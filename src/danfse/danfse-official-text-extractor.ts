import { DanfseExtractedSemanticFields } from './danfse-semantic-comparator';

export const DANFSE_OFFICIAL_TEXT_EXTRACTOR_VERSION = 'official-labels-1.0.0';

const LABELS = {
  invalidLegal: 'NFS-e SEM VALIDADE JURÍDICA',
  accessKey: 'CHAVE DE ACESSO DA NFS-E',
  number: 'NÚMERO DA NFS-E',
  competence: 'COMPETÊNCIA DA NFS-E',
  issuedAt: 'DATA E HORA DA EMISSÃO DA NFS-E',
  provider: 'PRESTADOR / FORNECEDOR',
  customer: 'TOMADOR / ADQUIRENTE',
  recipient: 'DESTINATÁRIO DA OPERAÇÃO',
  intermediary: 'INTERMEDIÁRIO DA OPERAÇÃO',
  partyTaxId: 'CNPJ / CPF / NIF',
  partyName: 'Nome / Nome Empresarial',
  service: 'SERVIÇO PRESTADO',
  serviceCodes: 'Código de Tributação Nacional / Municipal',
  nbs: 'Código da NBS',
  description: 'Descrição do Serviço',
  municipalTax: 'TRIBUTAÇÃO MUNICIPAL (ISSQN)',
  issBase: 'BC ISSQN',
  issRate: 'Alíquota Aplicada',
  issAmount: 'ISSQN Apurado',
  ibsCbs: 'TRIBUTAÇÃO IBS / CBS',
  cstClass: 'CST / cClassTrib',
  ibsCbsBase: 'Base de Cálculo Após Exclusões e Reduções',
  ibsRates: 'Alíquota IBS UF / IBS Mun',
  ibsMunicipalAmount: 'Valor Apurado Municipal - IBS',
  ibsStateAmount: 'Valor Apurado Estadual - IBS',
  ibsTotal: 'Valor Total Apurado - IBS',
  cbsRate: 'Alíquota - CBS',
  cbsTotal: 'Valor Total Apurado - CBS',
  totals: 'VALOR TOTAL DA NFS-E',
  serviceTotal: 'VALOR DA OPERAÇÃO / SERVIÇO',
  retentions: 'Total das Retenções (ISSQN / Federais)',
  net: 'VALOR LÍQUIDO DA NFS-e',
  totalIbsCbs: 'Total do IBS/CBS',
  netPlusIbsCbs: 'VALOR LÍQUIDO DA NFS-e + IBS/CBS',
} as const;

const sectionLabels = new Set([
  LABELS.provider,
  LABELS.customer,
  LABELS.recipient,
  LABELS.intermediary,
  LABELS.service,
  LABELS.municipalTax,
  'TRIBUTAÇÃO FEDERAL (EXCETO CBS)',
  LABELS.ibsCbs,
  LABELS.totals,
  'INFORMAÇÕES COMPLEMENTARES',
]);

const allLabels = new Set<string>([
  ...Object.values(LABELS),
  'Indicador Municipal (Inscrição)',
  'Telefone',
  'Município / Sigla UF',
  'Código IBGE / CEP',
  'Endereço',
  'E-mail',
  'Simples Nacional na Data de Competência',
  'Regime de Apuração Tributária pelo SN',
  'Local da Prestação / Sigla UF / País',
  'Tipo de Tributação do ISSQN',
  'Município / Sigla UF / País de Incidência do ISSQN',
  'Regime Especial de Tributação do ISSQN',
  'Tipo de Imunidade do ISSQN',
  'Suspensão da Exigibilidade do ISSQN',
  'Número Processo Suspensão',
  'Benefício Municipal',
  'Cálculo do BM',
  'Total Deduções/Reduções',
  'Desconto Incondicionado',
  'TRIBUTAÇÃO FEDERAL (EXCETO CBS)',
  'IRRF',
  'Contribuição Previdenciária - Retida',
  'Contribuições Sociais - Retidas',
  'PIS - Débito Apuração Própria',
  'COFINS - Débito Apuração Própria',
  'Descrição Contrib. Sociais - Retidas',
  'Indicador de Operação / Código IBGE Incidência / Município Incidência / Sigla UF',
  'Exclusões e Reduções da Base de Cálculo',
  'Red. Alíquota IBS / Red. Alíquota CBS',
  'Alíq. Efetiva Municipal - IBS',
  'Alíq. Efetiva Estadual - IBS',
  'Alíquota Efetiva - CBS',
  'Desconto Condicionado',
]);

