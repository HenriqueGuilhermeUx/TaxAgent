import { XMLParser } from 'fast-xml-parser';

export const GISS_SOAP_REQUEST_NAMESPACE = 'http://nfse.abrasf.org.br' as const;

export interface GissWsdlContractDocument {
  url: string;
  body: string;
}

export interface GissResolvedOperationShape {
  operation: string;
  operationPresent: boolean;
  requestWrapper?: string;
  requestNamespace?: string;
  responseWrapper?: string;
  responseNamespace?: string;
  requestMessageParts: string[];
  responseMessageParts: string[];
  hasNfseCabecMsg: boolean;
  hasNfseDadosMsg: boolean;
  hasOutputXml: boolean;
  shapePresent: boolean;
}

export interface GissResolvedWsdlShape {
  targetNamespace?: string;
  requestWrapper?: string;
  requestNamespace?: string;
  responseWrapper?: string;
  responseNamespace?: string;
  requestMessageParts: string[];
  responseMessageParts: string[];
  requestWrappers: string[];
  hasNfseCabecMsg: boolean;
  hasNfseDadosMsg: boolean;
  hasOutputXml: boolean;
  reconciliationShapePresent: boolean;
  supportingDocumentsInspected: number;
}

type XmlNode = Record<string, unknown>;

interface ParsedDocument {
  raw: string;
  root: XmlNode;
  namespaces: Record<string, string>;
  targetNamespace?: string;
  definitions?: XmlNode;
  schemas: Array<{ namespace?: string; node: XmlNode }>;
}

interface MessageDescriptor {
  name: string;
  namespace?: string;
  node: XmlNode;
  owner: ParsedDocument;
}

interface ElementDescriptor {
  name: string;
  namespace?: string;
  node: XmlNode;
  owner: ParsedDocument;
}

interface WrapperDescriptor {
  name?: string;
  namespace?: string;
  node?: XmlNode;
  owner?: ParsedDocument;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false,
});

const arr = <T>(value: T | T[] | undefined): T[] => value === undefined ? [] : Array.isArray(value) ? value : [value];
const local = (qname: string | undefined) => qname?.split(':').pop();
const prefix = (qname: string | undefined) => qname?.includes(':') ? qname.split(':')[0] : '';
const attr = (node: unknown, name: string): string | undefined => {
  if (!node || typeof node !== 'object') return undefined;
  const value = (node as XmlNode)[`@_${name}`];
  return typeof value === 'string' ? value : undefined;
};

function namespaceMap(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const match of raw.matchAll(/\bxmlns(?::([A-Za-z_][\w.-]*))?\s*=\s*["']([^"']+)["']/g)) {
    out[match[1] ?? ''] = match[2];
  }
  return out;
}

function schemasFromDefinitions(definitions: XmlNode | undefined): Array<{ namespace?: string; node: XmlNode }> {
  if (!definitions) return [];
  const types = definitions.types;
  if (!types || typeof types !== 'object') return [];
  return arr((types as XmlNode).schema as XmlNode | XmlNode[] | undefined).map((node) => ({ namespace: attr(node, 'targetNamespace'), node }));
}

