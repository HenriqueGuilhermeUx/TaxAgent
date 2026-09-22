import assert from 'node:assert/strict';
import test from 'node:test';
import { DpsBuilderService } from '../src/xml-engine/dps-builder.service';

test('DPS emits structured national tomador address required by SEFIN E0234', () => {
  const builder = new DpsBuilderService({} as any);
  const result = builder.buildPreview({
    companyId: 'comp_test', environment: 'test', competence: '2026-09-21', issuedAt: '2026-09-21T20:50:24+00:00',
    customer: {
      taxId: '31041372850', name: 'Cliente Teste', cityCode: '3548500',
      address: { street: 'Rua Governador Pedro de Toledo', number: '71', district: 'Boqueirao', postalCode: '11045550', cityCode: '3548500' },
    },
    service: { description: 'Servicos de consultoria empresarial', amount: 100, nationalServiceCode: '170101', nbsCode: '114011900', serviceLocationCityCode: '3548500', issTaxation: '1', issWithholding: '1', issRate: 3, operationIndicator: '100301', taxSituation: '000', taxClassification: '000001' },
  }, { id: 'comp_test', tax_id: '61922930000197', municipal_registration: null, city_code: '3548500', tax_regime: 'regular' }, 2);
  assert.match(result.xml, /<cServ><cTribNac>170101<\/cTribNac><xDescServ>Servicos de consultoria empresarial<\/xDescServ><cNBS>114011900<\/cNBS><\/cServ>/);
  assert.match(result.xml, /<toma><CPF>31041372850<\/CPF><xNome>Cliente Teste<\/xNome><end><endNac><cMun>3548500<\/cMun><CEP>11045550<\/CEP><\/endNac><xLgr>Rua Governador Pedro de Toledo<\/xLgr><nro>71<\/nro><xBairro>Boqueirao<\/xBairro><\/end><\/toma>/);
});
