import type { INestApplication } from '@nestjs/common';
import {
  catalogoRelatoriosSchema,
  paginaRelatorioSchema,
  PERMISSOES,
  type Permissao,
} from '@torres/shared';
import request from 'supertest';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { ENTIDADE_RELATORIO } from '../../src/common/relatorios/relatorios.controller';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit } from '../utils/expect-audit';

const BASE = '/api/gestao-profissionais/relatorios';
const TELA_VER = 'gestao-profissionais.relatorios.ver';
const TODAS: readonly Permissao[] = [
  TELA_VER,
  'gestao-profissionais.relatorios.exportar',
  'gestao-profissionais.receita-profissionais.ver',
];
const PERIODO = { de: '2026-10-01', ate: '2026-10-31' };
const ATENDIMENTO = new Date('2026-10-15T15:00:00Z');

describe('Relatórios de Receita Profissionais (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let usuario: UsuarioTeste;
  let ana: string;
  let beto: string;
  let pix: string;
  let dinheiro: string;
  let paciente1: string;
  let paciente2: string;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    usuario = await criarUsuarioTeste(app, { permissoes: TODAS });
    ana = (await prisma.profissional.create({ data: { nome: 'Dra. Ana Teste' } })).id;
    beto = (await prisma.profissional.create({ data: { nome: 'Dr. Beto Teste' } })).id;
    paciente1 = (await prisma.paciente.create({ data: { nome: 'Paciente Um' } })).id;
    paciente2 = (await prisma.paciente.create({ data: { nome: 'Paciente Dois' } })).id;
    pix = (
      await prisma.formaPagamento.create({
        data: { nome: 'PIX', finalidade: 'RECEBER', tipo: 'PIX' },
      })
    ).id;
    dinheiro = (
      await prisma.formaPagamento.create({
        data: { nome: 'Dinheiro', finalidade: 'RECEBER', tipo: 'DINHEIRO' },
      })
    ).id;
  });

  afterAll(async () => {
    await app.close();
  });

  const http = (quem: UsuarioTeste = usuario) => comUsuario(app, quem);

  const recebido = (
    profissionalId: string,
    valor: string,
    formaPagamentoId: string,
    pacienteId: string,
    dia: string,
  ) =>
    prisma.contaReceber.create({
      data: {
        descricao: 'Receita',
        profissionalId,
        pacienteId,
        formaPagamentoId,
        valor,
        status: 'RECEBIDO',
        dataVencimento: new Date(dia),
        dataRecebimento: new Date(dia),
      },
    });
  const agendamento = (
    profissionalId: string,
    valor: string,
    extra: Record<string, unknown> = {},
  ) =>
    prisma.agendamento.create({
      data: {
        pacienteId: paciente1,
        profissionalId,
        inicio: ATENDIMENTO,
        status: 'ATENDIDO',
        valor,
        ...extra,
      },
    });

  /** Ana: 3 atendimentos (1 sem registro, 1 pago, 1 com recebimento parcial) e 1 AGENDADO. */
  async function cenario() {
    await recebido(ana, '100.00', pix, paciente1, '2026-10-10');
    await recebido(ana, '50.00', dinheiro, paciente2, '2026-10-12');
    await recebido(beto, '70.00', pix, paciente1, '2026-10-05');
    await recebido(ana, '999.00', pix, paciente1, '2025-01-01');
    await prisma.contaReceber.create({
      data: {
        descricao: 'Parcela 2/2',
        profissionalId: ana,
        pacienteId: paciente2,
        valor: '30.00',
        dataVencimento: new Date('2026-10-20'),
        status: 'PENDENTE',
      },
    });
    await prisma.contaReceber.create({
      data: {
        descricao: 'Excluída',
        profissionalId: ana,
        valor: '5000.00',
        dataVencimento: new Date('2026-10-10'),
        status: 'RECEBIDO',
        dataRecebimento: new Date('2026-10-10'),
        deletedAt: new Date(),
      },
    });
    await agendamento(ana, '200.00');
    await agendamento(ana, '80.00', { pagoEm: ATENDIMENTO, formaPagamentoId: pix });
    const parcial = await agendamento(ana, '120.00');
    await prisma.agendamentoRecebimento.create({
      data: { agendamentoId: parcial.id, valor: '20.00', formaPagamentoId: pix },
    });
    await agendamento(ana, '500.00', { status: 'AGENDADO' });
    await agendamento(beto, '60.00', { status: 'EM_ATENDIMENTO' });
  }

  const consultar = (id: string, extra: Record<string, string> = {}, quem?: UsuarioTeste) =>
    http(quem)
      .get(`${BASE}/${id}`)
      .query({ ...PERIODO, ...extra });
  const corpo = async (id: string, extra: Record<string, string> = {}) =>
    paginaRelatorioSchema.parse((await consultar(id, extra).expect(200)).body);

  describe('catálogo', () => {
    it('lista os relatórios com colunas e filtros de entidade', async () => {
      const res = await http().get(BASE).expect(200);

      const { data } = catalogoRelatoriosSchema.parse(res.body);
      expect(data.map((r) => r.id)).toEqual([
        'RP-01',
        'RP-02',
        'RP-03',
        'RP-04',
        'RP-05',
        'RP-06',
        'RP-07',
        'RP-08',
        'RP-09',
        'RP-10',
        'RP-11',
        'RP-12',
        'RP-13',
      ]);
      expect(data.find((r) => r.id === 'RP-02')?.filtros).toEqual([
        expect.objectContaining({ tipo: 'entidade', parametro: 'profissionalId' }),
        expect.objectContaining({ tipo: 'entidade', parametro: 'formaPagamentoId' }),
      ]);
    });

    it('403 sem a permissão da tela e sem a da tela dona dos dados', async () => {
      const semTela = await criarUsuarioTeste(app, { permissoes: [] });
      await http(semTela).get(BASE).expect(403);

      const soTela = await criarUsuarioTeste(app, { permissoes: [TELA_VER] });
      const catalogo = await http(soTela).get(BASE).expect(200);
      expect(catalogo.body.data).toEqual([]);
      await consultar('RP-01', {}, soTela).expect(403);
    });
  });

  describe('relatórios', () => {
    it('RP-01: recebido, pendente (com os sem registro) e total por profissional', async () => {
      await cenario();

      const { data, totais } = await corpo('RP-01');

      expect(data).toEqual([
        { profissional: 'Dr. Beto Teste', atendimentos: 1, recebido: 70, pendente: 60, total: 130 },
        {
          profissional: 'Dra. Ana Teste',
          atendimentos: 3,
          recebido: 150,
          pendente: 230,
          total: 380,
        },
      ]);
      expect(totais).toEqual({ total: 510 });
    });

    it('RP-02: recebidos, pendentes e sem registro; com forma, os sem registro saem', async () => {
      await cenario();

      const todos = await corpo('RP-02');
      expect(todos.meta.total).toBe(3 + 1 + 2);
      expect(
        todos.data.map((l) => l.status).sort((a, b) => String(a).localeCompare(String(b))),
      ).toEqual(['Pendente', 'Recebido', 'Recebido', 'Recebido', 'Sem registro', 'Sem registro']);

      const porForma = await corpo('RP-02', { formaPagamentoId: pix });
      expect(porForma.data.map((l) => l.status)).toEqual(['Recebido', 'Recebido']);
      expect(porForma.data.every((l) => l.forma === 'PIX')).toBe(true);
    });

    it('RP-03: por forma de pagamento, com "Pendente de Registro" e total', async () => {
      await cenario();

      const { data, totais } = await corpo('RP-03');

      expect(data).toEqual([
        { forma: 'Pendente de Registro', quantidade: 2, total: 260 },
        { forma: 'PIX', quantidade: 2, total: 170 },
        { forma: 'Dinheiro', quantidade: 1, total: 50 },
      ]);
      expect(totais).toEqual({ total: 480 });
    });

    it('RP-04: parcelas e sem registro de qualquer data (ignora o período)', async () => {
      await cenario();

      const { data } = await corpo('RP-04');
      // Sem o período, entram os 3 recebidos de 2025? Não: só pendentes e sem registro.
      expect(data).toHaveLength(3);
      expect(data.map((l) => l.origem).sort((a, b) => String(a).localeCompare(String(b)))).toEqual([
        'Parcela',
        'Sem Registro',
        'Sem Registro',
      ]);
      const fora = await http()
        .get(`${BASE}/RP-04`)
        .query({ de: '2020-01-01', ate: '2020-01-02' })
        .expect(200);
      expect(fora.body.meta.total).toBe(3);
    });

    it('RP-05: atendimentos, pacientes únicos e valor por profissional', async () => {
      await cenario();

      const { data, totais } = await corpo('RP-05');

      expect(data).toEqual([
        { profissional: 'Dra. Ana Teste', atendimentos: 3, pacientesUnicos: 1, valorTotal: 400 },
        { profissional: 'Dr. Beto Teste', atendimentos: 1, pacientesUnicos: 1, valorTotal: 60 },
      ]);
      expect(totais).toEqual({ valorTotal: 460 });
    });

    it('RP-06 e RP-07: recebimentos por mês e por paciente', async () => {
      await cenario();

      const mes = await corpo('RP-06');
      expect(mes.data).toEqual([{ periodo: '2026-10', quantidade: 3, valor: 220 }]);
      expect(mes.totais).toEqual({ valor: 220 });

      const porPaciente = await corpo('RP-07');
      expect(porPaciente.data).toEqual([
        expect.objectContaining({ paciente: 'Paciente Um', quantidade: 2, valor: 170 }),
        expect.objectContaining({ paciente: 'Paciente Dois', quantidade: 1, valor: 50 }),
      ]);
      expect(porPaciente.totais).toEqual({ valor: 220 });
    });

    it('RP-11: atendimentos sem recebimento, com filtro de profissional', async () => {
      await cenario();

      const todos = await corpo('RP-11');
      expect(todos.meta.total).toBe(2);

      const doBeto = await corpo('RP-11', { profissionalId: beto });
      expect(doBeto.data).toEqual([
        expect.objectContaining({ profissional: 'Dr. Beto Teste', status: 'Em atendimento' }),
      ]);
    });

    it('RP-12: resumo de pendentes ("-" sem pendência) e total', async () => {
      await cenario();
      await agendamento(beto, '10.00', { pagoEm: ATENDIMENTO, formaPagamentoId: pix });
      await prisma.agendamento.updateMany({
        where: { profissionalId: beto, status: 'EM_ATENDIMENTO' },
        data: { pagoEm: ATENDIMENTO },
      });

      const { data, totais } = await corpo('RP-12');

      expect(data).toEqual([
        {
          profissional: 'Dra. Ana Teste',
          totalAtendimentos: 3,
          valorTotal: 400,
          semRecebimento: 1,
          valorPendente: 200,
        },
        {
          profissional: 'Dr. Beto Teste',
          totalAtendimentos: 2,
          valorTotal: 70,
          semRecebimento: 0,
          valorPendente: null,
        },
      ]);
      expect(totais).toEqual({ valorPendente: 200 });
    });

    it('RP-13: consultas por profissional e forma, com filtros', async () => {
      await cenario();

      const todos = await corpo('RP-13');
      expect(todos.data).toEqual([
        { profissional: 'Dr. Beto Teste', forma: 'PIX', consultas: 1, total: 70 },
        { profissional: 'Dra. Ana Teste', forma: 'PIX', consultas: 1, total: 100 },
        { profissional: 'Dra. Ana Teste', forma: 'Dinheiro', consultas: 1, total: 50 },
      ]);
      expect(todos.totais).toEqual({ total: 220 });

      const soDinheiro = await corpo('RP-13', { formaPagamentoId: dinheiro });
      expect(soDinheiro.data).toHaveLength(1);
      expect(soDinheiro.totais).toEqual({ total: 50 });
    });
  });

  describe('RP-08 a RP-10 (não usam o período)', () => {
    const DIA_MS = 86_400_000;
    const venc = (dias: number) => new Date(Date.now() + dias * DIA_MS);
    const parcela = (dias: number, valor: string, extra: Record<string, unknown> = {}) =>
      prisma.contaReceber.create({
        data: {
          descricao: 'Parcela',
          profissionalId: ana,
          pacienteId: paciente1,
          valor,
          dataVencimento: venc(dias),
          status: 'PENDENTE',
          ...extra,
        },
      });

    it('RP-08: só parcelas pendentes já vencidas, com os dias de atraso e o total', async () => {
      await parcela(-45, '100.00');
      await parcela(-5, '40.00', { profissionalId: beto });
      await parcela(10, '999.00');
      await parcela(-45, '7.00', { status: 'RECEBIDO', dataRecebimento: venc(-40) });

      const { data, totais } = await corpo('RP-08');

      expect(data.map((l) => [l.profissional, l.valor, l.diasAtraso])).toEqual([
        ['Dra. Ana Teste', 100, 45],
        ['Dr. Beto Teste', 40, 5],
      ]);
      expect(totais).toEqual({ valor: 140 });
      const doBeto = await corpo('RP-08', { profissionalId: beto });
      expect(doBeto.data).toHaveLength(1);
    });

    it('RP-09: pendentes por faixa de vencimento, com as 5 faixas e o total', async () => {
      await parcela(10, '1.00');
      await parcela(-5, '2.00');
      await parcela(-45, '4.00');
      await parcela(-75, '8.00');
      await parcela(-200, '16.00');
      await parcela(-200, '32.00');

      const { data, totais } = await corpo('RP-09');

      expect(data).toEqual([
        { faixa: 'A vencer', quantidade: 1, valor: 1 },
        { faixa: '1 a 30 dias', quantidade: 1, valor: 2 },
        { faixa: '31 a 60 dias', quantidade: 1, valor: 4 },
        { faixa: '61 a 90 dias', quantidade: 1, valor: 8 },
        { faixa: 'Mais de 90 dias', quantidade: 2, valor: 48 },
      ]);
      expect(totais).toEqual({ quantidade: 6, valor: 63 });
    });

    it('RP-10: receitas parceladas com parcela pendente, com recebido, saldo e parcelas pagas', async () => {
      const parcelada = (dias: number, status: 'PENDENTE' | 'RECEBIDO', documento: string) =>
        parcela(dias, '100.00', {
          status,
          documento,
          totalParcelas: 3,
          ...(status === 'RECEBIDO' && { dataRecebimento: venc(dias) }),
        });
      await parcelada(-60, 'RECEBIDO', 'DOC-1');
      await parcelada(-30, 'RECEBIDO', 'DOC-1');
      await parcelada(30, 'PENDENTE', 'DOC-1');
      // Quitada e à vista: ficam de fora.
      await parcelada(-60, 'RECEBIDO', 'DOC-2');
      await parcela(-5, '50.00');

      const { data, totais } = await corpo('RP-10');

      expect(data).toEqual([
        {
          paciente: 'Paciente Um',
          profissional: 'Dra. Ana Teste',
          total: 300,
          recebido: 200,
          saldo: 100,
          parcelas: '2/3',
        },
      ]);
      expect(totais).toEqual({ total: 300, recebido: 200, saldo: 100 });
    });
  });

  describe('validação e escopo', () => {
    it('400 com período invertido, filtro inválido e sort fora da lista; 404 e 403', async () => {
      await http().get(`${BASE}/RP-01`).query({ de: '2026-10-31', ate: '2026-10-01' }).expect(400);
      await consultar('RP-02', { profissionalId: 'nao-e-uuid' }).expect(400);
      await consultar('RP-01', { sort: 'inexistente:asc' }).expect(400);
      await http().get(`${BASE}/RP-99`).query(PERIODO).expect(404);
    });

    it('perfil restrito vê só os profissionais vinculados; fora do escopo é 403', async () => {
      await cenario();
      const restrito = await criarUsuarioTeste(app, {
        permissoes: [...PERMISSOES],
        escopoDados: 'PROFISSIONAIS_VINCULADOS',
        profissionalIds: [ana],
      });

      const rp01 = paginaRelatorioSchema.parse(
        (await consultar('RP-01', {}, restrito).expect(200)).body,
      );
      expect(rp01.data.map((l) => l.profissional)).toEqual(['Dra. Ana Teste']);
      expect(rp01.totais).toEqual({ total: 380 });

      await consultar('RP-11', { profissionalId: beto }, restrito).expect(403);
      const rp04 = await consultar('RP-04', {}, restrito).expect(200);
      expect(rp04.body.meta.total).toBe(2);
    });

    it('perfil restrito sem vínculo não vê nenhum dado', async () => {
      await cenario();
      const semVinculo = await criarUsuarioTeste(app, {
        permissoes: [...PERMISSOES],
        escopoDados: 'PROFISSIONAIS_VINCULADOS',
        profissionalIds: [],
      });

      const res = await consultar('RP-01', {}, semVinculo).expect(200);
      expect(res.body.meta.total).toBe(0);
    });
  });

  describe('exportação', () => {
    it('exporta Excel com a linha de total e grava EXPORT no audit_log', async () => {
      await cenario();

      await http()
        .get(`${BASE}/RP-01/export`)
        .query({ ...PERIODO, format: 'xlsx' })
        .buffer(true)
        .parse(binario)
        .expect(200);

      await expectAudit(prisma, {
        action: 'EXPORT',
        entity: ENTIDADE_RELATORIO,
        entityId: 'RP-01',
        userId: usuario.id,
      });
    });

    it('403 ao exportar sem a permissão exportar da tela', async () => {
      const soVer = await criarUsuarioTeste(app, {
        permissoes: [TELA_VER, 'gestao-profissionais.receita-profissionais.ver'],
      });
      await http(soVer)
        .get(`${BASE}/RP-01/export`)
        .query({ ...PERIODO, format: 'xlsx' })
        .expect(403);
    });
  });
});

function binario(res: request.Response, callback: (erro: Error | null, corpo: Buffer) => void) {
  const partes: Buffer[] = [];
  res.on('data', (parte: Buffer) => partes.push(parte));
  res.on('end', () => callback(null, Buffer.concat(partes)));
}
