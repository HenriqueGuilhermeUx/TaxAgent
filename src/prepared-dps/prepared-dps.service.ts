import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { createId } from '../common/id';
import { CertificateVaultService } from '../certificates/certificate-vault.service';
import { DatabaseService } from '../database/database.service';
import { CanonicalInvoiceInput, CanonicalService } from '../fiscal-core/fiscal.types';
import { CreateInvoiceDto } from '../invoices/dto/create-invoice.dto';
import { SchemaRegistryService } from '../schema-registry/schema-registry.service';
import { TaxEngineService } from '../tax-engine/tax-engine.service';
import { TenancyService } from '../tenancy/tenancy.service';
import { DpsBuilderService, FiscalCompany } from '../xml-engine/dps-builder.service';
import { formatNfseDateTimeUtc } from '../xml-engine/nfse-datetime';
import { XmlSignatureService } from '../xml-engine/xml-signature.service';
import { XmlValidationService } from '../xml-engine/xml-validation.service';

export interface PreparedDpsRecord {
  id: string;
  company_id: string;
  environment: 'test' | 'production';
  tax_decision_id: string;
  idempotency_key: string;
  request_sha256: string;
  canonical_input_sha256: string;
  canonical_input: CanonicalInvoiceInput;
  dps_id: string;
  sequence: string | number;
  series: string;
  issued_at: string;
  competence: string | Date;
  schema_id: string;
  builder_mode: string;
  unsigned_xml: Buffer;
  unsigned_xml_sha256: string;
  signed_xml: Buffer | null;
  signed_xml_sha256: string | null;
  certificate_fingerprint: string | null;
  status: 'prepared' | 'signed' | 'consumed';
  created_at: Date;
  signed_at: Date | null;
  consumed_at: Date | null;
}

interface PreparedIntent {
  company: FiscalCompany;
  service: CanonicalService;
  input: CanonicalInvoiceInput;
  requestHash: string;
  canonicalHash: string;
}

