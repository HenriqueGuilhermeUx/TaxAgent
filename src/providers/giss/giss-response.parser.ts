import { FiscalEngineError } from '../../fiscal-core/fiscal-engine.error';

export interface GissResponse { authorized: boolean; nfseNumber?: string; verificationCode?: string; protocol?: string; errorCode?: string; errorMessage?: string; raw: string }

const decode = (v?: string) => v?.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
const tag = (xml: string, name: string) => decode(xml.match(new RegExp(`<(?:\\w+:)?${name}[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${name}>`, 'i'))?.[1]?.trim());

export function parseGissResponse(xml: string): GissResponse {
  const payload = tag(xml, 'return') ?? tag(xml, 'nfseXML') ?? xml;
  const nfseNumber = tag(payload, 'Numero');
  const verificationCode = tag(payload, 'CodigoVerificacao');
  const protocol = tag(payload, 'Protocolo');
  const errorCode = tag(payload, 'Codigo');
  const errorMessage = tag(payload, 'Mensagem');
  if (nfseNumber) return { authorized: true, nfseNumber, verificationCode, protocol, raw: xml };
  if (errorCode || errorMessage) return { authorized: false, protocol, errorCode, errorMessage, raw: xml };
  throw new FiscalEngineError('TA_GISS_RESPONSE_UNRECOGNIZED', 'GISS response did not contain an authorization or a structured ABRASF error', false, { response_received: true });
}
