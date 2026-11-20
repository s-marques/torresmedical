import type { INestApplication } from '@nestjs/common';
import {
  tipoTreinamentoListSchema,
  tipoTreinamentoSchema,
  treinamentoPageSchema,
  treinamentoSchema,
} from '@torres/shared';
import request from 'supertest';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit, expectNoAudit } from '../utils/expect-audit';

const URL = '/api/regulatorio-qualidade/treinamentos';
const URL_TIPOS = '/api/regulatorio-qualidade/tipos-treinamento';
const PERMISSOES = [
  'regulatorio-qualidade.treinamentos.ver',
  'regulatorio-qualidade.treinamentos.criar',
  'regulatorio-qualidade.treinamentos.exportar',
] as const;
const INEXISTENTE = '00000000-0000-4000-8000-000000000000';

describe('Treinamentos (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let usuario: UsuarioTeste;
  let funcionarioId: string;
  let tipoId: string;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    usuario = await criarUsuarioTeste(app, { permissoes: PERMISSOES });
    funcionarioId = (await prisma.funcionario.create({ data: { nome: 'Ana de Teste' } })).id;
    tipoId = (await prisma.tipoTreinamento.create({ data: { nome: 'NR-32' } })).id;
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => comUsuario(app, usuario);

  const criarNoBanco = async (
    extra: Partial<{
      funcionarioId: string;
      tipoTreinamentoId: string;
      instituicao: string;
      dataRealizacao: Date;
      dataVencimento: Date;
      deletedAt: Date;
    }> = {},
  ) =>
    prisma.treinamento.create({
      data: { funcionarioId, tipoTreinamentoId: tipoId, ...extra },
    });

  const dias = (n: number) => new Date(Date.now() + n * 86_400_000);

  describe('POST (Novo Treinamento)', () => {
    it('201: só com Funcionário e Tipo; status Válido e audita CREATE', async () => {
      const res = await http()
        .post(URL)
        .send({ funcionarioId, tipoTreinamentoId: tipoId })
        .expect(201);
      expect(treinamentoSchema.parse(res.body)).toMatchObject({
        funcionarioNome: 'Ana de Teste',
        tipoNome: 'NR-32',
        status: 'valido',
        dataVencimento: null,
        cargaHoraria: null,
      });
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: 'Treinamento',
        entityId: res.body.id,
        before: null,
        userId: usuario.id,
      });
    });

    it('201: grava todos os campos; vencimento no passado é Vencido', async () => {
      const res = await http()
        .post(URL)
        .send({
          funcionarioId,
          tipoTreinamentoId: tipoId,
          descricao: ' Descrição fictícia ',
          dataRealizacao: '2024-01-10',
          dataVencimento: '2025-01-10',
          cargaHoraria: 8,
          instituicao: 'Instituto de Teste',
          observacoes: 'Sem observações',
        })
        .expect(201);
      expect(res.body).toMatchObject({
        descricao: 'Descrição fictícia',
        dataRealizacao: '2024-01-10',
        dataVencimento: '2025-01-10',
        cargaHoraria: 8,
        instituicao: 'Instituto de Teste',
        status: 'vencido',
      });
    });

    it('400 "Funcionário é obrigatório." e "Tipo é obrigatório." com tudo vazio, sem auditar', async () => {
      const res = await http().post(URL).send({}).expect(400);
      expect(res.body.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'funcionarioId',
            message: 'Funcionário é obrigatório.',
          }),
          expect.objectContaining({
            field: 'tipoTreinamentoId',
            message: 'Tipo é obrigatório.',
          }),
        ]),
      );
      await expectNoAudit(prisma, { entity: 'Treinamento' });
    });

    it('400 para data e carga horária inválidas', async () => {
      const res = await http()
        .post(URL)
        .send({
          funcionarioId,
          tipoTreinamentoId: tipoId,
          dataVencimento: '10/01/2025',
          cargaHoraria: -3,
        })
        .expect(400);
      expect(res.body.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'dataVencimento', message: 'Data Vencimento inválida' }),
          expect.objectContaining({ field: 'cargaHoraria' }),
        ]),
      );
    });

    it('404 para funcionário ou tipo inexistente, sem auditar', async () => {
      await http()
        .post(URL)
        .send({ funcionarioId: INEXISTENTE, tipoTreinamentoId: tipoId })
        .expect(404);
      await http().post(URL).send({ funcionarioId, tipoTreinamentoId: INEXISTENTE }).expect(404);
      await expectNoAudit(prisma, { entity: 'Treinamento' });
    });
  });

  describe('Tipos de treinamento', () => {
    it('POST 201 cria o tipo e audita; GET lista em ordem alfabética', async () => {
      const res = await http().post(URL_TIPOS).send({ nome: ' Biossegurança ' }).expect(201);
      expect(tipoTreinamentoSchema.parse(res.body).nome).toBe('Biossegurança');
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: 'TipoTreinamento',
        entityId: res.body.id,
        before: null,
        userId: usuario.id,
      });
      const lista = await http().get(URL_TIPOS).expect(200);
      expect(tipoTreinamentoListSchema.parse(lista.body).map((t) => t.nome)).toEqual([
        'Biossegurança',
        'NR-32',
      ]);
    });

    it('POST 400 "Nome é obrigatório." sem auditar; 403 sem permissão', async () => {
      const res = await http().post(URL_TIPOS).send({ nome: '  ' }).expect(400);
      expect(res.body.details).toEqual([
        expect.objectContaining({ field: 'nome', message: 'Nome é obrigatório.' }),
      ]);
      await expectNoAudit(prisma, { entity: 'TipoTreinamento' });
      const semPermissao = await criarUsuarioTeste(app, { permissoes: [] });
      await comUsuario(app, semPermissao).get(URL_TIPOS).expect(403);
      await comUsuario(app, semPermissao).post(URL_TIPOS).send({ nome: 'X' }).expect(403);
    });
  });

  describe('GET (listagem)', () => {
    it('200 paginado, sem excluídos, com as colunas do grid', async () => {
      await criarNoBanco({ instituicao: 'Instituto A' });
      await criarNoBanco({ deletedAt: new Date() });
      const res = await http().get(URL).expect(200);
      const pagina = treinamentoPageSchema.parse(res.body);
      expect(pagina.meta).toMatchObject({ page: 1, pageSize: 10, total: 1 });
      expect(pagina.data[0]).toMatchObject({
        funcionarioNome: 'Ana de Teste',
        tipoNome: 'NR-32',
        instituicao: 'Instituto A',
        status: 'valido',
      });
    });

    it('filtra pelas abas Válido e Vencido (sem vencimento é Válido)', async () => {
      await criarNoBanco({ instituicao: 'Futuro', dataVencimento: dias(30) });
      await criarNoBanco({ instituicao: 'Sem vencimento' });
      await criarNoBanco({ instituicao: 'Passado', dataVencimento: dias(-30) });

      const instituicoes = (res: { body: { data: { instituicao: string }[] } }) =>
        res.body.data.map((t) => t.instituicao).sort((a, b) => a.localeCompare(b));
      expect(instituicoes(await http().get(URL).query({ status: 'valido' }).expect(200))).toEqual([
        'Futuro',
        'Sem vencimento',
      ]);
      expect(instituicoes(await http().get(URL).query({ status: 'vencido' }).expect(200))).toEqual([
        'Passado',
      ]);
      expect((await http().get(URL).expect(200)).body.meta.total).toBe(3);
    });

    it('busca por funcionário, tipo e instituição', async () => {
      const outro = await prisma.funcionario.create({ data: { nome: 'Bruno de Teste' } });
      const outroTipo = await prisma.tipoTreinamento.create({
        data: { nome: 'Primeiros Socorros' },
      });
      await criarNoBanco({ instituicao: 'Alpha' });
      await criarNoBanco({ funcionarioId: outro.id, instituicao: 'Beta' });
      await criarNoBanco({ tipoTreinamentoId: outroTipo.id, instituicao: 'Gama' });
      const buscar = async (search: string) =>
        (await http().get(URL).query({ search }).expect(200)).body.data.map(
          (t: { instituicao: string }) => t.instituicao,
        );
      expect(await buscar('bruno')).toEqual(['Beta']);
      expect(await buscar('socorros')).toEqual(['Gama']);
      expect(await buscar('alph')).toEqual(['Alpha']);
    });

    it('ordena por coluna (inclusive relações) e pagina', async () => {
      const outro = await prisma.funcionario.create({ data: { nome: 'Aline de Teste' } });
      await criarNoBanco({ instituicao: 'B' });
      await criarNoBanco({ funcionarioId: outro.id, instituicao: 'A' });
      await criarNoBanco({ instituicao: 'C' });
      const porFuncionario = await http()
        .get(URL)
        .query({ sort: 'funcionario:asc', pageSize: 1 })
        .expect(200);
      expect(porFuncionario.body.data[0].funcionarioNome).toBe('Aline de Teste');
      expect(porFuncionario.body.meta).toMatchObject({ total: 3, totalPages: 3 });
      const porInstituicao = await http()
        .get(URL)
        .query({ sort: 'instituicao:desc', page: 2, pageSize: 2 })
        .expect(200);
      expect(porInstituicao.body.data.map((t: { instituicao: string }) => t.instituicao)).toEqual([
        'A',
      ]);
      await http().get(URL).query({ sort: 'tipo:asc' }).expect(200);
      await http().get(URL).query({ sort: 'status:desc' }).expect(200);
    });

    it('400 para ordenação e status inválidos', async () => {
      await http().get(URL).query({ sort: 'senha:asc' }).expect(400);
      await http().get(URL).query({ status: 'qualquer' }).expect(400);
    });
  });

  describe('GET /:id', () => {
    it('200 com o detalhe', async () => {
      const t = await criarNoBanco();
      const res = await http().get(`${URL}/${t.id}`).expect(200);
      expect(treinamentoSchema.parse(res.body).id).toBe(t.id);
    });

    it('404 para inexistente ou excluído; 400 para id inválido', async () => {
      const excluido = await criarNoBanco({ deletedAt: new Date() });
      await http().get(`${URL}/${INEXISTENTE}`).expect(404);
      await http().get(`${URL}/${excluido.id}`).expect(404);
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
      await criarNoBanco({ dataVencimento: dias(-5) });
      const res = await binary(
        http().get(`${URL}/export`).query({ format: 'xlsx', status: 'vencido' }),
      ).expect(200);
      expect((res.body as Buffer).length).toBeGreaterThan(0);
      await expectAudit(prisma, {
        action: 'EXPORT',
        entity: 'Treinamento',
        entityId: '*',
        userId: usuario.id,
      });
    });

    it('400 para colunas inválidas, sem auditar', async () => {
      await http().get(`${URL}/export`).query({ format: 'xlsx', columns: 'senha' }).expect(400);
      await expectNoAudit(prisma, { entity: 'Treinamento', action: 'EXPORT' });
    });
  });

  describe('acesso', () => {
    it('sem a permissão criar responde 403, sem auditar', async () => {
      const semCriar = await criarUsuarioTeste(app, {
        permissoes: PERMISSOES.filter((p) => !p.endsWith('.criar')),
      });
      const res = await comUsuario(app, semCriar)
        .post(URL)
        .send({ funcionarioId, tipoTreinamentoId: tipoId })
        .expect(403);
      expect(res.body).toMatchObject({ code: 'FORBIDDEN', message: 'Sem permissão' });
      await expectNoAudit(prisma, { entity: 'Treinamento' });
    });

    it('sem a permissão ver responde 403 na listagem e no detalhe', async () => {
      const semVer = await criarUsuarioTeste(app, { permissoes: [] });
      await comUsuario(app, semVer).get(URL).expect(403);
      await comUsuario(app, semVer).get(`${URL}/${INEXISTENTE}`).expect(403);
    });

    it('sem a permissão exportar responde 403', async () => {
      const semExportar = await criarUsuarioTeste(app, {
        permissoes: ['regulatorio-qualidade.treinamentos.ver'],
      });
      await comUsuario(app, semExportar).get(`${URL}/export`).query({ format: 'xlsx' }).expect(403);
    });
  });
});
