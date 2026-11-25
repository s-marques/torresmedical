import { writeDocumentoPdf, type BlocoDocumento } from './documento-pdf.writer';

const GERADO_EM = new Date('2026-10-14T02:00:00.000Z');
const paginas = (buffer: Buffer) =>
  (buffer.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length;

describe('writeDocumentoPdf', () => {
  it('gera um PDF com todos os tipos de bloco', async () => {
    const blocos: BlocoDocumento[] = [
      { tipo: 'secao', titulo: 'Paciente' },
      { tipo: 'subsecao', titulo: 'Atendimento' },
      { tipo: 'campo', rotulo: 'Queixa', valor: 'Dor de cabeça' },
      { tipo: 'campo', rotulo: 'Vazio', valor: '  ' },
      { tipo: 'campo', rotulo: 'Nulo', valor: null },
      { tipo: 'texto', texto: 'Texto corrido' },
      { tipo: 'lista', itens: ['um', 'dois'] },
      { tipo: 'separador' },
    ];

    const pdf = await writeDocumentoPdf({
      titulo: 'Prontuário',
      subtitulos: ['Paciente: Fulano Fictício'],
      blocos,
      geradoEm: GERADO_EM,
    });

    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(paginas(pdf)).toBe(1);
  });

  it('quebra em várias páginas quando o conteúdo é longo', async () => {
    const blocos: BlocoDocumento[] = Array.from({ length: 120 }, (_, i) => ({
      tipo: 'campo',
      rotulo: `Campo ${i}`,
      valor: 'texto '.repeat(30),
    }));

    const pdf = await writeDocumentoPdf({ titulo: 'Longo', blocos, geradoEm: GERADO_EM });

    expect(paginas(pdf)).toBeGreaterThan(1);
  });
});
