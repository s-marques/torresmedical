import type { INestApplication } from '@nestjs/common';
import { apiErrorSchema, arquivoLinkSchema, arquivoSchema } from '@torres/shared';
import request from 'supertest';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import {
  STORAGE_DRIVER,
  type StorageDriver,
} from '../../src/common/storage/drivers/storage-driver';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit, expectNoAudit } from '../utils/expect-audit';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';

const BASE = '/api/arquivos';
const INEXISTENTE = '00000000-0000-4000-8000-000000000000';
const MB = 1024 * 1024;
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('conteúdo fictício de imagem'),
]);
const XML = Buffer.from('<?xml version="1.0" encoding="UTF-8"?><nfeProc versao="4.00"/>');

describe('Arquivos: upload e download (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let storage: StorageDriver;
  let usuario: UsuarioTeste;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    storage = app.get(STORAGE_DRIVER);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    // Arquivos exigem só o login, sem permissão específica.
    usuario = await criarUsuarioTeste(app);
  });

  afterAll(async () => {
    await app.close();
  });

  function http() {
    return comUsuario(app, usuario);
  }

  function enviar(uso: string, conteudo: Buffer, filename: string, contentType?: string) {
    return http()
      .post(BASE)
      .query({ uso })

      .attach('arquivo', conteudo, { filename, contentType });
  }

  async function enviarPng(): Promise<string> {
    const res = await enviar('avatar', PNG, 'foto.png', 'image/png').expect(201);
    return res.body.id as string;
  }

  function detalhes(body: unknown) {
    const erro = apiErrorSchema.parse(body);
    expect(erro.code).toBe('VALIDATION_ERROR');
    return erro.details;
  }

  describe('POST (upload)', () => {
    it('201: grava no storage com chave aleatória, registra metadados e audita CREATE', async () => {
      const res = await enviar('nfe-xml', XML, 'Nota fiscal de compra.XML', 'text/xml').expect(201);

      const arquivo = arquivoSchema.parse(res.body);
      expect(arquivo).toMatchObject({
        uso: 'nfe-xml',
        nomeOriginal: 'Nota fiscal de compra.XML',
        contentType: 'application/xml',
        tamanho: XML.length,
        criadoPor: usuario.id,
      });
      expect(res.body).not.toHaveProperty('chave');

      const registro = await prisma.arquivo.findUniqueOrThrow({ where: { id: arquivo.id } });
      expect(registro.chave).toMatch(/^nfe-xml\/\d{4}\/\d{2}\/[0-9a-f-]{36}$/);
      expect(registro.chave).not.toContain('Nota');
      expect(await storage.get(registro.chave)).not.toBeNull();

      await expectAudit(prisma, {
        action: 'CREATE',
        entity: 'Arquivo',
        entityId: arquivo.id,
        before: null,
        after: { id: arquivo.id, uso: 'nfe-xml', tamanho: XML.length },
        userId: usuario.id,
      });
    });

    it('aceita nome com acento (UTF-8)', async () => {
      const res = await enviar('avatar', PNG, 'avatar-joão.png', 'image/png').expect(201);

      expect(res.body.nomeOriginal).toBe('avatar-joão.png');
    });

    it('400 para tipo não permitido no uso', async () => {
      const res = await enviar(
        'avatar',
        Buffer.from('%PDF-1.7'),
        'doc.pdf',
        'application/pdf',
      ).expect(400);

      expect(detalhes(res.body)).toEqual([
        expect.objectContaining({
          field: 'arquivo',
          message: 'Tipo de arquivo não permitido. Envie JPG, PNG ou GIF',
        }),
      ]);
      expect(await prisma.arquivo.count()).toBe(0);
      await expectNoAudit(prisma, { entity: 'Arquivo' });
    });

    it('400 para conteúdo que não corresponde à extensão', async () => {
      const res = await enviar('avatar', Buffer.from('MZ binário'), 'foto.png', 'image/png').expect(
        400,
      );

      expect(detalhes(res.body)).toEqual([
        expect.objectContaining({
          field: 'arquivo',
          message: 'O conteúdo do arquivo não corresponde ao tipo informado',
        }),
      ]);
    });

    it('400 para arquivo acima do limite do uso', async () => {
      const grande = Buffer.concat([PNG, Buffer.alloc(2 * MB)]);

      const res = await enviar('avatar', grande, 'foto.png', 'image/png').expect(400);

      expect(detalhes(res.body)).toEqual([
        expect.objectContaining({ field: 'arquivo', message: 'O arquivo deve ter no máximo 2 MB' }),
      ]);
      await expectNoAudit(prisma, { entity: 'Arquivo' });
    });

    it('400 sem arquivo, com campo errado ou corpo que não é multipart', async () => {
      const semArquivo = await http()
        .post(BASE)
        .query({ uso: 'avatar' })
        .field('outro', 'x')
        .expect(400);
      const campoErrado = await http()
        .post(BASE)
        .query({ uso: 'avatar' })
        .attach('foto', PNG, 'foto.png')
        .expect(400);
      const json = await http().post(BASE).query({ uso: 'avatar' }).send({ a: 1 }).expect(400);

      expect(detalhes(semArquivo.body)).toEqual([
        expect.objectContaining({ field: 'arquivo', message: 'Selecione um arquivo' }),
      ]);
      expect(detalhes(campoErrado.body)).toEqual([
        expect.objectContaining({
          field: 'arquivo',
          message: 'Envie um único arquivo no campo "arquivo"',
        }),
      ]);
      expect(detalhes(json.body)).toEqual([
        expect.objectContaining({ field: 'arquivo', message: 'Selecione um arquivo' }),
      ]);
    });

    it('400 para uso ausente ou inválido', async () => {
      const semUso = await http().post(BASE).attach('arquivo', PNG, 'foto.png').expect(400);
      const usoInvalido = await enviar('nao-existe', PNG, 'foto.png').expect(400);

      expect(detalhes(semUso.body)).toEqual([
        expect.objectContaining({ field: 'uso', message: 'Informe o uso do arquivo' }),
      ]);
      expect(detalhes(usoInvalido.body)).toEqual([
        expect.objectContaining({ field: 'uso', message: 'Uso de arquivo inválido' }),
      ]);
    });
  });

  describe('GET /:id', () => {
    it('200 com os metadados', async () => {
      const id = await enviarPng();

      const res = await http().get(`${BASE}/${id}`).expect(200);

      expect(arquivoSchema.parse(res.body)).toMatchObject({ id, uso: 'avatar' });
    });

    it('404 para inexistente e 400 para id inválido', async () => {
      const inexistente = await http().get(`${BASE}/${INEXISTENTE}`).expect(404);
      const invalido = await http().get(`${BASE}/abc`).expect(400);

      expect(inexistente.body).toMatchObject({
        code: 'NOT_FOUND',
        message: 'Arquivo não encontrado',
      });
      expect(invalido.body.details).toEqual([
        expect.objectContaining({ field: 'id', message: 'Identificador inválido' }),
      ]);
    });
  });

  describe('link e download', () => {
    it('baixa pelo link temporário o mesmo conteúdo enviado, como anexo', async () => {
      const id = await enviarPng();

      const link = arquivoLinkSchema.parse(
        (await http().get(`${BASE}/${id}/link`).expect(200)).body,
      );
      expect(link.url).toMatch(
        new RegExp(`^/api/arquivos/${id}/conteudo\\?expira=\\d+&assinatura=`),
      );
      expect(Date.parse(link.expiraEm)).toBeGreaterThan(Date.now());

      const res = await http()
        .get(link.url)
        .buffer(true)
        .parse((response, callback) => {
          const partes: Buffer[] = [];
          response.on('data', (parte: Buffer) => partes.push(parte));
          response.on('end', () => callback(null, Buffer.concat(partes)));
        })
        .expect(200);

      expect(Buffer.compare(res.body as Buffer, PNG)).toBe(0);
      expect(res.headers['content-type']).toBe('image/png');
      expect(res.headers['content-disposition']).toBe(
        `attachment; filename="foto.png"; filename*=UTF-8''foto.png`,
      );
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['cache-control']).toBe('private, no-store');
    });

    it('403 para assinatura adulterada ou link expirado', async () => {
      const id = await enviarPng();
      const { url } = (await http().get(`${BASE}/${id}/link`).expect(200)).body as { url: string };
      const adulterado = url.replace(
        /expira=(\d+)/,
        (_m, n: string) => `expira=${Number(n) + 3600}`,
      );

      const invalido = await http().get(adulterado).expect(403);
      const expirado = await http()
        .get(`${BASE}/${id}/conteudo`)
        .query({ expira: 1, assinatura: 'a'.repeat(43) })
        .expect(403);

      expect(invalido.body).toMatchObject({ code: 'LINK_INVALIDO' });
      // Assinatura errada também para o link expirado: a validade só é conferida com assinatura válida.
      expect(expirado.body).toMatchObject({ code: 'LINK_INVALIDO' });
    });

    it('400 para link malformado e 404 para arquivo inexistente', async () => {
      const malformado = await http()
        .get(`${BASE}/${INEXISTENTE}/conteudo`)
        .query({ expira: 'x' })
        .expect(400);
      const inexistente = await http().get(`${BASE}/${INEXISTENTE}/link`).expect(404);

      expect(malformado.body.code).toBe('VALIDATION_ERROR');
      expect(inexistente.body.code).toBe('NOT_FOUND');
    });
  });

  describe('DELETE /:id', () => {
    it('exclusão lógica, audita DELETE e o arquivo deixa de ser baixado', async () => {
      const id = await enviarPng();
      const { url } = (await http().get(`${BASE}/${id}/link`).expect(200)).body as { url: string };

      const res = await http().delete(`${BASE}/${id}`).expect(200);

      expect(res.body).toMatchObject({ id });
      const registro = await prisma.arquivo.findUniqueOrThrow({ where: { id } });
      expect(registro.deletedAt).not.toBeNull();
      await expectAudit(prisma, {
        action: 'DELETE',
        entity: 'Arquivo',
        entityId: id,
        before: { id, uso: 'avatar', deletedAt: null },
        after: null,
        userId: usuario.id,
      });
      await http().get(`${BASE}/${id}`).expect(404);
      const download = await http().get(url).expect(404);
      expect(download.body.code).toBe('NOT_FOUND');
    });

    it('404 para inexistente, sem auditoria', async () => {
      const res = await http().delete(`${BASE}/${INEXISTENTE}`).expect(404);

      expect(res.body.code).toBe('NOT_FOUND');
      await expectNoAudit(prisma, { entity: 'Arquivo', action: 'DELETE' });
    });
  });

  describe('acesso', () => {
    it('upload, metadados, link e exclusão exigem login (401 sem token)', async () => {
      const anonimo = () => request(app.getHttpServer());

      await anonimo().post(BASE).query({ uso: 'avatar' }).expect(401);
      await anonimo().get(`${BASE}/${INEXISTENTE}`).expect(401);
      await anonimo().get(`${BASE}/${INEXISTENTE}/link`).expect(401);
      const res = await anonimo().delete(`${BASE}/${INEXISTENTE}`).expect(401);

      expect(res.body).toMatchObject({ code: 'UNAUTHORIZED' });
    });

    it('o download pelo link assinado não exige login', async () => {
      const id = await enviarPng();
      const { url } = (await http().get(`${BASE}/${id}/link`).expect(200)).body as { url: string };

      const res = await request(app.getHttpServer()).get(url).expect(200);

      expect(res.headers['content-type']).toMatch(/^image\/png/);
    });
  });
});
