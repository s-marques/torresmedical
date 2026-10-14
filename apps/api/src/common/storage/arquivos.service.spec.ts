import type { TransactionHost } from '@nestjs-cls/transactional';
import { Logger } from '@nestjs/common';
import { Readable } from 'node:stream';
import type { RequestContextService } from '../context/request-context.service';
import { BusinessException, ValidationException } from '../errors/api.exception';
import type { PrismaAdapter } from '../prisma/prisma-transaction';
import {
  ArquivosService,
  gerarChave,
  sanitizarNome,
  type ArquivoRecebido,
} from './arquivos.service';
import type { StorageDriver } from './drivers/storage-driver';
import { UrlSigner } from './signed-url';
import type { StorageConfig } from './storage.config';

const ID = '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const SECRET = 'segredo-de-teste-das-urls-de-download-0001';
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const DTO = {
  id: ID,
  uso: 'avatar',
  nomeOriginal: 'foto.png',
  contentType: 'image/png',
  tamanho: PNG.length,
  criadoPor: 'u-1',
  createdAt: new Date('2026-10-14T12:00:00.000Z'),
};
const REGISTRO = { ...DTO, chave: 'avatar/2026/10/abc', deletedAt: null };

function png(extra: Partial<ArquivoRecebido> = {}): ArquivoRecebido {
  return {
    originalname: 'foto.png',
    mimetype: 'image/png',
    size: PNG.length,
    buffer: PNG,
    ...extra,
  };
}

function setup() {
  const arquivo = {
    create: jest.fn().mockResolvedValue(DTO),
    findFirst: jest.fn().mockResolvedValue(DTO),
    update: jest.fn().mockResolvedValue(DTO),
  };
  const txHost = { tx: { arquivo } } as unknown as TransactionHost<PrismaAdapter>;
  const context = { getUserId: jest.fn().mockReturnValue('u-1') };
  const storage: jest.Mocked<StorageDriver> = {
    ensureReady: jest.fn(),
    put: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue(Readable.from([PNG])),
    delete: jest.fn().mockResolvedValue(undefined),
    close: jest.fn(),
  };
  const config = { urlSecret: SECRET, urlTtlSeconds: 300 } as StorageConfig;
  const service = new ArquivosService(
    txHost,
    context as unknown as RequestContextService,
    storage,
    config,
  );
  return { service, arquivo, storage, context };
}

async function capture(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('deveria ter lançado');
}

function detailsOf(error: unknown) {
  expect(error).toBeInstanceOf(ValidationException);
  return (error as ValidationException).details;
}

