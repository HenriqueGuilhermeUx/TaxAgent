import assert from 'node:assert/strict';
import test from 'node:test';
import { FiscalEngineError } from '../src/fiscal-core/fiscal-engine.error';
import { buildGissCabecalho } from '../src/providers/giss/giss-header.builder';

test('builds exact GISS ABRASF 2.04 header with provider namespaces', () => {
  assert.equal(
    buildGissCabecalho(),
    '<cabecalho xmlns="http://www.giss.com.br/cabecalho-v2_04.xsd" xmlns:tipos="http://www.giss.com.br/tipos-v2_04.xsd" versao="2.04"><versaoDados>2.04</versaoDados></cabecalho>',
  );
});

test('fails closed for an unverified GISS layout version', () => {
  assert.throws(
    () => buildGissCabecalho('2.03'),
    (error: unknown) => error instanceof FiscalEngineError && error.code === 'TA_GISS_LAYOUT_VERSION_UNVERIFIED',
  );
});