interface Candidate {
  value?: string;
  ambiguous: boolean;
}

function linesFrom(text: string): string[] {
  return text
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.normalize('NFC').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function isKnownLabel(line: string): boolean {
  if (allLabels.has(line)) return true;
  for (const label of allLabels) if (line === label || line.startsWith(`${label} `)) return true;
  return false;
}

function sectionRange(lines: string[], section: string): [number, number] | undefined {
  const start = lines.findIndex((line) => line === section);
  if (start < 0) return undefined;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (sectionLabels.has(lines[i])) {
      end = i;
      break;
    }
  }
  return [start + 1, end];
}

function candidateFor(lines: string[], label: string, start = 0, end = lines.length): Candidate {
  const values: string[] = [];
  for (let i = start; i < end; i += 1) {
    const line = lines[i];
    if (line === label) {
      for (let j = i + 1; j < Math.min(end, i + 5); j += 1) {
        if (isKnownLabel(lines[j])) break;
        if (lines[j]) {
          values.push(lines[j]);
          break;
        }
      }
      continue;
    }
    // A longer exact official label may start with a shorter label
    // (for example "VALOR LÍQUIDO DA NFS-e + IBS/CBS"). Never treat
    // an exact known label as an inline value of its shorter prefix.
    if (allLabels.has(line)) continue;
    if (line.startsWith(`${label} `)) {
      const rest = line.slice(label.length).trim();
      if (rest) values.push(rest);
    }
  }
  const unique = [...new Set(values)];
  return { value: unique.length === 1 ? unique[0] : undefined, ambiguous: unique.length > 1 };
}

function normalizedNumber(value: string): string {
  let raw = value
    .replace(/R\$/gi, '')
    .replace(/%/g, '')
    .replace(/\s+/g, '')
    .trim();
  if (!raw) return raw;
  if (/^-?[\d.]+,\d+$/.test(raw)) raw = raw.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d+,\d+$/.test(raw)) raw = raw.replace(',', '.');
  return raw;
}

function add(
  fields: Record<string, string | undefined>,
  ambiguous: string[],
  field: string,
  candidate: Candidate,
  normalize?: (value: string) => string,
): void {
  if (candidate.ambiguous) {
    ambiguous.push(field);
    return;
  }
  if (candidate.value !== undefined) fields[field] = normalize ? normalize(candidate.value) : candidate.value;
}

function addParty(
  lines: string[],
  fields: Record<string, string | undefined>,
  ambiguous: string[],
  section: string,
  prefix: 'provider' | 'customer',
): void {
  const range = sectionRange(lines, section);
  if (!range) return;
  add(fields, ambiguous, `${prefix}.tax_id`, candidateFor(lines, LABELS.partyTaxId, ...range));
  add(fields, ambiguous, `${prefix}.name`, candidateFor(lines, LABELS.partyName, ...range));
}

function splitPair(value: string): [string, string] | undefined {
  const parts = value.split('/').map((part) => part.trim()).filter(Boolean);
  return parts.length >= 2 ? [parts[0], parts[1]] : undefined;
}

