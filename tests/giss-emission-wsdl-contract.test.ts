import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectGissWsdlContract } from '../src/providers/giss/giss.client';
import { GissWsdlDiagnosticService } from '../src/operations/giss-wsdl-diagnostic.service';

test('resolves RecepcionarLoteRps wrappers without confusing synchronous operation', () => {
  const wsdl = `<?xml version="1.0"?>
  <wsdl:definitions xmlns:wsdl="http://schemas.xmlsoap.org/wsdl/" xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/" xmlns:tns="http://impl.webservice.ws.declaracao.eicon.com.br/" xmlns:abr="http://nfse.abrasf.org.br" targetNamespace="http://impl.webservice.ws.declaracao.eicon.com.br/">
    <wsdl:types><xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><xs:import namespace="http://nfse.abrasf.org.br" schemaLocation="nfse-ws?xsd=1"/></xs:schema></wsdl:types>
    <wsdl:message name="RecepcionarLoteRps"><wsdl:part name="parameters" element="abr:RecepcionarLoteRpsRequest"/></wsdl:message>
    <wsdl:message name="RecepcionarLoteRpsResponse"><wsdl:part name="parameters" element="abr:RecepcionarLoteRpsResponse"/></wsdl:message>
    <wsdl:message name="RecepcionarLoteRpsSincrono"><wsdl:part name="parameters" element="abr:RecepcionarLoteRpsSincronoRequest"/></wsdl:message>
    <wsdl:message name="RecepcionarLoteRpsSincronoResponse"><wsdl:part name="parameters" element="abr:RecepcionarLoteRpsSincronoResponse"/></wsdl:message>
    <wsdl:message name="ConsultarNfsePorRps"><wsdl:part name="parameters" element="abr:ConsultarNfsePorRpsRequest"/></wsdl:message>
    <wsdl:message name="ConsultarNfsePorRpsResponse"><wsdl:part name="parameters" element="abr:ConsultarNfsePorRpsResponse"/></wsdl:message>
    <wsdl:portType name="NfseWs">
      <wsdl:operation name="RecepcionarLoteRps"><wsdl:input message="tns:RecepcionarLoteRps"/><wsdl:output message="tns:RecepcionarLoteRpsResponse"/></wsdl:operation>
      <wsdl:operation name="RecepcionarLoteRpsSincrono"><wsdl:input message="tns:RecepcionarLoteRpsSincrono"/><wsdl:output message="tns:RecepcionarLoteRpsSincronoResponse"/></wsdl:operation>
      <wsdl:operation name="ConsultarNfsePorRps"><wsdl:input message="tns:ConsultarNfsePorRps"/><wsdl:output message="tns:ConsultarNfsePorRpsResponse"/></wsdl:operation>
    </wsdl:portType>
    <wsdl:binding name="NfseWsBinding" type="tns:NfseWs"><soap:binding style="document" transport="http://schemas.xmlsoap.org/soap/http"/>
      <wsdl:operation name="RecepcionarLoteRps"><soap:operation soapAction="http://nfse.abrasf.org.br/RecepcionarLoteRps"/></wsdl:operation>
      <wsdl:operation name="RecepcionarLoteRpsSincrono"><soap:operation soapAction="http://nfse.abrasf.org.br/RecepcionarLoteRpsSincrono"/></wsdl:operation>
      <wsdl:operation name="ConsultarNfsePorRps"><soap:operation soapAction="http://nfse.abrasf.org.br/ConsultarNfsePorRps"/></wsdl:operation>
    </wsdl:binding>
    <wsdl:service name="NfseWsService"><wsdl:port name="NfseWsPort" binding="tns:NfseWsBinding"><soap:address location="https://ws-homologacao-rtc.giss.com.br/service-ws/nf/nfse-ws"/></wsdl:port></wsdl:service>
  </wsdl:definitions>`;
  const schema = `<?xml version="1.0"?>
  <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="http://nfse.abrasf.org.br" xmlns="http://nfse.abrasf.org.br" elementFormDefault="unqualified">
    <xs:element name="RecepcionarLoteRpsRequest"><xs:complexType><xs:sequence><xs:element name="nfseCabecMsg" type="xs:string"/><xs:element name="nfseDadosMsg" type="xs:string"/></xs:sequence></xs:complexType></xs:element>
    <xs:element name="RecepcionarLoteRpsResponse"><xs:complexType><xs:sequence><xs:element name="outputXML" type="xs:string"/></xs:sequence></xs:complexType></xs:element>
    <xs:element name="RecepcionarLoteRpsSincronoRequest"><xs:complexType><xs:sequence><xs:element name="nfseCabecMsg" type="xs:string"/><xs:element name="nfseDadosMsg" type="xs:string"/></xs:sequence></xs:complexType></xs:element>
    <xs:element name="RecepcionarLoteRpsSincronoResponse"><xs:complexType><xs:sequence><xs:element name="outputXML" type="xs:string"/></xs:sequence></xs:complexType></xs:element>
    <xs:element name="ConsultarNfsePorRpsRequest"><xs:complexType><xs:sequence><xs:element name="nfseCabecMsg" type="xs:string"/><xs:element name="nfseDadosMsg" type="xs:string"/></xs:sequence></xs:complexType></xs:element>
    <xs:element name="ConsultarNfsePorRpsResponse"><xs:complexType><xs:sequence><xs:element name="outputXML" type="xs:string"/></xs:sequence></xs:complexType></xs:element>
  </xs:schema>`;

  const result = inspectGissWsdlContract(wsdl, [{ url: 'https://ws-homologacao-rtc.giss.com.br/service-ws/nf/nfse-ws?xsd=1', body: schema }]);
  assert.equal(result.emissionShapePresent, true);
  assert.equal(result.emissionRequestWrapper, 'RecepcionarLoteRpsRequest');
  assert.equal(result.emissionResponseWrapper, 'RecepcionarLoteRpsResponse');
  assert.equal(result.emissionRequestNamespace, 'http://nfse.abrasf.org.br');
  assert.equal(result.emissionResponseNamespace, 'http://nfse.abrasf.org.br');
  assert.deepEqual(result.emissionRequestMessageParts, ['parameters']);
  assert.deepEqual(result.emissionResponseMessageParts, ['parameters']);
  assert.notEqual(result.emissionRequestWrapper, 'RecepcionarLoteRpsSincronoRequest');
});

