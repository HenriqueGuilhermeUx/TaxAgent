import assert from 'node:assert/strict';
import test from 'node:test';
import { buildIbsCbsGroup } from '../src/xml-engine/dps-builder.service';

const service = {
  description: 'Serviço de software',
  amount: 1000,
  operationIndicator: '123456',
  taxSituation: '000',
  taxClassification: '000001',
};

test('builds the NT004 IBS/CBS nesting used by DPS', () => {
  assert.deepEqual(buildIbsCbsGroup(service), {
    finNFSe: 0,
    cIndOp: '123456',
    indDest: 0,
    valores: {
      trib: {
        gIBSCBS: {
          CST: '000',
          cClassTrib: '000001',
        },
      },
    },
  });
});

test('does not create IBS/CBS group when no RTC fields are present', () => {
  assert.equal(buildIbsCbsGroup({ description: 'x', amount: 1 }), undefined);
});

test('refuses partial or malformed IBS/CBS classification', () => {
  assert.throws(() => buildIbsCbsGroup({ ...service, taxClassification: undefined }), /must be supplied together/);
  assert.throws(() => buildIbsCbsGroup({ ...service, operationIndicator: '123' }), /exactly 6/);
  assert.throws(() => buildIbsCbsGroup({ ...service, taxSituation: '00' }), /exactly 3/);
  assert.throws(() => buildIbsCbsGroup({ ...service, taxClassification: '1' }), /exactly 6/);
});
