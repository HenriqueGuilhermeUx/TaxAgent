import assert from 'node:assert/strict';
import test from 'node:test';
import { BadGatewayException, BadRequestException } from '@nestjs/common';
import { FiscalEngineError } from '../src/fiscal-core/fiscal-engine.error';
import { GissQueryExecutionService } from '../src/operations/giss-query-execution.service';

function buildService(overrides: Record<string, any> = {}) {
  const artifactCalls: any[] = [];
  const ledgerCalls: any[] = [];
  const defaults = {
    db: { query: async () => ({ rows: [{ id: 'inv_1', company_id: 'comp_1', environment: 'test' }] }) },
    documents: { latestContent: async () => ({ metadata: { rps_number: '1', series: 'TA' } }) },
    artifacts: { save: async (...args: any[]) => { artifactCalls.push(args); return { id: `doc_${artifactCalls.length}` }; } },
    ledger: { append: async (entry: any) => { ledgerCalls.push(entry); } },
    client: {
      prepareRpsQuery: async () => ({
        soapAddress: 'https://ws-homologacao-rtc.giss.com.br/service-ws/nf/nfse-ws',
        soapAction: 'http://nfse.abrasf.org.br/ConsultarNfsePorRps',
        soapVersion: '1.1',
        requestWrapper: 'ConsultarNfsePorRpsRequest',
        targetNamespace: 'http://nfse.abrasf.org.br',
        body: '<soapenv:Envelope>fixture-request</soapenv:Envelope>',
        bodyBytes: 52,
        bodySha256: 'request_sha',
        fiscalTransmissionAttempted: false,
        queryAttempted: false,
      }),
      executePreparedRpsQuery: async () => ({
        status: 200,
        body: '<ConsultarNfsePorRpsResponse><outputXML>&lt;ListaMensagemRetorno&gt;&lt;MensagemRetorno&gt;&lt;Codigo&gt;E123&lt;/Codigo&gt;&lt;Mensagem&gt;RPS inexistente&lt;/Mensagem&gt;&lt;/MensagemRetorno&gt;&lt;/ListaMensagemRetorno&gt;</outputXML></ConsultarNfsePorRpsResponse>',
        contentType: 'text/xml;charset=UTF-8',
        bodyBytes: 250,
        bodySha256: 'response_sha',
        fiscalTransmissionAttempted: false,
        queryAttempted: true,
      }),
    },
    vault: { getActiveMaterial: async () => ({ fingerprint: 'fixture-fingerprint', tlsCertificatePem: 'fixture-cert', tlsPrivateKeyPem: 'fixture-key' }) },
    tenancy: { getCompany: async () => ({ tax_id: '12345678000190', municipal_registration: '123456', city_code: '3548500' }) },
  };
  const d = { ...defaults, ...overrides };
  return {
    service: new GissQueryExecutionService(d.db as any, d.documents as any, d.artifacts as any, d.ledger as any, d.client as any, d.vault as any, d.tenancy as any),
    artifactCalls,
    ledgerCalls,
  };
}

test('real GISS reconciliation query remains test-only before DB/certificate/network access', async () => {
  let dbCalls = 0;
  const { service } = buildService({ db: { query: async () => { dbCalls += 1; return { rows: [] }; } } });
  await assert.rejects(service.execute('comp_1', 'production', 'inv_1'), BadRequestException);
  assert.equal(dbCalls, 0);
});

test('missing issuer Municipal Registration blocks reconciliation before certificate load or provider POST', async () => {
  let vaultCalls = 0;
  let prepareCalls = 0;
  const { service, artifactCalls, ledgerCalls } = buildService({
    tenancy: { getCompany: async () => ({ tax_id: '12345678000190', municipal_registration: null, city_code: '3548500' }) },
    vault: { getActiveMaterial: async () => { vaultCalls += 1; return {}; } },
    client: { prepareRpsQuery: async () => { prepareCalls += 1; return {}; } },
  });
  await assert.rejects(
    service.execute('comp_1', 'test', 'inv_1'),
    (error: unknown) => {
      assert.ok(error instanceof BadRequestException);
      const response = error.getResponse() as Record<string, unknown>;
      assert.equal(response.code, 'TA_GISS_MUNICIPAL_REGISTRATION_REQUIRED');
      assert.equal(response.query_attempted, false);
      assert.equal(response.fiscal_emission_attempted, false);
      return true;
    },
  );
  assert.equal(vaultCalls, 0);
  assert.equal(prepareCalls, 0);
  assert.equal(artifactCalls.length, 0);
  assert.equal(ledgerCalls.length, 1);
  assert.equal(ledgerCalls[0].type, 'giss_reconciliation_query_blocked');
});