function parseDocument(document: GissWsdlContractDocument): ParsedDocument | null {
  let parsed: unknown;
  try {
    parsed = parser.parse(document.body);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const root = parsed as XmlNode;
  const definitions = (root.definitions && typeof root.definitions === 'object') ? root.definitions as XmlNode : undefined;
  const schemaRoot = (root.schema && typeof root.schema === 'object') ? root.schema as XmlNode : undefined;
  const targetNamespace = definitions ? attr(definitions, 'targetNamespace') : schemaRoot ? attr(schemaRoot, 'targetNamespace') : undefined;
  return {
    raw: document.body,
    root,
    namespaces: namespaceMap(document.body),
    targetNamespace,
    definitions,
    schemas: [
      ...schemasFromDefinitions(definitions),
      ...(schemaRoot ? [{ namespace: attr(schemaRoot, 'targetNamespace'), node: schemaRoot }] : []),
    ],
  };
}

function parseDocuments(documents: GissWsdlContractDocument[]): ParsedDocument[] {
  return documents.map(parseDocument).filter((value): value is ParsedDocument => Boolean(value));
}

function qnameNamespace(qname: string | undefined, owner: ParsedDocument): string | undefined {
  if (!qname) return undefined;
  const p = prefix(qname);
  if (p) return owner.namespaces[p];
  return owner.namespaces[''] ?? owner.targetNamespace;
}

function collectMessages(documents: ParsedDocument[]): MessageDescriptor[] {
  const result: MessageDescriptor[] = [];
  for (const owner of documents) {
    if (!owner.definitions) continue;
    for (const node of arr(owner.definitions.message as XmlNode | XmlNode[] | undefined)) {
      const name = attr(node, 'name');
      if (name) result.push({ name, namespace: owner.targetNamespace, node, owner });
    }
  }
  return result;
}

function collectElements(documents: ParsedDocument[]): ElementDescriptor[] {
  const result: ElementDescriptor[] = [];
  for (const owner of documents) {
    for (const schema of owner.schemas) {
      for (const node of arr(schema.node.element as XmlNode | XmlNode[] | undefined)) {
        const name = attr(node, 'name');
        if (name) result.push({ name, namespace: schema.namespace, node, owner });
      }
    }
  }
  return result;
}

function findOperation(documents: ParsedDocument[], operationName: string) {
  for (const owner of documents) {
    if (!owner.definitions) continue;
    for (const portType of arr(owner.definitions.portType as XmlNode | XmlNode[] | undefined)) {
      for (const operation of arr(portType.operation as XmlNode | XmlNode[] | undefined)) {
        if (attr(operation, 'name') !== operationName) continue;
        const input = operation.input && typeof operation.input === 'object' ? operation.input as XmlNode : undefined;
        const output = operation.output && typeof operation.output === 'object' ? operation.output as XmlNode : undefined;
        return { owner, inputMessage: attr(input, 'message'), outputMessage: attr(output, 'message') };
      }
    }
  }
  return undefined;
}

function resolveMessage(qname: string | undefined, owner: ParsedDocument, messages: MessageDescriptor[]) {
  const name = local(qname);
  const namespace = qnameNamespace(qname, owner);
  if (!name) return undefined;
  return messages.find((message) => message.name === name && (!namespace || !message.namespace || message.namespace === namespace))
    ?? messages.find((message) => message.name === name);
}

function messageParts(message: MessageDescriptor | undefined) {
  if (!message) return [] as Array<{ name?: string; element?: string; type?: string; namespace?: string }>;
  return arr(message.node.part as XmlNode | XmlNode[] | undefined).map((part) => {
    const element = attr(part, 'element');
    return {
      name: attr(part, 'name'),
      element,
      type: attr(part, 'type'),
      namespace: qnameNamespace(element, message.owner),
    };
  });
}

function resolveWrapper(parts: ReturnType<typeof messageParts>, elements: ElementDescriptor[], expectedName: string): WrapperDescriptor | undefined {
  const elementPart = parts.find((part) => local(part.element) === expectedName) ?? parts.find((part) => Boolean(part.element));
  if (elementPart?.element) {
    const name = local(elementPart.element);
    const namespace = elementPart.namespace;
    const exact = elements.find((element) => element.name === name && (!namespace || element.namespace === namespace));
    return exact ?? { name, namespace };
  }
  const exact = elements.find((element) => element.name === expectedName);
  return exact ?? undefined;
}

function nestedElementNames(node: unknown): string[] {
  const names: string[] = [];
  const visit = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    const record = value as XmlNode;
    if (typeof record['@_name'] === 'string') names.push(record['@_name'] as string);
    for (const [key, child] of Object.entries(record)) {
      if (key.startsWith('@_')) continue;
      visit(child);
    }
  };
  visit(node);
  return names;
}

const normalizeNs = (value: string | undefined) => value?.replace(/\/+$/, '');

function wrapperContentNode(wrapper: WrapperDescriptor | undefined, documents: ParsedDocument[]): XmlNode | undefined {
  if (!wrapper?.node) return undefined;
  const inlineComplexType = wrapper.node.complexType;
  if (inlineComplexType && typeof inlineComplexType === 'object') return inlineComplexType as XmlNode;

  const typeQName = attr(wrapper.node, 'type');
  const typeName = local(typeQName);
  if (!typeName) return wrapper.node;
  const typeNamespace = wrapper.owner ? qnameNamespace(typeQName, wrapper.owner) : wrapper.namespace;

  for (const document of documents) {
    for (const schema of document.schemas) {
      if (typeNamespace && schema.namespace && normalizeNs(schema.namespace) !== normalizeNs(typeNamespace)) continue;
      for (const complexType of arr(schema.node.complexType as XmlNode | XmlNode[] | undefined)) {
        if (attr(complexType, 'name') === typeName) return complexType;
      }
    }
  }
  return wrapper.node;
}

