import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { createId } from '../common/id';
import { DatabaseService } from '../database/database.service';
import { InvoicesService } from '../invoices/invoices.service';
import { ReadinessService } from '../operations/readiness.service';
import { PreparedDpsService } from '../prepared-dps/prepared-dps.service';
import { TaxEngineService } from '../tax-engine/tax-engine.service';
import { TenancyService } from '../tenancy/tenancy.service';
import { detectServiceProfile } from './autopilot-classifier';
import { AnswerFiscalAutopilotDto, CreateFiscalAutopilotDto } from './dto/fiscal-autopilot.dto';

type IntentStatus = 'needs_input' | 'prepared' | 'signed' | 'queued' | 'authorized' | 'blocked' | 'failed';
type WithholdingAnswer = 'not_withheld' | 'customer' | 'intermediary';

interface FiscalIntentRow {
  id: string;
  company_id: string;
  environment: 'test' | 'production';
  idempotency_key: string;
  request_sha256: string;
  request: CreateFiscalAutopilotDto;
  answers: { service_kind?: 'business_consulting' | 'other'; iss_withholding?: WithholdingAnswer };
  status: IntentStatus;
  service_profile: 'business_consulting' | null;
  tax_decision_id: string | null;
  prepared_dps_id: string | null;
  invoice_id: string | null;
  output: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class FiscalAutopilotService {
  constructor(
    private readonly db: DatabaseService,
    private readonly tenancy: TenancyService,
    private readonly taxEngine: TaxEngineService,
    private readonly preparedDps: PreparedDpsService,
    private readonly readiness: ReadinessService,
    private readonly invoices: InvoicesService,
  ) {}

  async start(dto: CreateFiscalAutopilotDto, idempotencyKey: string) {
    this.assertStart(dto, idempotencyKey);
    await this.tenancy.getCompany(dto.company_id);
    const requestHash = this.hashStable(dto);
    const existing = await this.findByIdempotency(dto.company_id, dto.environment, idempotencyKey);
    if (existing) {
      if (existing.request_sha256 !== requestHash) throw new BadRequestException('Autopilot Idempotency-Key was already used with a different operation');
      return this.advance(existing.id, dto.company_id);
    }

    const id = createId('fint');
    const answers = dto.iss_withholding ? { iss_withholding: dto.iss_withholding } : {};
    await this.db.query(
      `INSERT INTO fiscal_intents(id, company_id, environment, idempotency_key, request_sha256, request, answers, status)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,'needs_input')`,
      [id, dto.company_id, dto.environment, idempotencyKey, requestHash, JSON.stringify(dto), JSON.stringify(answers)],
    );
    return this.advance(id, dto.company_id);
  }

  async answer(id: string, companyId: string, dto: AnswerFiscalAutopilotDto) {
    const intent = await this.getRow(id, companyId);
    const answers = { ...(intent.answers ?? {}), ...dto };
    await this.db.query('UPDATE fiscal_intents SET answers=$2::jsonb, updated_at=NOW() WHERE id=$1', [id, JSON.stringify(answers)]);
    return this.advance(id, companyId);
  }

  async continue(id: string, companyId: string) {
    return this.advance(id, companyId);
  }

  async inspect(id: string, companyId: string) {
    const intent = await this.getRow(id, companyId);
    if (intent.invoice_id) {
      const invoice = await this.invoices.findOneForCompany(intent.invoice_id, companyId);
      if (invoice.status === 'authorized' && intent.status !== 'authorized') {
        return this.updateAndPublic(intent, 'authorized', {
          ...intent.output,
          stage: 'authorized',
          invoice: { id: invoice.id, status: invoice.status, access_key: invoice.access_key, provider_reference: invoice.provider_reference },
          next_action: null,
        });
      }
    }
    return this.toPublic(intent);
  }

  private async advance(id: string, companyId: string): Promise<Record<string, unknown>> {
    let intent = await this.getRow(id, companyId);
    const request = intent.request;

    if (intent.invoice_id) {
      const invoice = await this.invoices.findOneForCompany(intent.invoice_id, companyId);
      if (invoice.status === 'authorized') {
        return this.updateAndPublic(intent, 'authorized', {
          ...intent.output,
          stage: 'authorized',
          invoice: { id: invoice.id, status: invoice.status, access_key: invoice.access_key, provider_reference: invoice.provider_reference },
          next_action: null,
        });
      }
      if (invoice.status === 'rejected') {
        return this.updateAndPublic(intent, 'failed', {
          ...intent.output,
          stage: 'invoice_rejected',
          invoice: { id: invoice.id, status: invoice.status, rejection: invoice.rejection },
          next_action: { kind: 'review_rejection', message: 'A SEFIN/provedor rejeitou a operação. O Autopilot preservou toda a trilha para diagnóstico.' },
        });
      }
      return this.updateAndPublic(intent, 'queued', {
        ...intent.output,
        stage: 'invoice_processing',
        invoice: { id: invoice.id, status: invoice.status },
        next_action: { kind: 'automatic_processing', message: 'A operação já está na fila fiscal. Consulte ou continue este Fiscal Intent; não crie outra emissão.' },
      });
    }

    const detectedProfile = detectServiceProfile(request.service.description);
    const answeredKind = intent.answers?.service_kind;
    if (answeredKind === 'other') {
      return this.updateAndPublic(intent, 'blocked', {
        stage: 'classification_required',
        message: 'O primeiro Autopilot não possui uma regra homologada para esse tipo de serviço. A operação foi preservada para classificação assistida/expert.',
        next_action: { kind: 'expert_classification', message: 'Classificar o serviço antes de emitir; nenhum código fiscal foi inventado.' },
      });
    }
    const profile = detectedProfile ?? (answeredKind === 'business_consulting' ? 'business_consulting' : undefined);
    if (!profile) {
      return this.updateAndPublic(intent, 'needs_input', {
        stage: 'needs_human_input',
        question: {
          id: 'service_kind',
          prompt: 'Este serviço é consultoria/assessoria empresarial geral, sem natureza financeira, contábil, jurídica, engenharia, tecnologia ou outra especialidade?',
          options: [
            { value: 'business_consulting', label: 'Sim · consultoria empresarial geral' },
            { value: 'other', label: 'Não / é outro tipo de serviço' },
          ],
        },
        next_action: { kind: 'answer_question', message: 'Responda apenas esta pergunta; o TaxAgent não pede códigos fiscais.' },
      });
    }

    const withholding = intent.answers?.iss_withholding ?? request.iss_withholding;
    if (!withholding) {
      return this.updateAndPublic({ ...intent, service_profile: profile }, 'needs_input', {
        stage: 'needs_human_input',
        service_profile: profile,
        question: {
          id: 'iss_withholding',
          prompt: 'O cliente vai reter o ISS desta prestação?',
          options: [
            { value: 'not_withheld', label: 'Não' },
            { value: 'customer', label: 'Sim · pelo tomador' },
            { value: 'intermediary', label: 'Sim · pelo intermediário' },
          ],
        },
        next_action: { kind: 'answer_question', message: 'Esta informação não é inferida porque depende dos fatos da operação.' },
      });
    }

    const company = await this.tenancy.getCompany(companyId) as { city_code: string };
    const effectiveAt = request.effective_at ?? request.competence ?? this.saoPauloDate();
    const competence = request.competence ?? effectiveAt;
    const tpRetIss = this.mapWithholding(withholding);

    if (!intent.tax_decision_id || intent.status === 'blocked') {
      const decision = await this.taxEngine.resolve({
        company_id: companyId,
        effective_at: effectiveAt,
        amount: request.service.amount,
        issuer_city_code: company.city_code,
        destination_city_code: request.customer.city_code,
        service_profile: profile,
        iss_withholding: tpRetIss,
      });
      intent = await this.patch(intent, {
        service_profile: profile,
        tax_decision_id: decision.id,
        output: {
          stage: decision.status === 'resolved' ? 'tax_resolved' : 'tax_blocked',
          service_profile: profile,
          tax_decision: {
            id: decision.id,
            status: decision.status,
            classification: decision.classification,
            municipal_tax: decision.municipal_tax,
            missing: decision.missing,
            warnings: decision.warnings,
          },
        },
      });
      if (decision.status !== 'resolved') {
        return this.updateAndPublic(intent, 'blocked', {
          ...intent.output,
          next_action: {
            kind: 'system_tax_review',
            message: 'A decisão fiscal não pôde ser fechada automaticamente. O Autopilot parou antes de preparar qualquer DPS.',
            missing: decision.missing,
          },
        });
      }
    }

    if (!intent.prepared_dps_id) {
      const prepared = await this.preparedDps.prepare({
        company_id: companyId,
        environment: request.environment,
        competence,
        tax_decision_id: intent.tax_decision_id!,
        customer: request.customer,
        service: {
          description: request.service.description,
          amount: request.service.amount,
          service_location_city_code: company.city_code,
        },
      }, `autopilot:${intent.id}:prepared`);
      intent = await this.patch(intent, {
        status: 'prepared',
        prepared_dps_id: prepared.id,
        output: {
          ...intent.output,
          stage: 'prepared',
          prepared_dps: this.preparedSummary(prepared),
        },
      });
    }

    const localReadiness = await this.readiness.report(companyId, request.environment);
    const certificateReady = localReadiness.gates.find((gate: { id: string }) => gate.id === 'certificate_a1')?.status === 'pass'
      && localReadiness.gates.find((gate: { id: string }) => gate.id === 'certificate_company_binding')?.status === 'pass';

    if (!certificateReady) {
      return this.updateAndPublic(intent, 'prepared', {
        ...intent.output,
        stage: 'prepared_waiting_certificate',
        readiness: this.readinessSummary(localReadiness),
        next_action: {
          kind: 'install_a1',
          message: 'A parte fiscal e a DPS já estão prontas. Cadastre um A1 válido da empresa uma única vez; depois o mesmo Fiscal Intent continua daqui.',
        },
      });
    }

    const signed = await this.preparedDps.sign(intent.prepared_dps_id!, companyId);
    intent = await this.patch(intent, {
      status: 'signed',
      output: {
        ...intent.output,
        stage: 'signed',
        prepared_dps: this.preparedSummary(signed),
      },
    });

    const probed = await this.readiness.probe(companyId, request.environment);
    const failedPreActivation = probed.gates
      .filter((gate: { id: string; status: string; blocking: boolean }) => gate.blocking && gate.status !== 'pass' && !['nfse_mode_live', 'live_enabled'].includes(gate.id))
      .map((gate: { id: string }) => gate.id);
    const failedProbes = (probed.probes ?? []).filter((probe: { status: string }) => probe.status !== 'pass').map((probe: { id: string }) => probe.id);

    if (failedPreActivation.length || failedProbes.length) {
      return this.updateAndPublic(intent, 'signed', {
        ...intent.output,
        stage: 'signed_waiting_readiness',
        readiness: this.readinessSummary(probed),
        next_action: {
          kind: 'system_readiness',
          message: 'O XML congelado já está assinado. Falta resolver gates técnicos de homologação; você não precisa refazer a operação.',
          blocked_by: [...failedPreActivation, ...failedProbes],
        },
      });
    }

    if (probed.ready_for_transmission !== true) {
      return this.updateAndPublic(intent, 'signed', {
        ...intent.output,
        stage: 'signed_ready_to_activate',
        readiness: this.readinessSummary(probed),
        next_action: {
          kind: 'activate_live_gates',
          message: 'A operação está assinada e o preflight passou. Os gates de transmissão continuam desligados por segurança; após promoção controlada, continue este mesmo Fiscal Intent.',
        },
      });
    }

    const prepared = await this.preparedDps.inspect(intent.prepared_dps_id!, companyId) as any;
    const invoicePayload = prepared.resume_payload;
    if (!invoicePayload) throw new BadRequestException('Prepared DPS is missing its resume payload');
    const accepted = await this.invoices.create(invoicePayload, `autopilot:${intent.id}:invoice`);
    intent = await this.patch(intent, {
      status: 'queued',
      invoice_id: accepted.id,
      output: {
        ...intent.output,
        stage: 'invoice_queued',
        invoice: accepted,
        next_action: { kind: 'automatic_processing', message: 'A emissão foi entregue à fila fiscal exactly-once. Continue/consulte este Intent para acompanhar o resultado.' },
      },
    });
    return this.toPublic(intent);
  }

  private assertStart(dto: CreateFiscalAutopilotDto, idempotencyKey: string): void {
    if (dto.environment !== 'test') throw new BadRequestException('Fiscal Autopilot remains restricted to environment=test during the first homologation cycle');
    const key = String(idempotencyKey ?? '').trim();
    if (!key) throw new BadRequestException('Idempotency-Key is required for Fiscal Autopilot');
    if (key.length > 200) throw new BadRequestException('Idempotency-Key must contain at most 200 characters');
  }

  private mapWithholding(answer: WithholdingAnswer): '1' | '2' | '3' {
    if (answer === 'not_withheld') return '1';
    if (answer === 'customer') return '2';
    return '3';
  }

  private async findByIdempotency(companyId: string, environment: string, key: string): Promise<FiscalIntentRow | null> {
    const { rows } = await this.db.query<FiscalIntentRow>(
      'SELECT * FROM fiscal_intents WHERE company_id=$1 AND environment=$2 AND idempotency_key=$3',
      [companyId, environment, key],
    );
    return rows[0] ?? null;
  }

  private async getRow(id: string, companyId: string): Promise<FiscalIntentRow> {
    const { rows } = await this.db.query<FiscalIntentRow>('SELECT * FROM fiscal_intents WHERE id=$1 AND company_id=$2', [id, companyId]);
    if (!rows[0]) throw new NotFoundException('Fiscal Intent not found');
    return rows[0];
  }

  private async patch(intent: FiscalIntentRow, patch: Partial<Pick<FiscalIntentRow, 'status' | 'service_profile' | 'tax_decision_id' | 'prepared_dps_id' | 'invoice_id' | 'output'>>): Promise<FiscalIntentRow> {
    const next = { ...intent, ...patch };
    const { rows } = await this.db.query<FiscalIntentRow>(
      `UPDATE fiscal_intents SET status=$2, service_profile=$3, tax_decision_id=$4, prepared_dps_id=$5, invoice_id=$6, output=$7::jsonb, updated_at=NOW()
       WHERE id=$1 RETURNING *`,
      [next.id, next.status, next.service_profile, next.tax_decision_id, next.prepared_dps_id, next.invoice_id, JSON.stringify(next.output ?? {})],
    );
    return rows[0];
  }

  private async updateAndPublic(intent: FiscalIntentRow, status: IntentStatus, output: Record<string, unknown>) {
    return this.toPublic(await this.patch(intent, { status, output }));
  }

  private toPublic(intent: FiscalIntentRow): Record<string, unknown> {
    return {
      id: intent.id,
      mode: 'autopilot',
      status: intent.status,
      company_id: intent.company_id,
      environment: intent.environment,
      service_profile: intent.service_profile ?? undefined,
      tax_decision_id: intent.tax_decision_id ?? undefined,
      prepared_dps_id: intent.prepared_dps_id ?? undefined,
      invoice_id: intent.invoice_id ?? undefined,
      operation: {
        customer: { name: intent.request.customer.name, tax_id: intent.request.customer.tax_id, city_code: intent.request.customer.city_code },
        service: { description: intent.request.service.description, amount: intent.request.service.amount },
        competence: intent.request.competence ?? intent.request.effective_at ?? undefined,
      },
      ...intent.output,
      created_at: intent.created_at,
      updated_at: intent.updated_at,
    };
  }

  private preparedSummary(prepared: any) {
    return {
      id: prepared.id,
      status: prepared.status,
      dps_id: prepared.dps_id,
      sequence: prepared.sequence,
      series: prepared.series,
      competence: prepared.competence,
      issued_at: prepared.issued_at,
      schema: prepared.schema,
      unsigned_xml_sha256: prepared.unsigned_xml_sha256,
      signed_xml_sha256: prepared.signed_xml_sha256,
      signed: prepared.signed,
      transmitted: prepared.transmitted,
    };
  }

  private readinessSummary(value: any) {
    return {
      ready_to_enable_live: value.ready_to_enable_live ?? value.readyToEnableLive ?? false,
      ready_for_transmission: value.ready_for_transmission ?? value.readyForTransmission ?? false,
      failed_blocking_gates: value.failedBlockingGates ?? [],
      probes: value.probes?.map((probe: any) => ({ id: probe.id, status: probe.status, detail: probe.detail })) ?? undefined,
    };
  }

  private hashStable(value: unknown): string {
    return createHash('sha256').update(this.stableStringify(value), 'utf8').digest('hex');
  }

  private stableStringify(value: unknown): string {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map((item) => this.stableStringify(item)).join(',')}]`;
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${this.stableStringify(item)}`).join(',')}}`;
  }

  private saoPauloDate(): string {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${map.year}-${map.month}-${map.day}`;
  }
}