test('executes only the persisted invoice RPS, stores exact SOAP request/response and never upgrades unknown code to not_found', async () => {
  let executeBody: string | undefined;
  const client = {
    prepareRpsQuery: async () => ({
      soapAddress: 'https://ws-homologacao-rtc.giss.com.br/service-ws/nf/nfse-ws',
      soapAction: 'http://nfse.abrasf.org.br/ConsultarNfsePorRps',
      soapVersion: '1.1',
      requestWrapper: 'ConsultarNfsePorRpsRequest',
      targetNamespace: 'http://nfse.abrasf.org.br',
      body: '<soapenv:Envelope>fixture-bytes</soapenv:Envelope>',
      bodyBytes: 51,
      bodySha256: 'request_sha',
      fiscalTransmissionAttempted: false,
      queryAttempted: false,
    }),
    executePreparedRpsQuery: async (_city: string, prepared: any) => {
      executeBody = prepared.body;
      return {
        status: 200,
        body: '<ConsultarNfsePorRpsResponse><outputXML>&lt;ListaMensagemRetorno&gt;&lt;MensagemRetorno&gt;&lt;Codigo&gt;E123&lt;/Codigo&gt;&lt;Mensagem&gt;RPS inexistente&lt;/Mensagem&gt;&lt;/MensagemRetorno&gt;&lt;/ListaMensagemRetorno&gt;</outputXML></ConsultarNfsePorRpsResponse>',
        contentType: 'text/xml;charset=UTF-8',
        bodyBytes: 250,
        bodySha256: 'response_sha',
        fiscalTransmissionAttempted: false,
        queryAttempted: true,
      };
    },
  };
  const { service, artifactCalls, ledgerCalls } = buildService({ client });
  const result = await service.execute('comp_1', 'test', 'inv_1');
  assert.equal(executeBody, '<soapenv:Envelope>fixture-bytes</soapenv:Envelope>');
  assert.equal(artifactCalls.length, 2);
  assert.equal(artifactCalls[0][1], 'giss_soap_request');
  assert.equal(artifactCalls[1][1], 'giss_soap_response');
  assert.equal(result.classification.state, 'unknown');
  assert.equal(result.classification.code, 'E123');
  assert.deepEqual(result.verified_not_found_codes, []);
  assert.equal(result.query_attempted, true);
  assert.equal(result.fiscal_emission_attempted, false);
  assert.equal(result.request_body_exposed, false);
  assert.equal(result.response_body_exposed, false);
  assert.equal(JSON.stringify(result).includes('fixture-bytes'), false);
  assert.equal(JSON.stringify(result).includes('ListaMensagemRetorno'), false);
  assert.deepEqual(ledgerCalls.map((entry) => entry.type), [
    'giss_reconciliation_query_prepared',
    'giss_reconciliation_query_response',
    'giss_reconciliation_classified',
  ]);
});

test('network failure is returned as safe 502 after persisting the exact request and never persists a fake response', async () => {
  const client = {
    prepareRpsQuery: async () => ({
      soapAddress: 'https://ws-homologacao-rtc.giss.com.br/service-ws/nf/nfse-ws',
      soapAction: 'http://nfse.abrasf.org.br/ConsultarNfsePorRps',
      soapVersion: '1.1',
      requestWrapper: 'ConsultarNfsePorRpsRequest',
      targetNamespace: 'http://nfse.abrasf.org.br',
      body: '<soapenv:Envelope>fixture-bytes</soapenv:Envelope>',
      bodyBytes: 51,
      bodySha256: 'request_sha',
      fiscalTransmissionAttempted: false,
      queryAttempted: false,
    }),
    executePreparedRpsQuery: async () => {
      throw new FiscalEngineError('TA_GISS_QUERY_NETWORK_ERROR', 'safe network failure', true, { query_attempted: true });
    },
  };
  const { service, artifactCalls, ledgerCalls } = buildService({ client });
  await assert.rejects(
    service.execute('comp_1', 'test', 'inv_1'),
    (error: unknown) => {
      assert.ok(error instanceof BadGatewayException);
      const response = error.getResponse() as Record<string, unknown>;
      assert.equal(response.code, 'TA_GISS_QUERY_NETWORK_ERROR');
      assert.equal(response.query_attempted, true);
      assert.equal(response.fiscal_emission_attempted, false);
      return true;
    },
  );
  assert.equal(artifactCalls.length, 1);
  assert.equal(artifactCalls[0][1], 'giss_soap_request');
  assert.equal(ledgerCalls.at(-1)?.type, 'giss_reconciliation_query_failed');
});
