import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CertificatesModule } from '../certificates/certificates.module';
import { DocumentsModule } from '../documents/documents.module';
import { FiscalLedgerService } from '../ledger/fiscal-ledger.service';
import { MunicipalParametersModule } from '../municipal-parameters/municipal-parameters.module';
import { PreparedDpsModule } from '../prepared-dps/prepared-dps.module';
import { ProviderCredentialsModule } from '../provider-credentials/provider-credentials.module';
import { GissArtifactsService } from '../providers/giss/giss-artifacts.service';
import { GissClient } from '../providers/giss/giss.client';
import { GissSignatureService } from '../providers/giss/giss-signature.service';
import { NfseNationalClient } from '../providers/nfse-national/nfse-national.client';
import { SchemaRegistryModule } from '../schema-registry/schema-registry.module';
import { TaxEngineModule } from '../tax-engine/tax-engine.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { XmlEngineModule } from '../xml-engine/xml-engine.module';
import { DpsPreflightService } from './dps-preflight.service';
import { FiscalOnboardingController } from './fiscal-onboarding.controller';
import { FiscalOnboardingPreflightService } from './fiscal-onboarding-preflight.service';
import { FiscalOnboardingService } from './fiscal-onboarding.service';
import { GissQueryExecutionService } from './giss-query-execution.service';
import { GissWsdlDiagnosticService } from './giss-wsdl-diagnostic.service';
import { IssuerReadinessController } from './issuer-readiness.controller';
import { IssuerReadinessService } from './issuer-readiness.service';
import { MunicipalityScenarioController } from './municipality-scenario.controller';
import { MunicipalityScenarioService } from './municipality-scenario.service';
import { NationalDpsEligibilityService } from './national-dps-eligibility.service';
import { NationalPreflightService } from './national-preflight.service';
import { NoA1HomologationService } from './no-a1-homologation.service';
import { OperationsController } from './operations.controller';
import { ReadinessService } from './readiness.service';

@Module({
  imports: [AuthModule, TenancyModule, CertificatesModule, SchemaRegistryModule, MunicipalParametersModule, ProviderCredentialsModule, TaxEngineModule, XmlEngineModule, PreparedDpsModule, DocumentsModule],
  controllers: [OperationsController, MunicipalityScenarioController, IssuerReadinessController, FiscalOnboardingController],
  providers: [ReadinessService, DpsPreflightService, NoA1HomologationService, NfseNationalClient, GissClient, GissSignatureService, GissWsdlDiagnosticService, GissQueryExecutionService, GissArtifactsService, FiscalLedgerService, MunicipalityScenarioService, NationalPreflightService, NationalDpsEligibilityService, IssuerReadinessService, FiscalOnboardingService, FiscalOnboardingPreflightService],
  exports: [ReadinessService, NoA1HomologationService, FiscalOnboardingService, FiscalOnboardingPreflightService],
})
export class OperationsModule {}
