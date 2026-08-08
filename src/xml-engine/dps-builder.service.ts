import { BadRequestException, Injectable } from '@nestjs/common';
import { XMLBuilder } from 'fast-xml-parser';
import { CanonicalInvoiceInput } from '../fiscal-core/fiscal.types';
import { DpsSequenceService } from './dps-sequence.service';

export interface FiscalCompany { id: string; tax_id: string; municipal_registration: string | null; city_code: string }
export interface DpsBuildResult { xml: string; id: string; sequence: number; series: string; verifiedLayout: boolean }

interface TaxIdentity { kind: 'CPF' | 'CNPJ'; xmlValue: string; typeCode: '1' | '2'; idValue: string }

export function normalizeTaxIdentity(value: string): TaxIdentity {
  const normalized = String(value ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (/^\d{11}$/.test(normalized)) return { kind: 'CPF', xmlValue: normalized, typeCode: '1', idValue: `000${normalized}` };
  if (/^[A-Z0-9]{14}$/.test(normalized)) return { kind: 'CNPJ', xmlValue: normalized, typeCode: '2', idValue: normalized };
  throw new BadRequestException('CPF/CNPJ must contain 11 numeric positions (CPF) or 14 alphanumeric positions (CNPJ)');
}

export function buildDpsId(cityCode: string, taxId: string, series: string, sequence: number): string {
  if (!/^\d{7}$/.test(cityCode)) throw new BadRequestException('DPS issuer city code must contain 7 digits');
  if (!Number.isSafeInteger(sequence) || sequence <= 0 || String(sequence).length > 15) throw new BadRequestException('DPS sequence must be a positive integer with at most 15 digits');
  const identity = normalizeTaxIdentity(taxId);
  const normalizedSeries = String(series ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!normalizedSeries || normalizedSeries.length > 5) throw new BadRequestException('DPS series must contain 1 to 5 alphanumeric positions');
  return `DPS${cityCode}${identity.typeCode}${identity.idValue}${normalizedSeries.padStart(5, '0')}${String(sequence).padStart(15, '0')}`;
}

@Injectable()
export class DpsBuilderService {
  constructor(private readonly sequences: DpsSequenceService) {}
  async build(input: CanonicalInvoiceInput, company: FiscalCompany): Promise<DpsBuildResult> {
    const sequence = await this.sequences.next(input.companyId, input.environment);
    const series = process.env.TAXAGENT_DPS_SERIES ?? '1';
    const id = buildDpsId(company.city_code, company.tax_id, series, sequence);
    const providerIdentity = normalizeTaxIdentity(company.tax_id);
    if (providerIdentity.kind !== 'CNPJ') throw new BadRequestException('TaxAgent company issuance currently requires a CNPJ prestador');
    const customerIdentity = normalizeTaxIdentity(input.customer.taxId);
    const issuedAt = input.issuedAt ?? new Date().toISOString();
    const competence = input.competence ?? issuedAt.slice(0, 10);
    const verifiedLayout = process.env.TAXAGENT_DPS_BUILDER_MODE === 'verified';
    const doc = { DPS: { '@_xmlns': 'http://www.sped.fazenda.gov.br/nfse', '@_versao': '1.01', infDPS: {
      '@_Id': id, tpAmb: input.environment === 'production' ? 1 : 2, dhEmi: issuedAt, verAplic: 'TaxAgent_0.10', serie: series, nDPS: sequence, dCompet: competence, tpEmit: 1, cLocEmi: company.city_code,
      prest: { CNPJ: providerIdentity.xmlValue, ...(company.municipal_registration ? { IM: company.municipal_registration } : {}) },
      toma: { [customerIdentity.kind]: customerIdentity.xmlValue, xNome: input.customer.name },
      serv: { locPrest: { cLocPrestacao: input.customer.cityCode }, cServ: { cTribNac: input.service.nationalServiceCode, xDescServ: input.service.description } },
      valores: { vServPrest: { vServ: input.service.amount.toFixed(2) } },
      ...(input.service.operationIndicator || input.service.taxSituation || input.service.taxClassification ? { IBSCBS: {
        ...(input.service.operationIndicator ? { cIndOp: input.service.operationIndicator } : {}),
        ...(input.service.taxSituation ? { CST: input.service.taxSituation } : {}),
        ...(input.service.taxClassification ? { cClassTrib: input.service.taxClassification } : {}),
      } } : {}),
    } } };
    const builder = new XMLBuilder({ ignoreAttributes: false, format: false });
    return { xml: `<?xml version="1.0" encoding="UTF-8"?>${builder.build(doc)}`, id, sequence, series, verifiedLayout };
  }
}
