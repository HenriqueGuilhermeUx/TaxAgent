import { FiscalEngineError } from '../../fiscal-core/fiscal-engine.error';
import { GissSoapVersion } from './giss-wsdl-binding';

export interface GissReconciliationContract {
  reachable: boolean;
  isWsdl: boolean;
  requiredOperationsPresent: boolean;
  reconciliationShapePresent: boolean;
  reconciliationTransportPresent: boolean;
  reconciliationSoapAddress?: string;
  reconciliationSoapAction?: string;
  reconciliationSoapVersion?: GissSoapVersion;
  targetNamespace?: string;
}

export interface VerifiedGissReconciliationTransport {
  soapAddress: string;
  soapAction: string;
  soapVersion: GissSoapVersion;
  targetNamespace: string;
}

export function requireVerifiedGissReconciliationTransport(contract: GissReconciliationContract): VerifiedGissReconciliationTransport {
  const ready = contract.reachable
    && contract.isWsdl
    && contract.requiredOperationsPresent
    && contract.reconciliationShapePresent
    && contract.reconciliationTransportPresent
    && Boolean(contract.reconciliationSoapAddress)
    && Boolean(contract.reconciliationSoapAction)
    && Boolean(contract.reconciliationSoapVersion)
    && Boolean(contract.targetNamespace);

  if (!ready) {
    throw new FiscalEngineError(
      'TA_GISS_RECONCILIATION_CONTRACT_UNVERIFIED',
      'GISS reconciliation transport remains locked until the authenticated WSDL proves the ConsultarNfsePorRps wrapper, SOAPAction, SOAP version, HTTPS service address, target namespace and response shape.',
      false,
      {
        transmission_attempted: false,
        query_attempted: false,
        reachable: contract.reachable,
        is_wsdl: contract.isWsdl,
        operation_present: contract.requiredOperationsPresent,
        shape_present: contract.reconciliationShapePresent,
        transport_present: contract.reconciliationTransportPresent,
      },
    );
  }

  return {
    soapAddress: contract.reconciliationSoapAddress!,
    soapAction: contract.reconciliationSoapAction!,
    soapVersion: contract.reconciliationSoapVersion!,
    targetNamespace: contract.targetNamespace!,
  };
}
