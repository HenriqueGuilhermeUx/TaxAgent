import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectGissWsdlContract } from '../src/providers/giss/giss.client';

test('authenticated GISS WSDL contract parser recognizes reconciliation wrapper and message parameters', () => {
  const wsdl = `<?xml version="1.0"?>
  <wsdl:definitions xmlns:wsdl="http://schemas.xmlsoap.org/wsdl/" xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="http://nfse.abrasf.org.br">
    <xs:schema>
      <xs:element name="ConsultarNfsePorRpsRequest"><xs:complexType><xs:sequence>
        <xs:element name="nfseCabecMsg" type="xs:string"/>
        <xs:element name="nfseDadosMsg" type="xs:string"/>
      </xs:sequence></xs:complexType></xs:element>
      <xs:element name="ConsultarNfsePorRpsResponse"><xs:complexType><xs:sequence>
        <xs:element name="outputXML" type="xs:string"/>
      </xs:sequence></xs:complexType></xs:element>
    </xs:schema>
    <wsdl:portType><wsdl:operation name="ConsultarNfsePorRps"/></wsdl:portType>
    <wsdl:binding><wsdl:operation name="ConsultarNfsePorRps"><soap:operation xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/" soapAction="http://nfse.abrasf.org.br/ConsultarNfsePorRps"/></wsdl:operation></wsdl:binding>
  </wsdl:definitions>`;

  const result = inspectGissWsdlContract(wsdl);
  assert.equal(result.isWsdl, true);
  assert.equal(result.requiredOperationsPresent, true);
  assert.equal(result.reconciliationShapePresent, true);
  assert.deepEqual(result.requestWrappers, ['ConsultarNfsePorRpsRequest']);
  assert.equal(result.hasNfseCabecMsg, true);
  assert.equal(result.hasNfseDadosMsg, true);
  assert.equal(result.hasOutputXml, true);
  assert.ok(result.soapActions.includes('http://nfse.abrasf.org.br/ConsultarNfsePorRps'));
});

test('WSDL probe shape fails closed when reconciliation parameters are absent', () => {
  const result = inspectGissWsdlContract('<definitions><operation name="ConsultarNfsePorRps"/></definitions>');
  assert.equal(result.requiredOperationsPresent, true);
  assert.equal(result.reconciliationShapePresent, false);
  assert.equal(result.hasNfseCabecMsg, false);
});
