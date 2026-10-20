import type { INestApplication } from '@nestjs/common';
import { tipoAgendamentoPageSchema, tipoAgendamentoSchema } from '@torres/shared';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit, expectNoAudit } from '../utils/expect-audit';

const BASE = '/api/configuracoes-gestao/tipos-agendamento';
const PERMISSOES = [
  'configuracoes-gestao.tipos-agendamento.ver',
  'configuracoes-gestao.tipos-agendamento.criar',
  'configuracoes-gestao.tipos-agendamento.editar',
  'configuracoes-gestao.tipos-agendamento.excluir',
] as const;
const INEXISTENTE = '00000000-0000-4000-8000-000000000000';

describe('Tipos de Agendamento (e2e)', () => {
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

  function criarNoBanco(nome: string, extra: { deletedAt?: Date; ativo?: boolean } = {}) {
    return prisma.tipoAgendamento.create({ data: { nome, duracaoMinutos: 30, ...extra } });
  }

  describe('GET', () => {
    it('lista paginada, por nome, sem excluídos; busca e status', async () => {
      await criarNoBanco('Retorno');
      await criarNoBanco('Avaliação');
      await criarNoBanco('Inativo', { ativo: false });
      await criarNoBanco('Excluído', { deletedAt: new Date() });

      const todos = await http().get(BASE).expect(200);
      const page = tipoAgendamentoPageSchema.parse(todos.body);
      expect(page.data.map((t) => t.nome)).toEqual(['Avaliação', 'Inativo', 'Retorno']);
      expect(page.data[0]).toMatchObject({
        permiteProcedimento: false,
        permitePacote: false,
        soroterapia: false,
      });

      const busca = await http().get(BASE).query({ search: 'ret' }).expect(200);
      expect(busca.body.data.map((t: { nome: string }) => t.nome)).toEqual(['Retorno']);
      const inativos = await http().get(BASE).query({ status: 'inativo' }).expect(200);
      expect(inativos.body.meta.total).toBe(1);
    });

    it('400 para sort fora da whitelist', async () => {
      const res = await http().get(BASE).query({ sort: 'deletedAt:asc' }).expect(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('403 sem permissão', async () => {
      const semPermissao = await criarUsuarioTeste(app, { permissoes: [] });
      await comUsuario(app, semPermissao).get(BASE).expect(403);
    });
  });

  describe('GET /:id', () => {
    it('200, 404 e 400', async () => {
      const tipo = await criarNoBanco('Retorno');

      const ok = await http().get(`${BASE}/${tipo.id}`).expect(200);
      expect(tipoAgendamentoSchema.parse(ok.body)).toMatchObject({ nome: 'Retorno' });
      const nao = await http().get(`${BASE}/${INEXISTENTE}`).expect(404);
      expect(nao.body.message).toBe('Tipo de agendamento não encontrado');
      await http().get(`${BASE}/abc`).expect(400);
    });
  });

  describe('POST', () => {
    it('201 com padrões do modal e audita CREATE', async () => {
      const res = await http().post(BASE).send({ nome: '  Avaliação  ' }).expect(201);

      expect(tipoAgendamentoSchema.parse(res.body)).toMatchObject({
        nome: 'Avaliação',
        duracaoMinutos: 30,
        cor: '#3b82f6',
        permiteProcedimento: false,
        permitePacote: false,
        soroterapia: false,
        ativo: true,
      });
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: 'TipoAgendamento',
        entityId: res.body.id,
        before: null,
        after: { id: res.body.id, nome: 'Avaliação', duracaoMinutos: 30 },
        userId: usuario.id,
      });
    });

    it('aceita nomes repetidos (sem regra de unicidade no inventário)', async () => {
      await criarNoBanco('Consulta');
      await http().post(BASE).send({ nome: 'Consulta' }).expect(201);
    });

    it('400 "Nome é obrigatório." e demais validações, sem auditar', async () => {
      const res = await http()
        .post(BASE)
        .send({ nome: '', duracaoMinutos: 0, cor: 'azul', extra: 1 })
        .expect(400);

      expect(res.body.details).toEqual(
        expect.arrayContaining([
          { field: 'nome', message: 'Nome é obrigatório.' },
          { field: 'duracaoMinutos', message: 'A duração deve ser de pelo menos 1 minuto' },
          { field: 'cor', message: 'Cor inválida. Use o formato #RRGGBB' },
          { field: 'extra', message: 'Campo não permitido' },
        ]),
      );
      await expectNoAudit(prisma, { entity: 'TipoAgendamento' });
    });

    it('403 sem permissão de criar', async () => {
      const leitor = await criarUsuarioTeste(app, {
        permissoes: ['configuracoes-gestao.tipos-agendamento.ver'],
      });
      await comUsuario(app, leitor).post(BASE).send({ nome: 'X' }).expect(403);
    });
  });

  describe('PATCH /:id', () => {
    it('200 e audita UPDATE com before/after', async () => {
      const tipo = await criarNoBanco('Retorno');

      const res = await http()
        .patch(`${BASE}/${tipo.id}`)
        .send({ nome: 'Retorno 2', soroterapia: true, duracaoMinutos: 20 })
        .expect(200);

      expect(res.body).toMatchObject({ nome: 'Retorno 2', soroterapia: true, duracaoMinutos: 20 });
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: 'TipoAgendamento',
        entityId: tipo.id,
        before: { nome: 'Retorno', soroterapia: false, duracaoMinutos: 30 },
        after: { nome: 'Retorno 2', soroterapia: true, duracaoMinutos: 20 },
        userId: usuario.id,
      });
    });

    it('400 sem campos e 404 para inexistente', async () => {
      const tipo = await criarNoBanco('Retorno');
      await http().patch(`${BASE}/${tipo.id}`).send({}).expect(400);
      await http().patch(`${BASE}/${INEXISTENTE}`).send({ nome: 'X' }).expect(404);
      await expectNoAudit(prisma, { entity: 'TipoAgendamento' });
    });
  });

  describe('DELETE /:id', () => {
    it('exclusão lógica: 200, audita DELETE e some da listagem', async () => {
      const tipo = await criarNoBanco('Retorno');

      await http().delete(`${BASE}/${tipo.id}`).expect(200);

      await expectAudit(prisma, {
        action: 'DELETE',
        entity: 'TipoAgendamento',
        entityId: tipo.id,
        before: { nome: 'Retorno', deletedAt: null },
        after: null,
        userId: usuario.id,
      });
      expect(
        (await prisma.tipoAgendamento.findUniqueOrThrow({ where: { id: tipo.id } })).deletedAt,
      ).not.toBeNull();
      expect((await http().get(BASE).expect(200)).body.meta.total).toBe(0);
    });

    it('404 para inexistente ou já excluído, sem auditar', async () => {
      const excluido = await criarNoBanco('X', { deletedAt: new Date() });
      await http().delete(`${BASE}/${excluido.id}`).expect(404);
      await http().delete(`${BASE}/${INEXISTENTE}`).expect(404);
      await expectNoAudit(prisma, { entity: 'TipoAgendamento' });
    });
  });
});
