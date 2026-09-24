export type GissSoapVersion = '1.1' | '1.2';

export interface GissWsdlOperationBinding {
  operation: string;
  soapAction?: string;
}

export interface GissWsdlTransportBinding {
  soapAddresses: string[];
  operationBindings: GissWsdlOperationBinding[];
  soapVersion?: GissSoapVersion;
}

export function inspectGissWsdlTransport(body: string): GissWsdlTransportBinding {
  const soapAddresses = [...body.matchAll(/<(?:\w+:)?address\b[^>]*\blocation\s*=\s*["']([^"']+)["']/gi)]
    .map((match) => match[1])
    .filter((value) => /^https:\/\//i.test(value));

  const operationBindings: GissWsdlOperationBinding[] = [];
  const operationPattern = /<(?:\w+:)?operation\b[^>]*\bname\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/(?:\w+:)?operation>/gi;
  for (const match of body.matchAll(operationPattern)) {
    const soapAction = match[2].match(/\bsoapAction\s*=\s*["']([^"']*)["']/i)?.[1];
    if (soapAction || /<(?:\w+:)?operation\b/i.test(match[2])) {
      operationBindings.push({ operation: match[1], soapAction });
    }
  }

  const uniqueBindings = [...new Map(operationBindings.map((binding) => [`${binding.operation}|${binding.soapAction ?? ''}`, binding])).values()]
    .sort((a, b) => a.operation.localeCompare(b.operation));
  const soapVersion: GissSoapVersion | undefined = /http:\/\/schemas\.xmlsoap\.org\/wsdl\/soap12\//i.test(body)
    ? '1.2'
    : /http:\/\/schemas\.xmlsoap\.org\/wsdl\/soap\//i.test(body)
      ? '1.1'
      : undefined;

  return {
    soapAddresses: [...new Set(soapAddresses)].sort(),
    operationBindings: uniqueBindings,
    soapVersion,
  };
}

export function operationTransportBinding(binding: GissWsdlTransportBinding, operationName: string) {
  const operation = binding.operationBindings.find((candidate) => candidate.operation === operationName && candidate.soapAction);
  const soapAddress = binding.soapAddresses[0];
  return {
    proven: Boolean(operation?.soapAction && soapAddress && binding.soapVersion),
    soapAddress,
    soapAction: operation?.soapAction,
    soapVersion: binding.soapVersion,
    operation: operation?.operation,
  };
}

export function reconciliationTransportBinding(binding: GissWsdlTransportBinding) {
  return operationTransportBinding(binding, 'ConsultarNfsePorRps');
}

export function emissionTransportBinding(binding: GissWsdlTransportBinding) {
  return operationTransportBinding(binding, 'RecepcionarLoteRps');
}
