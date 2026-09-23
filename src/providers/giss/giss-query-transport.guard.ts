import { FiscalEngineError } from '../../fiscal-core/fiscal-engine.error';
import { GissSoapVersion } from './giss-wsdl-binding';
import { GISS_SOAP_REQUEST_NAMESPACE } from './giss-wsdl-contract';

export interface GissReconciliationContract {
  reachable: boolean;
  isWsdl: boolean;
  requiredOperationsPresent: boolean;
  reconciliationShapePresent: boolean;
  reconciliationTransportPresent: boolean;
  reconciliationSoapAddress?: string;
  reconciliationSoapAction?: string;
  reconciliationSoapVersion?: GissSoapVersion;
  reconciliationRequestWrapper?: string;
  reconciliationRequestNamespace?: string;
  reconciliationResponseWrapper?: string;
  reconciliationResponseNamespace?: string;
}

export interface VerifiedGissReconciliationTransport {
  soapAddress: string;
  soapAction: string;
  soapVersion: GissSoapVersion;
  requestWrapper: 'ConsultarNfsePorRpsRequest';
  requestNamespace: string;
}

const normalizeNs = (value: string | undefined) => value?.replace(/\/+$/, '');

export function requireVerifiedGissReconciliationTransport(contract: GissReconciliationContract): VerifiedGissReconciliationTransport {
  const requestNamespaceVerified = normalizeNs(contract.reconciliationRequestNamespace) === normalizeNs(GISS_SOAP_REQUEST_NAMESPACE);
  const responseNamespaceVerified = normalizeNs(contract.reconciliationResponseNamespace) === normalizeNs(GISS_SOAP_REQUEST_NAMESPACE);
  const ready = contract.reachable
    && contract.isWsdl
    && contract.requiredOperationsPresent
    && contract.reconciliationShapePresent
    && contract.reconciliationTransportPresent
    && Boolean(contract.reconciliationSoapAddress)
    && Boolean(contract.reconciliationSoapAction)
    && Boolean(contract.reconciliationSoapVersion)
    && contract.reconciliationRequestWrapper === 'ConsultarNfsePorRpsRequest'
    && contract.reconciliationResponseWrapper === 'ConsultarNfsePorRpsResponse'
    && requestNamespaceVerified
    && responseNamespaceVerified;

  if (!ready) {
    throw new FiscalEngineError(
      'TA_GISS_RECONCILIATION_CONTRACT_UNVERIFIED',
      'GISS reconciliation transport remains locked until the authenticated WSDL and its same-host imports prove the ConsultarNfsePorRps request/response wrappers, ABRASF namespace, SOAPAction, SOAP version, HTTPS service address and response shape.',
      false,
      {
        transmission_attempted: false,
        query_attempted: false,
        reachable: contract.reachable,
        is_wsdl: contract.isWsdl,
        operation_present: contract.requiredOperationsPresent,
        shape_present: contract.reconciliationShapePresent,
        transport_present: contract.reconciliationTransportPresent,
        request_namespace_verified: requestNamespaceVerified,
        response_namespace_verified: responseNamespaceVerified,
      },
    );
  }

  return {
    soapAddress: contract.reconciliationSoapAddress!,
    soapAction: contract.reconciliationSoapAction!,
    soapVersion: contract.reconciliationSoapVersion!,
    requestWrapper: 'ConsultarNfsePorRpsRequest',
    requestNamespace: contract.reconciliationRequestNamespace!,
  };
}
