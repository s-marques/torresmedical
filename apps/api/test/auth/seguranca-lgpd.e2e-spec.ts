import type { INestApplication } from '@nestjs/common';
import { politicaSegurancaSchema, POLITICA_PADRAO } from '@torres/shared';
import request from 'supertest';
import { AcessoProfissionalAgendador } from '../../src/modules/gestao-profissionais/profissionais/acesso-profissional.agendador';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { comUsuario, criarUsuarioTeste, SENHA_TESTE, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit } from '../utils/expect-audit';
import { criarMotivo } from '../utils/motivos-cancelamento';

const AUTH = '/api/auth';
const POLITICA = '/api/configuracoes-gestao/politica-seguranca';
const USUARIOS = '/api/configuracoes-gestao/usuarios';
const SENHA_NOVA = 'NovaSenha#2026ok';

describe('LGPD e segurança (e2e, issue #156)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: UsuarioTeste;
  /** IP próprio por teste: o rate limit do login é por IP. */
  let ip: string;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    admin = await criarUsuarioTeste(app, {
      permissoes: [
        'configuracoes-gestao.minha-empresa.ver',
        'configuracoes-gestao.minha-empresa.editar',
        'configuracoes-gestao.usuarios.ver',
        'configuracoes-gestao.usuarios.criar',
        'configuracoes-gestao.usuarios.editar',
      ],
    });
    ip = `10.1.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
  });

  afterAll(async () => {
    await app.close();
  });

  const login = (email: string, senha: string) =>
    request(app.getHttpServer())
      .post(`${AUTH}/login`)
      .set('X-Forwarded-For', ip)
      .send({ email, senha });

  const salvarPolitica = (extra: Record<string, unknown> = {}) =>
    comUsuario(app, admin)
      .put(POLITICA)
      .send({ ...POLITICA_PADRAO, ...extra });

  describe('política de segurança', () => {
    it('sem registro devolve os valores padrão', async () => {
      const res = await comUsuario(app, admin).get(POLITICA).expect(200);

      expect(politicaSegurancaSchema.parse(res.body)).toMatchObject({
        ...POLITICA_PADRAO,
        updatedAt: null,
      });
    });

    it('salva e audita antes e depois (UPDATE)', async () => {
      const res = await salvarPolitica({ tamanhoMinimo: 12, exigirSimbolo: true }).expect(200);

      expect(res.body).toMatchObject({ tamanhoMinimo: 12, exigirSimbolo: true });
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: 'PoliticaSeguranca',
        entityId: admin.empresaId,
        before: { tamanhoMinimo: 8, exigirSimbolo: false },
        after: { tamanhoMinimo: 12, exigirSimbolo: true },
        userId: admin.id,
      });
    });

    it('400 com valores fora dos limites', async () => {
      await salvarPolitica({ tamanhoMinimo: 4 }).expect(400);
      await salvarPolitica({ tentativasBloqueio: 1 }).expect(400);
      await salvarPolitica({ expiracaoDias: 5 }).expect(400);
    });

    it('403 sem permissão', async () => {
      const sem = await criarUsuarioTeste(app, { permissoes: [] });

      await comUsuario(app, sem).get(POLITICA).expect(403);
      await comUsuario(app, sem).put(POLITICA).send(POLITICA_PADRAO).expect(403);
    });
  });

  describe('senha fora da política', () => {
    const novoUsuario = (senha: string) =>
      comUsuario(app, admin)
        .post(USUARIOS)
        .send({ nome: 'Pessoa Teste', email: `novo.${Date.now()}@example.com`, senha });

    it('recusa com mensagem clara por regra não cumprida', async () => {
      await salvarPolitica({
        tamanhoMinimo: 12,
        exigirMaiuscula: true,
        exigirSimbolo: true,
      }).expect(200);

      const res = await novoUsuario('abcdefgh1').expect(400);

      expect(res.body.code).toBe('SENHA_FORA_DA_POLITICA');
      const mensagens = (res.body.details as { field: string; message: string }[]).map(
        (d) => d.message,
      );
      expect(mensagens).toEqual(
        expect.arrayContaining([
          'A senha deve ter no mínimo 12 caracteres',
          'A senha deve ter ao menos uma letra maiúscula',
          expect.stringContaining('ao menos um símbolo'),
        ]),
      );
      expect(await prisma.usuario.count({ where: { nome: 'Pessoa Teste' } })).toBe(0);
    });

    it('aceita a senha que cumpre a política', async () => {
      await salvarPolitica({
        tamanhoMinimo: 12,
        exigirMaiuscula: true,
        exigirSimbolo: true,
      }).expect(200);

      await novoUsuario(SENHA_NOVA).expect(201);
    });
  });

  describe('bloqueio por tentativas e troca no primeiro acesso', () => {
    it('bloqueia a conta ao atingir o limite, mesmo com a senha certa, e audita', async () => {
      await salvarPolitica({ tentativasBloqueio: 3, minutosBloqueio: 10 }).expect(200);
      const alvo = await criarUsuarioTeste(app, { permissoes: [], empresaId: admin.empresaId });

      for (let i = 0; i < 3; i++) await login(alvo.email, 'errada-123').expect(401);

      const bloqueado = await prisma.usuario.findUniqueOrThrow({ where: { id: alvo.id } });
      expect(bloqueado.bloqueadoAte).not.toBeNull();
      expect(bloqueado.tentativasFalhas).toBe(0);
      // A resposta é a mesma de senha errada: não revela que a conta existe.
      const res = await login(alvo.email, SENHA_TESTE).expect(401);
      expect(res.body.code).toBe('CREDENCIAIS_INVALIDAS');
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: 'Usuario',
        entityId: alvo.id,
        after: { motivo: 'TENTATIVAS_DE_LOGIN' },
        userId: alvo.id,
      });
    });

    it('depois do bloqueio expirar, a senha certa entra e zera o contador', async () => {
      const alvo = await criarUsuarioTeste(app, { permissoes: [], empresaId: admin.empresaId });
      await prisma.usuario.update({
        where: { id: alvo.id },
        data: { bloqueadoAte: new Date(Date.now() - 1000), tentativasFalhas: 2 },
      });

      await login(alvo.email, SENHA_TESTE).expect(200);

      const depois = await prisma.usuario.findUniqueOrThrow({ where: { id: alvo.id } });
      expect(depois.tentativasFalhas).toBe(0);
      expect(depois.bloqueadoAte).toBeNull();
    });

    it('senha provisória: só libera a troca de senha até trocá-la', async () => {
      await comUsuario(app, admin)
        .post(USUARIOS)
        .send({ nome: 'Pessoa Nova', email: 'nova.pessoa@example.com', senha: 'Provisoria1' })
        .expect(201);
      const entrada = await login('nova.pessoa@example.com', 'Provisoria1').expect(200);
      expect(entrada.body.usuario.trocarSenha).toBe(true);
      const auth = `Bearer ${entrada.body.accessToken as string}`;
      const http = () => request(app.getHttpServer());

      await http().get('/api/configuracoes-gestao/usuarios').set('Authorization', auth).expect(403);
      await http().get(`${AUTH}/me`).set('Authorization', auth).expect(200);
      const bloqueio = await http()
        .get('/api/configuracoes-gestao/politica-seguranca')
        .set('Authorization', auth)
        .expect(403);
      expect(bloqueio.body.code).toBe('TROCA_SENHA_OBRIGATORIA');

      await http()
        .post(`${AUTH}/trocar-senha`)
        .set('Authorization', auth)
        .send({ senhaAtual: 'errada-123', senhaNova: SENHA_NOVA })
        .expect(400);
      await http()
        .post(`${AUTH}/trocar-senha`)
        .set('Authorization', auth)
        .send({ senhaAtual: 'Provisoria1', senhaNova: 'Provisoria1' })
        .expect(400);
      await http()
        .post(`${AUTH}/trocar-senha`)
        .set('Authorization', auth)
        .send({ senhaAtual: 'Provisoria1', senhaNova: SENHA_NOVA })
        .expect(204);

      const me = await http().get(`${AUTH}/me`).set('Authorization', auth).expect(200);
      expect(me.body.trocarSenha).toBe(false);
      await login('nova.pessoa@example.com', SENHA_NOVA).expect(200);
      const usuario = await prisma.usuario.findFirstOrThrow({
        where: { email: 'nova.pessoa@example.com' },
      });
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: 'Usuario',
        entityId: usuario.id,
        userId: usuario.id,
      });
    });

    it('trocar a senha respeita a política e derruba as outras sessões', async () => {
      await salvarPolitica({ exigirMaiuscula: true }).expect(200);
      const alvo = await criarUsuarioTeste(app, { permissoes: [], empresaId: admin.empresaId });
      const outra = await login(alvo.email, SENHA_TESTE).expect(200);

      const recusada = await comUsuario(app, alvo)
        .post(`${AUTH}/trocar-senha`)
        .send({ senhaAtual: SENHA_TESTE, senhaNova: 'tudominusculo1' })
        .expect(400);
      expect(recusada.body.code).toBe('SENHA_FORA_DA_POLITICA');

      await comUsuario(app, alvo)
        .post(`${AUTH}/trocar-senha`)
        .send({ senhaAtual: SENHA_TESTE, senhaNova: SENHA_NOVA })
        .expect(204);

      await comUsuario(app, alvo).get(`${AUTH}/me`).expect(200);
      await request(app.getHttpServer())
        .get(`${AUTH}/me`)
        .set('Authorization', `Bearer ${outra.body.accessToken as string}`)
        .expect(401);
    });

    it('expiração ligada: senha antiga exige a troca no login', async () => {
      await salvarPolitica({ expiracaoDias: 30 }).expect(200);
      const alvo = await criarUsuarioTeste(app, { permissoes: [], empresaId: admin.empresaId });
      await prisma.usuario.update({
        where: { id: alvo.id },
        data: { senhaAlteradaEm: new Date(Date.now() - 31 * 86_400_000) },
      });

      const res = await login(alvo.email, SENHA_TESTE).expect(200);

      expect(res.body.usuario.trocarSenha).toBe(true);
    });

    it('administrador que redefine a senha desbloqueia a conta e derruba as sessões', async () => {
      const alvo = await criarUsuarioTeste(app, { permissoes: [], empresaId: admin.empresaId });
      await prisma.usuario.update({
        where: { id: alvo.id },
        data: { bloqueadoAte: new Date(Date.now() + 600_000) },
      });

      await comUsuario(app, admin)
        .patch(`${USUARIOS}/${alvo.id}/resetar-senha`)
        .send({ senha: SENHA_NOVA })
        .expect(200);

      const depois = await prisma.usuario.findUniqueOrThrow({ where: { id: alvo.id } });
      expect(depois.bloqueadoAte).toBeNull();
      expect(depois.trocarSenhaNoAcesso).toBe(true);
      await comUsuario(app, alvo).get(`${AUTH}/me`).expect(401);
    });
  });

  describe('controle de exportação de dados pessoais', () => {
    const PERMISSOES_PACIENTES = [
      'comercial-atendimento.pacientes.ver',
      'comercial-atendimento.pacientes.exportar',
    ] as const;

    it('403 sem a permissão específica, mesmo com pacientes.exportar', async () => {
      const sem = await criarUsuarioTeste(app, { permissoes: PERMISSOES_PACIENTES });

      await comUsuario(app, sem)
        .get('/api/comercial-atendimento/pacientes/export')
        .query({ format: 'xlsx', columns: 'nome' })
        .expect(403);
      expect(await prisma.auditLog.count({ where: { action: 'EXPORT' } })).toBe(0);
    });

    it('200 com a permissão e grava EXPORT, que aparece no relatório de exportações', async () => {
      const com = await criarUsuarioTeste(app, {
        permissoes: [
          ...PERMISSOES_PACIENTES,
          'configuracoes-gestao.dados-pessoais.exportar',
          'configuracoes-gestao.auditoria.ver',
        ],
      });

      await comUsuario(app, com)
        .get('/api/comercial-atendimento/pacientes/export')
        .query({ format: 'xlsx', columns: 'nome' })
        .expect(200);

      const registro = await prisma.auditLog.findFirstOrThrow({ where: { action: 'EXPORT' } });
      expect(registro.userId).toBe(com.id);
      const relatorio = await comUsuario(app, com)
        .get('/api/auditoria')
        .query({ grupo: 'exportacoes' })
        .expect(200);
      expect(relatorio.body.data).toHaveLength(1);
      expect(relatorio.body.data[0]).toMatchObject({ action: 'EXPORT', userId: com.id });
    });
  });

  describe('encerramento de acesso do profissional', () => {
    async function cenario() {
      const sala = await prisma.sala.create({ data: { nome: 'Sala 1', numero: '01' } });
      const profissional = await prisma.profissional.create({ data: { nome: 'Dr. Teste' } });
      const usuario = await criarUsuarioTeste(app, {
        permissoes: [],
        profissionalIds: [profissional.id],
      });
      const contrato = (extra: Record<string, unknown> = {}) =>
        prisma.contratoSala.create({
          data: {
            salaId: sala.id,
            modalidade: 'MENSAL',
            locatarioTipo: 'PROFISSIONAL',
            profissionalId: profissional.id,
            dataInicio: new Date('2026-01-01'),
            ...extra,
          },
        });
      return { sala, profissional, usuario, contrato };
    }

    const operador = () =>
      criarUsuarioTeste(app, {
        permissoes: ['gestao-profissionais.salas.ver', 'gestao-profissionais.salas.editar'],
      });

    it('encerrar o último contrato desativa o usuário, derruba a sessão e audita', async () => {
      const { usuario, contrato } = await cenario();
      const c = await contrato();
      const op = await operador();
      await comUsuario(app, usuario).get(`${AUTH}/me`).expect(200);

      await comUsuario(app, op)
        .post(`/api/gestao-profissionais/contratos-sala/${c.id}/encerrar`)
        .send({ data: '2026-11-01' })
        .expect(200);

      const depois = await prisma.usuario.findUniqueOrThrow({ where: { id: usuario.id } });
      expect(depois.ativo).toBe(false);
      expect(
        await prisma.sessao.count({ where: { usuarioId: usuario.id, revogadaEm: null } }),
      ).toBe(0);
      await comUsuario(app, usuario).get(`${AUTH}/me`).expect(401);
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: 'Usuario',
        entityId: usuario.id,
        before: { ativo: true },
        after: { ativo: false, motivo: 'PROFISSIONAL_SEM_CONTRATO' },
      });
    });

    it('com outro contrato ativo, o usuário continua com acesso', async () => {
      const { usuario, contrato } = await cenario();
      const c = await contrato();
      await contrato();
      const op = await operador();

      await comUsuario(app, op)
        .post(`/api/gestao-profissionais/contratos-sala/${c.id}/encerrar`)
        .send({ data: '2026-11-01' })
        .expect(200);

      await comUsuario(app, usuario).get(`${AUTH}/me`).expect(200);
    });

    it('usuário ligado a dois profissionais só perde o acesso quando os dois ficam sem contrato', async () => {
      const { sala, profissional, usuario, contrato } = await cenario();
      const outro = await prisma.profissional.create({ data: { nome: 'Dra. Outra' } });
      await prisma.usuarioProfissional.create({
        data: { usuarioId: usuario.id, profissionalId: outro.id },
      });
      await prisma.contratoSala.create({
        data: {
          salaId: sala.id,
          modalidade: 'MENSAL',
          locatarioTipo: 'PROFISSIONAL',
          profissionalId: outro.id,
          dataInicio: new Date('2026-01-01'),
        },
      });
      const c = await contrato();
      const op = await operador();
      const motivo = await criarMotivo(prisma, 'CONTRATO', { nome: 'Valor' });

      await comUsuario(app, op)
        .post(`/api/gestao-profissionais/contratos-sala/${c.id}/cancelar`)
        .send({ data: '2026-11-01', motivoId: motivo.id })
        .expect(200);

      expect(profissional.id).toBeDefined();
      await comUsuario(app, usuario).get(`${AUTH}/me`).expect(200);
    });

    it('carência: o acesso só acaba depois dos dias configurados (rotina diária)', async () => {
      const { usuario, contrato } = await cenario();
      await salvarPolitica({ carenciaProfissionalDias: 10 }).expect(200);
      const c = await contrato();
      const op = await operador();
      const hoje = new Date().toISOString().slice(0, 10);

      await comUsuario(app, op)
        .post(`/api/gestao-profissionais/contratos-sala/${c.id}/encerrar`)
        .send({ data: hoje })
        .expect(200);
      await comUsuario(app, usuario).get(`${AUTH}/me`).expect(200);

      const agendador = app.get(AcessoProfissionalAgendador);
      expect(await agendador.rodar(new Date(Date.now() + 5 * 86_400_000))).toBe(0);
      expect(await agendador.rodar(new Date(Date.now() + 12 * 86_400_000))).toBe(1);
      await comUsuario(app, usuario).get(`${AUTH}/me`).expect(401);
    });

    it('contrato ativo vencido (dataFim) também perde o acesso na rotina diária', async () => {
      const { usuario, contrato } = await cenario();
      await contrato({ dataFim: new Date('2026-02-01') });

      expect(await app.get(AcessoProfissionalAgendador).rodar(new Date())).toBe(1);

      await comUsuario(app, usuario).get(`${AUTH}/me`).expect(401);
    });

    it('profissional inativado perde o acesso do usuário vinculado', async () => {
      const { profissional, usuario } = await cenario();
      const op = await criarUsuarioTeste(app, {
        permissoes: [
          'gestao-profissionais.profissionais.ver',
          'gestao-profissionais.profissionais.editar',
        ],
      });

      await comUsuario(app, op)
        .patch(`/api/gestao-profissionais/profissionais/${profissional.id}/status`)
        .send({ ativo: false })
        .expect(200);

      await comUsuario(app, usuario).get(`${AUTH}/me`).expect(401);
    });

    it('profissional que nunca teve contrato não é governado pela regra', async () => {
      const { usuario } = await cenario();

      expect(await app.get(AcessoProfissionalAgendador).rodar(new Date())).toBe(0);

      await comUsuario(app, usuario).get(`${AUTH}/me`).expect(200);
    });
  });
});
