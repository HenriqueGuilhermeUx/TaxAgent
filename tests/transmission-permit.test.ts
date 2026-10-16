import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { FiscalTransmissionPermitService } from '../src/transmission-permits/fiscal-transmission-permit.service';

const active = {
  id:'txpermit_1',
  company_id:'comp_1',
  environment:'test',
  provider:'nfse-national',
  prepared_dps_id:'pdps_1',
  status:'active',
  reason:'first restricted-production proof',
  expires_at:new Date(Date.now()+15*60_000).toISOString(),
  claimed_invoice_id:null,
  outcome:null,
  created_at:new Date().toISOString(),
  claimed_at:null,
  consumed_at:null,
  revoked_at:null,
};

test('grant requires a signed immutable Prepared DPS', async () => {
  const service=new FiscalTransmissionPermitService(
    {query:async()=>({rows:[],rowCount:0})} as any,
    {get:async()=>({id:'pdps_1',company_id:'comp_1',environment:'test',status:'prepared',signed_xml_sha256:null,certificate_fingerprint:null})} as any,
  );
  await assert.rejects(
    ()=>service.grant({
      company_id:'comp_1',environment:'test',provider:'nfse-national',prepared_dps_id:'pdps_1',
      expiration_minutes:15,reason:'test',confirmation:'AUTHORIZE-ONE-NATIONAL-TEST-TRANSMISSION',
    }),
    BadRequestException,
  );
});

test('claim fails closed when no one-shot permit exists', async () => {
  const db={
    withTransaction:async(fn:any)=>fn({query:async()=>({rows:[],rowCount:0})}),
  } as any;
  const service=new FiscalTransmissionPermitService(db,{} as any);
  await assert.rejects(
    ()=>service.claimForPost({companyId:'comp_1',environment:'test',provider:'nfse-national',preparedDpsId:'pdps_1',invoiceId:'inv_1'}),
    (error:any)=>error?.code==='TA_TRANSMISSION_PERMIT_REQUIRED'
      && error?.details?.fiscal_transmission_attempted===false,
  );
});

test('claim atomically changes active permit to claimed exactly once', async () => {
  let updateCalls=0;
  const client={
    query:async(sql:string)=>{
      if(sql.includes('SELECT * FROM fiscal_transmission_permits')) return {rows:[active],rowCount:1};
      if(sql.includes("SET status='claimed'")){updateCalls+=1;return {rows:[{...active,status:'claimed',claimed_invoice_id:'inv_1'}],rowCount:1};}
      return {rows:[],rowCount:0};
    },
  };
  const db={withTransaction:async(fn:any)=>fn(client)} as any;
  const service=new FiscalTransmissionPermitService(db,{} as any);
  const claim=await service.claimForPost({companyId:'comp_1',environment:'test',provider:'nfse-national',preparedDpsId:'pdps_1',invoiceId:'inv_1'});
  assert.equal(claim.id,'txpermit_1');
  assert.equal(updateCalls,1);
});

test('claimed permit is treated as uncertain provider state and cannot POST again', async () => {
  const claimed={...active,status:'claimed',claimed_invoice_id:'inv_1'};
  const db={
    withTransaction:async(fn:any)=>fn({query:async()=>({rows:[claimed],rowCount:1})}),
  } as any;
  const service=new FiscalTransmissionPermitService(db,{} as any);
  await assert.rejects(
    ()=>service.claimForPost({companyId:'comp_1',environment:'test',provider:'nfse-national',preparedDpsId:'pdps_1',invoiceId:'inv_1'}),
    (error:any)=>error?.code==='TA_TRANSMISSION_PERMIT_UNCERTAIN'
      && error?.retryable===true
      && error?.details?.fiscal_retransmission_attempted===false,
  );
});

test('production cannot be authorized by the first-cycle permit service', async () => {
  const service=new FiscalTransmissionPermitService({} as any,{} as any);
  await assert.rejects(
    ()=>service.claimForPost({companyId:'comp_1',environment:'production',provider:'nfse-national',preparedDpsId:'pdps_1',invoiceId:'inv_1'}),
    (error:any)=>error?.code==='TA_TRANSMISSION_PERMIT_PRODUCTION_DISABLED',
  );
});

test('definitive provider response consumes a claimed permit', async () => {
  let params:any[]=[];
  const db={query:async(_sql:string,p:any[])=>{params=p;return {rows:[],rowCount:1};}} as any;
  const service=new FiscalTransmissionPermitService(db,{} as any);
  await service.consumeClaim('txpermit_1','inv_1','authorized');
  assert.deepEqual(params,['txpermit_1','inv_1','authorized']);
});


test('authoritative reconciliation can finalize a previously claimed permit without a second POST', async () => {
  let params:any[]=[];
  const db={query:async(_sql:string,p:any[])=>{params=p;return {rows:[],rowCount:1};}} as any;
  const service=new FiscalTransmissionPermitService(db,{} as any);
  const consumed=await service.consumeClaimForPreparedIfPresent('pdps_1','inv_1','authorized');
  assert.equal(consumed,true);
  assert.deepEqual(params,['pdps_1','inv_1','authorized']);
});


test('reconciliation settlement is a no-op when no claimed permit belongs to the invoice', async () => {
  const db={query:async()=>({rows:[],rowCount:0})} as any;
  const service=new FiscalTransmissionPermitService(db,{} as any);
  assert.equal(await service.consumeClaimForPreparedIfPresent('pdps_1','inv_other','authorized'),false);
});
