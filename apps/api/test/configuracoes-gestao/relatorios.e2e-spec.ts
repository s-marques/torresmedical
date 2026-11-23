import { fakerPT_BR as faker } from '@faker-js/faker';
import type { INestApplication } from '@nestjs/common';
import {
  apiErrorSchema,
  catalogoRelatoriosSchema,
  paginaRelatorioSchema,
  PERIODO_INVALIDO,
  type Permissao,
} from '@torres/shared';
import { Workbook } from 'exceljs';
import request from 'supertest';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { ENTIDADE_RELATORIO } from '../../src/common/relatorios/relatorios.controller';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit, expectNoAudit } from '../utils/expect-audit';

const BASE = '/api/configuracoes-gestao/relatorios';
const LOG = `${BASE}/GES-01`;
const TICKET = `${BASE}/GES-02`;
const OCUPACAO = `${BASE}/GES-03`;
const LTV = `${BASE}/GES-04`;
const TELA_VER = 'configuracoes-gestao.relatorios.ver';
const TELA_EXPORTAR = 'configuracoes-gestao.relatorios.exportar';
const DADOS: readonly Permissao[] = [
  'configuracoes-gestao.usuarios.ver',
  'comercial-atendimento.vendas-pdv.ver',
  'gestao-profissionais.salas.ver',
  'comercial-atendimento.pacientes.ver',
];
const TODAS: readonly Permissao[] = [TELA_VER, TELA_EXPORTAR, ...DADOS];
const OUTUBRO = { de: '2026-10-01', ate: '2026-10-31' };

/** Instante em São Paulo (UTC-3), como o usuário vê. */
function emSaoPaulo(dataHora: string): Date {
  return new Date(`${dataHora}-03:00`);
}

