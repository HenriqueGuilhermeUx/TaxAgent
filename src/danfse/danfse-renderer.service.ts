import { Injectable } from '@nestjs/common';
import { access } from 'node:fs/promises';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { FiscalEngineError } from '../fiscal-core/fiscal-engine.error';
import { DanfseModel, DanfseParty } from './danfse.types';

const PT_PER_CM = 72 / 2.54;
const MARGIN = 0.17 * PT_PER_CM;
const LIGHT_GRAY = '#f2f2f2';

@Injectable()
export class DanfseRendererService {
  async render(model: DanfseModel, invoiceState?: string): Promise<Buffer> {
    const verified = process.env.TAXAGENT_DANFSE_RENDERER_MODE === 'verified';
    const resources = verified ? await this.verifiedResources() : undefined;
    const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: true, compress: true, info: { Title: `DANFSe ${model.number ?? ''}`, Subject: 'Documento Auxiliar da NFS-e', Creator: 'TaxAgent NT008-1.02' } });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    const completed = new Promise<Buffer>((resolve, reject) => { doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject); });

    if (resources) {
      doc.registerFont('TAArial', resources.arial);
      doc.registerFont('TASans', resources.sans);
      doc.registerFont('TAArialBold', resources.arial);
    }
    const bodyFont = resources ? 'TASans' : 'Helvetica';
    const titleFont = resources ? 'TAArial' : 'Helvetica-Bold';
    const boldFont = resources ? 'TAArialBold' : 'Helvetica-Bold';
    const pageW = doc.page.width;
    const pageH = doc.page.height;
    const x = MARGIN;
    const width = pageW - MARGIN * 2;
    let y = MARGIN;

    doc.rect(x, y, width, pageH - MARGIN * 2).lineWidth(1).stroke();
    const headerH = 48;
    doc.rect(x, y, width, headerH).fillAndStroke(LIGHT_GRAY, 'black');
    if (resources?.logo) doc.image(resources.logo, x + 8, y + 8, { fit: [110, 30] });
    doc.fillColor('black').font(titleFont).fontSize(9).text('DANFSe v2.0', x + 135, y + 9, { width: width - 270, align: 'center' });
    doc.text('Documento Auxiliar da NFS-e', x + 135, y + 22, { width: width - 270, align: 'center' });
    if (model.environment === 'test') doc.fillColor('red').font(boldFont).fontSize(9).text('NFS-e SEM VALIDADE JURÍDICA', x + 135, y + 34, { width: width - 270, align: 'center' });
    doc.fillColor('black').font(bodyFont).fontSize(6).text(`Município: ${this.v(join([model.issuerMunicipality, model.issuerUf], ' / '))}`, x + width - 155, y + 8, { width: 145 });
    doc.text(`Ambiente Gerador: ${this.v(model.generator)}`, x + width - 155, y + 19, { width: 145 });
    doc.text(`Tipo de Ambiente: ${model.environment === 'test' ? 'Homologação' : 'Produção'}`, x + width - 155, y + 30, { width: 145 });
    y += headerH;

    const qr = model.accessKey ? await QRCode.toBuffer(`https://www.nfse.gov.br/ConsultaPublica/?tpc=1&chave=${encodeURIComponent(model.accessKey)}`, { margin: 0, width: 92, errorCorrectionLevel: 'M' }) : undefined;
    const idH = 104;
    doc.rect(x, y, width, idH).stroke();
    this.label(doc, boldFont, 'CHAVE DE ACESSO DA NFS-E', x + 5, y + 4, 360);
    this.value(doc, bodyFont, model.accessKey, x + 5, y + 15, 360, 12);
    this.gridFields(doc, bodyFont, boldFont, x + 5, y + 31, width - 125, 22, [
      ['NÚMERO DA NFS-E', model.number], ['COMPETÊNCIA DA NFS-E', model.competence], ['DATA E HORA DA EMISSÃO DA NFS-E', model.issuedAt],
      ['NÚMERO DA DPS', model.dpsNumber], ['SÉRIE DA DPS', model.dpsSeries], ['DATA E HORA DA EMISSÃO DA DPS', model.dpsIssuedAt],
      ['EMITENTE DA NFS-E', model.issuer], ['SITUAÇÃO DA NFS-E', invoiceState ?? model.status], ['FINALIDADE', model.purpose],
    ], 3);
    if (qr) doc.image(qr, x + width - 105, y + 8, { width: 60, height: 60 });
    doc.font(bodyFont).fontSize(5.5).text('A autenticidade desta NFS-e pode ser verificada pela leitura deste código QR ou pela consulta da chave de acesso no portal nacional da NFS-e.', x + width - 120, y + 70, { width: 112, align: 'center' });
    y += idH;

    y = this.partyBlock(doc, bodyFont, boldFont, x, y, width, 'PRESTADOR / FORNECEDOR', model.provider, true);
    y = this.partyBlock(doc, bodyFont, boldFont, x, y, width, 'TOMADOR / ADQUIRENTE', model.customer, false);
    if (Object.values(model.recipient).some(Boolean)) y = this.partyBlock(doc, bodyFont, boldFont, x, y, width, 'DESTINATÁRIO DA OPERAÇÃO', model.recipient, false);
    if (Object.values(model.intermediary).some(Boolean)) y = this.partyBlock(doc, bodyFont, boldFont, x, y, width, 'INTERMEDIÁRIO DA OPERAÇÃO', model.intermediary, false);

    y = this.section(doc, bodyFont, boldFont, x, y, width, 'SERVIÇO PRESTADO', 72, [
      ['Código de Tributação Nacional / Municipal', join([model.service.nationalCode, model.service.municipalCode], ' / ')],
      ['Código da NBS', model.service.nbs], ['Local da Prestação / Sigla UF / País', model.service.location],
      ['Descrição do Código de Tributação', model.service.codeDescription], ['Descrição do Serviço', model.service.description],
    ]);
    y = this.section(doc, bodyFont, boldFont, x, y, width, 'TRIBUTAÇÃO MUNICIPAL (ISSQN)', 56, Object.entries(model.iss).map(([key, value]) => [this.human(key), value] as [string, string | undefined]));
    y = this.section(doc, bodyFont, boldFont, x, y, width, 'TRIBUTAÇÃO FEDERAL (EXCETO CBS)', 42, Object.entries(model.federal).map(([key, value]) => [this.human(key), value] as [string, string | undefined]));
    y = this.section(doc, bodyFont, boldFont, x, y, width, 'TRIBUTAÇÃO IBS / CBS', 68, Object.entries(model.ibsCbs).map(([key, value]) => [this.human(key), value] as [string, string | undefined]));
    y = this.section(doc, bodyFont, boldFont, x, y, width, 'VALOR TOTAL DA NFS-E', 46, Object.entries(model.totals).map(([key, value]) => [this.human(key), value] as [string, string | undefined]));

    const remaining = pageH - MARGIN - y;
    const compH = Math.max(42, remaining - 4);
    doc.rect(x, y, width, compH).stroke();
    doc.rect(x, y, width, 13).fillAndStroke(LIGHT_GRAY, 'black');
    doc.fillColor('black').font(boldFont).fontSize(7).text('INFORMAÇÕES COMPLEMENTARES', x + 5, y + 3, { width: width - 10 });
    doc.font(bodyFont).fontSize(6.5).text(this.v(model.complementary), x + 5, y + 17, { width: width - 10, height: compH - 21, ellipsis: true });

    if (invoiceState === 'cancelled' || String(model.status).toLowerCase().includes('cancel')) this.watermark(doc, titleFont, 'CANCELADA');
    if (String(model.status).toLowerCase().includes('substit')) this.watermark(doc, titleFont, 'SUBSTITUÍDA');

    doc.end();
    return completed;
  }

  private async verifiedResources() {
    const arial = process.env.TAXAGENT_DANFSE_ARIAL_PATH;
    const sans = process.env.TAXAGENT_DANFSE_SANS_PATH;
    const logo = process.env.TAXAGENT_DANFSE_LOGO_PATH;
    if (!arial || !sans || !logo) throw new FiscalEngineError('TA_DANFSE_RESOURCES_MISSING', 'Verified DANFSe mode requires Arial, Microsoft Sans Serif-compatible font and official NFS-e logo paths', false);
    await Promise.all([access(arial), access(sans), access(logo)]);
    return { arial, sans, logo };
  }

  private partyBlock(doc: PDFKit.PDFDocument, body: string, bold: string, x: number, y: number, width: number, title: string, party: DanfseParty, includeSimple: boolean): number {
    const h = includeSimple ? 64 : 52;
    const fields: Array<[string, string | undefined]> = [
      ['CNPJ / CPF / NIF', party.taxId], ['Indicador Municipal (Inscrição)', party.municipalRegistration], ['Telefone', party.phone],
      ['Nome / Nome Empresarial', party.name], ['Município / Sigla UF', join([party.municipality, party.uf], ' / ')], ['Código IBGE / CEP', join([party.cityCode, party.cep], ' / ')],
      ['Endereço', party.address], ['E-mail', party.email],
    ];
    if (includeSimple) fields.push(['Simples Nacional na Data de Competência', party.simpleNational], ['Regime de Apuração Tributária pelo SN', party.simpleRegime]);
    return this.section(doc, body, bold, x, y, width, title, h, fields);
  }

  private section(doc: PDFKit.PDFDocument, body: string, bold: string, x: number, y: number, width: number, title: string, height: number, fields: Array<[string, string | undefined]>): number {
    doc.rect(x, y, width, height).stroke();
    doc.rect(x, y, width, 13).fillAndStroke(LIGHT_GRAY, 'black');
    doc.fillColor('black').font(bold).fontSize(7).text(title, x + 5, y + 3, { width: width - 10 });
    const columns = fields.length <= 3 ? 3 : 4;
    const rows = Math.max(1, Math.ceil(fields.length / columns));
    const rowH = (height - 14) / rows;
    const colW = width / columns;
    fields.forEach(([label, value], index) => {
      const row = Math.floor(index / columns); const col = index % columns;
      const fx = x + col * colW + 4; const fy = y + 15 + row * rowH;
      this.label(doc, bold, label, fx, fy, colW - 8);
      this.value(doc, body, value, fx, fy + 9, colW - 8, Math.max(8, rowH - 11));
    });
    return y + height;
  }

  private gridFields(doc: PDFKit.PDFDocument, body: string, bold: string, x: number, y: number, width: number, rowH: number, fields: Array<[string, string | undefined]>, columns: number) {
    const colW = width / columns;
    fields.forEach(([label, value], index) => { const row = Math.floor(index / columns); const col = index % columns; const fx = x + col * colW; const fy = y + row * rowH; this.label(doc, bold, label, fx, fy, colW - 5); this.value(doc, body, value, fx, fy + 9, colW - 5, 11); });
  }
  private label(doc: PDFKit.PDFDocument, font: string, label: string, x: number, y: number, width: number) { doc.fillColor('black').font(font).fontSize(6).text(label, x, y, { width, ellipsis: true }); }
  private value(doc: PDFKit.PDFDocument, font: string, value: string | undefined, x: number, y: number, width: number, height: number) { doc.fillColor('black').font(font).fontSize(7).text(this.v(value), x, y, { width, height, ellipsis: true }); }
  private v(value?: string) { return value && value.trim() ? value : '-'; }
  private human(value: string) { return value.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()); }
  private watermark(doc: PDFKit.PDFDocument, font: string, text: string) { doc.save(); doc.fillColor('#a6a6a6').opacity(0.35).font(font).fontSize(58).rotate(-35, { origin: [doc.page.width / 2, doc.page.height / 2] }).text(text, 120, doc.page.height / 2 - 30, { width: 360, align: 'center' }); doc.restore(); }
}

function join(parts: Array<string | undefined>, separator: string): string | undefined { const values = parts.filter((part): part is string => Boolean(part)); return values.length ? values.join(separator) : undefined; }