test('diagnostic marks emission wrapper mapping verified only with exact WSDL shape', async () => {
  const service = new GissWsdlDiagnosticService(
    { getActiveMaterial: async () => ({ fingerprint: 'fp_test', tlsCertificatePem: 'SECRET_CERT', tlsPrivateKeyPem: 'SECRET_KEY' }) } as any,
    { inspectWsdl: async () => ({
      host: 'ws-homologacao-rtc.giss.com.br',
      path: '/service-ws/nf/nfse-ws',
      status: 200,
      reachable: true,
      operations: ['RecepcionarLoteRps', 'RecepcionarLoteRpsSincrono'],
      operationBindings: [
        { operation: 'RecepcionarLoteRps', soapAction: 'http://nfse.abrasf.org.br/RecepcionarLoteRps' },
        { operation: 'RecepcionarLoteRpsSincrono', soapAction: 'http://nfse.abrasf.org.br/RecepcionarLoteRpsSincrono' },
      ],
      soapAddresses: ['https://ws-homologacao-rtc.giss.com.br/service-ws/nf/nfse-ws'],
      reconciliationSoapVersion: '1.1',
      requestWrappers: ['RecepcionarLoteRpsRequest', 'RecepcionarLoteRpsSincronoRequest'],
      emissionShapePresent: true,
      emissionRequestWrapper: 'RecepcionarLoteRpsRequest',
      emissionRequestNamespace: 'http://nfse.abrasf.org.br',
      emissionResponseWrapper: 'RecepcionarLoteRpsResponse',
      emissionResponseNamespace: 'http://nfse.abrasf.org.br',
      emissionRequestMessageParts: ['parameters'],
      emissionResponseMessageParts: ['parameters'],
    }) } as any,
    { getCompany: async () => ({}) } as any,
  );

  const result = await service.inspect('comp_1', 'test', '3548500');
  assert.equal(result.emission_transport.transport_present, true);
  assert.equal(result.emission_transport.shape_present, true);
  assert.equal(result.emission_transport.request_wrapper, 'RecepcionarLoteRpsRequest');
  assert.equal(result.emission_transport.response_wrapper, 'RecepcionarLoteRpsResponse');
  assert.equal(result.emission_transport.wrapper_mapping_verified, true);
  assert.equal(result.fiscal_transmission_attempted, false);
  assert.equal(result.emission_transport.fiscal_emission_attempted, false);
  assert.equal(JSON.stringify(result).includes('SECRET_CERT'), false);
  assert.equal(JSON.stringify(result).includes('SECRET_KEY'), false);
});
