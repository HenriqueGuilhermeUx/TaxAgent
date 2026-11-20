import assert from 'node:assert/strict';
import test from 'node:test';
import AdmZip from 'adm-zip';
import { BadRequestException } from '@nestjs/common';
import { parseCsvBatch, parseXlsxBatch } from '../src/official-rtc/rtc-batch-file.parser';
import { RtcBatchService, regularDtoFromBatchRow, simplesDtoFromBatchRow } from '../src/official-rtc/rtc-batch.service';

test('CSV batch parses semicolon-delimited rows and normalizes headers', () => {
  const parsed = parseCsvBatch(Buffer.from(
    'Operation ID;Effective At;Municipality Code;UF;NBS;CST;Tax Classification;Tax Base\n'
    + 'op-1;2026-03-10T10:00:00-03:00;4314902;RS;115012000;200;200043;200.00\n',
    'utf8',
  ));
  assert.equal(parsed.format, 'csv');
  assert.deepEqual(parsed.headers, [
    'operation_id','effective_at','municipality_code','uf','nbs','cst','tax_classification','tax_base',
  ]);
  assert.equal(parsed.rows[0].values.operation_id, 'op-1');
  assert.equal(parsed.rows[0].row_number, 2);
});

test('CSV batch rejects formula-like cells and more than 100 rows', () => {
  assert.throws(
    () => parseCsvBatch(Buffer.from('operation_id,tax_base\n=1+1,100\n')),
    BadRequestException,
  );

  const lines = ['operation_id,tax_base'];
  for (let i = 0; i < 101; i += 1) lines.push(`op-${i},100`);
  assert.throws(
    () => parseCsvBatch(Buffer.from(lines.join('\n'))),
    BadRequestException,
  );
});

function xlsxWithSheet(sheetXml: string, extra?: Array<{ name: string; data: string }>): Buffer {
  const zip = new AdmZip();
  zip.addFile('[Content_Types].xml', Buffer.from(
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
    + '</Types>',
  ));
  zip.addFile('xl/worksheets/sheet1.xml', Buffer.from(sheetXml));
  for (const item of extra ?? []) zip.addFile(item.name, Buffer.from(item.data));
  return zip.toBuffer();
}

test('XLSX batch parses first worksheet inline strings without formulas', () => {
  const sheet = `<?xml version="1.0"?>
  <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
    <row r="1">
      <c r="A1" t="inlineStr"><is><t>operation_id</t></is></c>
      <c r="B1" t="inlineStr"><is><t>tax_base</t></is></c>
    </row>
    <row r="2">
      <c r="A2" t="inlineStr"><is><t>op-xlsx</t></is></c>
      <c r="B2"><v>250.50</v></c>
    </row>
  </sheetData></worksheet>`;
  const parsed = parseXlsxBatch(xlsxWithSheet(sheet));
  assert.equal(parsed.format, 'xlsx');
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].values.operation_id, 'op-xlsx');
  assert.equal(parsed.rows[0].values.tax_base, '250.50');
});

test('XLSX batch rejects formulas and macro/external embedded content', () => {
  const formulaSheet = `<?xml version="1.0"?>
  <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
    <row r="1"><c r="A1" t="inlineStr"><is><t>operation_id</t></is></c></row>
    <row r="2"><c r="A2"><f>1+1</f><v>2</v></c></row>
  </sheetData></worksheet>`;
  assert.throws(() => parseXlsxBatch(xlsxWithSheet(formulaSheet)), BadRequestException);

  const safeSheet = `<?xml version="1.0"?>
  <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
    <row r="1"><c r="A1" t="inlineStr"><is><t>operation_id</t></is></c></row>
    <row r="2"><c r="A2" t="inlineStr"><is><t>op</t></is></c></row>
  </sheetData></worksheet>`;
  assert.throws(
    () => parseXlsxBatch(xlsxWithSheet(safeSheet, [{ name: 'xl/vbaProject.bin', data: 'x' }])),
    BadRequestException,
  );
  assert.throws(
    () => parseXlsxBatch(xlsxWithSheet(safeSheet, [{ name: 'xl/externalLinks/externalLink1.xml', data: '<x/>' }])),
    BadRequestException,
  );
});

