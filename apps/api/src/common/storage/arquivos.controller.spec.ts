import { contentDisposition } from './arquivos.controller';

describe('contentDisposition', () => {
  it('sempre attachment, com nome ASCII e nome UTF-8', () => {
    expect(contentDisposition('relatório "final".pdf')).toBe(
      `attachment; filename="relatorio final.pdf"; filename*=UTF-8''relat%C3%B3rio%20%22final%22.pdf`,
    );
  });

  it('nome sem caracteres ASCII usa "arquivo" no fallback', () => {
    expect(contentDisposition('文件.pdf')).toMatch(/^attachment; filename="\.pdf"/);
    expect(contentDisposition('文件')).toMatch(/^attachment; filename="arquivo"/);
  });
});
