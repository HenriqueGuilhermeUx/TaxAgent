export interface GissWsdlOperationBinding {
  operation: string;
  soapAction?: string;
}

export interface GissWsdlTransportBinding {
  soapAddresses: string[];
  operationBindings: GissWsdlOperationBinding[];
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

  return {
    soapAddresses: [...new Set(soapAddresses)].sort(),
    operationBindings: uniqueBindings,
  };
}

export function reconciliationTransportBinding(binding: GissWsdlTransportBinding) {
  const operation = binding.operationBindings.find((candidate) => candidate.operation === 'ConsultarNfsePorRps' && candidate.soapAction);
  const soapAddress = binding.soapAddresses[0];
  return {
    proven: Boolean(operation?.soapAction && soapAddress),
    soapAddress,
    soapAction: operation?.soapAction,
    operation: operation?.operation,
  };
}
