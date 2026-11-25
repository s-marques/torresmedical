import { fakerPT_BR as faker } from '@faker-js/faker';
import type { INestApplication } from '@nestjs/common';
import { auditLogPageSchema, type Permissao } from '@torres/shared';
import request from 'supertest';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import type { AuditAction } from '../../src/generated/prisma/client';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit, expectNoAudit } from '../utils/expect-audit';

const BASE = '/api/auditoria';
const VER: Permissao = 'configuracoes-gestao.auditoria.ver';
const EXPORTAR: Permissao = 'configuracoes-gestao.auditoria.exportar';
const PRONTUARIO: Permissao = 'consultorio-assistencial.prontuarios.ver';
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

describe('Auditoria: consulta da trilha (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let auditor: UsuarioTeste;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    auditor = await criarUsuarioTeste(app, { permissoes: [VER, EXPORTAR, PRONTUARIO] });
    // Os registros do próprio setup não interessam: começa com a trilha vazia.
    await prisma.$executeRawUnsafe('TRUNCATE TABLE audit_log');
  });

  afterAll(async () => {
    await app.close();
  });

  const http = (usuario: UsuarioTeste = auditor) => comUsuario(app, usuario);

  function registrar(dados: {
    entity: string;
    action?: AuditAction;
    entityId?: string;
    userId?: string;
    before?: object | null;
    after?: object | null;
    occurredAt?: Date;
  }) {
    return prisma.auditLog.create({
      data: {
        userId: dados.userId ?? auditor.id,
        action: dados.action ?? 'UPDATE',
        entity: dados.entity,
        entityId: dados.entityId ?? faker.string.uuid(),
        before: dados.before ?? undefined,
        after: dados.after ?? undefined,
        occurredAt: dados.occurredAt,
      },
    });
  }

  async function listar(query: Record<string, string> = {}) {
    const res = await http().get(BASE).query(query).expect(200);
    return auditLogPageSchema.parse(res.body);
  }

  describe('GET /api/auditoria', () => {
    it('mostra quem, quando, o quê e o diff campo a campo da alteração de contrato', async () => {
      const contratoId = faker.string.uuid();
      await registrar({
        entity: 'ContratoSala',
        entityId: contratoId,
        before: { valorUnitario: '100', diaVencimento: 10, status: 'ATIVO', updatedAt: 'a' },
        after: { valorUnitario: '150', diaVencimento: 15, status: 'ATIVO', updatedAt: 'b' },
      });

      const { data, meta } = await listar({ entity: 'ContratoSala', entityId: contratoId });

      expect(meta.total).toBe(1);
      expect([...(data[0]?.campos ?? [])].sort()).toEqual(['diaVencimento', 'valorUnitario']);
      expect(data[0]).toMatchObject({
        userId: auditor.id,
        userNome: expect.any(String),
        action: 'UPDATE',
        restrito: false,
        before: { valorUnitario: '100', diaVencimento: 10 },
        after: { valorUnitario: '150', diaVencimento: 15 },
      });
    });

    it('pagina e ordena por data, mais recentes primeiro (e pelo sort pedido)', async () => {
      await registrar({ entity: 'Sala', occurredAt: new Date('2026-10-01T12:00:00Z') });
      await registrar({ entity: 'Agendamento', occurredAt: new Date('2026-10-03T12:00:00Z') });
      await registrar({ entity: 'ContaReceber', occurredAt: new Date('2026-10-02T12:00:00Z') });

      const pagina1 = await listar({ pageSize: '2' });
      const pagina2 = await listar({ pageSize: '2', page: '2' });
      const porEntidade = await listar({ sort: 'entity:asc' });

      expect(pagina1.meta).toEqual({ page: 1, pageSize: 2, total: 3, totalPages: 2 });
      expect(pagina1.data.map((i) => i.entity)).toEqual(['Agendamento', 'ContaReceber']);
      expect(pagina2.data.map((i) => i.entity)).toEqual(['Sala']);
      expect(porEntidade.data.map((i) => i.entity)).toEqual([
        'Agendamento',
        'ContaReceber',
        'Sala',
      ]);
    });

    it('filtra por usuário, entidade, ação, id do registro e período (dia inteiro)', async () => {
      const outro = await criarUsuarioTeste(app, { permissoes: [VER] });
      await prisma.$executeRawUnsafe('TRUNCATE TABLE audit_log');
      const alvo = await registrar({
        entity: 'ContaReceber',
        action: 'DELETE',
        userId: outro.id,
        occurredAt: new Date('2026-10-14T15:00:00Z'),
      });
      await registrar({ entity: 'ContaReceber', occurredAt: new Date('2026-10-14T15:00:00Z') });
      await registrar({ entity: 'Sala', action: 'DELETE', userId: outro.id });
      await registrar({
        entity: 'ContaReceber',
        action: 'DELETE',
        userId: outro.id,
        occurredAt: new Date('2026-09-01T15:00:00Z'),
      });

      const todos = await listar({
        userId: outro.id,
        entity: 'ContaReceber',
        action: 'DELETE',
        de: '2026-10-14',
        ate: '2026-10-14',
      });
      const porId = await listar({ entityId: alvo.entityId });
      const busca = await listar({ search: alvo.entityId.slice(0, 8) });

      expect(todos.data.map((i) => i.id)).toEqual([alvo.id]);
      expect(porId.data.map((i) => i.id)).toEqual([alvo.id]);
      expect(busca.data.map((i) => i.id)).toEqual([alvo.id]);
    });

    it('o dia inteiro respeita o fuso da clínica (23h de Brasília ainda é o mesmo dia)', async () => {
      await registrar({ entity: 'Sala', occurredAt: new Date('2026-10-15T01:30:00Z') });

      expect((await listar({ de: '2026-10-14', ate: '2026-10-14' })).meta.total).toBe(1);
      expect((await listar({ de: '2026-10-15', ate: '2026-10-15' })).meta.total).toBe(0);
    });

    describe('atalhos de eventos', () => {
      beforeEach(async () => {
        await registrar({ entity: 'ContaReceber', action: 'DELETE' });
        await registrar({ entity: 'Agendamento', before: { status: 'AGENDADO' } });
        await registrar({
          entity: 'Agendamento',
          before: { status: 'AGENDADO' },
          after: { status: 'CANCELADO' },
        });
        await registrar({ entity: 'ContratoSala', after: { status: 'CANCELADO' } });
        await registrar({ entity: 'Venda', after: { desconto: '10' } });
        await registrar({ entity: 'Sala' });
        await registrar({ entity: 'SalaBloqueio' });
        await registrar({ entity: 'Atendimento' });
      });

      const entidades = async (grupo: string) =>
        (await listar({ grupo })).data.map((i) => i.entity).sort();

      it.each([
        ['exclusoes', ['ContaReceber']],
        ['cancelamentos', ['Agendamento', 'ContratoSala']],
        ['descontos', ['Venda']],
        ['financeiro', ['ContaReceber', 'Venda']],
        ['agenda', ['Agendamento', 'Agendamento']],
        ['sala', ['Sala', 'SalaBloqueio']],
        ['contrato', ['ContratoSala']],
        ['prontuario', ['Atendimento']],
      ])('%s', async (grupo, esperado) => {
        expect(await entidades(grupo)).toEqual(esperado);
      });

      it('combina o atalho com os outros filtros', async () => {
        const { data } = await listar({ grupo: 'financeiro', action: 'DELETE' });

        expect(data.map((i) => i.entity)).toEqual(['ContaReceber']);
      });
    });

    describe('conteúdo clínico', () => {
      const atendimento = {
        before: { queixa: 'dor de cabeça' },
        after: { queixa: 'dor de cabeça forte', conduta: 'repouso' },
      };

      it('sem a permissão de prontuário omite antes/depois e mostra só os campos', async () => {
        await registrar({ entity: 'Atendimento', ...atendimento });
        await registrar({ entity: 'Sala', after: { nome: 'Sala 1' }, action: 'CREATE' });
        const semProntuario = await criarUsuarioTeste(app, { permissoes: [VER] });

        const res = await http(semProntuario).get(BASE).expect(200);
        const { data } = auditLogPageSchema.parse(res.body);

        const clinico = data.find((i) => i.entity === 'Atendimento');
        expect(clinico).toMatchObject({
          restrito: true,
          before: null,
          after: null,
          campos: ['queixa', 'conduta'],
        });
        expect(data.find((i) => i.entity === 'Sala')).toMatchObject({
          restrito: false,
          after: { nome: 'Sala 1' },
        });
        expect(JSON.stringify(res.body)).not.toContain('dor de cabeça');
      });

      it('com a permissão de prontuário devolve o conteúdo', async () => {
        await registrar({ entity: 'Atendimento', ...atendimento });

        const { data } = await listar();

        expect(data[0]).toMatchObject({ restrito: false, after: atendimento.after });
      });
    });

    it('sem token responde 401 e sem a permissão responde 403', async () => {
      await request(app.getHttpServer()).get(BASE).expect(401);
      const semPermissao = await criarUsuarioTeste(app, { permissoes: ['financeiro.caixas.ver'] });

      const res = await http(semPermissao).get(BASE).expect(403);

      expect(res.body).toMatchObject({
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'Sem permissão',
      });
    });

    it('filtro inválido responde 400 com details por campo', async () => {
      const res = await http()
        .get(BASE)
        .query({ grupo: 'tudo', sort: 'userId:asc', de: 'ontem' })
        .expect(400);

      expect(res.body).toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' });
      const campos = (res.body.details as { field: string }[]).map((d) => d.field).sort();
      expect(campos).toEqual(['de', 'grupo', 'sort']);
    });

    it('período invertido responde 400 no campo ate', async () => {
      const res = await http().get(BASE).query({ de: '2026-10-05', ate: '2026-10-01' }).expect(400);

      expect(res.body.details).toEqual([expect.objectContaining({ field: 'ate' })]);
    });

    it('a própria consulta não grava auditoria', async () => {
      await listar();

      expect(await prisma.auditLog.count()).toBe(0);
    });
  });

  describe('GET /api/auditoria/entidades', () => {
    it('lista as entidades com registro, sem repetir, em ordem', async () => {
      await registrar({ entity: 'Sala' });
      await registrar({ entity: 'Agendamento' });
      await registrar({ entity: 'Sala' });

      const res = await http().get(`${BASE}/entidades`).expect(200);

      expect(res.body).toEqual({ data: ['Agendamento', 'Sala'] });
    });

    it('sem a permissão responde 403', async () => {
      const semPermissao = await criarUsuarioTeste(app, { permissoes: ['financeiro.caixas.ver'] });

      await http(semPermissao).get(`${BASE}/entidades`).expect(403);
    });
  });

  describe('GET /api/auditoria/export', () => {
    it('exporta em Excel com os filtros e registra a exportação no audit_log', async () => {
      await registrar({ entity: 'ContaReceber', action: 'DELETE' });
      await registrar({ entity: 'Sala' });

      const res = await http()
        .get(`${BASE}/export`)
        .query({ format: 'xlsx', grupo: 'exclusoes', columns: 'data,usuario,acao,campos' })
        .buffer(true)
        .parse((resposta, done) => {
          const partes: Buffer[] = [];
          resposta.on('data', (parte: Buffer) => partes.push(parte));
          resposta.on('end', () => done(null, Buffer.concat(partes)));
        })
        .expect(200);

      expect(res.headers['content-type']).toContain(XLSX);
      expect(res.headers['content-disposition']).toContain('auditoria-');
      await expectAudit(prisma, {
        action: 'EXPORT',
        entity: 'AuditLog',
        entityId: '*',
        before: null,
        after: { filtros: { format: 'xlsx', grupo: 'exclusoes' } },
        userId: auditor.id,
      });
    });

    it('exporta em PDF', async () => {
      await registrar({ entity: 'Sala' });

      const res = await http().get(`${BASE}/export`).query({ format: 'pdf' }).expect(200);

      expect(res.headers['content-type']).toContain('application/pdf');
    });

    it('sem a permissão de exportar responde 403 e não audita', async () => {
      const soVer = await criarUsuarioTeste(app, { permissoes: [VER] });

      await http(soVer).get(`${BASE}/export`).query({ format: 'xlsx' }).expect(403);

      await expectNoAudit(prisma, { entity: 'AuditLog', action: 'EXPORT' });
    });

    it('formato ou coluna inválidos respondem 400', async () => {
      await http().get(`${BASE}/export`).query({ format: 'docx' }).expect(400);
      await http().get(`${BASE}/export`).query({ format: 'xlsx', columns: 'antes' }).expect(400);
    });

    it('não vaza conteúdo clínico: a exportação só tem metadados', async () => {
      await registrar({ entity: 'Atendimento', after: { queixa: 'segredo clínico' } });
      const semProntuario = await criarUsuarioTeste(app, { permissoes: [VER, EXPORTAR] });

      const res = await http(semProntuario)
        .get(`${BASE}/export`)
        .query({ format: 'pdf', columns: 'entidade,campos' })
        .expect(200);

      expect(res.body.toString('latin1')).not.toContain('segredo');
    });
  });
});
