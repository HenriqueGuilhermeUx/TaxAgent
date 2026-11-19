import { BadRequestException } from '@nestjs/common';
import AdmZip from 'adm-zip';
import { XMLParser } from 'fast-xml-parser';

export interface RtcBatchUploadedFile {
  buffer?: Buffer;
  originalname?: string;
  mimetype?: string;
  size?: number;
}

export interface ParsedBatchRow {
  row_number: number;
  values: Record<string, string>;
}

export interface ParsedBatchFile {
  format: 'csv' | 'xlsx';
  headers: string[];
  rows: ParsedBatchRow[];
}

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_XLSX_UNCOMPRESSED_BYTES = 10 * 1024 * 1024;
const MAX_XLSX_ENTRIES = 100;
const MAX_ROWS = 100;
const MAX_COLUMNS = 32;
const MAX_CELL_CHARS = 512;

function fail(message: string): never {
  throw new BadRequestException(message);
}

function safeCell(raw: unknown): string {
  const value = String(raw ?? '').trim();
  if (value.length > MAX_CELL_CHARS) fail('Batch cell exceeds maximum length');
  if (value.includes('\u0000')) fail('Batch contains invalid NUL bytes');
  if (/^[=+@]/.test(value)) fail('Batch formula-like cells are not allowed');
  return value;
}

function normalizeHeaders(raw: string[]): string[] {
  if (!raw.length || raw.length > MAX_COLUMNS) fail('Batch header column count is invalid');
  const headers = raw.map((value) => safeCell(value).toLowerCase().replace(/[\s\-]+/g, '_'));
  if (headers.some((value) => !value || !/^[a-z0-9_]+$/.test(value))) fail('Batch headers must use letters, numbers, spaces, hyphens or underscores');
  if (new Set(headers).size !== headers.length) fail('Batch headers must be unique');
  return headers;
}

function matrixToRows(matrix: string[][]): { headers: string[]; rows: ParsedBatchRow[] } {
  const nonEmpty = matrix
    .map((cells, index) => ({ cells, rowNumber: index + 1 }))
    .filter(({ cells }) => cells.some((value) => String(value ?? '').trim() !== ''));
  if (nonEmpty.length < 2) fail('Batch must contain a header and at least one data row');
  const headers = normalizeHeaders(nonEmpty[0].cells);
  const data = nonEmpty.slice(1);
  if (data.length > MAX_ROWS) fail(`Batch exceeds maximum of ${MAX_ROWS} data rows`);

  const rows = data.map(({ cells, rowNumber }) => {
    if (cells.length > MAX_COLUMNS) fail('Batch row exceeds maximum column count');
    const values: Record<string, string> = {};
    for (let index = 0; index < headers.length; index += 1) {
      values[headers[index]] = safeCell(cells[index] ?? '');
    }
    return { row_number: rowNumber, values };
  });
  return { headers, rows };
}

function delimiterCounts(line: string): Record<string, number> {
  const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0 };
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const ch = line[index];
    if (ch === '"') {
      if (quoted && line[index + 1] === '"') { index += 1; continue; }
      quoted = !quoted;
      continue;
    }
    if (!quoted && Object.prototype.hasOwnProperty.call(counts, ch)) counts[ch] += 1;
  }
  return counts;
}

function detectDelimiter(text: string): string {
  const first = text.replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0] ?? '';
  const counts = delimiterCounts(first);
  const ordered = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (!ordered[0] || ordered[0][1] === 0) return ',';
  return ordered[0][0];
}

export function parseCsvBatch(buffer: Buffer): ParsedBatchFile {
  if (!buffer.length || buffer.length > MAX_FILE_BYTES) fail('CSV file size is invalid');
  const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
  if (text.includes('\u0000')) fail('CSV must be UTF-8 text');
  const delimiter = detectDelimiter(text);
  const matrix: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const ch = text[index];
    if (ch === '"') {
      if (quoted && text[index + 1] === '"') { cell += '"'; index += 1; }
      else quoted = !quoted;
      continue;
    }
    if (!quoted && ch === delimiter) {
      row.push(cell);
      cell = '';
      continue;
    }
    if (!quoted && (ch === '\n' || ch === '\r')) {
      if (ch === '\r' && text[index + 1] === '\n') index += 1;
      row.push(cell);
      matrix.push(row);
      if (matrix.length > MAX_ROWS + 2) fail(`Batch exceeds maximum of ${MAX_ROWS} data rows`);
      row = [];
      cell = '';
      continue;
    }
    cell += ch;
    if (cell.length > MAX_CELL_CHARS) fail('Batch cell exceeds maximum length');
  }
  if (quoted) fail('CSV contains an unterminated quoted cell');
  if (cell.length || row.length) {
    row.push(cell);
    matrix.push(row);
  }

  const parsed = matrixToRows(matrix);
  return { format: 'csv', ...parsed };
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function xmlText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(xmlText).join('');
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (record['#text'] !== undefined) return xmlText(record['#text']);
    if (record.t !== undefined) return xmlText(record.t);
    if (record.r !== undefined) return xmlText(record.r);
  }
  return '';
}

