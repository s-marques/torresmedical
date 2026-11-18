import type { INestApplication } from '@nestjs/common';
import { perfilPageSchema, perfilSchema } from '@torres/shared';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit, expectNoAudit } from '../utils/expect-audit';

const BASE = '/api/configuracoes-gestao/perfis-acesso';
const PERMISSOES = [
  'configuracoes-gestao.perfis-acesso.ver',
  'configuracoes-gestao.perfis-acesso.criar',
  'configuracoes-gestao.perfis-acesso.editar',
  'configuracoes-gestao.perfis-acesso.excluir',
] as const;
const INEXISTENTE = '00000000-0000-4000-8000-000000000000';

describe('Perfis de Acesso (e2e)', () => {
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

  function criarNoBanco(
    nome: string,
    extra: { deletedAt?: Date; ativo?: boolean; paginas?: string[] } = {},
  ) {
    const { paginas = ['painel.painel'], ...dados } = extra;
    return prisma.perfil.create({
      data: {
        nome,
        ...dados,
        permissoes: { create: paginas.map((pagina) => ({ permissao: `${pagina}.ver` })) },
      },
      include: { permissoes: true },
    });
  }

  describe('GET', () => {
    it('lista paginada, por nome, sem excluídos; busca e status', async () => {
      await criarNoBanco('Recepção');
      await criarNoBanco('Administrador');
      await criarNoBanco('Inativo', { ativo: false });
      await criarNoBanco('Excluído', { deletedAt: new Date() });

      const todos = await http().get(BASE).expect(200);
      const page = perfilPageSchema.parse(todos.body);
      // `criarUsuarioTeste` grava o próprio perfil do usuário de teste (`Perfil <uuid>`).
      const nomes = page.data.map((p) => p.nome).filter((nome) => !nome.startsWith('Perfil '));
      expect(nomes).toEqual(['Administrador', 'Inativo', 'Recepção']);
      const recepcao = page.data.find((p) => p.nome === 'Recepção');
      expect(recepcao?.paginasPermitidas).toEqual(['painel.painel']);

      const busca = await http().get(BASE).query({ search: 'recep' }).expect(200);
      expect(busca.body.data.map((p: { nome: string }) => p.nome)).toEqual(['Recepção']);
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
      const perfil = await criarNoBanco('Recepção');

      const ok = await http().get(`${BASE}/${perfil.id}`).expect(200);
      expect(perfilSchema.parse(ok.body)).toMatchObject({
        nome: 'Recepção',
        paginasPermitidas: ['painel.painel'],
      });
      const nao = await http().get(`${BASE}/${INEXISTENTE}`).expect(404);
      expect(nao.body.message).toBe('Perfil não encontrado');
      await http().get(`${BASE}/abc`).expect(400);
    });
  });

  describe('POST', () => {
    it('201 grava uma permissão .ver por página e audita CREATE', async () => {
      const res = await http()
        .post(BASE)
        .send({
          nome: '  Recepção  ',
          descricao: 'Acesso para recepcionistas',
          paginasPermitidas: ['painel.painel', 'comercial-atendimento.agenda'],
        })
        .expect(201);

      expect(perfilSchema.parse(res.body)).toMatchObject({
        nome: 'Recepção',
        descricao: 'Acesso para recepcionistas',
        ativo: true,
      });
      expect(res.body.paginasPermitidas.sort()).toEqual(
        ['comercial-atendimento.agenda', 'painel.painel'].sort(),
      );
      const permissoes = await prisma.perfilPermissao.findMany({
        where: { perfilId: res.body.id },
      });
      expect(permissoes.map((p) => p.permissao).sort()).toEqual([
        'comercial-atendimento.agenda.ver',
        'painel.painel.ver',
      ]);
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: 'Perfil',
        entityId: res.body.id,
        before: null,
        after: { id: res.body.id, nome: 'Recepção' },
        userId: usuario.id,
      });
    });

    it('escopo de dados: padrão TODOS; restrito aos vinculados é gravado e auditado (issue #153)', async () => {
      const padrao = await http()
        .post(BASE)
        .send({ nome: 'Recepção', paginasPermitidas: ['painel.painel'] })
        .expect(201);
      expect(perfilSchema.parse(padrao.body).escopoDados).toBe('TODOS');

      const res = await http()
        .post(BASE)
        .send({
          nome: 'Médico',
          paginasPermitidas: ['comercial-atendimento.agenda'],
          escopoDados: 'PROFISSIONAIS_VINCULADOS',
        })
        .expect(201);
      expect(perfilSchema.parse(res.body).escopoDados).toBe('PROFISSIONAIS_VINCULADOS');
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: 'Perfil',
        entityId: res.body.id,
        after: { escopoDados: 'PROFISSIONAIS_VINCULADOS' },
        userId: usuario.id,
      });

      await http()
        .patch(`${BASE}/${res.body.id}`)
        .send({ nome: 'Médico', paginasPermitidas: ['comercial-atendimento.agenda'] })
        .expect(200);
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: 'Perfil',
        entityId: res.body.id,
        before: { escopoDados: 'PROFISSIONAIS_VINCULADOS' },
        after: { escopoDados: 'TODOS' },
        userId: usuario.id,
      });

      await http()
        .post(BASE)
        .send({ nome: 'X', paginasPermitidas: ['painel.painel'], escopoDados: 'OUTRO' })
        .expect(400);
    });

    it('400 "Nome é obrigatório." e página inválida, sem auditar', async () => {
      const res = await http()
        .post(BASE)
        .send({ nome: '', paginasPermitidas: ['pagina-que-nao-existe'], extra: 1 })
        .expect(400);

      expect(res.body.details).toEqual(
        expect.arrayContaining([
          { field: 'nome', message: 'Nome é obrigatório.' },
          { field: 'paginasPermitidas.0', message: 'Página inválida' },
          { field: 'extra', message: 'Campo não permitido' },
        ]),
      );
      await expectNoAudit(prisma, { entity: 'Perfil' });
    });

    it('400 sem nenhuma página selecionada', async () => {
      const res = await http()
        .post(BASE)
        .send({ nome: 'Recepção', paginasPermitidas: [] })
        .expect(400);

      expect(res.body.details).toEqual(
        expect.arrayContaining([
          { field: 'paginasPermitidas', message: 'Selecione ao menos uma página.' },
        ]),
      );
    });

    it('403 sem permissão de criar', async () => {
      const leitor = await criarUsuarioTeste(app, {
        permissoes: ['configuracoes-gestao.perfis-acesso.ver'],
      });
      await comUsuario(app, leitor)
        .post(BASE)
        .send({ nome: 'X', paginasPermitidas: ['painel.painel'] })
        .expect(403);
    });
  });

  describe('PATCH /:id', () => {
    it('200, substitui as páginas e audita UPDATE com before/after', async () => {
      const perfil = await criarNoBanco('Recepção');

      const res = await http()
        .patch(`${BASE}/${perfil.id}`)
        .send({
          nome: 'Recepção Geral',
          descricao: null,
          paginasPermitidas: ['comercial-atendimento.agenda'],
        })
        .expect(200);

      expect(res.body).toMatchObject({
        nome: 'Recepção Geral',
        paginasPermitidas: ['comercial-atendimento.agenda'],
      });
      const permissoes = await prisma.perfilPermissao.findMany({
        where: { perfilId: perfil.id },
      });
      expect(permissoes.map((p) => p.permissao)).toEqual(['comercial-atendimento.agenda.ver']);
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: 'Perfil',
        entityId: perfil.id,
        before: { nome: 'Recepção' },
        after: { nome: 'Recepção Geral' },
        userId: usuario.id,
      });
    });

    it('400 sem páginas e 404 para inexistente', async () => {
      const perfil = await criarNoBanco('Recepção');
      await http()
        .patch(`${BASE}/${perfil.id}`)
        .send({ nome: 'Recepção', paginasPermitidas: [] })
        .expect(400);
      await http()
        .patch(`${BASE}/${INEXISTENTE}`)
        .send({ nome: 'X', paginasPermitidas: ['painel.painel'] })
        .expect(404);
      await expectNoAudit(prisma, { entity: 'Perfil' });
    });
  });

  describe('DELETE /:id', () => {
    it('exclusão lógica: 200, audita DELETE e some da listagem', async () => {
      const perfil = await criarNoBanco('Recepção');

      await http().delete(`${BASE}/${perfil.id}`).expect(200);

      await expectAudit(prisma, {
        action: 'DELETE',
        entity: 'Perfil',
        entityId: perfil.id,
        before: { nome: 'Recepção', deletedAt: null },
        after: null,
        userId: usuario.id,
      });
      expect(
        (await prisma.perfil.findUniqueOrThrow({ where: { id: perfil.id } })).deletedAt,
      ).not.toBeNull();
      const busca = await http().get(BASE).query({ search: 'Recepção' }).expect(200);
      expect(busca.body.meta.total).toBe(0);
    });

    it('404 para inexistente ou já excluído, sem auditar', async () => {
      const excluido = await criarNoBanco('X', { deletedAt: new Date() });
      await http().delete(`${BASE}/${excluido.id}`).expect(404);
      await http().delete(`${BASE}/${INEXISTENTE}`).expect(404);
      await expectNoAudit(prisma, { entity: 'Perfil' });
    });
  });
});