describe('ArquivosService', () => {
  describe('upload', () => {
    it('grava no storage com chave aleatória e MIME canônico, e registra os metadados', async () => {
      const { service, arquivo, storage } = setup();

      const result = await service.upload('avatar', png({ originalname: 'C:\\fotos\\Foto.PNG' }));

      expect(result).toBe(DTO);
      const [chave, conteudo, contentType] = storage.put.mock.calls[0] ?? [];
      expect(chave).toMatch(/^avatar\/\d{4}\/\d{2}\/[0-9a-f-]{36}$/);
      expect(conteudo).toBe(PNG);
      expect(contentType).toBe('image/png');
      expect(arquivo.create).toHaveBeenCalledWith({
        data: {
          uso: 'avatar',
          nomeOriginal: 'Foto.PNG',
          contentType: 'image/png',
          tamanho: PNG.length,
          chave,
          criadoPor: 'u-1',
        },
        omit: { chave: true, deletedAt: true },
      });
    });

    it('sem usuário no contexto grava criadoPor nulo', async () => {
      const { service, arquivo, context } = setup();
      context.getUserId.mockReturnValue(undefined);

      await service.upload('avatar', png());

      expect(arquivo.create.mock.calls[0][0].data.criadoPor).toBeNull();
    });

    it('400 sem arquivo, com tipo ou tamanho inválidos, sem gravar nada', async () => {
      const { service, storage } = setup();

      expect(detailsOf(await capture(service.upload('avatar', undefined)))).toEqual([
        { field: 'arquivo', message: 'Selecione um arquivo' },
      ]);
      expect(
        detailsOf(
          await capture(
            service.upload('avatar', png({ originalname: 'a.pdf', mimetype: 'application/pdf' })),
          ),
        ),
      ).toEqual([
        { field: 'arquivo', message: 'Tipo de arquivo não permitido. Envie JPG, PNG ou GIF' },
      ]);
      expect(
        detailsOf(await capture(service.upload('avatar', png({ size: 3 * 1024 * 1024 })))),
      ).toEqual([{ field: 'arquivo', message: 'O arquivo deve ter no máximo 2 MB' }]);
      expect(storage.put).not.toHaveBeenCalled();
    });

    it('400 quando o conteúdo não corresponde à extensão', async () => {
      const { service, storage } = setup();

      const error = await capture(
        service.upload('avatar', png({ buffer: Buffer.from('MZ executável') })),
      );

      expect(detailsOf(error)).toEqual([
        { field: 'arquivo', message: 'O conteúdo do arquivo não corresponde ao tipo informado' },
      ]);
      expect(storage.put).not.toHaveBeenCalled();
    });

    it('remove o objeto do storage se o registro no banco falhar', async () => {
      const { service, arquivo, storage } = setup();
      const falha = new Error('banco fora');
      arquivo.create.mockRejectedValue(falha);
      storage.delete.mockRejectedValue(new Error('storage fora'));

      await expect(service.upload('avatar', png())).rejects.toBe(falha);
      expect(storage.delete).toHaveBeenCalledWith(storage.put.mock.calls[0]?.[0]);
    });
  });

  describe('findById', () => {
    it('busca só não excluídos e sem a chave', async () => {
      const { service, arquivo } = setup();

      await expect(service.findById(ID)).resolves.toBe(DTO);
      expect(arquivo.findFirst).toHaveBeenCalledWith({
        where: { id: ID, deletedAt: null },
        omit: { chave: true, deletedAt: true },
      });
    });

    it('404 quando não existe', async () => {
      const { service, arquivo } = setup();
      arquivo.findFirst.mockResolvedValue(null);

      const error = await capture(service.findById(ID));

      expect(error).toBeInstanceOf(BusinessException);
      expect((error as BusinessException).getStatus()).toBe(404);
      expect((error as BusinessException).message).toBe('Arquivo não encontrado');
    });
  });

  describe('link', () => {
    it('gera URL relativa assinada com a validade configurada', async () => {
      const { service } = setup();
      const agora = Date.parse('2026-10-14T12:00:00.000Z');

      const link = await service.link(ID, agora);

      const expira = agora / 1000 + 300;
      const assinatura = new UrlSigner(SECRET).sign(ID, expira);
      expect(link).toEqual({
        url: `/api/arquivos/${ID}/conteudo?expira=${expira}&assinatura=${assinatura}`,
        expiraEm: '2026-10-14T12:05:00.000Z',
      });
    });
  });

  describe('conteudo', () => {
    const signer = new UrlSigner(SECRET);
    const futuro = Math.floor(Date.now() / 1000) + 60;

    it('devolve metadados (sem chave) e o stream do storage', async () => {
      const { service, arquivo, storage } = setup();
      arquivo.findFirst.mockResolvedValue(REGISTRO);

      const result = await service.conteudo(ID, {
        expira: futuro,
        assinatura: signer.sign(ID, futuro),
      });

      expect(result.arquivo).toEqual(DTO);
      expect(storage.get).toHaveBeenCalledWith(REGISTRO.chave);
    });

    it('403 para assinatura inválida ou link expirado', async () => {
      const { service } = setup();
      const passado = Math.floor(Date.now() / 1000) - 1;

      const invalido = await capture(
        service.conteudo(ID, { expira: futuro, assinatura: signer.sign(ID, futuro - 1) }),
      );
      const expirado = await capture(
        service.conteudo(ID, { expira: passado, assinatura: signer.sign(ID, passado) }),
      );

      expect(invalido).toMatchObject({ code: 'LINK_INVALIDO' });
      expect((invalido as BusinessException).getStatus()).toBe(403);
      expect(expirado).toMatchObject({ code: 'LINK_EXPIRADO' });
      expect((expirado as BusinessException).getStatus()).toBe(403);
    });

    it('404 quando o registro ou o objeto não existem', async () => {
      const { service, arquivo, storage } = setup();
      const query = { expira: futuro, assinatura: signer.sign(ID, futuro) };

      arquivo.findFirst.mockResolvedValueOnce(null);
      expect(await capture(service.conteudo(ID, query))).toMatchObject({ code: 'NOT_FOUND' });

      arquivo.findFirst.mockResolvedValueOnce(REGISTRO);
      storage.get.mockResolvedValueOnce(null);
      const log = jest.spyOn(Logger.prototype, 'error').mockImplementation();
      expect(await capture(service.conteudo(ID, query))).toMatchObject({ code: 'NOT_FOUND' });
      expect(log).toHaveBeenCalledWith(
        { arquivoId: ID },
        'Arquivo registrado sem conteúdo no storage',
      );
      log.mockRestore();
    });
  });

  describe('remove', () => {
    it('exclusão lógica', async () => {
      const { service, arquivo } = setup();

      await expect(service.remove(ID)).resolves.toBe(DTO);
      expect(arquivo.update).toHaveBeenCalledWith({
        where: { id: ID },
        data: { deletedAt: expect.any(Date) },
        omit: { chave: true, deletedAt: true },
      });
    });
  });
});

describe('gerarChave', () => {
  it('uso, ano e mês em UTC e uuid, sem o nome original', () => {
    expect(gerarChave('nfe-xml', new Date('2026-01-31T23:00:00.000Z'))).toMatch(
      /^nfe-xml\/2026\/01\/[0-9a-f-]{36}$/,
    );
  });
});

describe('sanitizarNome', () => {
  it('remove caminho e caracteres de controle', () => {
    expect(sanitizarNome('../../etc/pass\u0000wd.txt')).toBe('passwd.txt');
    expect(sanitizarNome('  relatório final.pdf ')).toBe('relatório final.pdf');
  });

  it('limita a 255 caracteres mantendo a extensão', () => {
    const nome = sanitizarNome(`${'a'.repeat(300)}.pdf`);
    expect(nome).toHaveLength(255);
    expect(nome.endsWith('.pdf')).toBe(true);
    expect(sanitizarNome('b'.repeat(300))).toHaveLength(255);
  });
});
