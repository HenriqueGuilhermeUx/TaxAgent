import assert from 'node:assert/strict';
import test from 'node:test';
import { GissSignatureService } from '../src/providers/giss/giss-signature.service';

test('GISS signs RPS, batch and reconciliation query with their required SHA1 XMLDSig profiles', () => {
  const idCalls: Array<{ id: string; element: string; profile: string }> = [];
  const emptyUriCalls: Array<{ element: string; profile: string }> = [];
  const xmlSignatures = {
    sign: (xml: string, id: string, element: string, _material: unknown, profile: string) => {
      idCalls.push({ id, element, profile });
      return `${xml}<Signature/>`;
    },
    signEmptyUri: (xml: string, element: string, _material: unknown, profile: string) => {
      emptyUriCalls.push({ element, profile });
      return xml.replace(`</${element}>`, '<Signature xmlns="http://www.w3.org/2000/09/xmldsig#"><SignedInfo><Reference URI=""/></SignedInfo></Signature></' + element + '>');
    },
  };
  const service = new GissSignatureService(xmlSignatures as any);
  service.signRps('<Rps><InfDeclaracaoPrestacaoServico Id="RPS1"/></Rps>', {} as any);
  service.signBatch('<EnviarLoteRpsEnvio><LoteRps Id="LOTE1"/></EnviarLoteRpsEnvio>', {} as any);
  const query = service.signRpsQuery('<ConsultarNfseRpsEnvio><IdentificacaoRps/><Prestador/></ConsultarNfseRpsEnvio>', {} as any);

  assert.deepEqual(idCalls, [
    { id: 'RPS1', element: 'InfDeclaracaoPrestacaoServico', profile: 'sha1' },
    { id: 'LOTE1', element: 'LoteRps', profile: 'sha1' },
  ]);
  assert.deepEqual(emptyUriCalls, [{ element: 'ConsultarNfseRpsEnvio', profile: 'sha1' }]);
  assert.match(query, /<Reference URI=""/);
});
