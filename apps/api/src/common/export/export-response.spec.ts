import { toStreamableFile } from './export-response';

describe('toStreamableFile', () => {
  it('define tipo, tamanho e nome do arquivo (ASCII e UTF-8)', () => {
    const file = toStreamableFile({
      buffer: Buffer.from('abc'),
      contentType: 'application/pdf',
      filename: 'relatório "x".pdf',
    });

    const headers = file.getHeaders();
    expect(headers.type).toBe('application/pdf');
    expect(headers.length).toBe(3);
    expect(headers.disposition).toBe(
      `attachment; filename="relatorio x.pdf"; filename*=UTF-8''relat%C3%B3rio%20%22x%22.pdf`,
    );
  });
});
