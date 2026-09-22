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
    return this.signatures.sign(xml, match[1], 'InfDeclaracaoPrestacaoServico', material);
  }
}
