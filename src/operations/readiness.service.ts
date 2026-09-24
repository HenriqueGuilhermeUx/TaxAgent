import { Injectable } from '@nestjs/common';
import { CertificateVaultService } from '../certificates/certificate-vault.service';
import { FiscalEnvironment } from '../fiscal-core/fiscal.types';
import { MunicipalParametersClient } from '../municipal-parameters/municipal-parameters.client';
import { MunicipalCapabilityService } from '../municipal-parameters/municipal-capability.service';
import { GissClient } from '../providers/giss/giss.client';
import { gissEndpointPolicy } from '../providers/giss/giss-endpoints';
import { NfseNationalClient } from '../providers/nfse-national/nfse-national.client';
import { nfseEndpointPolicy } from '../providers/nfse-national/nfse-endpoints';
import { SchemaRegistryService } from '../schema-registry/schema-registry.service';
import { TenancyService } from '../tenancy/tenancy.service';
import { ReadinessGate, summarizeReadiness } from './readiness.types';

interface CompanyRecord { id: string; tax_id: string; municipal_registration: string | null; city_code: string; tax_regime?: string | null }

@Injectable()
export class ReadinessService {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly vault: CertificateVaultService,
    private readonly schemas: SchemaRegistryService,
    private readonly parameters: MunicipalParametersClient,
    private readonly capabilities: MunicipalCapabilityService,
    private readonly nfse: NfseNationalClient,
    private readonly giss: GissClient,
  ) {}

  async report(companyId: string, environment: FiscalEnvironment) {
    const company = await this.tenancy.getCompany(companyId) as CompanyRecord;
    const certificates = await this.vault.metadata(companyId) as Array<{ status: string; valid_to?: Date | string | null; certificate_fingerprint?: string; subject_tax_id?: string | null }>;
    const activeCertificate = certificates.find((certificate) => certificate.status === 'active');
    const endpoint = nfseEndpointPolicy(environment);
    const schema = this.schemas.active(environment);
    const dpsConformance = this.schemas.dpsConformance(environment);
    const gates: ReadinessGate[] = [];
    const capability = await this.capabilities.resolve(company.city_code, environment, { taxRegime: company.tax_regime ?? undefined });
    const resolvedProvider = capability.route === 'national-direct'
      ? 'nfse-national'
      : capability.route === 'municipal-provider' && capability.provider === 'giss'
        ? 'giss'
        : undefined;

    gates.push({
      id: 'fiscal_route',
      label: 'Rota fiscal do município/contribuinte',
      status: resolvedProvider ? 'pass' : 'fail',
      blocking: true,
      detail: resolvedProvider === 'nfse-national'
        ? `Rota SEFIN Nacional comprovada para ${company.city_code}.`
        : resolvedProvider === 'giss'
          ? `Rota municipal GISS comprovada para ${company.city_code}; SEFIN direta permanece bloqueada.`
          : `Rota de emissão ainda não comprovada para ${company.city_code}; transmissão bloqueada.`,
      data: capability,
    } as ReadinessGate);

    const taxId = normalizeTaxId(company.tax_id);
    gates.push({ id: 'company_tax_id', label: 'CNPJ do prestador', status: /^[A-Z0-9]{14}$/.test(taxId) ? 'pass' : 'fail', blocking: true, detail: /^[A-Z0-9]{14}$/.test(taxId) ? 'Identificador de 14 posições compatível com CNPJ numérico/alfanumérico.' : 'CNPJ deve possuir 14 posições alfanuméricas.' });
    gates.push({ id: 'company_city_code', label: 'Código IBGE do município emissor', status: /^\d{7}$/.test(String(company.city_code ?? '')) ? 'pass' : 'fail', blocking: true, detail: /^\d{7}$/.test(String(company.city_code ?? '')) ? `Município emissor ${company.city_code}.` : 'Código IBGE municipal deve possuir 7 dígitos.' });
    gates.push({ id: 'tax_regime', label: 'Regime tributário suportado pelo builder live atual', status: String(company.tax_regime ?? '').toLowerCase() === 'regular' ? 'pass' : 'fail', blocking: true, detail: String(company.tax_regime ?? '').toLowerCase() === 'regular' ? 'Regime regular habilitado para o primeiro ciclo de homologação.' : 'Primeiro ciclo live está deliberadamente limitado a tax_regime=regular; Simples e regimes especiais serão liberados após regras específicas.' });
    gates.push({ id: 'municipal_registration', label: 'Inscrição municipal', status: company.municipal_registration ? 'pass' : 'warn', blocking: false, detail: company.municipal_registration ? 'Inscrição municipal cadastrada.' : 'Não cadastrada; algumas operações/municípios podem exigir IM.' });

    if (!activeCertificate) {
      gates.push({ id: 'certificate_a1', label: 'Certificado A1', status: 'fail', blocking: true, detail: 'Nenhum certificado A1 ativo no Certificate Vault.' });
      gates.push({ id: 'certificate_company_binding', label: 'A1 pertence ao CNPJ emissor', status: 'fail', blocking: true, detail: 'Não há A1 ativo para validar a vinculação com a Company.' });
    } else {
      const validTo = activeCertificate.valid_to ? new Date(activeCertificate.valid_to).getTime() : NaN;
      const valid = Number.isFinite(validTo) && validTo > Date.now();
      gates.push({ id: 'certificate_a1', label: 'Certificado A1', status: valid ? 'pass' : 'fail', blocking: true, detail: valid ? `A1 ativo; fingerprint ${activeCertificate.certificate_fingerprint ?? 'registrado'}; expira em ${new Date(validTo).toISOString()}.` : 'Certificado A1 ativo está expirado ou sem validade reconhecível.' });
      const subjectTaxId = normalizeTaxId(activeCertificate.subject_tax_id ?? '');
      const bound = subjectTaxId.length === 14 && subjectTaxId === taxId;
      gates.push({ id: 'certificate_company_binding', label: 'A1 pertence ao CNPJ emissor', status: bound ? 'pass' : 'fail', blocking: true, detail: bound ? `OID ICP-Brasil 2.16.76.1.3.3 confirma o CNPJ ${subjectTaxId}.` : 'CNPJ do certificado A1 não foi extraído do OID ICP-Brasil 2.16.76.1.3.3 ou não corresponde à Company.' });
    }

    if (resolvedProvider === 'nfse-national') {
      gates.push({ id: 'official_schema', label: 'XSD oficial sincronizado', status: this.schemas.localDpsXsd(environment) ? 'pass' : 'fail', blocking: true, detail: this.schemas.localDpsXsd(environment) ? `Schema ${schema.id} disponível no runtime.` : `Schema ${schema.id} ainda não foi sincronizado no runtime.` });
      gates.push({
        id: 'dps_builder_verified',
        label: 'DPS Builder homologado',
        status: dpsConformance.verified ? 'pass' : 'fail',
        blocking: true,
        detail: dpsConformance.verified ? dpsConformance.reason : `Builder sem atestado válido para o schema ativo: ${dpsConformance.reason}.`,
        data: dpsConformance.attestation,
      });
      gates.push({ id: 'nfse_endpoint', label: 'Endpoint SEFIN', status: endpoint.configured && (endpoint.official || endpoint.customAllowed) ? 'pass' : 'fail', blocking: true, detail: endpoint.official ? `Endpoint oficial: ${endpoint.url}` : endpoint.customAllowed ? `Endpoint custom explicitamente permitido: ${endpoint.url}` : `Endpoint deve ser o oficial ${endpoint.expectedHost}${endpoint.expectedPath}.` });
    } else if (resolvedProvider === 'giss') {
      const gissEndpoint = gissEndpointPolicy(company.city_code);
      gates.push({
        id: 'giss_transport_contract',
        label: 'Contrato SOAP GISS homologado',
        status: 'fail',
        blocking: true,
        detail: 'Rota, assinatura SHA-1 e builders GISS estão montados, mas o transporte SOAP continua deliberadamente bloqueado até o WSDL autenticado confirmar wrapper, namespace, versão SOAP, endereço HTTPS, SOAPAction e a reconciliação ConsultarNfsePorRps ser validada ponta a ponta.',
        data: gissEndpoint ? { protocol: gissEndpoint.protocol, layout: gissEndpoint.layout, homologation_wsdl: gissEndpoint.homologationWsdl } : undefined,
      });
    }

    gates.push({ id: 'nfse_mode_live', label: 'Modo fiscal live', status: process.env.TAXAGENT_NFSE_MODE === 'live' ? 'pass' : 'fail', blocking: true, detail: process.env.TAXAGENT_NFSE_MODE === 'live' ? 'Fiscal Router habilitado para provider real resolvido.' : 'Provider permanece em mock; correto até concluir o preflight.' });
    gates.push({ id: 'live_enabled', label: 'Chave geral de transmissão', status: process.env.TAXAGENT_LIVE_ENABLED === 'true' ? 'pass' : 'fail', blocking: true, detail: process.env.TAXAGENT_LIVE_ENABLED === 'true' ? 'Transmissão real explicitamente habilitada.' : 'TAXAGENT_LIVE_ENABLED=false; correto até concluir o preflight.' });

    return {
      company_id: companyId,
      environment,
      provider: resolvedProvider ?? 'unresolved',
      route: capability,
      schema: { id: schema.id, status: schema.status },
      dps_conformance: dpsConformance,
      endpoint,
      provider_endpoint: resolvedProvider === 'giss' ? gissEndpointPolicy(company.city_code) : endpoint,
      gates,
      ...summarizeReadiness(gates),
      checked_at: new Date().toISOString(),
    };
  }

  async probe(companyId: string, environment: FiscalEnvironment) {
    const company = await this.tenancy.getCompany(companyId) as CompanyRecord;
    const base = await this.report(companyId, environment);
    const probes: Array<{ id: string; status: 'pass' | 'fail'; detail: string; data?: unknown }> = [];
    const route = await this.capabilities.resolve(company.city_code, environment, { taxRegime: company.tax_regime ?? undefined });

    if (route.route === 'national-direct') {
      try {
        const certificate = await this.vault.getActiveMaterial(companyId);
        const tls = await this.nfse.probeMutualTls(environment, certificate);
        probes.push({ id: 'sefin_mtls', status: 'pass', detail: 'Handshake TLS com certificado cliente concluído contra a SEFIN configurada.', data: tls });
      } catch (error) {
        probes.push({ id: 'sefin_mtls', status: 'fail', detail: error instanceof Error ? error.message : 'Falha no handshake mTLS.' });
      }
      try {
        const certificate = await this.vault.getActiveMaterial(companyId);
        const convention = await this.parameters.getConvention(environment, company.city_code, certificate);
        probes.push({ id: 'municipal_convention', status: convention.supported ? 'pass' : 'fail', detail: convention.supported ? `Parâmetros do convênio encontrados para ${company.city_code}.` : `Município ${company.city_code} não retornou convênio no endpoint configurado.`, data: { status: convention.status } });
      } catch (error) {
        probes.push({ id: 'municipal_convention', status: 'fail', detail: error instanceof Error ? error.message : 'Falha na consulta de parâmetros municipais.' });
      }
      probes.push({ id: 'fiscal_route', status: 'pass', detail: `Rota national-direct confirmada para ${company.city_code}.`, data: route });
    } else if (route.route === 'municipal-provider' && route.provider === 'giss') {
      try {
        const certificate = await this.vault.getActiveMaterial(companyId);
        const wsdl = await this.giss.inspectWsdl(company.city_code, certificate);
        const transportOk = wsdl.reachable && wsdl.isWsdl;
        probes.push({
          id: 'giss_wsdl_mtls',
          status: transportOk ? 'pass' : 'fail',
          detail: transportOk ? 'WSDL GISS de homologação acessado por GET com A1/mTLS; nenhuma operação fiscal foi transmitida.' : `Resposta GISS não comprovou um WSDL válido (HTTP ${wsdl.status}).`,
          data: wsdl,
        });
        const contractOk = wsdl.requiredOperationsPresent
          && wsdl.reconciliationShapePresent
          && wsdl.reconciliationTransportPresent
          && Boolean(wsdl.reconciliationSoapAddress)
          && Boolean(wsdl.reconciliationSoapAction)
          && Boolean(wsdl.reconciliationSoapVersion)
          && Boolean(wsdl.targetNamespace);
        probes.push({
          id: 'giss_wsdl_contract',
          status: contractOk ? 'pass' : 'fail',
          detail: contractOk
            ? 'WSDL autenticado comprovou ConsultarNfsePorRps, wrapper/partes, namespace, versão SOAP, endereço HTTPS e SOAPAction.'
            : `Contrato de reconciliação incompleto; operações ausentes: ${wsdl.missingRequiredOperations.join(', ') || 'nenhuma'}, shape/transporte ainda não comprovados.`,
          data: {
            targetNamespace: wsdl.targetNamespace,
            operations: wsdl.operations,
            requestWrappers: wsdl.requestWrappers,
            reconciliationShapePresent: wsdl.reconciliationShapePresent,
            reconciliationTransportPresent: wsdl.reconciliationTransportPresent,
            soapAddress: wsdl.reconciliationSoapAddress,
            soapAction: wsdl.reconciliationSoapAction,
            soapVersion: wsdl.reconciliationSoapVersion,
          },
        });
      } catch (error) {
        probes.push({ id: 'giss_wsdl_mtls', status: 'fail', detail: error instanceof Error ? error.message : 'Falha no acesso autenticado ao WSDL GISS.' });
        probes.push({ id: 'giss_wsdl_contract', status: 'fail', detail: 'Contrato SOAP não pôde ser inspecionado porque o WSDL autenticado não foi obtido.' });
      }
      probes.push({ id: 'fiscal_route', status: 'pass', detail: `Rota municipal-provider/giss confirmada para ${company.city_code}; SEFIN direta não será usada.`, data: route });
    } else {
      probes.push({ id: 'fiscal_route', status: 'fail', detail: `Rota resolvida como ${route.route}/${route.provider}; nenhum transporte fiscal será testado.`, data: route });
    }

    const networkReady = probes.length > 0 && probes.every((probe) => probe.status === 'pass');
    return {
      ...base,
      probes,
      network_ready: networkReady,
      ready_to_enable_live: base.readyToEnableLive && networkReady,
      ready_for_transmission: base.readyForTransmission && networkReady,
      probed_at: new Date().toISOString(),
    };
  }
}

function normalizeTaxId(value: string): string { return String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
