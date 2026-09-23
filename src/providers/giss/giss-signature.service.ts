import { Injectable } from '@nestjs/common';
import { CertificateMaterial } from '../../certificates/certificate-vault.service';
import { FiscalEngineError } from '../../fiscal-core/fiscal-engine.error';
import { XmlSignatureService } from '../../xml-engine/xml-signature.service';

@Injectable()
export class GissSignatureService {
  constructor(private readonly signatures: XmlSignatureService) {}

  signRps(xml: string, material: CertificateMaterial): string {
    const match = xml.match(/<InfDeclaracaoPrestacaoServico\s+Id="([^"]+)"/);
    if (!match) throw new FiscalEngineError('TA_GISS_RPS_ID_REQUIRED', 'ABRASF RPS must contain InfDeclaracaoPrestacaoServico/@Id before XMLDSig signing', false);
    return this.signatures.sign(xml, match[1], 'InfDeclaracaoPrestacaoServico', material, 'sha1');
  }

  signBatch(xml: string, material: CertificateMaterial): string {
    const match = xml.match(/<LoteRps\s+Id="([^"]+)"/);
    if (!match) throw new FiscalEngineError('TA_GISS_BATCH_ID_REQUIRED', 'ABRASF batch must contain LoteRps/@Id before XMLDSig signing', false);
    return this.signatures.sign(xml, match[1], 'LoteRps', material, 'sha1');
  }

  signRpsQuery(xml: string, material: CertificateMaterial): string {
    if (!/<ConsultarNfseRpsEnvio(?:\s|>)/i.test(xml)) {
      throw new FiscalEngineError('TA_GISS_QUERY_ROOT_REQUIRED', 'GISS reconciliation signature requires ConsultarNfseRpsEnvio as the query document root', false, { transmission_attempted: false, query_attempted: false });
    }
    const signed = this.signatures.signEmptyUri(xml, 'ConsultarNfseRpsEnvio', material, 'sha1');
    if (!/<Signature\b[^>]*xmlns="http:\/\/www\.w3\.org\/2000\/09\/xmldsig#"/i.test(signed) || !/<Reference\s+URI=""/i.test(signed)) {
      throw new FiscalEngineError('TA_GISS_QUERY_SIGNATURE_INVALID', 'GISS reconciliation query signature did not match the required enveloped empty-URI XMLDSig shape', false, { transmission_attempted: false, query_attempted: false });
    }
    return signed;
  }

  signRpsAndBatch(xml: string, material: CertificateMaterial): string {
    return this.signBatch(this.signRps(xml, material), material);
  }
}
