import type { INestApplication } from '@nestjs/common';
import {
  licencaListaSchema,
  licencaPageSchema,
  licencaResumoSchema,
  licencaSchema,
  tipoLicencaSchema,
} from '@torres/shared';
import request from 'supertest';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit, expectNoAudit } from '../utils/expect-audit';

const BASE = '/api/regulatorio-qualidade';
const LICENCAS = `${BASE}/licencas`;
const TIPOS = `${BASE}/tipos-licenca`;
const PERMISSOES = [
  'regulatorio-qualidade.alvaras-licencas.ver',
  'regulatorio-qualidade.alvaras-licencas.criar',
  'regulatorio-qualidade.alvaras-licencas.editar',
  'regulatorio-qualidade.alvaras-licencas.exportar',
] as const;
const INEXISTENTE = '00000000-0000-4000-8000-000000000000';
const DIA_MS = 86_400_000;

/** `YYYY-MM-DD` daqui a `dias` dias (o fuso da clínica pode diferir em horas, não em dias de folga). */
const emDias = (dias: number) => new Date(Date.now() + dias * DIA_MS).toISOString().slice(0, 10);

describe('Alvarás e Licenças (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let usuario: UsuarioTeste;
  let unidadeId: string;
  let outraUnidadeId: string;
  let tipoId: string;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    usuario = await criarUsuarioTeste(app, { permissoes: PERMISSOES });
    const empresa = await prisma.empresa.create({
      data: { nome: 'Empresa Teste', documento: '11222333000181' },
    });
    unidadeId = (await prisma.unidade.create({ data: { empresaId: empresa.id, nome: 'Matriz' } }))
      .id;
    outraUnidadeId = (
      await prisma.unidade.create({ data: { empresaId: empresa.id, nome: 'Filial' } })
    ).id;
    tipoId = (await prisma.tipoLicenca.create({ data: { nome: 'Alvará Sanitário' } })).id;
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => comUsuario(app, usuario);

  function criarNoBanco(
    extra: {
      unidadeId?: string;
      naoSeAplica?: boolean;
      dataVencimento?: string | null;
      numeroDocumento?: string;
      deletedAt?: Date;
    } = {},
  ) {
    const { dataVencimento, unidadeId: unidade, ...resto } = extra;
    return prisma.licenca.create({
      data: {
        unidadeId: unidade ?? unidadeId,
        tipoLicencaId: tipoId,
        dataVencimento: dataVencimento ? new Date(`${dataVencimento}T00:00:00Z`) : null,
        ...resto,
      },
    });
  }

  describe('POST /tipos-licenca (Novo Tipo)', () => {
    it('201: cria o tipo, uma licença "Não se aplica" por unidade e audita CREATE', async () => {
      const res = await http().post(TIPOS).send({ nome: 'Alvará Bombeiro' }).expect(201);
      const tipo = tipoLicencaSchema.parse(res.body);
      expect(tipo.nome).toBe('Alvará Bombeiro');

      const geradas = await prisma.licenca.findMany({ where: { tipoLicencaId: tipo.id } });
      expect(geradas.map((l) => l.unidadeId).sort()).toEqual([unidadeId, outraUnidadeId].sort());
      expect(geradas.every((l) => l.naoSeAplica)).toBe(true);
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: 'TipoLicenca',
        entityId: tipo.id,
        before: null,
        userId: usuario.id,
      });
    });

    it('400 "Nome é obrigatório." com o nome vazio, sem auditar', async () => {
      const res = await http().post(TIPOS).send({ nome: '' }).expect(400);
      expect(res.body.details).toEqual([
        expect.objectContaining({ field: 'nome', message: 'Nome é obrigatório.' }),
      ]);
      await expectNoAudit(prisma, { entity: 'TipoLicenca' });
    });
  });

  describe('GET /tipos-licenca', () => {
    it('lista por nome, sem excluídos', async () => {
      await prisma.tipoLicenca.create({ data: { nome: 'Excluído', deletedAt: new Date() } });
      await prisma.tipoLicenca.create({ data: { nome: 'Alvará Bombeiro' } });
      const res = await http().get(TIPOS).expect(200);
      expect(res.body.map((t: { nome: string }) => t.nome)).toEqual([
        'Alvará Bombeiro',
        'Alvará Sanitário',
      ]);
    });
  });

  describe('POST /licencas (Nova Licenca)', () => {
    it('201: só com Unidade e Tipo; audita CREATE', async () => {
      const res = await http()
        .post(LICENCAS)
        .send({ unidadeId, tipoLicencaId: tipoId })
        .expect(201);
      expect(licencaSchema.parse(res.body)).toMatchObject({
        unidadeNome: 'Matriz',
        tipoLicencaNome: 'Alvará Sanitário',
        naoSeAplica: false,
        status: 'ok',
        diasRestantes: null,
      });
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: 'Licenca',
        entityId: res.body.id,
        before: null,
        userId: usuario.id,
      });
    });

    it('201 com todos os campos e status calculado pelo vencimento', async () => {
      const res = await http()
        .post(LICENCAS)
        .send({
          unidadeId,
          tipoLicencaId: tipoId,
          numeroDocumento: '123/2026',
          orgaoEmissor: 'Prefeitura',
          titular: 'Clínica Teste',
          dataEmissao: '2026-01-10',
          dataVencimento: emDias(20),
          email: 'contato@exemplo.com',
          plataformaOnline: true,
          responsavel: 'Fulana',
        })
        .expect(201);
      expect(res.body).toMatchObject({
        numeroDocumento: '123/2026',
        dataEmissao: '2026-01-10',
        plataformaOnline: true,
        status: 'alerta-30',
      });
    });

    it('400 com Unidade e Tipo de Licença obrigatórios, sem auditar', async () => {
      const res = await http().post(LICENCAS).send({}).expect(400);
      expect(res.body.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'unidadeId' }),
          expect.objectContaining({ field: 'tipoLicencaId' }),
        ]),
      );
      await expectNoAudit(prisma, { entity: 'Licenca' });
    });

    it('400 com e-mail ou data inválidos', async () => {
      const res = await http()
        .post(LICENCAS)
        .send({ unidadeId, tipoLicencaId: tipoId, email: 'x', dataVencimento: '31/12/2026' })
        .expect(400);
      expect(res.body.details.map((d: { field: string }) => d.field)).toEqual(
        expect.arrayContaining(['email', 'dataVencimento']),
      );
    });

    it('404 para unidade ou tipo inexistente, sem auditar', async () => {
      await http()
        .post(LICENCAS)
        .send({ unidadeId: INEXISTENTE, tipoLicencaId: tipoId })
        .expect(404);
      await http().post(LICENCAS).send({ unidadeId, tipoLicencaId: INEXISTENTE }).expect(404);
      await expectNoAudit(prisma, { entity: 'Licenca' });
    });
  });

  describe('GET /licencas (listagem)', () => {
    beforeEach(async () => {
      await criarNoBanco({ dataVencimento: emDias(-5), numeroDocumento: 'VENCIDA' });
      await criarNoBanco({ dataVencimento: emDias(20), numeroDocumento: 'A30' });
      await criarNoBanco({ dataVencimento: emDias(45), numeroDocumento: 'A60' });
      await criarNoBanco({ dataVencimento: emDias(200), numeroDocumento: 'OK' });
      await criarNoBanco({ naoSeAplica: true, numeroDocumento: 'NA', unidadeId: outraUnidadeId });
      await criarNoBanco({ numeroDocumento: 'EXCLUIDA', deletedAt: new Date() });
    });

    const documentos = (body: { data: { numeroDocumento: string | null }[] }) =>
      body.data.map((l) => l.numeroDocumento);

    it('padrão: vencimento mais próximo primeiro, sem excluídos', async () => {
      const res = await http().get(LICENCAS).expect(200);
      const page = licencaPageSchema.parse(res.body);
      expect(page.meta.total).toBe(5);
      expect(documentos(page).slice(0, 4)).toEqual(['VENCIDA', 'A30', 'A60', 'OK']);
    });

    it.each([
      ['vencido', ['VENCIDA']],
      ['alerta-30', ['A30']],
      ['alerta-60', ['A60']],
      ['ok', ['OK']],
      ['na', ['NA']],
    ])('filtra por status %s', async (status, esperado) => {
      const res = await http().get(LICENCAS).query({ status }).expect(200);
      expect(documentos(res.body)).toEqual(esperado);
    });

    it('filtra por unidade e busca por texto', async () => {
      const porUnidade = await http()
        .get(LICENCAS)
        .query({ unidadeId: outraUnidadeId })
        .expect(200);
      expect(documentos(porUnidade.body)).toEqual(['NA']);
      const porBusca = await http().get(LICENCAS).query({ search: 'a60' }).expect(200);
      expect(documentos(porBusca.body)).toEqual(['A60']);
    });

    it('ordena por unidade (desc) e pagina', async () => {
      const res = await http()
        .get(LICENCAS)
        .query({ sort: 'unidade:desc', page: 1, pageSize: 2 })
        .expect(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.meta).toMatchObject({ page: 1, pageSize: 2, total: 5, totalPages: 3 });
      expect(res.body.data[0].unidadeNome).toBe('Matriz');
    });

    it('400 para ordenação inválida', async () => {
      await http().get(LICENCAS).query({ sort: 'senha:asc' }).expect(400);
    });
  });

  describe('GET /licencas/resumo, /alertas e /ordem-renovacao', () => {
    beforeEach(async () => {
      await criarNoBanco({ dataVencimento: emDias(-5), numeroDocumento: 'VENCIDA' });
      await criarNoBanco({ dataVencimento: emDias(20), numeroDocumento: 'A30' });
      await criarNoBanco({ dataVencimento: emDias(45), numeroDocumento: 'A60' });
      await criarNoBanco({ dataVencimento: emDias(200), numeroDocumento: 'OK' });
      await criarNoBanco({ naoSeAplica: true, numeroDocumento: 'NA' });
    });

    it('resumo: totais por status', async () => {
      const res = await http().get(`${LICENCAS}/resumo`).expect(200);
      expect(licencaResumoSchema.parse(res.body)).toEqual({
        total: 5,
        ok: 1,
        alerta60: 1,
        alerta30: 1,
        vencido: 1,
        naoSeAplica: 1,
      });
    });

    it('alertas: vencidas e até 60 dias, da mais urgente para a menos', async () => {
      const res = await http().get(`${LICENCAS}/alertas`).expect(200);
      expect(licencaListaSchema.parse(res.body).map((l) => l.numeroDocumento)).toEqual([
        'VENCIDA',
        'A30',
        'A60',
      ]);
    });

    it('ordem de renovação: todas com vencimento, da mais próxima à mais distante', async () => {
      const res = await http().get(`${LICENCAS}/ordem-renovacao`).expect(200);
      expect(res.body.map((l: { numeroDocumento: string }) => l.numeroDocumento)).toEqual([
        'VENCIDA',
        'A30',
        'A60',
        'OK',
      ]);
    });
  });

  describe('GET /licencas/:id e PATCH /licencas/:id', () => {
    it('200 no detalhe; 404 inexistente', async () => {
      const licenca = await criarNoBanco();
      await http().get(`${LICENCAS}/${licenca.id}`).expect(200);
      await http().get(`${LICENCAS}/${INEXISTENTE}`).expect(404);
    });

    it('PATCH 200: altera e audita UPDATE', async () => {
      const licenca = await criarNoBanco({ numeroDocumento: 'ANTES' });
      const res = await http()
        .patch(`${LICENCAS}/${licenca.id}`)
        .send({ unidadeId, tipoLicencaId: tipoId, numeroDocumento: 'DEPOIS', naoSeAplica: true })
        .expect(200);
      expect(res.body).toMatchObject({ numeroDocumento: 'DEPOIS', status: 'na' });
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: 'Licenca',
        entityId: licenca.id,
        before: { numeroDocumento: 'ANTES', naoSeAplica: false },
        after: { numeroDocumento: 'DEPOIS', naoSeAplica: true },
        userId: usuario.id,
      });
    });

    it('PATCH 404 inexistente e 400 inválido, sem auditar', async () => {
      await http()
        .patch(`${LICENCAS}/${INEXISTENTE}`)
        .send({ unidadeId, tipoLicencaId: tipoId })
        .expect(404);
      const licenca = await criarNoBanco();
      await http().patch(`${LICENCAS}/${licenca.id}`).send({ unidadeId }).expect(400);
      await expectNoAudit(prisma, { entity: 'Licenca' });
    });
  });

  describe('GET /licencas/export', () => {
    function binary(req: request.Test) {
      return req.buffer(true).parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });
    }

    it('xlsx com filtro; audita EXPORT', async () => {
      await criarNoBanco({ dataVencimento: emDias(20) });
      const res = await binary(
        http().get(`${LICENCAS}/export`).query({ format: 'xlsx', status: 'alerta-30' }),
      ).expect(200);
      expect((res.body as Buffer).length).toBeGreaterThan(0);
      await expectAudit(prisma, {
        action: 'EXPORT',
        entity: 'Licenca',
        entityId: '*',
        userId: usuario.id,
      });
    });

    it('400 para colunas inválidas, sem auditar', async () => {
      await http()
        .get(`${LICENCAS}/export`)
        .query({ format: 'xlsx', columns: 'senha' })
        .expect(400);
      await expectNoAudit(prisma, { entity: 'Licenca', action: 'EXPORT' });
    });
  });

  describe('acesso', () => {
    it('sem a permissão criar responde 403, sem auditar', async () => {
      const semPermissao = await criarUsuarioTeste(app, {
        permissoes: PERMISSOES.filter((p) => !p.endsWith('.criar')),
      });
      const cliente = comUsuario(app, semPermissao);
      const res = await cliente
        .post(LICENCAS)
        .send({ unidadeId, tipoLicencaId: tipoId })
        .expect(403);
      expect(res.body).toMatchObject({ code: 'FORBIDDEN', message: 'Sem permissão' });
      await cliente.post(TIPOS).send({ nome: 'X' }).expect(403);
      await expectNoAudit(prisma, { entity: 'Licenca' });
      await expectNoAudit(prisma, { entity: 'TipoLicenca' });
    });

    it('sem a permissão ver responde 403 na listagem', async () => {
      const semVer = await criarUsuarioTeste(app, { permissoes: [] });
      await comUsuario(app, semVer).get(LICENCAS).expect(403);
    });
  });
});