function columnIndex(cellRef: string | undefined, fallback: number): number {
  const match = String(cellRef ?? '').match(/^([A-Z]+)\d+$/i);
  if (!match) return fallback;
  let index = 0;
  for (const char of match[1].toUpperCase()) index = index * 26 + (char.charCodeAt(0) - 64);
  return index - 1;
}

export function parseXlsxBatch(buffer: Buffer): ParsedBatchFile {
  if (!buffer.length || buffer.length > MAX_FILE_BYTES) fail('XLSX file size is invalid');
  let zip: AdmZip;
  try { zip = new AdmZip(buffer); } catch { fail('Invalid XLSX ZIP container'); }

  const entries = zip.getEntries();
  if (entries.length > MAX_XLSX_ENTRIES) fail('XLSX contains too many ZIP entries');
  let totalUncompressed = 0;
  for (const entry of entries) {
    const name = entry.entryName.replace(/\\/g, '/');
    totalUncompressed += Number(entry.header?.size ?? 0);
    if (totalUncompressed > MAX_XLSX_UNCOMPRESSED_BYTES) fail('XLSX uncompressed content exceeds safety limit');
    if (/vbaProject\.bin$/i.test(name) || /(^|\/)externalLinks\//i.test(name) || /(^|\/)embeddings\//i.test(name) || /oleObject/i.test(name)) {
      fail('XLSX active/external embedded content is not allowed');
    }
  }

  const worksheetEntry = entries
    .filter((entry) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(entry.entryName))
    .sort((a, b) => a.entryName.localeCompare(b.entryName, undefined, { numeric: true }))[0];
  if (!worksheetEntry) fail('XLSX first worksheet is missing');
  if (Number(worksheetEntry.header?.size ?? 0) > 5 * 1024 * 1024) fail('XLSX worksheet exceeds safety limit');

  const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: false, trimValues: false });
  let sharedStrings: string[] = [];
  const sharedEntry = zip.getEntry('xl/sharedStrings.xml');
  if (sharedEntry) {
    if (Number(sharedEntry.header?.size ?? 0) > 2 * 1024 * 1024) fail('XLSX shared strings exceed safety limit');
    const shared = parser.parse(sharedEntry.getData().toString('utf8'));
    sharedStrings = asArray(shared?.sst?.si).map((item) => safeCell(xmlText(item)));
    if (sharedStrings.length > MAX_ROWS * MAX_COLUMNS + MAX_COLUMNS) fail('XLSX shared strings exceed safety limit');
  }

  let sheet: any;
  try { sheet = parser.parse(worksheetEntry.getData().toString('utf8')); }
  catch { fail('XLSX worksheet XML is invalid'); }

  const rows = asArray(sheet?.worksheet?.sheetData?.row);
  if (rows.length > MAX_ROWS + 1) fail(`Batch exceeds maximum of ${MAX_ROWS} data rows`);
  const matrix: string[][] = rows.map((row: any) => {
    const cells = asArray(row?.c);
    if (cells.length > MAX_COLUMNS) fail('XLSX row exceeds maximum column count');
    const values: string[] = [];
    let fallback = 0;
    for (const cell of cells) {
      if (cell?.f !== undefined) fail('XLSX formulas are not allowed');
      const index = columnIndex(cell?.['@_r'], fallback);
      if (index >= MAX_COLUMNS) fail('XLSX column exceeds maximum column count');
      const type = String(cell?.['@_t'] ?? '');
      let raw = '';
      if (type === 's') {
        const sharedIndex = Number(xmlText(cell?.v));
        if (!Number.isInteger(sharedIndex) || sharedIndex < 0 || sharedIndex >= sharedStrings.length) fail('XLSX shared string index is invalid');
        raw = sharedStrings[sharedIndex];
      } else if (type === 'inlineStr') {
        raw = xmlText(cell?.is);
      } else {
        raw = xmlText(cell?.v);
      }
      values[index] = safeCell(raw);
      fallback = index + 1;
    }
    return values;
  });

  const parsed = matrixToRows(matrix);
  return { format: 'xlsx', ...parsed };
}

export function parseRtcBatchFile(file: RtcBatchUploadedFile | undefined): ParsedBatchFile {
  if (!file?.buffer?.length) fail('Select a CSV or XLSX file');
  if (file.buffer.length > MAX_FILE_BYTES || Number(file.size ?? file.buffer.length) > MAX_FILE_BYTES) fail('Batch file exceeds 2 MiB limit');
  const name = String(file.originalname ?? '').toLowerCase();
  if (name.endsWith('.csv')) return parseCsvBatch(file.buffer);
  if (name.endsWith('.xlsx')) return parseXlsxBatch(file.buffer);
  fail('Batch file must use .csv or .xlsx extension');
}