export function extractOfficialDanfseTextFields(text: string): DanfseExtractedSemanticFields {
  const lines = linesFrom(text);
  const fields: Record<string, string | undefined> = {};
  const ambiguousFields: string[] = [];

  add(fields, ambiguousFields, 'document.access_key', candidateFor(lines, LABELS.accessKey));
  add(fields, ambiguousFields, 'document.number', candidateFor(lines, LABELS.number));
  add(fields, ambiguousFields, 'document.competence', candidateFor(lines, LABELS.competence));
  add(fields, ambiguousFields, 'document.issued_at', candidateFor(lines, LABELS.issuedAt));
  if (lines.includes(LABELS.invalidLegal)) fields['document.environment'] = 'test';

  addParty(lines, fields, ambiguousFields, LABELS.provider, 'provider');
  addParty(lines, fields, ambiguousFields, LABELS.customer, 'customer');

  const serviceRange = sectionRange(lines, LABELS.service);
  if (serviceRange) {
    const codes = candidateFor(lines, LABELS.serviceCodes, ...serviceRange);
    if (codes.ambiguous) {
      ambiguousFields.push('service.national_code', 'service.municipal_code');
    } else if (codes.value) {
      const pair = splitPair(codes.value);
      if (pair) {
        fields['service.national_code'] = pair[0];
        fields['service.municipal_code'] = pair[1];
      } else {
        ambiguousFields.push('service.national_code', 'service.municipal_code');
      }
    }
    add(fields, ambiguousFields, 'service.nbs', candidateFor(lines, LABELS.nbs, ...serviceRange));
    add(fields, ambiguousFields, 'service.description', candidateFor(lines, LABELS.description, ...serviceRange));
  }

  const issRange = sectionRange(lines, LABELS.municipalTax);
  if (issRange) {
    add(fields, ambiguousFields, 'iss.base', candidateFor(lines, LABELS.issBase, ...issRange), normalizedNumber);
    add(fields, ambiguousFields, 'iss.rate', candidateFor(lines, LABELS.issRate, ...issRange), normalizedNumber);
    add(fields, ambiguousFields, 'iss.amount', candidateFor(lines, LABELS.issAmount, ...issRange), normalizedNumber);
  }

  const ibsRange = sectionRange(lines, LABELS.ibsCbs);
  if (ibsRange) {
    add(fields, ambiguousFields, 'ibs_cbs.cst_class', candidateFor(lines, LABELS.cstClass, ...ibsRange));
    add(fields, ambiguousFields, 'ibs_cbs.base', candidateFor(lines, LABELS.ibsCbsBase, ...ibsRange), normalizedNumber);
    add(fields, ambiguousFields, 'ibs_cbs.municipal_amount', candidateFor(lines, LABELS.ibsMunicipalAmount, ...ibsRange), normalizedNumber);
    add(fields, ambiguousFields, 'ibs_cbs.state_amount', candidateFor(lines, LABELS.ibsStateAmount, ...ibsRange), normalizedNumber);
    add(fields, ambiguousFields, 'ibs_cbs.ibs_total', candidateFor(lines, LABELS.ibsTotal, ...ibsRange), normalizedNumber);
    add(fields, ambiguousFields, 'ibs_cbs.cbs_total', candidateFor(lines, LABELS.cbsTotal, ...ibsRange), normalizedNumber);

    const ibsRates = candidateFor(lines, LABELS.ibsRates, ...ibsRange);
    const cbsRate = candidateFor(lines, LABELS.cbsRate, ...ibsRange);
    if (ibsRates.ambiguous || cbsRate.ambiguous) {
      ambiguousFields.push('ibs_cbs.rates');
    } else if (ibsRates.value && cbsRate.value) {
      const pair = splitPair(ibsRates.value);
      if (pair) {
        fields['ibs_cbs.rates'] = [
          normalizedNumber(pair[0]),
          normalizedNumber(pair[1]),
          normalizedNumber(cbsRate.value),
        ].join(' / ');
      } else {
        ambiguousFields.push('ibs_cbs.rates');
      }
    }
  }

  const totalsRange = sectionRange(lines, LABELS.totals) ?? [0, lines.length] as [number, number];
  add(fields, ambiguousFields, 'totals.service', candidateFor(lines, LABELS.serviceTotal, ...totalsRange), normalizedNumber);
  add(fields, ambiguousFields, 'totals.retentions', candidateFor(lines, LABELS.retentions, ...totalsRange), normalizedNumber);
  add(fields, ambiguousFields, 'totals.net', candidateFor(lines, LABELS.net, ...totalsRange), normalizedNumber);
  add(fields, ambiguousFields, 'totals.net_plus_ibs_cbs', candidateFor(lines, LABELS.netPlusIbsCbs, ...totalsRange), normalizedNumber);

  return {
    fields,
    ambiguousFields: [...new Set(ambiguousFields)],
    extractionVersion: DANFSE_OFFICIAL_TEXT_EXTRACTOR_VERSION,
  };
}
