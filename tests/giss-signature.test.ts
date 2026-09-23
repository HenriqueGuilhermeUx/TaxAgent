import assert from 'node:assert/strict';
import test from 'node:test';
import { GissSignatureService } from '../src/providers/giss/giss-signature.service';

test('GISS signs both RPS and batch with the official SHA1 XMLDSig profile', () => {
  const calls: Array<{ id: string; element: string; profile: string }> = [];
  const xmlSignatures = {
    sign: (xml: string, id: string, element: string, _material: unknown, profile: string) => {
      calls.push({ id, element, profile });
      return `${xml}<Signature/>`;
    },
  };
  const service = new GissSignatureService(xmlSignatures as any);
  service.signRps('<Rps><InfDeclaracaoPrestacaoServico Id="RPS1"/></Rps>', {} as any);
  service.signBatch('<EnviarLoteRpsEnvio><LoteRps Id="LOTE1"/></EnviarLoteRpsEnvio>', {} as any);
  assert.deepEqual(calls, [
    { id: 'RPS1', element: 'InfDeclaracaoPrestacaoServico', profile: 'sha1' },
    { id: 'LOTE1', element: 'LoteRps', profile: 'sha1' },
  ]);
});
