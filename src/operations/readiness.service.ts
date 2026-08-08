import { Injectable } from '@nestjs/common';
import { CertificateVaultService } from '../certificates/certificate-vault.service';
import { FiscalEnvironment } from '../fiscal-core/fiscal.types';
import { MunicipalParametersClient } from '../municipal-parameters/municipal-parameters.client';
import { NfseNationalClient } from '../providers/nfse-national/nfse-national.client';
import { nfseEndpointPolicy } from '../providers/nfse-national/nfse-endpoints';
import { SchemaRegistryService } from '../schema-registry/schema-registry.service';
import { TenancyService } from '../tenancy/tenancy.service';
import { ReadinessGate, summarizeReadiness } from './readiness.types';

interface CompanyRecord { id: string; tax_id: string; municipal_registration: string | null; city_code: string; tax_regime?: string | null }
@Injectable()
export class ReadinessService {
  constructor(private readonly tenancy: TenancyService, private readonly vault: CertificateVaultService, private readonly schemas: SchemaRegistryService, private readonly parameters: MunicipalParametersClient, private readonly nfse: NfseNationalClient) {}
  async report(companyId: string, environment: FiscalEnvironment) {
    const company = await this.tenancy.getCompany(companyId) as CompanyRecord;
    const certificates = await this.vault.metadata(companyId) as Array<{ status: string; valid_to?: Date | string | null; certificate_fingerprint?: string }>;
    const activeCertificate = certificates.find((certificate) => certificate.status === 'active');
    const endpoint = nfseEndpointPolicy(environment); const schema = this.schemas.active(environment); const gates: ReadinessGate[] = [];
    const taxId = String(company.tax_id ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    gates.push({ id: 'company_tax_id', label: 'CNPJ do prestador', status: /^[A-Z0-9]{14}$/.test(taxId) ? 'pass' : 'fail', blocking: true, detail: /^[A-Z0-9]{14}$/.test(taxId) ? 'Identificador de 14 posições compatível com CNPJ numérico/alfanumérico.' : 'CNPJ deve possuir 14 posições alfanuméricas.' });
    gates.push({ id: 'company_city_code', label: 'Código IBGE do município emissor', status: /^\d{7}$/.test(String(company.city_code ?? '')) ? 'pass' : 'fail', blocking: true, detail: /^\d{7}$/.test(String(company.city_code ?? '')) ? `Município emissor ${company.city_code}.` : 'Código IBGE municipal deve possuir 7 dígitos.' });
    gates.push({ id: 'tax_regime', label: 'Regime tributário suportado pelo builder live atual', status: String(company.tax_regime ?? '').toLowerCase() === 'regular' ? 'pass' : 'fail', blocking: true, detail: String(company.tax_regime ?? '').toLowerCase() === 'regular' ? 'Regime regular habilitado para o primeiro ciclo de homologação.' : 'Primeiro ciclo live está deliberadamente limitado a tax_regime=regular; Simples e regimes especiais serão liberados após regras específicas.' });
    gates.push({ id: 'municipal_registration', label: 'Inscrição municipal', status: company.municipal_registration ? 'pass' : 'warn', blocking: false, detail: company.municipal_registration ? 'Inscrição municipal cadastrada.' : 'Não cadastrada; algumas operações/municípios podem exigir IM.' });
    if (!activeCertificate) gates.push({ id: 'certificate_a1', label: 'Certificado A1', status: 'fail', blocking: true, detail: 'Nenhum certificado A1 ativo no Certificate Vault.' });
    else { const validTo = activeCertificate.valid_to ? new Date(activeCertificate.valid_to).getTime() : NaN; const valid = Number.isFinite(validTo) && validTo > Date.now(); gates.push({ id: 'certificate_a1', label: 'Certificado A1', status: valid ? 'pass' : 'fail', blocking: true, detail: valid ? `A1 ativo; fingerprint ${activeCertificate.certificate_fingerprint ?? 'registrado'}; expira em ${new Date(validTo).toISOString()}.` : 'Certificado A1 ativo está expirado ou sem validade reconhecível.' }); }
    gates.push({ id: 'official_schema', label: 'XSD oficial sincronizado', status: this.schemas.localDpsXsd(environment) ? 'pass' : 'fail', blocking: true, detail: this.schemas.localDpsXsd(environment) ? `Schema ${schema.id} disponível no runtime.` : `Schema ${schema.id} ainda não foi sincronizado no runtime.` });
    gates.push({ id: 'dps_builder_verified', label: 'DPS Builder homologado', status: process.env.TAXAGENT_DPS_BUILDER_MODE === 'verified' ? 'pass' : 'fail', blocking: true, detail: process.env.TAXAGENT_DPS_BUILDER_MODE === 'verified' ? 'Builder explicitamente marcado como verificado.' : 'TAXAGENT_DPS_BUILDER_MODE ainda não está em verified.' });
    gates.push({ id: 'nfse_endpoint', label: 'Endpoint SEFIN', status: endpoint.configured && (endpoint.official || endpoint.customAllowed) ? 'pass' : 'fail', blocking: true, detail: endpoint.official ? `Endpoint oficial: ${endpoint.url}` : endpoint.customAllowed ? `Endpoint custom explicitamente permitido: ${endpoint.url}` : `Endpoint deve ser o oficial ${endpoint.expectedHost}${endpoint.expectedPath}.` });
    gates.push({ id: 'nfse_mode_live', label: 'Modo NFS-e live', status: process.env.TAXAGENT_NFSE_MODE === 'live' ? 'pass' : 'fail', blocking: true, detail: process.env.TAXAGENT_NFSE_MODE === 'live' ? 'Provider configurado para transmissão real.' : 'Provider permanece em mock; correto até concluir o preflight.' });
    gates.push({ id: 'live_enabled', label: 'Chave geral de transmissão', status: process.env.TAXAGENT_LIVE_ENABLED === 'true' ? 'pass' : 'fail', blocking: true, detail: process.env.TAXAGENT_LIVE_ENABLED === 'true' ? 'Transmissão real explicitamente habilitada.' : 'TAXAGENT_LIVE_ENABLED=false; correto até concluir o preflight.' });
    return { company_id: companyId, environment, schema: { id: schema.id, status: schema.status }, endpoint, gates, ...summarizeReadiness(gates), checked_at: new Date().toISOString() };
  }
  async probe(companyId: string, environment: FiscalEnvironment) {
    const company = await this.tenancy.getCompany(companyId) as CompanyRecord; const base = await this.report(companyId, environment); const probes: Array<{ id: string; status: 'pass' | 'fail'; detail: string; data?: unknown }> = [];
    try { const certificate = await this.vault.getActiveMaterial(companyId); const tls = await this.nfse.probeMutualTls(environment, certificate); probes.push({ id: 'sefin_mtls', status: 'pass', detail: 'Handshake TLS com certificado cliente concluído contra a SEFIN configurada.', data: tls }); } catch (error) { probes.push({ id: 'sefin_mtls', status: 'fail', detail: error instanceof Error ? error.message : 'Falha no handshake mTLS.' }); }
    try { const convention = await this.parameters.getConvention(environment, company.city_code); probes.push({ id: 'municipal_convention', status: convention.supported ? 'pass' : 'fail', detail: convention.supported ? `Parâmetros do convênio encontrados para ${company.city_code}.` : `Município ${company.city_code} não retornou convênio no endpoint configurado.`, data: { status: convention.status } }); } catch (error) { probes.push({ id: 'municipal_convention', status: 'fail', detail: error instanceof Error ? error.message : 'Falha na consulta de parâmetros municipais.' }); }
    const networkReady = probes.every((probe) => probe.status === 'pass');
    return { ...base, probes, network_ready: networkReady, ready_to_enable_live: base.readyToEnableLive && networkReady, ready_for_transmission: base.readyForTransmission && networkReady, probed_at: new Date().toISOString() };
  }
}