describe('Relatórios de Gestão GES-01 a GES-04 (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let empresaId: string;
  let usuario: UsuarioTeste;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    empresaId = (
      await prisma.empresa.create({
        data: { nome: faker.company.name(), documento: faker.string.numeric(14) },
      })
    ).id;
    usuario = await criarUsuarioTeste(app, { permissoes: TODAS, empresaId });
  });

  afterAll(async () => {
    await app.close();
  });

  function http(quem: UsuarioTeste = usuario) {
    return comUsuario(app, quem);
  }

  function binary(req: request.Test) {
    return req.buffer(true).parse((res, callback) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => callback(null, Buffer.concat(chunks)));
    });
  }

  async function lerXlsx(buffer: Buffer) {
    const workbook = new Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const linhas: unknown[][] = [];
    workbook.worksheets[0]?.eachRow((row) => linhas.push((row.values as unknown[]).slice(1)));
    return linhas;
  }

  describe('GET /relatorios (catálogo)', () => {
    it('lista GES-01 a GES-04 com colunas e sem filtros extras', async () => {
      const res = await http().get(BASE).expect(200);

      const { data } = catalogoRelatoriosSchema.parse(res.body);
      expect(data.map((r) => [r.id, r.nome])).toEqual([
        ['GES-01', 'Log de Acesso'],
        ['GES-02', 'Ticket Médio por Canal'],
        ['GES-03', 'Ocupação por Sala'],
        ['GES-04', 'LTV Paciente'],
      ]);
      expect(data[0]?.colunas.map((c) => c.titulo)).toEqual([
        'Data/hora do acesso',
        'Usuário',
        'IP',
        'Navegador',
      ]);
    });

    it('só mostra os relatórios cujos dados o usuário pode ver', async () => {
      const parcial = await criarUsuarioTeste(app, {
        permissoes: [TELA_VER, 'gestao-profissionais.salas.ver'],
        empresaId,
      });

      const res = await http(parcial).get(BASE).expect(200);

      expect(res.body.data.map((r: { id: string }) => r.id)).toEqual(['GES-03']);
    });
  });

  describe('GES-01 Log de Acesso', () => {
    beforeEach(async () => {
      const outro = await criarUsuarioTeste(app, { permissoes: [], empresaId });
      await prisma.usuario.update({ where: { id: outro.id }, data: { nome: 'Ana Teste' } });
      await prisma.usuario.update({ where: { id: usuario.id }, data: { nome: 'Zeca Teste' } });
      await prisma.sessao.createMany({
        data: [
          // Primeiro e último instantes de outubro no fuso da clínica entram; os vizinhos, não.
          {
            usuarioId: outro.id,
            tokenHash: 'a',
            expiraEm: new Date(),
            ip: '10.0.0.1',
            userAgent: 'Firefox',
            createdAt: emSaoPaulo('2026-10-01T00:00:00'),
          },
          {
            usuarioId: usuario.id,
            tokenHash: 'b',
            expiraEm: new Date(),
            ip: '10.0.0.2',
            userAgent: 'Chrome',
            createdAt: emSaoPaulo('2026-10-31T23:59:59'),
          },
          {
            usuarioId: outro.id,
            tokenHash: 'c',
            expiraEm: new Date(),
            createdAt: emSaoPaulo('2026-09-30T23:59:59'),
          },
          {
            usuarioId: outro.id,
            tokenHash: 'd',
            expiraEm: new Date(),
            createdAt: emSaoPaulo('2026-11-01T00:00:00'),
          },
        ],
      });
    });

    it('lista os acessos do período, do mais recente ao mais antigo', async () => {
      const res = await http().get(LOG).query(OUTUBRO).expect(200);

      const pagina = paginaRelatorioSchema.parse(res.body);
      expect(pagina.data).toEqual([
        {
          acessoEm: '2026-11-01T02:59:59.000Z',
          usuario: 'Zeca Teste',
          ip: '10.0.0.2',
          navegador: 'Chrome',
        },
        {
          acessoEm: '2026-10-01T03:00:00.000Z',
          usuario: 'Ana Teste',
          ip: '10.0.0.1',
          navegador: 'Firefox',
        },
      ]);
      expect(pagina.meta).toEqual({ page: 1, pageSize: 10, total: 2, totalPages: 1 });
    });

    it('ordena por usuário e pagina', async () => {
      const res = await http()
        .get(LOG)
        .query({ ...OUTUBRO, sort: 'usuario:asc', page: 2, pageSize: 1 })
        .expect(200);

      expect(res.body.data.map((l: { usuario: string }) => l.usuario)).toEqual(['Zeca Teste']);
      expect(res.body.meta).toEqual({ page: 2, pageSize: 1, total: 2, totalPages: 2 });
    });

    it('um dia só: De igual a Até', async () => {
      const res = await http().get(LOG).query({ de: '2026-10-01', ate: '2026-10-01' }).expect(200);

      expect(res.body.data.map((l: { usuario: string }) => l.usuario)).toEqual(['Ana Teste']);
    });
  });

  describe('GES-02 Ticket Médio por Canal', () => {
    it('agrupa as vendas finalizadas pela origem do cliente; sem cliente ou origem vira "Sem origem"', async () => {
      const [instagram, indicacao] = await Promise.all(
        ['Instagram', 'Indicação'].map((nome, ordem) =>
          prisma.origemCliente.create({ data: { nome, codigo: nome.toLowerCase(), ordem } }),
        ),
      );
      const [p1, p2, p3] = await Promise.all([
        prisma.paciente.create({ data: { nome: 'Paciente Um', origemClienteId: instagram?.id } }),
        prisma.paciente.create({ data: { nome: 'Paciente Dois', origemClienteId: instagram?.id } }),
        prisma.paciente.create({ data: { nome: 'Paciente Três', origemClienteId: indicacao?.id } }),
      ]);
      const venda = (pacienteId: string | null, total: number, extra = {}) => ({
        pacienteId,
        subtotal: total,
        total,
        createdAt: emSaoPaulo('2026-10-10T10:00:00'),
        ...extra,
      });
      await prisma.venda.createMany({
        data: [
          venda(p1.id, 100),
          venda(p2.id, 200),
          venda(p3.id, 500),
          venda(null, 50),
          venda(p1.id, 999, { status: 'CANCELADA' }),
          venda(p1.id, 999, { deletedAt: new Date() }),
          venda(p1.id, 999, { createdAt: emSaoPaulo('2026-09-30T23:59:59') }),
        ],
      });

      const res = await http().get(TICKET).query(OUTUBRO).expect(200);

      expect(res.body.data).toEqual([
        { origem: 'Indicação', vendas: 1, total: 500, ticketMedio: 500 },
        { origem: 'Instagram', vendas: 2, total: 300, ticketMedio: 150 },
        { origem: 'Sem origem', vendas: 1, total: 50, ticketMedio: 50 },
      ]);
    });
  });

  describe('GES-03 Ocupação por Sala', () => {
    it('conta os dias do período em que a sala teve contrato ativo ou reserva', async () => {
      const profissional = await prisma.profissional.create({ data: { nome: 'Dr. Teste' } });
      const [sala1, sala2, sala3] = await Promise.all(
        ['Sala 1', 'Sala 2', 'Sala 10'].map((nome) => prisma.sala.create({ data: { nome } })),
      );
      await prisma.contratoSala.create({
        data: {
          salaId: sala1!.id,
          modalidade: 'MENSAL',
          locatarioTipo: 'PROFISSIONAL',
          profissionalId: profissional.id,
          valorUnitario: 1000,
          dataInicio: new Date('2026-10-22T00:00:00Z'),
        },
      });
      await prisma.salaBloqueio.create({
        data: {
          salaId: sala2!.id,
          tipo: 'RESERVA',
          dataInicio: new Date('2026-10-05T00:00:00Z'),
          dataFim: new Date('2026-10-05T00:00:00Z'),
          horaInicio: '08:00',
          horaFim: '12:00',
        },
      });

      const res = await http().get(OCUPACAO).query(OUTUBRO).expect(200);

      expect(res.body.data).toEqual(
        [
          { sala: sala1!.nome, diasNoPeriodo: 31, diasOcupados: 10, taxaOcupacao: 32.3 },
          { sala: sala2!.nome, diasNoPeriodo: 31, diasOcupados: 1, taxaOcupacao: 3.2 },
          { sala: sala3!.nome, diasNoPeriodo: 31, diasOcupados: 0, taxaOcupacao: 0 },
        ].sort((a, b) => b.taxaOcupacao - a.taxaOcupacao),
      );
    });
  });

  describe('GES-04 LTV Paciente', () => {
    it('soma vendas finalizadas e consultas recebidas por paciente, dentro do período', async () => {
      const profissional = await prisma.profissional.create({ data: { nome: 'Dr. Teste' } });
      const forma = await prisma.formaPagamento.create({
        data: { nome: 'Pix', finalidade: 'RECEBER', tipo: 'PIX' },
      });
      const [bia, caio] = await Promise.all(
        ['Bia Teste', 'Caio Teste'].map((nome) => prisma.paciente.create({ data: { nome } })),
      );
      await prisma.venda.createMany({
        data: [
          {
            pacienteId: bia!.id,
            subtotal: 300,
            total: 300,
            createdAt: emSaoPaulo('2026-10-03T09:00:00'),
          },
          {
            pacienteId: bia!.id,
            subtotal: 100,
            total: 100,
            createdAt: emSaoPaulo('2026-10-20T09:00:00'),
          },
          {
            pacienteId: caio!.id,
            subtotal: 80,
            total: 80,
            createdAt: emSaoPaulo('2026-10-04T09:00:00'),
          },
          {
            pacienteId: caio!.id,
            subtotal: 900,
            total: 900,
            status: 'CANCELADA',
            createdAt: emSaoPaulo('2026-10-04T09:00:00'),
          },
        ],
      });
      const agendamento = await prisma.agendamento.create({
        data: {
          pacienteId: bia!.id,
          profissionalId: profissional.id,
          inicio: emSaoPaulo('2026-10-06T10:00:00'),
          valor: 250,
        },
      });
      await prisma.agendamentoRecebimento.createMany({
        data: [
          {
            agendamentoId: agendamento.id,
            valor: 150,
            formaPagamentoId: forma.id,
            recebidoEm: emSaoPaulo('2026-10-06T11:00:00'),
          },
          {
            agendamentoId: agendamento.id,
            valor: 100,
            formaPagamentoId: forma.id,
            recebidoEm: emSaoPaulo('2026-11-02T11:00:00'),
          },
        ],
      });

      const res = await http()
        .get(LTV)
        .query({ ...OUTUBRO, sort: 'ltv:desc' })
        .expect(200);

      expect(res.body.data).toEqual([
        { paciente: 'Bia Teste', vendas: 2, valorVendas: 400, valorConsultas: 150, ltv: 550 },
        { paciente: 'Caio Teste', vendas: 1, valorVendas: 80, valorConsultas: 0, ltv: 80 },
      ]);
    });
  });

  describe('escopo de dados', () => {
    it.each([TICKET, OCUPACAO, LTV])('403 para o usuário restrito em %s', async (rota) => {
      const profissional = await prisma.profissional.create({ data: { nome: 'Dr. Escopo' } });
      const restrito = await criarUsuarioTeste(app, {
        permissoes: TODAS,
        empresaId,
        escopoDados: 'PROFISSIONAIS_VINCULADOS',
        profissionalIds: [profissional.id],
      });

      const res = await http(restrito).get(rota).query(OUTUBRO).expect(403);

      expect(res.body).toMatchObject({ code: 'FORBIDDEN', message: 'Sem permissão' });
    });
  });

  describe('GET /relatorios/:id (validação e permissão)', () => {
    it('400 com De depois de Até, na mensagem do schema compartilhado', async () => {
      const res = await http().get(LOG).query({ de: '2026-10-31', ate: '2026-10-01' }).expect(400);

      expect(apiErrorSchema.parse(res.body)).toMatchObject({
        code: 'VALIDATION_ERROR',
        details: [expect.objectContaining({ field: 'ate', message: PERIODO_INVALIDO })],
      });
    });

    it('400 sem período ou com sort fora da whitelist', async () => {
      const semPeriodo = await http().get(LOG).expect(400);
      expect(semPeriodo.body.details).toEqual([
        expect.objectContaining({ field: 'de', message: 'Informe a data inicial' }),
        expect.objectContaining({ field: 'ate', message: 'Informe a data final' }),
      ]);

      const invalido = await http()
        .get(LOG)
        .query({ ...OUTUBRO, sort: 'ip:asc' })
        .expect(400);
      expect(invalido.body.details.map((d: { field: string }) => d.field)).toEqual(['sort']);
    });

    it('404 para relatório inexistente', async () => {
      const res = await http().get(`${BASE}/XX-99`).query(OUTUBRO).expect(404);

      expect(res.body).toMatchObject({ code: 'RELATORIO_NAO_ENCONTRADO' });
    });

    it('403 sem a permissão dos dados do relatório, mesmo com a da tela', async () => {
      const semDados = await criarUsuarioTeste(app, {
        permissoes: [TELA_VER, TELA_EXPORTAR],
        empresaId,
      });

      const res = await http(semDados).get(LOG).query(OUTUBRO).expect(403);

      expect(res.body).toMatchObject({ code: 'FORBIDDEN', message: 'Sem permissão' });
    });
  });

  describe('GET /relatorios/:id/export', () => {
    it('xlsx do GES-01 com as colunas pedidas; audita EXPORT com o id do relatório', async () => {
      const outro = await criarUsuarioTeste(app, { permissoes: [], empresaId });
      await prisma.usuario.update({ where: { id: outro.id }, data: { nome: 'Ana Teste' } });
      await prisma.sessao.updateMany({
        where: { usuarioId: outro.id },
        data: { createdAt: emSaoPaulo('2026-10-05T10:00:00'), ip: '10.0.0.9' },
      });
      // A sessão do próprio usuário fica fora do período; ela precisa existir para autenticar.
      await prisma.sessao.updateMany({
        where: { usuarioId: usuario.id },
        data: { createdAt: emSaoPaulo('2026-09-01T10:00:00') },
      });
      const query = { ...OUTUBRO, format: 'xlsx', columns: 'usuario,ip' };

      const res = await binary(http().get(`${LOG}/export`).query(query)).expect(200);

      expect(res.headers['content-type']).toContain('spreadsheetml');
      expect(res.headers['content-disposition']).toMatch(
        /^attachment; filename="relatorio-ges-01-\d{4}-\d{2}-\d{2}\.xlsx"/,
      );
      expect(await lerXlsx(res.body as Buffer)).toEqual([
        ['Usuário', 'IP'],
        ['Ana Teste', '10.0.0.9'],
      ]);
      await expectAudit(prisma, {
        action: 'EXPORT',
        entity: ENTIDADE_RELATORIO,
        entityId: 'GES-01',
        before: null,
        after: { filtros: query },
        userId: usuario.id,
      });
    });

    it('pdf do GES-03, auditado', async () => {
      const res = await binary(
        http()
          .get(`${OCUPACAO}/export`)
          .query({ ...OUTUBRO, format: 'pdf' }),
      ).expect(200);

      expect((res.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
      await expectAudit(prisma, {
        action: 'EXPORT',
        entity: ENTIDADE_RELATORIO,
        entityId: 'GES-03',
      });
    });

    it('400 para formato inválido e 404 para relatório inexistente, sem auditar', async () => {
      await http()
        .get(`${LOG}/export`)
        .query({ ...OUTUBRO, format: 'csv' })
        .expect(400);
      await http()
        .get(`${BASE}/XX-99/export`)
        .query({ ...OUTUBRO, format: 'pdf' })
        .expect(404);

      await expectNoAudit(prisma, { entity: ENTIDADE_RELATORIO });
    });

    it('403 sem a permissão do relatório, sem auditar', async () => {
      const semDados = await criarUsuarioTeste(app, {
        permissoes: [TELA_VER, TELA_EXPORTAR],
        empresaId,
      });

      await http(semDados)
        .get(`${LOG}/export`)
        .query({ ...OUTUBRO, format: 'pdf' })
        .expect(403);

      await expectNoAudit(prisma, { entity: ENTIDADE_RELATORIO });
    });
  });

  describe('acesso pela tela', () => {
    const ROTAS = [
      { caminho: BASE, falta: TELA_VER },
      { caminho: `${LOG}?de=2026-10-01&ate=2026-10-31`, falta: TELA_VER },
      { caminho: `${LOG}/export?de=2026-10-01&ate=2026-10-31&format=pdf`, falta: TELA_EXPORTAR },
    ] as const;

    it.each(ROTAS)('$caminho sem token responde 401', async ({ caminho }) => {
      const res = await request(app.getHttpServer()).get(caminho).expect(401);

      expect(res.body).toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });
    });

    it.each(ROTAS)('$caminho sem $falta responde 403, sem auditar', async ({ caminho, falta }) => {
      const semTela = await criarUsuarioTeste(app, {
        permissoes: TODAS.filter((permissao) => permissao !== falta),
        empresaId,
      });

      const res = await http(semTela).get(caminho).expect(403);

      expect(res.body).toMatchObject({ code: 'FORBIDDEN' });
      await expectNoAudit(prisma, { entity: ENTIDADE_RELATORIO });
    });
  });
});
