import assert from 'node:assert/strict';
import test from 'node:test';
import { emissionTransportBinding, inspectGissWsdlTransport, reconciliationTransportBinding } from '../src/providers/giss/giss-wsdl-binding';

test('extracts HTTPS SOAP address and ConsultarNfsePorRps SOAPAction', () => {
  const wsdl = `<?xml version="1.0"?>
  <wsdl:definitions xmlns:wsdl="http://schemas.xmlsoap.org/wsdl/" xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/">
    <wsdl:binding name="NfseBinding">
      <wsdl:operation name="ConsultarNfsePorRps">
        <soap:operation soapAction="http://nfse.abrasf.org.br/ConsultarNfsePorRps"/>
      </wsdl:operation>
    </wsdl:binding>
    <wsdl:service><wsdl:port><soap:address location="https://ws-homologacao.giss.com.br/service-ws/nf/nfse-ws"/></wsdl:port></wsdl:service>
  </wsdl:definitions>`;
  const parsed = inspectGissWsdlTransport(wsdl);
  const reconciliation = reconciliationTransportBinding(parsed);
  assert.equal(reconciliation.proven, true);
  assert.equal(reconciliation.soapAddress, 'https://ws-homologacao.giss.com.br/service-ws/nf/nfse-ws');
  assert.equal(reconciliation.soapAction, 'http://nfse.abrasf.org.br/ConsultarNfsePorRps');
});

test('extracts RecepcionarLoteRps transport independently from reconciliation', () => {
  const wsdl = `<?xml version="1.0"?>
  <wsdl:definitions xmlns:wsdl="http://schemas.xmlsoap.org/wsdl/" xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/">
    <wsdl:binding name="NfseBinding">
      <wsdl:operation name="ConsultarNfsePorRps"><soap:operation soapAction="http://nfse.abrasf.org.br/ConsultarNfsePorRps"/></wsdl:operation>
      <wsdl:operation name="RecepcionarLoteRps"><soap:operation soapAction="http://nfse.abrasf.org.br/RecepcionarLoteRps"/></wsdl:operation>
    </wsdl:binding>
    <wsdl:service><wsdl:port><soap:address location="https://ws-homologacao.giss.com.br/service-ws/nf/nfse-ws"/></wsdl:port></wsdl:service>
  </wsdl:definitions>`;
  const parsed = inspectGissWsdlTransport(wsdl);
  const emission = emissionTransportBinding(parsed);
  assert.equal(emission.proven, true);
  assert.equal(emission.operation, 'RecepcionarLoteRps');
  assert.equal(emission.soapAddress, 'https://ws-homologacao.giss.com.br/service-ws/nf/nfse-ws');
  assert.equal(emission.soapAction, 'http://nfse.abrasf.org.br/RecepcionarLoteRps');
  assert.equal(emission.soapVersion, '1.1');
});

test('reconciliation and emission transports remain independently unproven without their SOAPAction', () => {
  const parsed = inspectGissWsdlTransport('<definitions><operation name="ConsultarNfsePorRps"></operation><operation name="RecepcionarLoteRps"></operation></definitions>');
  assert.equal(reconciliationTransportBinding(parsed).proven, false);
  assert.equal(emissionTransportBinding(parsed).proven, false);
});
