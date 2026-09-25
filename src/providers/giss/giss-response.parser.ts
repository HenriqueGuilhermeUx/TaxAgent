import { FiscalEngineError } from '../../fiscal-core/fiscal-engine.error';

export interface GissResponse {
  authorized: boolean;
  nfseNumber?: string;
  verificationCode?: string;
  protocol?: string;
  errorCode?: string;
  errorMessage?: string;
  detailCode?: string;
  detailMessage?: string;
  raw: string;
}

const decodeOnce = (value?: string) => value?.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const decode = (value?: string) => {
  let current = value;
  for (let i = 0; i < 3; i += 1) {
    const next = decodeOnce(current);
    if (next === current) break;
    current = next;
  }
  return current;
};
const tag = (xml: string, name: string) => decode(xml.match(new RegExp(`<(?:\\w+:)?${name}[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${name}>`, 'i'))?.[1]?.trim());

function nestedError(message?: string): { detailCode?: string; detailMessage?: string } {
  const decoded = decode(message)?.trim();
  if (!decoded) return {};

  const nestedMessage = tag(decoded, 'Mensagem')?.trim();
  const text = nestedMessage ?? decoded.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const explicitNestedCode = tag(decoded, 'Codigo')?.trim();
  const token = text.match(/\b(?:E|A)\d{1,4}\b/i)?.[0]?.toUpperCase();
  const detailCode = token ?? (explicitNestedCode && /^(?:E|A)\d{1,4}$/i.test(explicitNestedCode) ? explicitNestedCode.toUpperCase() : undefined);
  return {
    ...(detailCode ? { detailCode } : {}),
    ...(nestedMessage ? { detailMessage: nestedMessage } : detailCode ? { detailMessage: text } : {}),
  };
}

export function parseGissResponse(xml: string): GissResponse {
  const faultCode = tag(xml, 'faultcode');
  const faultMessage = tag(xml, 'faultstring');
  if (faultCode || faultMessage) return { authorized: false, errorCode: faultCode, errorMessage: faultMessage, raw: xml };

  const payload = tag(xml, 'outputXML') ?? tag(xml, 'return') ?? tag(xml, 'nfseXML') ?? xml;
  const nfseNumber = tag(payload, 'Numero');
  const verificationCode = tag(payload, 'CodigoVerificacao');
  const protocol = tag(payload, 'Protocolo');
  const errorCode = tag(payload, 'Codigo');
  const errorMessage = tag(payload, 'Mensagem');
  if (nfseNumber) return { authorized: true, nfseNumber, verificationCode, protocol, raw: xml };
  if (errorCode || errorMessage) {
    return { authorized: false, protocol, errorCode, errorMessage, ...nestedError(errorMessage), raw: xml };
  }
  throw new FiscalEngineError('TA_GISS_RESPONSE_UNRECOGNIZED', 'GISS response did not contain an authorization or a structured ABRASF/SOAP error', false, { response_received: true });
}
