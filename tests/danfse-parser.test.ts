import assert from 'node:assert/strict';
import test from 'node:test';
import { DanfseParserService } from '../src/danfse/danfse-parser.service';

test('maps authorized NFS-e XML into NT008 render model without inventing missing values', () => {
  const xml = `<?xml version="1.0"?><NFSe><infNFSe Id="NFS123456789"><nNFSe>77</nNFSe><dhProc>2026-08-08T10:00:00-03:00</dhProc><emit><xNome>Município Emissor</xNome><enderNac><xLocEmi>Santos</xLocEmi><UF>SP</UF></enderNac></emit><DPS><infDPS><tpAmb>2</tpAmb><dCompet>2026-08-01</dCompet><serie>1</serie><nDPS>9</nDPS><dhEmi>2026-08-08T09:59:00-03:00</dhEmi><prest><CNPJ>12345678000199</CNPJ><xNome>Prestador LTDA</xNome></prest><toma><CNPJ>98765432000111</CNPJ><xNome>Cliente LTDA</xNome></toma><serv><cServ><cTribNac>01.01.01</cTribNac><cNBS>123</cNBS><xDescServ>Consultoria</xDescServ></cServ></serv><valores><vServPrest><vServ>5000.00</vServ></vServPrest></valores></infDPS></DPS><valores><vLiq>5000.00</vLiq></valores></infNFSe></NFSe>`;
  const model = new DanfseParserService().parse(xml);
  assert.equal(model.specVersion, 'NT008-1.02');
  assert.equal(model.environment, 'test');
  assert.equal(model.accessKey, '123456789');
  assert.equal(model.number, '77');
  assert.equal(model.provider.taxId, '12345678000199');
  assert.equal(model.customer.name, 'Cliente LTDA');
  assert.equal(model.service.nationalCode, '01.01.01');
  assert.equal(model.service.description, 'Consultoria');
  assert.equal(model.totals.net, '5000.00');
  assert.equal(model.intermediary.name, undefined);
});
