import type { INestApplication } from '@nestjs/common';
import { naoConformidadePageSchema, naoConformidadeSchema } from '@torres/shared';
import request from 'supertest';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit, expectNoAudit } from '../utils/expect-audit';

const URL = '/api/regulatorio-qualidade/nao-conformidades';
const PERMISSOES = [
  'regulatorio-qualidade.nao-conformidades.ver',
  'regulatorio-qualidade.nao-conformidades.criar',
  'regulatorio-qualidade.nao-conformidades.exportar',
] as const;
const INEXISTENTE = '00000000-0000-4000-8000-000000000000';

describe('Não Conformidades (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let usuario: UsuarioTeste;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    usuario = await criarUsuarioTeste(app, { permissoes: PERMISSOES });
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => comUsuario(app, usuario);

  const criarNoBanco = (
    extra: Partial<{
      titulo: string;
      setor: string;
      responsavel: string;
      status: 'ABERTA' | 'EM_TRATAMENTO' | 'CORRIGIDA' | 'FECHADA';
      dataOcorrencia: Date;
      deletedAt: Date;
    }> = {},
  ) =>
    prisma.naoConformidade.create({ data: { titulo: 'NC de teste', tipo: 'PROCESSO', ...extra } });

  describe('POST (Nova NC)', () => {
    it('201: só com Título e Tipo; nasce Aberta e audita CREATE', async () => {
      const res = await http()
        .post(URL)
        .send({ titulo: 'Falha no fluxo', tipo: 'processo' })
        .expect(201);
      expect(naoConformidadeSchema.parse(res.body)).toMatchObject({
        titulo: 'Falha no fluxo',
        tipo: 'processo',
        status: 'aberta',
        setor: null,
        dataOcorrencia: null,
      });
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: 'NaoConformidade',
        entityId: res.body.id,
        before: null,
        userId: usuario.id,
      });
    });

    it('201: grava todos os campos, com datas', async () => {
      const res = await http()
        .post(URL)
        .send({
          titulo: ' Lote vencido ',
          descricao: 'Descrição fictícia',
          setor: 'Estoque',
          tipo: 'produto',
          dataOcorrencia: '2026-11-10',
          dataLimiteCorrecao: '2026-11-30',
          responsavel: 'Fulano de Teste',
          acaoCorretiva: 'Descartar lote',
          observacoes: 'Sem observações',
        })
        .expect(201);
      expect(res.body).toMatchObject({
        titulo: 'Lote vencido',
        setor: 'Estoque',
        tipo: 'produto',
        dataOcorrencia: '2026-11-10',
        dataLimiteCorrecao: '2026-11-30',
        acaoCorretiva: 'Descartar lote',
      });
    });

    it('400 "Título é obrigatório." e "Tipo é obrigatório." com tudo vazio, sem auditar', async () => {
      const res = await http().post(URL).send({ titulo: '' }).expect(400);
      expect(res.body.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'titulo', message: 'Título é obrigatório.' }),
          expect.objectContaining({ field: 'tipo', message: 'Tipo é obrigatório.' }),
        ]),
      );
      await expectNoAudit(prisma, { entity: 'NaoConformidade' });
    });

    it('400 para tipo desconhecido e data inválida', async () => {
      await http().post(URL).send({ titulo: 'X', tipo: 'inexistente' }).expect(400);
      const res = await http()
        .post(URL)
        .send({ titulo: 'X', tipo: 'processo', dataOcorrencia: '10/11/2026' })
        .expect(400);
      expect(res.body.details).toEqual([
        expect.objectContaining({ field: 'dataOcorrencia', message: 'Data Ocorrência inválida' }),
      ]);
    });
  });

  describe('GET (listagem)', () => {
    it('200 paginado, sem excluídos, com as colunas do grid', async () => {
      await criarNoBanco({ titulo: 'A', setor: 'Recepção' });
      await criarNoBanco({ titulo: 'Excluída', deletedAt: new Date() });
      const res = await http().get(URL).expect(200);
      const pagina = naoConformidadePageSchema.parse(res.body);
      expect(pagina.meta).toMatchObject({ page: 1, pageSize: 10, total: 1 });
      expect(pagina.data[0]).toMatchObject({ titulo: 'A', setor: 'Recepção', status: 'aberta' });
    });

    it('filtra por status (abas) e busca por título, setor e responsável', async () => {
      await criarNoBanco({ titulo: 'Alpha', status: 'ABERTA' });
      await criarNoBanco({ titulo: 'Beta', status: 'EM_TRATAMENTO', setor: 'Laboratório' });
      await criarNoBanco({ titulo: 'Gama', status: 'FECHADA', responsavel: 'Zélia' });

      const aba = await http().get(URL).query({ status: 'em-tratamento' }).expect(200);
      expect(aba.body.data.map((n: { titulo: string }) => n.titulo)).toEqual(['Beta']);

      const setor = await http().get(URL).query({ search: 'labor' }).expect(200);
      expect(setor.body.data.map((n: { titulo: string }) => n.titulo)).toEqual(['Beta']);

      const resp = await http().get(URL).query({ search: 'zélia' }).expect(200);
      expect(resp.body.data.map((n: { titulo: string }) => n.titulo)).toEqual(['Gama']);
    });

    it('ordena por coluna e pagina', async () => {
      await criarNoBanco({ titulo: 'B' });
      await criarNoBanco({ titulo: 'A' });
      await criarNoBanco({ titulo: 'C' });
      const asc = await http().get(URL).query({ sort: 'titulo:asc', pageSize: 2 }).expect(200);
      expect(asc.body.data.map((n: { titulo: string }) => n.titulo)).toEqual(['A', 'B']);
      expect(asc.body.meta).toMatchObject({ total: 3, totalPages: 2 });
      const desc = await http()
        .get(URL)
        .query({ sort: 'titulo:desc', page: 2, pageSize: 2 })
        .expect(200);
      expect(desc.body.data.map((n: { titulo: string }) => n.titulo)).toEqual(['A']);
    });

    it('400 para ordenação e status inválidos', async () => {
      await http().get(URL).query({ sort: 'senha:asc' }).expect(400);
      await http().get(URL).query({ status: 'qualquer' }).expect(400);
    });
  });

  describe('GET /:id', () => {
    it('200 com o detalhe', async () => {
      const nc = await criarNoBanco();
      const res = await http().get(`${URL}/${nc.id}`).expect(200);
      expect(naoConformidadeSchema.parse(res.body).id).toBe(nc.id);
    });

    it('404 para inexistente ou excluída; 400 para id inválido', async () => {
      const excluida = await criarNoBanco({ deletedAt: new Date() });
      await http().get(`${URL}/${INEXISTENTE}`).expect(404);
      await http().get(`${URL}/${excluida.id}`).expect(404);
      await http().get(`${URL}/nao-e-uuid`).expect(400);
    });
  });

  describe('GET /export', () => {
    function binary(req: request.Test) {
      return req.buffer(true).parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });
    }

    it('xlsx com filtro; audita EXPORT', async () => {
      await criarNoBanco({ status: 'CORRIGIDA' });
      const res = await binary(
        http().get(`${URL}/export`).query({ format: 'xlsx', status: 'corrigida' }),
      ).expect(200);
      expect((res.body as Buffer).length).toBeGreaterThan(0);
      await expectAudit(prisma, {
        action: 'EXPORT',
        entity: 'NaoConformidade',
        entityId: '*',
        userId: usuario.id,
      });
    });

    it('400 para colunas inválidas, sem auditar', async () => {
      await http().get(`${URL}/export`).query({ format: 'xlsx', columns: 'senha' }).expect(400);
      await expectNoAudit(prisma, { entity: 'NaoConformidade', action: 'EXPORT' });
    });
  });

  describe('acesso', () => {
    it('sem a permissão criar responde 403, sem auditar', async () => {
      const semCriar = await criarUsuarioTeste(app, {
        permissoes: PERMISSOES.filter((p) => !p.endsWith('.criar')),
      });
      const res = await comUsuario(app, semCriar)
        .post(URL)
        .send({ titulo: 'X', tipo: 'processo' })
        .expect(403);
      expect(res.body).toMatchObject({ code: 'FORBIDDEN', message: 'Sem permissão' });
      await expectNoAudit(prisma, { entity: 'NaoConformidade' });
    });

    it('sem a permissão ver responde 403 na listagem e no detalhe', async () => {
      const semVer = await criarUsuarioTeste(app, { permissoes: [] });
      await comUsuario(app, semVer).get(URL).expect(403);
      await comUsuario(app, semVer).get(`${URL}/${INEXISTENTE}`).expect(403);
    });

    it('sem a permissão exportar responde 403', async () => {
      const semExportar = await criarUsuarioTeste(app, {
        permissoes: ['regulatorio-qualidade.nao-conformidades.ver'],
      });
      await comUsuario(app, semExportar).get(`${URL}/export`).query({ format: 'xlsx' }).expect(403);
    });
  });
});
