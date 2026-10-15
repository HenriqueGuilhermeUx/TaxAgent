export type AutopilotServiceProfile = 'business_consulting';

const BUSINESS_MARKERS = ['consultoria empresarial', 'assessoria empresarial', 'consultoria de gestao', 'assessoria de gestao'];
const SPECIALTY_MARKERS = [
  'financeir', 'econom', 'contabil', 'contábil', 'jurid', 'advoc', 'engenh', 'arquitet', 'medic', 'saude', 'saúde',
  'tecnologia', 'software', 'sistema', 'tributar', 'fiscal', 'marketing', 'publicidade', 'recursos humanos', 'rh ', 'ambiental',
];

export function normalizeAutopilotText(value: string): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function detectServiceProfile(description: string): AutopilotServiceProfile | undefined {
  const normalized = normalizeAutopilotText(description);
  const business = BUSINESS_MARKERS.some((marker) => normalized.includes(normalizeAutopilotText(marker)));
  const specialty = SPECIALTY_MARKERS.some((marker) => normalized.includes(normalizeAutopilotText(marker)));
  return business && !specialty ? 'business_consulting' : undefined;
}
