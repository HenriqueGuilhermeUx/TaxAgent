import assert from 'node:assert/strict';
import test from 'node:test';
import { buildIbsCbsGroup, buildRegularRegimeGroup } from '../src/xml-engine/dps-builder.service';

const service = { description: 'Serviço de software', amount: 1000, operationIndicator: '123456', taxSituation: '000', taxClassification: '000001' };

test('builds active Produção Restrita IBS/CBS nesting and keeps indFinal optional', () => {
  assert.deepEqual(buildIbsCbsGroup(service), { finNFSe: 0, cIndOp: '123456', indDest: 0, valores: { trib: { gIBSCBS: { CST: '000', cClassTrib: '000001' } } } });
  assert.deepEqual(buildIbsCbsGroup({ ...service, finalConsumption: '1' }), { finNFSe: 0, indFinal: '1', cIndOp: '123456', indDest: 0, valores: { trib: { gIBSCBS: { CST: '000', cClassTrib: '000001' } } } });
});
test('does not create IBS/CBS group when no RTC fields are present', () => { assert.equal(buildIbsCbsGroup({ description: 'x', amount: 1 }), undefined); });
test('refuses partial or malformed IBS/CBS classification', () => {
  assert.throws(() => buildIbsCbsGroup({ ...service, taxClassification: undefined }), /must be supplied together/);
  assert.throws(() => buildIbsCbsGroup({ ...service, operationIndicator: '123' }), /exactly 6/);
  assert.throws(() => buildIbsCbsGroup({ ...service, taxSituation: '00' }), /exactly 3/);
});
test('builds mandatory provider tax regime for regular first-cycle issuer', () => {
  assert.deepEqual(buildRegularRegimeGroup('regular'), { opSimpNac: 1, regEspTrib: 0 });
});
