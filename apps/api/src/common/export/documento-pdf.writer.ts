import PDFDocument from 'pdfkit';
import { EXPORT_TIME_ZONE } from './export-values';
import { collect, drawPageNumbers } from './pdf.writer';

const MARGIN = 48;
const GERADO_EM = new Intl.DateTimeFormat('pt-BR', {
  timeZone: EXPORT_TIME_ZONE,
  dateStyle: 'short',
  timeStyle: 'short',
});

/** Blocos de um documento corrido (prontuário, ficha). Texto simples, sem formatação rica. */
export type BlocoDocumento =
  | { tipo: 'secao'; titulo: string }
  | { tipo: 'subsecao'; titulo: string }
  | { tipo: 'campo'; rotulo: string; valor: string | null | undefined }
  | { tipo: 'texto'; texto: string }
  | { tipo: 'lista'; itens: readonly string[] }
  | { tipo: 'separador' };

export interface DocumentoPdf {
  titulo: string;
  /** Linhas abaixo do título (ex.: paciente, profissional, período). */
  subtitulos?: readonly string[];
  blocos: readonly BlocoDocumento[];
  geradoEm: Date;
}

/** PDF A4 em retrato, com título, blocos de texto e "Página X de Y" (Helvetica padrão). */
export function writeDocumentoPdf(documento: DocumentoPdf): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    margin: MARGIN,
    bufferPages: true,
    info: { Title: documento.titulo, Creator: 'Torres Medical' },
  });
  const done = collect(doc);

  doc.font('Helvetica-Bold').fontSize(16).text(documento.titulo);
  doc.font('Helvetica').fontSize(9).fillColor('#4B5563');
  for (const linha of documento.subtitulos ?? []) doc.text(linha);
  doc
    .text(`Gerado em ${GERADO_EM.format(documento.geradoEm)}`)
    .fillColor('black')
    .moveDown();

  for (const bloco of documento.blocos) desenhar(doc, bloco);

  drawPageNumbers(doc);
  doc.end();
  return done;
}

function desenhar(doc: InstanceType<typeof PDFDocument>, bloco: BlocoDocumento): void {
  switch (bloco.tipo) {
    case 'secao':
      doc.moveDown(0.8).font('Helvetica-Bold').fontSize(13).text(bloco.titulo);
      linha(doc);
      doc.moveDown(0.3);
      break;
    case 'subsecao':
      doc.moveDown(0.5).font('Helvetica-Bold').fontSize(10.5).text(bloco.titulo);
      break;
    case 'campo':
      if (!bloco.valor?.trim()) break;
      doc
        .font('Helvetica-Bold')
        .fontSize(9.5)
        .text(`${bloco.rotulo}: `, { continued: true })
        .font('Helvetica')
        .text(bloco.valor);
      break;
    case 'texto':
      doc.font('Helvetica').fontSize(9.5).text(bloco.texto);
      break;
    case 'lista':
      for (const item of bloco.itens) doc.font('Helvetica').fontSize(9.5).text(`• ${item}`);
      break;
    case 'separador':
      doc.moveDown(0.4);
      break;
  }
}

function linha(doc: InstanceType<typeof PDFDocument>): void {
  const y = doc.y + 1;
  doc
    .moveTo(MARGIN, y)
    .lineTo(doc.page.width - MARGIN, y)
    .strokeColor('#D1D5DB')
    .stroke()
    .strokeColor('black');
}
