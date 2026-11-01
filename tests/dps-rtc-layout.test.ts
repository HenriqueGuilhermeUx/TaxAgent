import assert from 'node:assert/strict';
import test from 'node:test';
import { DpsBuilderService, buildIbsCbsGroup, buildRegularRegimeGroup } from '../src/xml-engine/dps-builder.service';

const service = { description: 'Serviço de software', amount: 1000, operationIndicator: '123456', taxSituation: '000', taxClassification: '000001' };

test('keeps the current production NT004 IBS/CBS nesting unchanged', () => {
  assert.deepEqual(buildIbsCbsGroup(service, 'production'), {
    finNFSe: 0,
    cIndOp: '123456',
    indDest: 0,
    valores: { trib: { gIBSCBS: { CST: '000', cClassTrib: '000001' } } },
  });
});

test('builds NT009 release 1 Produção Restrita IBS/CBS nesting', () => {
  assert.deepEqual(buildIbsCbsGroup(service, 'test'), {
    cIndOp: '123456',
    indDest: 0,
    valores: { trib: { CST: '000', cClassTrib: '000001' } },
  });
  assert.deepEqual(buildIbsCbsGroup({ ...service, finalConsumption: '1' }, 'test'), {
    indFinal: '1',
    cIndOp: '123456',
    indDest: 0,
    valores: { trib: { CST: '000', cClassTrib: '000001' } },
  });
});

test('DPS builder keeps TEST NT009 ordering isolated from production layout', () => {
  const builder = new DpsBuilderService({} as any);
  const base = {
    companyId: 'comp_layout',
    competence: '2026-11-01',
    issuedAt: '2026-11-01T12:00:00-03:00',
    customer: { taxId: '31041372850', name: 'Cliente Teste', cityCode: '3530607' },
    service: {
      description: 'Servicos de consultoria empresarial',
      amount: 100,
      nationalServiceCode: '170101',
      nbsCode: '114011900',
      serviceLocationCityCode: '3530607',
      issTaxation: '1' as const,
      issWithholding: '1' as const,
      issRate: 3,
      operationIndicator: '100301',
      taxSituation: '000',
      taxClassification: '000001',
    },
  };
  const company = { id: 'comp_layout', tax_id: '61922930000197', municipal_registration: null, city_code: '3530607', tax_regime: 'regular' };

  const testXml = builder.buildPreview({ ...base, environment: 'test' as const }, company, 1).xml;
  assert.match(testXml, /<tpEmit>1<\/tpEmit><finNFSe>0<\/finNFSe><cLocEmi>3530607<\/cLocEmi>/);
  assert.match(testXml, /<cServ><cTribNac>170101<\/cTribNac><cNBS>114011900<\/cNBS><xDescServ>Servicos de consultoria empresarial<\/xDescServ><\/cServ>/);
  assert.match(testXml, /<valores><trib><CST>000<\/CST><cClassTrib>000001<\/cClassTrib><\/trib><\/valores>/);
  assert.doesNotMatch(testXml, /<gIBSCBS>/);

  const productionXml = builder.buildPreview({ ...base, environment: 'production' as const }, company, 1).xml;
  assert.doesNotMatch(productionXml, /<tpEmit>1<\/tpEmit><finNFSe>/);
  assert.match(productionXml, /<cServ><cTribNac>170101<\/cTribNac><xDescServ>Servicos de consultoria empresarial<\/xDescServ><cNBS>114011900<\/cNBS><\/cServ>/);
  assert.match(productionXml, /<IBSCBS><finNFSe>0<\/finNFSe>/);
  assert.match(productionXml, /<gIBSCBS><CST>000<\/CST><cClassTrib>000001<\/cClassTrib><\/gIBSCBS>/);
});

test('does not create IBS/CBS group when no RTC fields are present', () => {
  assert.equal(buildIbsCbsGroup({ description: 'x', amount: 1 }, 'test'), undefined);
});

test('refuses partial or malformed IBS/CBS classification', () => {
  assert.throws(() => buildIbsCbsGroup({ ...service, taxClassification: undefined }, 'test'), /must be supplied together/);
  assert.throws(() => buildIbsCbsGroup({ ...service, operationIndicator: '123' }, 'test'), /exactly 6/);
  assert.throws(() => buildIbsCbsGroup({ ...service, taxSituation: '00' }, 'test'), /exactly 3/);
});

test('builds mandatory provider tax regime for regular first-cycle issuer', () => {
  assert.deepEqual(buildRegularRegimeGroup('regular'), { opSimpNac: 1, regEspTrib: 0 });
});