@Injectable()
export class PreparedDpsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly tenancy: TenancyService,
    private readonly taxEngine: TaxEngineService,
    private readonly builder: DpsBuilderService,
    private readonly validation: XmlValidationService,
    private readonly signature: XmlSignatureService,
    private readonly vault: CertificateVaultService,
    private readonly schemas: SchemaRegistryService,
  ) {}

  async prepare(dto: CreateInvoiceDto, idempotencyKey: string) {
    this.assertPrepareRequest(dto, idempotencyKey);
    const issuedAt = formatNfseDateTimeUtc();
    const intent = await this.prepareIntent(dto, issuedAt);

    return this.db.withTransaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`prepared-dps:${dto.company_id}:${dto.environment}`]);
      const existingResult = await client.query<PreparedDpsRecord>(
        'SELECT * FROM prepared_dps WHERE company_id=$1 AND environment=$2 AND idempotency_key=$3',
        [dto.company_id, dto.environment, idempotencyKey],
      );
      const existing = existingResult.rows[0];
      if (existing) {
        if (existing.request_sha256 !== intent.requestHash) throw new BadRequestException('Prepared DPS Idempotency-Key was already used with a different fiscal payload');
        return this.toPublic(existing);
      }

      const sequenceResult = await client.query<{ value: string }>(
        `INSERT INTO dps_sequences(company_id, environment, next_number)
         VALUES ($1,$2,2)
         ON CONFLICT(company_id, environment)
         DO UPDATE SET next_number=dps_sequences.next_number+1
         RETURNING (next_number-1)::text AS value`,
        [dto.company_id, dto.environment],
      );
      const sequence = Number(sequenceResult.rows[0].value);
      const built = this.builder.buildPreview(intent.input, intent.company, sequence);
      await this.validation.validateWellFormed(built.xml);
      await this.validation.validateStrict(built.xml, dto.environment);

      const id = createId('pdps');
      const schemaId = this.schemas.active(dto.environment).id;
      const builderMode = process.env.TAXAGENT_DPS_BUILDER_MODE ?? 'draft';
      const unsignedHash = this.hashText(built.xml);
      const inserted = await client.query<PreparedDpsRecord>(
        `INSERT INTO prepared_dps(
          id, company_id, environment, tax_decision_id, idempotency_key,
          request_sha256, canonical_input_sha256, canonical_input,
          dps_id, sequence, series, issued_at, competence, schema_id, builder_mode,
          unsigned_xml, unsigned_xml_sha256
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13::date,$14,$15,$16,$17)
        RETURNING *`,
        [
          id,
          dto.company_id,
          dto.environment,
          dto.tax_decision_id,
          idempotencyKey,
          intent.requestHash,
          intent.canonicalHash,
          JSON.stringify(intent.input),
          built.id,
          built.sequence,
          built.series,
          intent.input.issuedAt,
          intent.input.competence,
          schemaId,
          builderMode,
          Buffer.from(built.xml, 'utf8'),
          unsignedHash,
        ],
      );
      return this.toPublic(inserted.rows[0]);
    });
  }

  async get(id: string, companyId?: string): Promise<PreparedDpsRecord> {
    const { rows } = await this.db.query<PreparedDpsRecord>('SELECT * FROM prepared_dps WHERE id=$1', [id]);
    const record = rows[0];
    if (!record || (companyId && record.company_id !== companyId)) throw new NotFoundException('Prepared DPS not found');
    return record;
  }

  async inspect(id: string, companyId: string) {
    return this.toPublic(await this.get(id, companyId));
  }

  async sign(id: string, companyId: string) {
    const current = await this.get(id, companyId);
    if (current.signed_xml && current.signed_xml_sha256) return this.toPublic(current);
    const certificate = await this.vault.getActiveMaterial(companyId);
    const unsignedXml = current.unsigned_xml.toString('utf8');
    const signedXml = this.signature.sign(unsignedXml, current.dps_id, 'infDPS', certificate);
    await this.validation.validateWellFormed(signedXml);
    await this.validation.validateStrict(signedXml, current.environment);
    const signedHash = this.hashText(signedXml);
    await this.db.query(
      `UPDATE prepared_dps
       SET signed_xml=$2, signed_xml_sha256=$3, certificate_fingerprint=$4, status='signed', signed_at=NOW()
       WHERE id=$1 AND signed_xml IS NULL`,
      [id, Buffer.from(signedXml, 'utf8'), signedHash, certificate.fingerprint],
    );
    return this.toPublic(await this.get(id, companyId));
  }

  async assertBindable(id: string, dto: CreateInvoiceDto, input: CanonicalInvoiceInput): Promise<PreparedDpsRecord> {
    const record = await this.get(id, dto.company_id);
    if (record.environment !== dto.environment) throw new BadRequestException('Prepared DPS environment does not match invoice environment');
    if (dto.tax_decision_id && dto.tax_decision_id !== record.tax_decision_id) throw new BadRequestException('Prepared DPS tax decision does not match invoice tax_decision_id');
    const candidate: CanonicalInvoiceInput = {
      ...input,
      issuedAt: record.issued_at,
      competence: this.dateOnly(record.competence),
    };
    const candidateHash = this.hashStable(candidate);
    if (candidateHash !== record.canonical_input_sha256) throw new BadRequestException('Invoice payload does not match immutable Prepared DPS canonical input');
    return record;
  }

  async markConsumed(id: string): Promise<void> {
    await this.db.query("UPDATE prepared_dps SET status='consumed', consumed_at=COALESCE(consumed_at,NOW()) WHERE id=$1", [id]);
  }

  async signedMaterial(id: string, companyId: string) {
    const record = await this.get(id, companyId);
    if (!record.signed_xml || !record.signed_xml_sha256) throw new BadRequestException('Prepared DPS has not been signed yet');
    return {
      record,
      signedXml: record.signed_xml.toString('utf8'),
      unsignedXml: record.unsigned_xml.toString('utf8'),
    };
  }

  private async prepareIntent(dto: CreateInvoiceDto, issuedAt: string): Promise<PreparedIntent> {
    if (!dto.tax_decision_id) throw new BadRequestException('Prepared DPS requires a resolved tax_decision_id');
    const company = await this.tenancy.getCompany(dto.company_id) as FiscalCompany;
    let service: CanonicalService = {
      description: dto.service.description,
      amount: dto.service.amount,
      nationalServiceCode: dto.service.national_service_code,
      serviceLocationCityCode: dto.service.service_location_city_code,
      issTaxation: dto.service.iss_taxation,
      issWithholding: dto.service.iss_withholding,
      issRate: dto.service.iss_rate,
      finalConsumption: dto.service.final_consumption,
      operationIndicator: dto.service.operation_indicator,
      taxSituation: dto.service.tax_situation,
      taxClassification: dto.service.tax_classification,
    };
    service = await this.taxEngine.hydrateServiceFromDecision(dto.company_id, dto.tax_decision_id, service);
    this.assertFiscalInputs(company, service);
    const competence = dto.competence ?? issuedAt.slice(0, 10);
    const input = this.taxEngine.validate({
      companyId: dto.company_id,
      environment: dto.environment,
      competence,
      issuedAt,
      customer: { taxId: dto.customer.tax_id, name: dto.customer.name, cityCode: dto.customer.city_code },
      service,
    });
    const requestIntent = {
      companyId: input.companyId,
      environment: input.environment,
      competence: input.competence,
      taxDecisionId: dto.tax_decision_id,
      customer: input.customer,
      service: input.service,
    };
    return { company, service, input, requestHash: this.hashStable(requestIntent), canonicalHash: this.hashStable(input) };
  }

  private assertPrepareRequest(dto: CreateInvoiceDto, idempotencyKey: string): void {
    if (dto.environment !== 'test') throw new BadRequestException('Prepared DPS is restricted to environment=test during the first homologation cycle');
    const key = String(idempotencyKey ?? '').trim();
    if (!key) throw new BadRequestException('Idempotency-Key is required to persist a Prepared DPS');
    if (key.length > 200) throw new BadRequestException('Idempotency-Key must contain at most 200 characters');
  }

  private assertFiscalInputs(company: FiscalCompany, service: CanonicalService): void {
    if (String(company.tax_regime ?? '').toLowerCase() !== 'regular') throw new BadRequestException('First homologation cycle supports tax_regime=regular only');
    if (!service.nationalServiceCode || !/^\d{6}$/.test(service.nationalServiceCode)) throw new BadRequestException('national_service_code must be a 6-digit cTribNac');
    if (!service.serviceLocationCityCode) throw new BadRequestException('service_location_city_code is required for Prepared DPS');
    if (!service.issTaxation || !service.issWithholding) throw new BadRequestException('iss_taxation and iss_withholding are required for Prepared DPS');
    if (!service.operationIndicator || !service.taxSituation || !service.taxClassification) throw new BadRequestException('cIndOp, CST and cClassTrib are required for Prepared DPS');
  }

  private toPublic(record: PreparedDpsRecord) {
    const input = record.canonical_input;
    const resumePayload: CreateInvoiceDto & { prepared_dps_id: string } = {
      company_id: record.company_id,
      environment: record.environment,
      competence: this.dateOnly(record.competence),
      tax_decision_id: record.tax_decision_id,
      prepared_dps_id: record.id,
      customer: {
        tax_id: input.customer.taxId,
        name: input.customer.name,
        city_code: input.customer.cityCode,
      },
      service: {
        description: input.service.description,
        amount: input.service.amount,
        national_service_code: input.service.nationalServiceCode,
        service_location_city_code: input.service.serviceLocationCityCode,
        iss_taxation: input.service.issTaxation,
        iss_withholding: input.service.issWithholding,
        iss_rate: input.service.issRate,
        final_consumption: input.service.finalConsumption,
        operation_indicator: input.service.operationIndicator,
        tax_situation: input.service.taxSituation,
        tax_classification: input.service.taxClassification,
      },
    };
    return {
      id: record.id,
      status: record.status,
      valid: true,
      signed: Boolean(record.signed_xml_sha256),
      transmitted: false,
      company_id: record.company_id,
      environment: record.environment,
      tax_decision_id: record.tax_decision_id,
      dps_id: record.dps_id,
      sequence: Number(record.sequence),
      series: record.series,
      issued_at: record.issued_at,
      competence: this.dateOnly(record.competence),
      schema: record.schema_id,
      builder_mode: record.builder_mode,
      request_sha256: record.request_sha256,
      canonical_input_sha256: record.canonical_input_sha256,
      unsigned_xml_sha256: record.unsigned_xml_sha256,
      signed_xml_sha256: record.signed_xml_sha256 ?? undefined,
      certificate_fingerprint: record.certificate_fingerprint ?? undefined,
      resume_payload: resumePayload,
      created_at: record.created_at,
      signed_at: record.signed_at ?? undefined,
      consumed_at: record.consumed_at ?? undefined,
      note: record.signed_xml_sha256
        ? 'Prepared DPS is immutable and signed. No SEFIN transmission was performed by this endpoint.'
        : 'Prepared DPS is immutable and XSD-valid. Sequence, dhEmi, competence, tax decision and unsigned XML hash are frozen; no certificate or SEFIN transmission was used.',
    };
  }

  private hashText(value: string): string {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  }

  private hashStable(value: unknown): string {
    return this.hashText(this.stableStringify(value));
  }

  private stableStringify(value: unknown): string {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map((item) => this.stableStringify(item)).join(',')}]`;
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${this.stableStringify(item)}`).join(',')}}`;
  }

  private dateOnly(value: string | Date): string {
    return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
  }
}