test('file batch regular row maps into canonical NFS-e contract without inventing rates', () => {
  const dto = regularDtoFromBatchRow({
    row_number: 2,
    values: {
      operation_id: 'op-regular',
      effective_at: '2026-03-10T10:00:00-03:00',
      municipality_code: '4314902',
      uf: 'rs',
      nbs: '115012000',
      cst: '200',
      tax_classification: '200043',
      tax_base: '200.00',
      item_number: '1',
      quantity: '2',
      unit: 'UN',
    },
  });
  assert.equal(dto.document_kind, 'nfse');
  assert.equal(dto.uf, 'RS');
  assert.equal(dto.items[0].tax_base, 200);
  assert.equal(dto.items[0].nominal_rates, undefined);
});

test('file batch Simples row maps into canonical NF-e contract', () => {
  const dto = simplesDtoFromBatchRow({
    row_number: 2,
    values: {
      operation_id: 'op-simples',
      effective_date: '2027-03-15',
      document_kind: 'nfe',
      crt: '1',
      activity_code: '01',
      tax_classification: '000001',
      tax_base: '950.00',
      selective_tax_amount: '50.00',
      ibs_effective_rate: '1.25',
      cbs_effective_rate: '2.75',
    },
  });
  assert.equal(dto.document_kind, 'nfe');
  assert.equal(dto.items[0].ibs_effective_rate, 1.25);
  assert.equal(dto.items[0].cbs_effective_rate, 2.75);
});


test('CSV/XLSX file batch defaults can validate without calling an RTC sidecar', async () => {
  let calls = 0;
  const service = new RtcBatchService({
    calculateRegular: async () => { calls += 1; throw new Error('must not run in validate mode'); },
  } as any);
  const file = {
    originalname: 'regular.csv',
    buffer: Buffer.from(
      'operation_id,effective_at,municipality_code,uf,nbs,cst,tax_classification,tax_base\n'
      + 'op-validate,2026-03-10T10:00:00-03:00,4314902,RS,115012000,200,200043,200.00\n',
    ),
  };
  const result = await service.regular('company', 'test', file, 'validate');
  assert.equal(calls, 0);
  assert.equal(result.execution, 'validate');
  assert.equal(result.counts.valid, 1);
  assert.equal(result.rows[0].outcome, 'validated');
  assert.equal(result.rows[0].reference_only, true);
  assert.equal(result.policy.each_success_persists_rtc_tax_decision, false);
});

test('file batch calculate mode still delegates only canonical validated rows', async () => {
  let calls = 0;
  const service = new RtcBatchService({
    calculateRegular: async (_company: string, _environment: string, dto: any) => {
      calls += 1;
      return {
        decision_id: 'taxdec_batch',
        status: 'resolved',
        authoritative: false,
        reference_only: true,
        assessment: { all_items_usable: true, simulation_only: true, counts: { simulated: 1 } },
        engine: { id: 'regular', upstreamRelease: '1.6.1', upstreamCommit: '150cccbe414d4a5edea703e4f7a424af5aa222c7' },
        input: dto,
      };
    },
  } as any);
  const file = {
    originalname: 'regular.csv',
    buffer: Buffer.from(
      'operation_id,effective_at,municipality_code,uf,nbs,cst,tax_classification,tax_base\n'
      + 'op-calc,2026-03-10T10:00:00-03:00,4314902,RS,115012000,200,200043,200.00\n',
    ),
  };
  const result = await service.regular('company', 'test', file, 'calculate');
  assert.equal(calls, 1);
  assert.equal(result.execution, 'calculate');
  assert.equal(result.rows[0].decision_id, 'taxdec_batch');
  assert.equal(result.rows[0].reference_only, true);
  assert.equal(result.policy.each_success_persists_rtc_tax_decision, true);
});


test('file batch Simples row accepts canonical NFS-e and preserves official activity facts', () => {
  const dto = simplesDtoFromBatchRow({
    row_number: 2,
    values: {
      operation_id: 'op-simples-nfse',
      effective_date: '2027-03-15',
      document_kind: 'nfse',
      crt: '1',
      activity_code: '07',
      tax_classification: '000001',
      tax_base: '1000.00',
      selective_tax_amount: '0.00',
      ibs_effective_rate: '1.25',
      cbs_effective_rate: '2.75',
    },
  });
  assert.equal(dto.document_kind, 'nfse');
  assert.equal(dto.items[0].activity_code, '07');
  assert.equal(dto.items[0].ibs_effective_rate, 1.25);
  assert.equal(dto.items[0].cbs_effective_rate, 2.75);
});
