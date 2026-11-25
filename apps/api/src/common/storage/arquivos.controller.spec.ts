import { ArquivosController, contentDisposition } from './arquivos.controller';
import type { ArquivoDto, ArquivosService } from './arquivos.service';

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

describe('ArquivosController: usos privados', () => {
  const exame = { id: 'a1', uso: 'anexo-atendimento' } as ArquivoDto;
  const avatar = { id: 'a2', uso: 'avatar' } as ArquivoDto;

  function criar(arquivo: ArquivoDto) {
    const service = {
      findById: jest.fn().mockResolvedValue(arquivo),
      link: jest.fn().mockResolvedValue({ url: '/u', expiraEm: 'x' }),
      remove: jest.fn().mockResolvedValue(arquivo),
    };
    return { controller: new ArquivosController(service as unknown as ArquivosService), service };
  }

  it('recusa metadados, link e exclusão do arquivo clínico (403)', async () => {
    const { controller, service } = criar(exame);
    await expect(controller.findById('a1')).rejects.toMatchObject({ status: 403 });
    await expect(controller.link('a1')).rejects.toMatchObject({ status: 403 });
    await expect(controller.remove('a1')).rejects.toMatchObject({ status: 403 });
    expect(service.link).not.toHaveBeenCalled();
    expect(service.remove).not.toHaveBeenCalled();
  });

  it('os demais usos seguem liberados', async () => {
    const { controller, service } = criar(avatar);
    await expect(controller.findById('a2')).resolves.toBe(avatar);
    await expect(controller.link('a2')).resolves.toEqual({ url: '/u', expiraEm: 'x' });
    await controller.remove('a2');
    expect(service.remove).toHaveBeenCalledWith('a2');
  });
});
