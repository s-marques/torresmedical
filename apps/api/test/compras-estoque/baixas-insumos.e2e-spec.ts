import { fakerPT_BR as faker } from '@faker-js/faker';
import type { INestApplication } from '@nestjs/common';
import { baixaInsumoPageSchema, baixaInsumoSchema } from '@torres/shared';
import request from 'supertest';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit, expectNoAudit } from '../utils/expect-audit';

const BASE = '/api/compras-estoque/baixas-insumos';
const ENTITY = 'BaixaInsumo';
const PERMISSOES = [
  'compras-estoque.baixa-insumos.ver',
  'compras-estoque.baixa-insumos.criar',
] as const;
const INEXISTENTE = '00000000-0000-4000-8000-000000000000';

describe('Baixa de Insumos (e2e)', () => {
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

  const criarProduto = (nome: string, atual: number, controla = true) =>
    prisma.produto.create({
      data: { nome, tipo: 'PRODUTO', estoqueAtual: atual, controlaEstoque: controla },
    });

  const saldo = async (id: string) =>
    Number((await prisma.produto.findUniqueOrThrow({ where: { id } })).estoqueAtual);

  describe('POST / (Registrar Baixa)', () => {
    it('201: grava a baixa com o responsável, baixa o saldo, registra a saída e audita CREATE', async () => {
      const luva = await criarProduto('Luva', 10);
      const gaze = await criarProduto('Gaze', 5);
      const paciente = await prisma.paciente.create({ data: { nome: faker.person.fullName() } });
      const profissional = await prisma.profissional.create({
        data: { nome: faker.person.fullName() },
      });

      const res = await http()
        .post(BASE)
        .send({
          pacienteId: paciente.id,
          profissionalId: profissional.id,
          pressaoArterial: ' 12x8 ',
          dextro: '95',
          observacao: 'Curativo',
          itens: [
            { produtoId: luva.id, quantidade: 2 },
            { produtoId: gaze.id, quantidade: 5 },
          ],
        })
        .expect(201);

      expect(baixaInsumoSchema.parse(res.body)).toMatchObject({
        pacienteId: paciente.id,
        profissionalId: profissional.id,
        unidadeId: null,
        pressaoArterial: '12x8',
        dextro: '95',
        responsavelId: usuario.id,
      });
      expect(res.body.itens).toHaveLength(2);
      expect(await saldo(luva.id)).toBe(8);
      expect(await saldo(gaze.id)).toBe(0);
      const saidas = await prisma.movimentacaoEstoque.findMany({
        where: { tipo: 'SAIDA' },
        orderBy: { createdAt: 'asc' },
      });
      expect(saidas).toHaveLength(2);
      expect(saidas.every((s) => s.usuarioId === usuario.id)).toBe(true);
      expect(saidas.every((s) => s.motivo === 'Baixa de Insumos')).toBe(true);
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: ENTITY,
        entityId: res.body.id,
        before: null,
        after: { responsavelId: usuario.id },
        userId: usuario.id,
      });
    });

    it('201: paciente, profissional e unidade são opcionais', async () => {
      const luva = await criarProduto('Luva', 3);
      await http()
        .post(BASE)
        .send({ itens: [{ produtoId: luva.id, quantidade: 1 }] })
        .expect(201);
      expect(await saldo(luva.id)).toBe(2);
    });

    it('400: sem insumo, com as mensagens do formulário, sem auditar', async () => {
      const res = await http().post(BASE).send({}).expect(400);
      expect(res.body.details).toEqual(
        expect.arrayContaining([{ field: 'itens', message: 'Selecione ao menos um insumo.' }]),
      );
      await expectNoAudit(prisma, { entity: ENTITY });
    });

    it('400: quantidade inteira maior que zero e insumos sem repetição', async () => {
      const luva = await criarProduto('Luva', 10);
      const quantidade = await http()
        .post(BASE)
        .send({ itens: [{ produtoId: luva.id, quantidade: 0 }] })
        .expect(400);
      expect(quantidade.body.details).toEqual([
        { field: 'itens.0.quantidade', message: 'A quantidade deve ser maior que zero' },
      ]);
      const repetido = await http()
        .post(BASE)
        .send({
          itens: [
            { produtoId: luva.id, quantidade: 1 },
            { produtoId: luva.id, quantidade: 1 },
          ],
        })
        .expect(400);
      expect(repetido.body.details[0].field).toBe('itens');
    });

    it('400: saldo insuficiente desfaz tudo (saldo, baixa, movimentação e auditoria)', async () => {
      const luva = await criarProduto('Luva', 10);
      const gaze = await criarProduto('Gaze', 1);

      const res = await http()
        .post(BASE)
        .send({
          itens: [
            { produtoId: luva.id, quantidade: 4 },
            { produtoId: gaze.id, quantidade: 2 },
          ],
        })
        .expect(400);

      expect(res.body.code).toBe('ESTOQUE_INSUFICIENTE');
      expect(await saldo(luva.id)).toBe(10);
      expect(await prisma.baixaInsumo.count()).toBe(0);
      expect(await prisma.movimentacaoEstoque.count()).toBe(0);
      await expectNoAudit(prisma, { entity: ENTITY });
    });

    it('404 para insumo, paciente, profissional ou unidade inexistente, sem auditar', async () => {
      const luva = await criarProduto('Luva', 10);
      const itens = [{ produtoId: luva.id, quantidade: 1 }];
      for (const extra of [
        { itens: [{ produtoId: INEXISTENTE, quantidade: 1 }] },
        { itens, pacienteId: INEXISTENTE },
        { itens, profissionalId: INEXISTENTE },
        { itens, unidadeId: INEXISTENTE },
      ]) {
        await http().post(BASE).send(extra).expect(404);
      }
      expect(await saldo(luva.id)).toBe(10);
      await expectNoAudit(prisma, { entity: ENTITY });
    });
  });

  describe('GET / (listagem)', () => {
    it('200: pagina, ordena pela data (mais recente primeiro) e filtra por Data Início/Fim', async () => {
      const luva = await criarProduto('Luva', 50);
      const antiga = await prisma.baixaInsumo.create({
        data: {
          createdAt: new Date('2026-01-10T15:00:00Z'),
          itens: { create: [{ produtoId: luva.id, quantidade: 1 }] },
        },
      });
      const recente = await prisma.baixaInsumo.create({
        data: {
          createdAt: new Date('2026-03-10T15:00:00Z'),
          itens: { create: [{ produtoId: luva.id, quantidade: 2 }] },
        },
      });

      const todas = await http().get(BASE).expect(200);
      const page = baixaInsumoPageSchema.parse(todas.body);
      expect(page.data.map((b) => b.id)).toEqual([recente.id, antiga.id]);
      expect(page.meta.total).toBe(2);
      expect(page.data[0]?.itens[0]).toMatchObject({ produtoNome: 'Luva', quantidade: '2' });

      const filtrada = await http()
        .get(BASE)
        .query({ dataInicio: '2026-03-01', dataFim: '2026-03-10' })
        .expect(200);
      expect(filtrada.body.data.map((b: { id: string }) => b.id)).toEqual([recente.id]);
    });

    it('400: data inválida', async () => {
      await http().get(BASE).query({ dataInicio: 'abc' }).expect(400);
    });
  });

  describe('segurança', () => {
    const ROTAS = [
      { metodo: 'get', caminho: BASE, permissao: 'ver' },
      { metodo: 'post', caminho: BASE, permissao: 'criar' },
    ] as const;

    it.each(ROTAS)('$metodo $caminho sem token responde 401', async ({ metodo, caminho }) => {
      await request(app.getHttpServer())[metodo](caminho).send({}).expect(401);
    });

    it.each(ROTAS)(
      '$metodo $caminho sem a permissão $permissao responde 403, sem auditar',
      async ({ metodo, caminho, permissao }) => {
        const outras = PERMISSOES.filter((p) => !p.endsWith(`.${permissao}`));
        const semPermissao = await criarUsuarioTeste(app, { permissoes: outras });

        const res = await comUsuario(app, semPermissao)[metodo](caminho).send({}).expect(403);

        expect(res.body).toMatchObject({ code: 'FORBIDDEN', message: 'Sem permissão' });
        await expectNoAudit(prisma, { entity: ENTITY });
      },
    );
  });

  describe('escopo de dados (issue #153)', () => {
    it('perfil restrito vê só as baixas dos profissionais vinculados e só baixa para eles (403 fora)', async () => {
      const meu = await prisma.profissional.create({ data: { nome: faker.person.fullName() } });
      const outro = await prisma.profissional.create({ data: { nome: faker.person.fullName() } });
      const luva = await criarProduto('Luva', 10);
      const itens = { create: [{ produtoId: luva.id, quantidade: 1 }] };
      const minha = await prisma.baixaInsumo.create({ data: { profissionalId: meu.id, itens } });
      await prisma.baixaInsumo.create({ data: { profissionalId: outro.id, itens } });
      await prisma.baixaInsumo.create({ data: { itens } });
      const restrito = await criarUsuarioTeste(app, {
        permissoes: PERMISSOES,
        escopoDados: 'PROFISSIONAIS_VINCULADOS',
        profissionalIds: [meu.id],
      });

      const lista = await comUsuario(app, restrito).get(BASE).expect(200);
      expect(lista.body.data.map((b: { id: string }) => b.id)).toEqual([minha.id]);

      const corpo = (profissionalId?: string) => ({
        profissionalId,
        itens: [{ produtoId: luva.id, quantidade: 1 }],
      });
      await comUsuario(app, restrito).post(BASE).send(corpo(outro.id)).expect(403);
      await comUsuario(app, restrito).post(BASE).send(corpo()).expect(403);
      expect(await saldo(luva.id)).toBe(10);
      await comUsuario(app, restrito).post(BASE).send(corpo(meu.id)).expect(201);
      expect(await saldo(luva.id)).toBe(9);
    });
  });
});
