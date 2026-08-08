import { BadRequestException, Injectable } from '@nestjs/common';
import { XMLBuilder } from 'fast-xml-parser';
import { CanonicalInvoiceInput, CanonicalService } from '../fiscal-core/fiscal.types';
import { DpsSequenceService } from './dps-sequence.service';

export interface FiscalCompany { id: string; tax_id: string; municipal_registration: string | null; city_code: string; tax_regime?: string | null }
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
export function buildIbsCbsGroup(service: CanonicalService): Record<string, unknown> | undefined {
  const values = [service.operationIndicator, service.taxSituation, service.taxClassification];
  if (values.every((value) => !value)) return undefined;
  if (values.some((value) => !value)) throw new BadRequestException('IBS/CBS group is incomplete: cIndOp, CST and cClassTrib must be supplied together');
  if (!/^\d{6}$/.test(service.operationIndicator!)) throw new BadRequestException('cIndOp must contain exactly 6 numeric positions');
  if (!/^\d{3}$/.test(service.taxSituation!)) throw new BadRequestException('CST IBS/CBS must contain exactly 3 numeric positions');
  if (!/^\d{6}$/.test(service.taxClassification!)) throw new BadRequestException('cClassTrib must contain exactly 6 numeric positions');
  return { finNFSe: 0, cIndOp: service.operationIndicator, indDest: 0, valores: { trib: { gIBSCBS: { CST: service.taxSituation, cClassTrib: service.taxClassification } } } };
}
export function buildMunicipalTaxGroup(service: CanonicalService, taxRegime?: string | null): Record<string, unknown> {
  if (String(taxRegime ?? '').toLowerCase() !== 'regular') throw new BadRequestException('Current verified live builder supports tax_regime=regular only');
  if (!service.issTaxation || !service.issWithholding) throw new BadRequestException('ISS group requires iss_taxation/tribISSQN and iss_withholding/tpRetISSQN');
  const tribMun = { tribISSQN: service.issTaxation, tpRetISSQN: service.issWithholding, ...(service.issRate !== undefined ? { pAliq: service.issRate.toFixed(2) } : {}) };
  return { tribMun, totTrib: { indTotTrib: 0 } };
}

@Injectable()
export class DpsBuilderService {
  constructor(private readonly sequences: DpsSequenceService) {}
  async build(input: CanonicalInvoiceInput, company: FiscalCompany): Promise<DpsBuildResult> {
    const sequence = await this.sequences.next(input.companyId, input.environment);
    return this.buildWithSequence(input, company, sequence);
  }
  buildPreview(input: CanonicalInvoiceInput, company: FiscalCompany, sequence = 1): DpsBuildResult {
    return this.buildWithSequence(input, company, sequence);
  }
  private buildWithSequence(input: CanonicalInvoiceInput, company: FiscalCompany, sequence: number): DpsBuildResult {
    const series = process.env.TAXAGENT_DPS_SERIES ?? '1';
    const id = buildDpsId(company.city_code, company.tax_id, series, sequence);
    const providerIdentity = normalizeTaxIdentity(company.tax_id);
    if (providerIdentity.kind !== 'CNPJ') throw new BadRequestException('TaxAgent company issuance currently requires a CNPJ prestador');
    const customerIdentity = normalizeTaxIdentity(input.customer.taxId);
    const issuedAt = input.issuedAt ?? new Date().toISOString();
    const competence = input.competence ?? issuedAt.slice(0, 10);
    const serviceLocationCityCode = input.service.serviceLocationCityCode ?? input.customer.cityCode;
    const municipalTax = buildMunicipalTaxGroup(input.service, company.tax_regime);
    const ibsCbs = buildIbsCbsGroup(input.service);
    const verifiedLayout = process.env.TAXAGENT_DPS_BUILDER_MODE === 'verified';
    const doc = { DPS: { '@_xmlns': 'http://www.sped.fazenda.gov.br/nfse', '@_versao': '1.01', infDPS: {
      '@_Id': id, tpAmb: input.environment === 'production' ? 1 : 2, dhEmi: issuedAt, verAplic: 'TaxAgent_0.12', serie: series, nDPS: sequence, dCompet: competence, tpEmit: 1, cLocEmi: company.city_code,
      prest: { CNPJ: providerIdentity.xmlValue, ...(company.municipal_registration ? { IM: company.municipal_registration } : {}) },
      toma: { [customerIdentity.kind]: customerIdentity.xmlValue, xNome: input.customer.name },
      serv: { locPrest: { cLocPrestacao: serviceLocationCityCode }, cServ: { cTribNac: input.service.nationalServiceCode, xDescServ: input.service.description } },
      valores: { vServPrest: { vServ: input.service.amount.toFixed(2) }, trib: municipalTax },
      ...(ibsCbs ? { IBSCBS: ibsCbs } : {}),
    } } };
    const builder = new XMLBuilder({ ignoreAttributes: false, format: false });
    return { xml: `<?xml version="1.0" encoding="UTF-8"?>${builder.build(doc)}`, id, sequence, series, verifiedLayout };
  }
}
