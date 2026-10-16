import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createId } from '../common/id';
import { DatabaseService } from '../database/database.service';
import { FiscalEngineError } from '../fiscal-core/fiscal-engine.error';
import { PreparedDpsService } from '../prepared-dps/prepared-dps.service';
import { GrantFiscalTransmissionPermitDto } from './dto/transmission-permit.dto';

type PermitStatus = 'active'|'claimed'|'consumed'|'revoked'|'expired';

interface PermitRow {
  id:string;
  company_id:string;
  environment:'test'|'production';
  provider:string;
  prepared_dps_id:string;
  status:PermitStatus;
  reason:string;
  expires_at:Date|string;
  claimed_invoice_id:string|null;
  outcome:string|null;
  created_at:Date|string;
  claimed_at:Date|string|null;
  consumed_at:Date|string|null;
  revoked_at:Date|string|null;
}

@Injectable()
export class FiscalTransmissionPermitService {
  constructor(
    private readonly db: DatabaseService,
    private readonly prepared: PreparedDpsService,
  ) {}

  async grant(input: GrantFiscalTransmissionPermitDto) {
    if (input.environment !== 'test') throw new BadRequestException('Transmission permits are restricted to environment=test');
    if (input.provider !== 'nfse-national') throw new BadRequestException('Only nfse-national permits are supported in the first homologation cycle');

    const prepared = await this.prepared.get(input.prepared_dps_id, input.company_id);
    if (prepared.environment !== 'test') throw new BadRequestException('Prepared DPS is not in TEST');
    if (prepared.status !== 'signed' || !prepared.signed_xml_sha256 || !prepared.certificate_fingerprint) {
      throw new BadRequestException('Transmission permit requires a signed immutable Prepared DPS');
    }

    const existing = await this.findByPrepared(input.prepared_dps_id);
    if (existing) {
      if (existing.status === 'active' && new Date(existing.expires_at).getTime() > Date.now()) {
        return this.toPublic(existing, true);
      }
      throw new BadRequestException(`Prepared DPS already has a transmission permit in status=${existing.status}; create a fresh Prepared DPS for a new explicit transmission authorization`);
    }

    const id = createId('txpermit');
    const expiresAt = new Date(Date.now() + input.expiration_minutes * 60_000);
    try {
      const { rows } = await this.db.query<PermitRow>(
        `INSERT INTO fiscal_transmission_permits(
           id,company_id,environment,provider,prepared_dps_id,status,reason,expires_at
         ) VALUES($1,$2,'test','nfse-national',$3,'active',$4,$5)
         RETURNING *`,
        [id,input.company_id,input.prepared_dps_id,input.reason.trim(),expiresAt],
      );
      return this.toPublic(rows[0], false);
    } catch (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as any).code) : '';
      if (code === '23505') {
        const raced = await this.findByPrepared(input.prepared_dps_id);
        if (raced) return this.toPublic(raced, true);
      }
      throw error;
    }
  }

  async claimForPost(input: {
    companyId:string;
    environment:'test'|'production';
    provider:string;
    preparedDpsId:string;
    invoiceId:string;
  }):Promise<{id:string}> {
    if (input.environment !== 'test') {
      throw new FiscalEngineError(
        'TA_TRANSMISSION_PERMIT_PRODUCTION_DISABLED',
        'Per-Company fiscal transmission permits currently authorize TEST/Produção Restrita only',
        false,
        { fiscal_transmission_attempted:false },
      );
    }

    return this.db.withTransaction(async(client)=>{
      const result = await client.query<PermitRow>(
        `SELECT * FROM fiscal_transmission_permits
          WHERE company_id=$1 AND environment=$2 AND provider=$3 AND prepared_dps_id=$4
          FOR UPDATE`,
        [input.companyId,input.environment,input.provider,input.preparedDpsId],
      );
      const permit=result.rows[0];
      if(!permit){
        throw new FiscalEngineError(
          'TA_TRANSMISSION_PERMIT_REQUIRED',
          'No explicit one-shot transmission permit exists for this Company and Prepared DPS',
          false,
          { prepared_dps_id:input.preparedDpsId,fiscal_transmission_attempted:false },
        );
      }

      if(permit.status==='active' && new Date(permit.expires_at).getTime()<=Date.now()){
        await client.query("UPDATE fiscal_transmission_permits SET status='expired' WHERE id=$1 AND status='active'",[permit.id]);
        throw new FiscalEngineError(
          'TA_TRANSMISSION_PERMIT_EXPIRED',
          'The one-shot transmission permit expired before fiscal POST',
          false,
          { permit_id:permit.id,prepared_dps_id:permit.prepared_dps_id,fiscal_transmission_attempted:false },
        );
      }

      if(permit.status==='claimed'){
        throw new FiscalEngineError(
          'TA_TRANSMISSION_PERMIT_UNCERTAIN',
          'This one-shot permit was already claimed for a possible fiscal POST. TaxAgent must reconcile provider state and will not POST again with the same permit.',
          true,
          { permit_id:permit.id,prepared_dps_id:permit.prepared_dps_id,claimed_invoice_id:permit.claimed_invoice_id,fiscal_retransmission_attempted:false },
        );
      }
      if(permit.status!=='active'){
        throw new FiscalEngineError(
          'TA_TRANSMISSION_PERMIT_NOT_ACTIVE',
          `Transmission permit is ${permit.status}; a new Prepared DPS and explicit permit are required for another POST`,
          false,
          { permit_id:permit.id,prepared_dps_id:permit.prepared_dps_id,fiscal_transmission_attempted:false },
        );
      }

      const claimed=await client.query<PermitRow>(
        `UPDATE fiscal_transmission_permits
            SET status='claimed',claimed_invoice_id=$2,claimed_at=NOW()
          WHERE id=$1 AND status='active'
          RETURNING *`,
        [permit.id,input.invoiceId],
      );
      if(!claimed.rows[0]){
        throw new FiscalEngineError('TA_TRANSMISSION_PERMIT_RACE','Transmission permit could not be atomically claimed',true,{fiscal_transmission_attempted:false});
      }
      return {id:permit.id};
    });
  }

  async consumeClaimForPreparedIfPresent(preparedDpsId:string,invoiceId:string,outcome:'authorized'|'rejected'):Promise<boolean>{
    const {rowCount}=await this.db.query(
      `UPDATE fiscal_transmission_permits
          SET status='consumed',outcome=$3,consumed_at=NOW()
        WHERE prepared_dps_id=$1 AND claimed_invoice_id=$2 AND status='claimed'`,
      [preparedDpsId,invoiceId,outcome],
    );
    return (rowCount??0)===1;
  }

  async consumeClaim(permitId:string,invoiceId:string,outcome:'authorized'|'rejected'):Promise<void>{
    const {rowCount}=await this.db.query(
      `UPDATE fiscal_transmission_permits
          SET status='consumed',outcome=$3,consumed_at=NOW()
        WHERE id=$1 AND claimed_invoice_id=$2 AND status='claimed'`,
      [permitId,invoiceId,outcome],
    );
    if((rowCount??0)!==1){
      throw new FiscalEngineError(
        'TA_TRANSMISSION_PERMIT_CONSUME_FAILED',
        'Fiscal response was definitive but the claimed transmission permit could not be consumed atomically',
        false,
        {permit_id:permitId,invoice_id:invoiceId},
      );
    }
  }

  async revoke(id:string,reason?:string){
    const {rows}=await this.db.query<PermitRow>(
      `UPDATE fiscal_transmission_permits
          SET status='revoked',revoked_at=NOW(),reason=CASE WHEN $2::text IS NULL THEN reason ELSE reason || ' | revoke: ' || $2 END
        WHERE id=$1 AND status='active'
        RETURNING *`,
      [id,clean(reason)],
    );
    if(!rows[0]){
      const existing=await this.find(id);
      if(!existing) throw new NotFoundException('Transmission permit not found');
      throw new BadRequestException(`Only an unused active permit can be revoked; current status=${existing.status}`);
    }
    return this.toPublic(rows[0],false);
  }

  async list(companyId:string,environment='test'){
    if(environment!=='test') throw new BadRequestException('Transmission permit management is restricted to TEST');
    const {rows}=await this.db.query<PermitRow>(
      `SELECT * FROM fiscal_transmission_permits
        WHERE company_id=$1 AND environment='test'
        ORDER BY created_at DESC LIMIT 100`,
      [companyId],
    );
    return {items:rows.map((row)=>this.toPublic(row,false)),count:rows.length};
  }

  private async find(id:string):Promise<PermitRow|null>{
    const {rows}=await this.db.query<PermitRow>('SELECT * FROM fiscal_transmission_permits WHERE id=$1',[id]);
    return rows[0]??null;
  }

  private async findByPrepared(preparedDpsId:string):Promise<PermitRow|null>{
    const {rows}=await this.db.query<PermitRow>('SELECT * FROM fiscal_transmission_permits WHERE prepared_dps_id=$1',[preparedDpsId]);
    return rows[0]??null;
  }

  private toPublic(row:PermitRow,deduplicated:boolean){
    return {
      id:row.id,
      company_id:row.company_id,
      environment:row.environment,
      provider:row.provider,
      prepared_dps_id:row.prepared_dps_id,
      status:row.status,
      expires_at:row.expires_at,
      claimed_invoice_id:row.claimed_invoice_id??undefined,
      outcome:row.outcome??undefined,
      created_at:row.created_at,
      claimed_at:row.claimed_at??undefined,
      consumed_at:row.consumed_at??undefined,
      revoked_at:row.revoked_at??undefined,
      deduplicated,
      safeguards:{
        one_shot:true,
        test_only:true,
        fiscal_transmission_attempted_by_management_endpoint:false,
        secrets_exposed:false,
      },
    };
  }
}

function clean(value?:string):string|null{const text=String(value??'').trim();return text||null;}
