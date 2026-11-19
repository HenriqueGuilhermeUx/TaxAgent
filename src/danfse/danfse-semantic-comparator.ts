import { DanfseModel } from './danfse.types';

export type DanfseSemanticState = 'inconclusive' | 'different' | 'matched_fields';

export interface DanfseExtractedSemanticFields {
  fields: Record<string, string | undefined>;
  ambiguousFields?: string[];
  extractionVersion: string;
}

export interface DanfseSemanticFinding {
  field: string;
  code: 'missing_canonical' | 'missing_extracted' | 'ambiguous_extracted' | 'different';
}

export interface DanfseSemanticAssessment {
  state: DanfseSemanticState;
  extraction_version: string;
  checked_fields: string[];
  findings: DanfseSemanticFinding[];
  visual_conformance: 'not_assessed';
  authoritative: false;
}

type Normalizer = (value: string) => string;

interface FieldRule {
  id: string;
  canonical: (model: DanfseModel) => string | undefined;
  normalize: Normalizer;
  requiredForMatch?: boolean;
}

const trim = (value: string) => value.trim();
const collapseText = (value: string) => value.normalize('NFC').trim().replace(/\s+/g, ' ');
const digits = (value: string) => value.replace(/\D+/g, '');

function decimal(value: string): string {
  const input = value.trim().replace(',', '.');
  const match = input.match(/^([+-]?)(\d+)(?:\.(\d+))?$/);
  if (!match) return input;
  const sign = match[1] === '-' ? '-' : '';
  const integer = match[2].replace(/^0+(?=\d)/, '') || '0';
  const fraction = (match[3] ?? '').replace(/0+$/, '');
  return fraction ? `${sign}${integer}.${fraction}` : `${sign}${integer}`;
}

const rules: FieldRule[] = [
  { id: 'document.access_key', canonical: (m) => m.accessKey, normalize: trim, requiredForMatch: true },
  { id: 'document.number', canonical: (m) => m.number, normalize: trim, requiredForMatch: true },
  { id: 'document.environment', canonical: (m) => m.environment, normalize: trim, requiredForMatch: true },
  { id: 'document.competence', canonical: (m) => m.competence, normalize: trim },
  { id: 'document.issued_at', canonical: (m) => m.issuedAt, normalize: trim },
  { id: 'provider.tax_id', canonical: (m) => m.provider.taxId, normalize: digits, requiredForMatch: true },
  { id: 'provider.name', canonical: (m) => m.provider.name, normalize: collapseText },
  { id: 'customer.tax_id', canonical: (m) => m.customer.taxId, normalize: digits },
  { id: 'customer.name', canonical: (m) => m.customer.name, normalize: collapseText },
  { id: 'service.national_code', canonical: (m) => m.service.nationalCode, normalize: trim },
  { id: 'service.municipal_code', canonical: (m) => m.service.municipalCode, normalize: trim },
  { id: 'service.nbs', canonical: (m) => m.service.nbs, normalize: trim },
  { id: 'service.description', canonical: (m) => m.service.description, normalize: collapseText },
  { id: 'iss.base', canonical: (m) => m.iss.base, normalize: decimal },
  { id: 'iss.rate', canonical: (m) => m.iss.rate, normalize: decimal },
  { id: 'iss.amount', canonical: (m) => m.iss.amount, normalize: decimal },
  { id: 'iss.retained', canonical: (m) => m.iss.retained, normalize: decimal },
  { id: 'ibs_cbs.cst_class', canonical: (m) => m.ibsCbs.cstClass, normalize: collapseText },
  { id: 'ibs_cbs.base', canonical: (m) => m.ibsCbs.base, normalize: decimal },
  { id: 'ibs_cbs.rates', canonical: (m) => m.ibsCbs.rates, normalize: collapseText },
  { id: 'ibs_cbs.state_amount', canonical: (m) => m.ibsCbs.stateAmount, normalize: decimal },
  { id: 'ibs_cbs.municipal_amount', canonical: (m) => m.ibsCbs.municipalAmount, normalize: decimal },
  { id: 'ibs_cbs.ibs_total', canonical: (m) => m.ibsCbs.ibsTotal, normalize: decimal },
  { id: 'ibs_cbs.cbs_total', canonical: (m) => m.ibsCbs.cbsTotal, normalize: decimal },
  { id: 'totals.service', canonical: (m) => m.totals.service, normalize: decimal, requiredForMatch: true },
  { id: 'totals.retentions', canonical: (m) => m.totals.retentions, normalize: decimal },
  { id: 'totals.net', canonical: (m) => m.totals.net, normalize: decimal },
  { id: 'totals.net_plus_ibs_cbs', canonical: (m) => m.totals.netPlusIbsCbs, normalize: decimal },
];

export function assessDanfseSemanticFields(
  model: DanfseModel,
  extracted: DanfseExtractedSemanticFields,
): DanfseSemanticAssessment {
  const findings: DanfseSemanticFinding[] = [];
  const checked: string[] = [];
  const ambiguous = new Set(extracted.ambiguousFields ?? []);

  for (const rule of rules) {
    const canonical = rule.canonical(model);
    const candidate = extracted.fields[rule.id];

    if (ambiguous.has(rule.id)) {
      findings.push({ field: rule.id, code: 'ambiguous_extracted' });
      continue;
    }

    if (canonical === undefined || canonical === '') {
      if (rule.requiredForMatch) findings.push({ field: rule.id, code: 'missing_canonical' });
      continue;
    }

    if (candidate === undefined || candidate === '') {
      findings.push({ field: rule.id, code: 'missing_extracted' });
      continue;
    }

    checked.push(rule.id);
    if (rule.normalize(canonical) !== rule.normalize(candidate)) {
      findings.push({ field: rule.id, code: 'different' });
    }
  }

  const hasDifference = findings.some((finding) => finding.code === 'different');
  const hasInconclusive = findings.some((finding) => finding.code !== 'different');
  const requiredIds = rules.filter((rule) => rule.requiredForMatch).map((rule) => rule.id);
  const allRequiredChecked = requiredIds.every((id) => checked.includes(id));

  const state: DanfseSemanticState = hasDifference
    ? 'different'
    : hasInconclusive || !allRequiredChecked || checked.length === 0
      ? 'inconclusive'
      : 'matched_fields';

  return {
    state,
    extraction_version: extracted.extractionVersion,
    checked_fields: checked,
    findings,
    visual_conformance: 'not_assessed',
    authoritative: false,
  };
}
