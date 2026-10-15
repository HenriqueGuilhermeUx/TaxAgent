import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectGissWsdlContract } from '../src/providers/giss/giss.client';
import { gissEndpointPolicy } from '../src/providers/giss/giss-endpoints';

test('authenticated GISS RTC WSDL resolves ConsultarNfsePorRps through imported ABRASF schema', () => {
  const wsdl = `<?xml version="1.0"?>
  <wsdl:definitions xmlns:wsdl="http://schemas.xmlsoap.org/wsdl/" xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/" xmlns:tns="http://impl.webservice.ws.declaracao.eicon.com.br/" xmlns:abr="http://nfse.abrasf.org.br" targetNamespace="http://impl.webservice.ws.declaracao.eicon.com.br/">
    <wsdl:types><xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><xs:import namespace="http://nfse.abrasf.org.br" schemaLocation="nfse-ws?xsd=1"/></xs:schema></wsdl:types>
    <wsdl:message name="ConsultarNfsePorRps"><wsdl:part name="parameters" element="abr:ConsultarNfsePorRpsRequest"/></wsdl:message>
    <wsdl:message name="ConsultarNfsePorRpsResponse"><wsdl:part name="parameters" element="abr:ConsultarNfsePorRpsResponse"/></wsdl:message>
    <wsdl:portType name="NfseWs"><wsdl:operation name="ConsultarNfsePorRps"><wsdl:input message="tns:ConsultarNfsePorRps"/><wsdl:output message="tns:ConsultarNfsePorRpsResponse"/></wsdl:operation></wsdl:portType>
    <wsdl:binding name="NfseWsBinding" type="tns:NfseWs"><soap:binding style="document" transport="http://schemas.xmlsoap.org/soap/http"/><wsdl:operation name="ConsultarNfsePorRps"><soap:operation soapAction="http://nfse.abrasf.org.br/ConsultarNfsePorRps"/></wsdl:operation></wsdl:binding>
    <wsdl:service name="NfseWsService"><wsdl:port name="NfseWsPort" binding="tns:NfseWsBinding"><soap:address location="https://ws-homologacao-rtc.giss.com.br/service-ws/nf/nfse-ws"/></wsdl:port></wsdl:service>
  </wsdl:definitions>`;
  const schema = `<?xml version="1.0"?>
  <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="http://nfse.abrasf.org.br" xmlns="http://nfse.abrasf.org.br" elementFormDefault="unqualified">
    <xs:element name="ConsultarNfsePorRpsRequest"><xs:complexType><xs:sequence><xs:element name="nfseCabecMsg" type="xs:string"/><xs:element name="nfseDadosMsg" type="xs:string"/></xs:sequence></xs:complexType></xs:element>
    <xs:element name="ConsultarNfsePorRpsResponse"><xs:complexType><xs:sequence><xs:element name="outputXML" type="xs:string"/></xs:sequence></xs:complexType></xs:element>
  </xs:schema>`;

  const result = inspectGissWsdlContract(wsdl, [{ url: 'https://ws-homologacao-rtc.giss.com.br/service-ws/nf/nfse-ws?xsd=1', body: schema }]);
  assert.equal(result.targetNamespace, 'http://impl.webservice.ws.declaracao.eicon.com.br/');
  assert.equal(result.isWsdl, true);
  assert.equal(result.requiredOperationsPresent, true);
  assert.equal(result.reconciliationShapePresent, true);
  assert.equal(result.reconciliationRequestWrapper, 'ConsultarNfsePorRpsRequest');
  assert.equal(result.reconciliationRequestNamespace, 'http://nfse.abrasf.org.br');
  assert.equal(result.reconciliationResponseWrapper, 'ConsultarNfsePorRpsResponse');
  assert.equal(result.hasNfseCabecMsg, true);
  assert.equal(result.hasNfseDadosMsg, true);
  assert.equal(result.hasOutputXml, true);
  assert.equal(result.supportingDocumentsInspected, 1);
  assert.ok(result.soapActions.includes('http://nfse.abrasf.org.br/ConsultarNfsePorRps'));
});

test('WSDL shape fails closed when imported response/request evidence is absent', () => {
  const wsdl = `<definitions xmlns="http://schemas.xmlsoap.org/wsdl/" targetNamespace="http://impl.example/"><portType><operation name="ConsultarNfsePorRps"/></portType></definitions>`;
  const result = inspectGissWsdlContract(wsdl);
  assert.equal(result.requiredOperationsPresent, true);
  assert.equal(result.reconciliationShapePresent, false);
  assert.equal(result.hasNfseCabecMsg, false);
});

test('Santos GISS policy uses RTC homologation endpoint without changing production municipality routing', () => {
  const policy = gissEndpointPolicy('3548500');
  assert.ok(policy);
  assert.equal(policy.homologationWsdl, 'https://ws-homologacao-rtc.giss.com.br/service-ws/nf/nfse-ws?wsdl');
  assert.equal(policy.productionWsdl, 'https://ws-santos.giss.com.br/service-ws/nf/nfse-ws?wsdl');
  assert.equal(policy.layout, 'abrasf-2.04');
  assert.equal(gissEndpointPolicy('9999999'), null);
});