function resolveOperationShape(parsed: ParsedDocument[], operationName: string): GissResolvedOperationShape {
  const messages = collectMessages(parsed);
  const elements = collectElements(parsed);
  const operation = findOperation(parsed, operationName);
  const requestMessage = operation ? resolveMessage(operation.inputMessage, operation.owner, messages) : undefined;
  const responseMessage = operation ? resolveMessage(operation.outputMessage, operation.owner, messages) : undefined;
  const requestParts = messageParts(requestMessage);
  const responseParts = messageParts(responseMessage);
  const request = resolveWrapper(requestParts, elements, `${operationName}Request`);
  const response = resolveWrapper(responseParts, elements, `${operationName}Response`);
  const requestNames = nestedElementNames(wrapperContentNode(request, parsed));
  const responseNames = nestedElementNames(wrapperContentNode(response, parsed));
  const hasNfseCabecMsg = requestNames.includes('nfseCabecMsg') || requestParts.some((part) => part.name === 'nfseCabecMsg');
  const hasNfseDadosMsg = requestNames.includes('nfseDadosMsg') || requestParts.some((part) => part.name === 'nfseDadosMsg');
  const hasOutputXml = responseNames.includes('outputXML') || responseParts.some((part) => part.name === 'outputXML');
  const requestNamespaceVerified = normalizeNs(request?.namespace) === normalizeNs(GISS_SOAP_REQUEST_NAMESPACE);
  const responseNamespaceVerified = normalizeNs(response?.namespace) === normalizeNs(GISS_SOAP_REQUEST_NAMESPACE);
  const shapePresent = Boolean(operation)
    && request?.name === `${operationName}Request`
    && response?.name === `${operationName}Response`
    && requestNamespaceVerified
    && responseNamespaceVerified
    && hasNfseCabecMsg
    && hasNfseDadosMsg
    && hasOutputXml;

  return {
    operation: operationName,
    operationPresent: Boolean(operation),
    requestWrapper: request?.name,
    requestNamespace: request?.namespace,
    responseWrapper: response?.name,
    responseNamespace: response?.namespace,
    requestMessageParts: requestParts.map((part) => part.name).filter((value): value is string => Boolean(value)),
    responseMessageParts: responseParts.map((part) => part.name).filter((value): value is string => Boolean(value)),
    hasNfseCabecMsg,
    hasNfseDadosMsg,
    hasOutputXml,
    shapePresent,
  };
}

export function inspectResolvedGissOperationShape(documents: GissWsdlContractDocument[], operationName: string): GissResolvedOperationShape {
  return resolveOperationShape(parseDocuments(documents), operationName);
}

export function inspectResolvedGissWsdlShape(documents: GissWsdlContractDocument[]): GissResolvedWsdlShape {
  const parsed = parseDocuments(documents);
  const main = parsed[0];
  const elements = collectElements(parsed);
  const reconciliation = resolveOperationShape(parsed, 'ConsultarNfsePorRps');

  return {
    targetNamespace: main?.targetNamespace,
    requestWrapper: reconciliation.requestWrapper,
    requestNamespace: reconciliation.requestNamespace,
    responseWrapper: reconciliation.responseWrapper,
    responseNamespace: reconciliation.responseNamespace,
    requestMessageParts: reconciliation.requestMessageParts,
    responseMessageParts: reconciliation.responseMessageParts,
    requestWrappers: elements.map((element) => element.name).filter((name) => /Request$/i.test(name)).sort(),
    hasNfseCabecMsg: reconciliation.hasNfseCabecMsg,
    hasNfseDadosMsg: reconciliation.hasNfseDadosMsg,
    hasOutputXml: reconciliation.hasOutputXml,
    reconciliationShapePresent: reconciliation.shapePresent,
    supportingDocumentsInspected: Math.max(0, parsed.length - 1),
  };
}
