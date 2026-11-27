import type { INestApplication } from '@nestjs/common';
import { catalogoRelatoriosSchema, paginaRelatorioSchema, type Permissao } from '@torres/shared';
import request from 'supertest';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { ENTIDADE_RELATORIO } from '../../src/common/relatorios/relatorios.controller';
import { somarDias } from '../../src/modules/financeiro/inadimplencia/inadimplencia.regras';
import { hojeNaClinica } from '../../src/modules/financeiro/inadimplencia/inadimplencia.service';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit } from '../utils/expect-audit';

const BASE = '/api/financeiro/relatorios';
const TELA_VER = 'financeiro.relatorios.ver';
const TODAS: readonly Permissao[] = [
  TELA_VER,
  'financeiro.relatorios.exportar',
  'financeiro.contas-receber.ver',
  'financeiro.contas-pagar.ver',
  'financeiro.plano-contas.ver',
  'financeiro.indicadores.ver',
];

const HOJE = hojeNaClinica();
const dia = (n: number) => new Date(`${somarDias(HOJE, n)}T00:00:00.000Z`);
/** Janela larga: dos últimos 400 dias aos próximos 400. */
const PERIODO = { de: somarDias(HOJE, -400), ate: somarDias(HOJE, 400) };

describe('Relatórios do Financeiro (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let usuario: UsuarioTeste;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    usuario = await criarUsuarioTeste(app, { permissoes: TODAS });
  });

  afterAll(async () => {
    await app.close();
  });

  const http = (quem: UsuarioTeste = usuario) => comUsuario(app, quem);
  const consultar = (id: string, extra: Record<string, string> = {}) =>
    http()
      .get(`${BASE}/${id}`)
      .query({ ...PERIODO, ...extra });
  const linhas = async (id: string, extra: Record<string, string> = {}) =>
    paginaRelatorioSchema.parse((await consultar(id, extra).expect(200)).body).data;

  const receber = (vencimento: number, valor: number, extra: Record<string, unknown> = {}) =>
    prisma.contaReceber.create({
      data: { descricao: 'Aluguel', valor, dataVencimento: dia(vencimento), ...extra } as never,
    });
  const pagar = (vencimento: number, valor: number, extra: Record<string, unknown> = {}) =>
    prisma.contaPagar.create({
      data: { descricao: 'Conta', valor, dataVencimento: dia(vencimento), ...extra } as never,
    });
  const paciente = (nome: string) => prisma.paciente.create({ data: { nome } as never });
  const plano = (codigo: string, nome: string, tipo: 'RECEITA' | 'DESPESA') =>
    prisma.planoConta.create({ data: { codigo, nome, tipo } });

  describe('GET /relatorios (catálogo)', () => {
    it('lista FIN-01 a FIN-27 que têm dados, com colunas e filtros', async () => {
      const res = await http().get(BASE).expect(200);

      const { data: relatorios } = catalogoRelatoriosSchema.parse(res.body);
      expect(relatorios.map((r) => r.id)).toEqual([
        'FIN-01',
        'FIN-06',
        'FIN-07',
        'FIN-10',
        'FIN-11',
        'FIN-12',
        'FIN-13',
        'FIN-14',
        'FIN-17',
        'FIN-19',
        'FIN-20',
        'FIN-22',
        'FIN-23',
        'FIN-24',
        'FIN-25',
        'FIN-26',
        'FIN-27',
      ]);
      expect(relatorios.find((r) => r.id === 'FIN-25')?.filtros[0]?.parametro).toBe('situacao');
    });

    it('só mostra os relatórios cuja tela dona dos dados o usuário vê', async () => {
      const soPagar = await criarUsuarioTeste(app, {
        permissoes: [TELA_VER, 'financeiro.contas-pagar.ver'],
      });
      const res = await http(soPagar).get(BASE).expect(200);
      expect(res.body.data.map((r: { id: string }) => r.id)).toEqual([
        'FIN-12',
        'FIN-17',
        'FIN-19',
        'FIN-25',
      ]);
    });

    it('403 sem a permissão da tela', async () => {
      const semTela = await criarUsuarioTeste(app, { permissoes: [] });
      await http(semTela).get(BASE).expect(403);
    });
  });

  describe('recebíveis', () => {
    it('FIN-01: só títulos vencidos com saldo, descontando a baixa parcial', async () => {
      const ana = await paciente('Paciente Ana Teste');
      const vencido = await receber(-20, 300, { pacienteId: ana.id, status: 'PARCIAL' });
      await prisma.contaReceberBaixa.create({
        data: { contaReceberId: vencido.id, dataRecebimento: dia(-10), valorRecebido: 100 },
      });
      await receber(-5, 50, { status: 'RECEBIDO' });
      await receber(10, 70);
      await receber(-8, 90, {
        profissionalId: (await prisma.profissional.create({ data: { nome: 'Dr. Teste' } })).id,
      });

      const resultado = await linhas('FIN-01');

      expect(resultado).toEqual([
        expect.objectContaining({
          cliente: 'Paciente Ana Teste',
          diasAtraso: 20,
          valor: 300,
          saldo: 200,
        }),
      ]);
    });

    it('FIN-06: faturamento por dia, sem canceladas nem renegociadas', async () => {
      await receber(1, 100);
      await receber(1, 50);
      await receber(2, 999, { status: 'CANCELADO' });
      await receber(3, 999, { status: 'RENEGOCIADO' });

      const resultado = await linhas('FIN-06');

      expect(resultado).toEqual([expect.objectContaining({ titulos: 2, valor: 150 })]);
    });

    it('FIN-07: o recebido por forma de pagamento, com a participação', async () => {
      const pix = await prisma.formaPagamento.create({
        data: { nome: 'Pix', finalidade: 'RECEBER', tipo: 'PIX' } as never,
      });
      const conta = await receber(-1, 400);
      await prisma.contaReceberBaixa.create({
        data: {
          contaReceberId: conta.id,
          dataRecebimento: dia(-1),
          valorRecebido: 300,
          formaPagamentoId: pix.id,
        },
      });
      await prisma.contaReceberBaixa.create({
        data: { contaReceberId: conta.id, dataRecebimento: dia(-1), valorRecebido: 100 },
      });

      const resultado = await linhas('FIN-07', { sort: 'valor:desc' });

      expect(resultado).toEqual([
        expect.objectContaining({ formaPagamento: 'Pix', valor: 300, participacao: 75 }),
        expect.objectContaining({ formaPagamento: 'Sem forma de pagamento', valor: 100 }),
      ]);
    });

    it('FIN-10: faturamento por paciente', async () => {
      const ana = await paciente('Paciente Ana Teste');
      await receber(1, 100, { pacienteId: ana.id });
      await receber(2, 40, { pacienteId: ana.id });
      await receber(3, 10);

      const resultado = await linhas('FIN-10', { sort: 'valor:desc' });

      expect(resultado).toEqual([
        expect.objectContaining({ paciente: 'Paciente Ana Teste', titulos: 2, valor: 140 }),
        expect.objectContaining({ paciente: 'Sem cliente', valor: 10 }),
      ]);
    });

    it('FIN-20: contas a receber com recebido e saldo', async () => {
      const conta = await receber(5, 200, { status: 'PARCIAL' });
      await prisma.contaReceberBaixa.create({
        data: { contaReceberId: conta.id, dataRecebimento: dia(1), valorRecebido: 60 },
      });

      const resultado = await linhas('FIN-20');

      expect(resultado).toEqual([
        expect.objectContaining({ valor: 200, recebido: 60, saldo: 140, status: 'Parcial' }),
      ]);
    });
  });

  describe('pagáveis', () => {
    it('FIN-11: receber e pagar lado a lado, sem as canceladas', async () => {
      await receber(1, 100);
      await pagar(2, 40);
      await pagar(3, 999, { status: 'CANCELADO' });

      const resultado = await linhas('FIN-11', { sort: 'vencimento:asc' });

      expect(resultado.map((l) => [l.tipo, l.valor])).toEqual([
        ['Receber', 100],
        ['Pagar', 40],
      ]);
    });

    it('FIN-12: despesa do período contra a média dos 90 dias anteriores', async () => {
      const limpeza = await prisma.centroCusto.create({ data: { nome: 'Limpeza' } });
      await pagar(-5, 100, { centroCustoId: limpeza.id });
      await pagar(-8, 50);
      await pagar(-100, 900, { centroCustoId: limpeza.id }); // fora da janela de 90 dias
      await pagar(-60, 900, { centroCustoId: limpeza.id });

      const res = await http()
        .get(`${BASE}/FIN-12`)
        .query({ de: somarDias(HOJE, -9), ate: somarDias(HOJE, 0), sort: 'valor:desc' })
        .expect(200);
      const resultado = paginaRelatorioSchema.parse(res.body).data;

      // Média: 900 / 90 dias × 10 dias do período = 100.
      expect(resultado).toEqual([
        expect.objectContaining({
          centroCusto: 'Limpeza',
          valor: 100,
          mediaPeriodo: 100,
          variacao: 0,
        }),
        expect.objectContaining({ centroCusto: 'Sem centro de custo', valor: 50 }),
      ]);
    });

    it('FIN-13 e FIN-14: extratos pelo tipo da conta do plano', async () => {
      const aluguel = await plano('3.01', 'Aluguel', 'DESPESA');
      const consultas = await plano('4.01', 'Consultas', 'RECEITA');
      await pagar(1, 80, { planoContaId: aluguel.id });
      await receber(1, 120, { planoContaId: consultas.id });

      expect(await linhas('FIN-13')).toEqual([
        expect.objectContaining({ codigo: '3.01', conta: 'Aluguel', valor: 80 }),
      ]);
      expect(await linhas('FIN-14')).toEqual([
        expect.objectContaining({ codigo: '4.01', conta: 'Consultas', valor: 120 }),
      ]);
    });

    it('FIN-17 e FIN-19: o fornecedor aparece pelo nome', async () => {
      const forn = await prisma.fornecedor.create({ data: { nome: 'Fornecedor Teste' } });
      const conta = await pagar(1, 100, {
        beneficiarioTipo: 'FORNECEDOR',
        fornecedorId: forn.id,
        status: 'PENDENTE',
      });
      await prisma.contaPagarBaixa.create({
        data: { contaPagarId: conta.id, dataPagamento: dia(1), valorPago: 30 },
      });

      expect(await linhas('FIN-17')).toEqual([
        expect.objectContaining({ fornecedor: 'Fornecedor Teste', valor: 100 }),
      ]);
      expect(await linhas('FIN-19')).toEqual([
        expect.objectContaining({
          beneficiario: 'Fornecedor Teste',
          valor: 100,
          pago: 30,
          saldo: 70,
        }),
      ]);
    });

    it('FIN-25: vencidas, da semana e pendentes, e o filtro de situação', async () => {
      await pagar(-3, 10);
      await pagar(2, 20);
      await pagar(30, 30);
      await pagar(1, 99, { status: 'PAGO' });

      const todas = await linhas('FIN-25', { sort: 'vencimento:asc' });
      expect(todas.map((l) => [l.situacao, l.valor])).toEqual([
        ['Vencida', 10],
        ['Da semana', 20],
        ['Pendente', 30],
      ]);
      const semana = await linhas('FIN-25', { situacao: 'semana' });
      expect(semana.map((l) => l.valor)).toEqual([20]);
    });
  });

  describe('visão gerencial (requisitos do cliente)', () => {
    it('FIN-22: faturamento e recebido por mês', async () => {
      const conta = await receber(1, 500);
      await prisma.contaReceberBaixa.create({
        data: { contaReceberId: conta.id, dataRecebimento: dia(1), valorRecebido: 200 },
      });
      await receber(2, 100, {
        profissionalId: (await prisma.profissional.create({ data: { nome: 'Dr. Teste' } })).id,
      });

      const resultado = await linhas('FIN-22');

      expect(resultado).toHaveLength(1);
      expect(resultado[0]).toEqual(expect.objectContaining({ faturamento: 500, recebido: 200 }));
    });

    it('FIN-23 e FIN-24: DRE por competência e totais por conta contábil', async () => {
      const mes = somarDias(HOJE, 0).slice(0, 7);
      const consultas = await plano('4.01', 'Consultas', 'RECEITA');
      const aluguel = await plano('3.01', 'Aluguel', 'DESPESA');
      await receber(0, 1000, { planoContaId: consultas.id, competencia: mes });
      await receber(0, 500, { competencia: mes });
      await pagar(0, 300, { planoContaId: aluguel.id, competencia: mes });
      await receber(0, 777, { competencia: '2000-01' }); // outra competência

      const dre = await linhas('FIN-23');
      expect(dre.map((l) => [l.secao, l.conta, l.valor])).toEqual([
        ['Receitas', 'Sem conta contábil', 500],
        ['Receitas', 'Consultas', 1000],
        ['Despesas', 'Aluguel', 300],
        ['Resultado', 'Receitas menos despesas', 1200],
      ]);

      const soDespesa = await linhas('FIN-24', { tipo: 'despesa' });
      expect(soDespesa).toEqual([
        expect.objectContaining({ codigo: '3.01', tipo: 'Despesa', lancamentos: 1, valor: 300 }),
      ]);
    });
  });

  describe('FIN-26 e FIN-27: provisão de recebimentos', () => {
    const mesAtual = HOJE.slice(0, 7);
    const somarMeses = (mes: string, n: number): string => {
      const [ano = 0, m = 1] = mes.split('-').map(Number);
      return new Date(Date.UTC(ano, m - 1 + n, 1)).toISOString().slice(0, 7);
    };
    const [m0, m1, m2] = [mesAtual, somarMeses(mesAtual, 1), somarMeses(mesAtual, 2)] as [
      string,
      string,
      string,
    ];
    const fimDoMes = (mes: string) =>
      new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5)), 0))
        .toISOString()
        .slice(0, 10);
    const PROVISAO = { de: `${m0}-01`, ate: fimDoMes(m2) };
    const inicio = new Date(`${somarMeses(m0, -6)}-01T00:00:00Z`);

    const sala = (nome: string) => prisma.sala.create({ data: { nome } });
    const profissional = (nome: string) => prisma.profissional.create({ data: { nome } });
    const contrato = (
      salaId: string,
      profissionalId: string,
      extra: Record<string, unknown> = {},
    ) =>
      prisma.contratoSala.create({
        data: {
          salaId,
          modalidade: 'MENSAL',
          locatarioTipo: 'PROFISSIONAL',
          profissionalId,
          valorUnitario: 1160,
          diaVencimento: 10,
          dataInicio: inicio,
          ...extra,
        } as never,
      });
    const consultarProvisao = (id: string, extra: Record<string, string> = {}) =>
      http()
        .get(`${BASE}/${id}`)
        .query({ ...PROVISAO, ...extra });
    const linhasProvisao = async (id: string, extra: Record<string, string> = {}) =>
      paginaRelatorioSchema.parse((await consultarProvisao(id, extra).expect(200)).body).data;

    /** Cenário conhecido: um contrato com título no mês atual, outros só projetados, permuta, turno e "sem cobrança". */
    async function cenario() {
      const [salaA, salaB] = await Promise.all([sala('Sala A'), sala('Sala B')]);
      const [dra, dr] = await Promise.all([profissional('Dra. Alfa'), profissional('Dr. Beta')]);
      const comTitulo = await contrato(salaA.id, dra.id);
      const titulo = await receber(0, 1160, {
        dataVencimento: new Date(`${m0}-10T00:00:00Z`),
        contratoSalaId: comTitulo.id,
        competencia: m0,
        profissionalSacadoId: dra.id,
      });
      await prisma.contratoSalaCobranca.create({
        data: { contratoSalaId: comTitulo.id, competencia: m0, contaReceberId: titulo.id },
      });
      await contrato(salaB.id, dr.id, { valorUnitario: 500, diaVencimento: 20 });
      await contrato(salaB.id, dr.id, { permuta: true });
      await contrato(salaB.id, dr.id, { modalidade: 'TURNO', valorUnitario: 300 });
      const semCobranca = await contrato(salaA.id, dra.id, { valorUnitario: 200 });
      await prisma.contratoSalaCobranca.create({
        data: { contratoSalaId: semCobranca.id, competencia: m2 },
      });
    }

    it('FIN-27: o contrato de R$ 1.160 (dia 10) aparece nos meses seguintes, sem permuta, turno nem "sem cobrança"', async () => {
      await cenario();

      const detalhe = await linhasProvisao('FIN-27');

      expect(
        detalhe.map((l) => [l.origem, String(l.vencimento).slice(0, 10), l.valor, l.profissional]),
      ).toEqual(
        expect.arrayContaining([
          ['Gerado', `${m0}-10`, 1160, 'Dra. Alfa'],
          ['Projetado', `${m1}-10`, 1160, 'Dra. Alfa'],
          ['Projetado', `${m2}-10`, 1160, 'Dra. Alfa'],
          ['Projetado', `${m0}-20`, 500, 'Dr. Beta'],
          ['Projetado', `${m1}-20`, 500, 'Dr. Beta'],
          ['Projetado', `${m2}-20`, 500, 'Dr. Beta'],
          ['Projetado', `${m0}-10`, 200, 'Dra. Alfa'],
          ['Projetado', `${m1}-10`, 200, 'Dra. Alfa'],
        ]),
      );
      expect(detalhe).toHaveLength(8);
    });

    it('FIN-26: os totais por mês conferem com o cenário conhecido', async () => {
      await cenario();

      expect(await linhasProvisao('FIN-26')).toEqual([
        { grupo: m0, gerado: 1160, projetado: 700, total: 1860 },
        { grupo: m1, gerado: 0, projetado: 1860, total: 1860 },
        { grupo: m2, gerado: 0, projetado: 1660, total: 1660 },
      ]);
    });

    it('FIN-26: agrupa por profissional e filtra por origem', async () => {
      await cenario();

      expect(
        await linhasProvisao('FIN-26', { agrupar: 'profissional', origem: 'projetado' }),
      ).toEqual([
        { grupo: 'Dr. Beta', gerado: 0, projetado: 1500, total: 1500 },
        { grupo: 'Dra. Alfa', gerado: 0, projetado: 2720, total: 2720 },
      ]);
    });

    it('FIN-26: título cancelado não entra na provisão', async () => {
      const salaA = await sala('Sala A');
      const dra = await profissional('Dra. Alfa');
      const c = await contrato(salaA.id, dra.id);
      await receber(0, 1160, {
        dataVencimento: new Date(`${m0}-10T00:00:00Z`),
        contratoSalaId: c.id,
        competencia: m0,
        status: 'CANCELADO',
      });

      expect(await linhasProvisao('FIN-26', { agrupar: 'status', origem: 'gerado' })).toEqual([]);
    });

    it('422 quando o período passa de 24 meses', async () => {
      const res = await http()
        .get(`${BASE}/FIN-26`)
        .query({ de: PROVISAO.de, ate: fimDoMes(somarMeses(m0, 24)) })
        .expect(422);

      expect(res.body.code).toBe('PROVISAO_PERIODO_EXCEDIDO');
    });

    it('403 sem permissão em Contas a Receber e para perfil restrito', async () => {
      const semReceber = await criarUsuarioTeste(app, { permissoes: [TELA_VER] });
      await http(semReceber).get(`${BASE}/FIN-26`).query(PROVISAO).expect(403);
      const dra = await profissional('Dra. Alfa');
      const restrito = await criarUsuarioTeste(app, {
        permissoes: TODAS,
        escopoDados: 'PROFISSIONAIS_VINCULADOS',
        profissionalIds: [dra.id],
      });
      await http(restrito).get(`${BASE}/FIN-27`).query(PROVISAO).expect(403);
    });

    it('exporta em Excel, PDF e CSV e grava EXPORT no audit_log', async () => {
      await cenario();

      for (const format of ['xlsx', 'pdf', 'csv']) {
        await http()
          .get(`${BASE}/FIN-27/export`)
          .query({ ...PROVISAO, format })
          .buffer(true)
          .parse(binario)
          .expect(200);
      }

      const registros = await prisma.auditLog.findMany({
        where: { action: 'EXPORT', entity: ENTIDADE_RELATORIO, entityId: 'FIN-27' },
      });
      expect(registros.map((r) => r.userId)).toEqual([usuario.id, usuario.id, usuario.id]);
      expect(
        registros.map((r) => (r.after as { filtros: { format: string } }).filtros.format).sort(),
      ).toEqual(['csv', 'pdf', 'xlsx']);
    });
  });

  describe('validação, escopo e exportação', () => {
    it('400 com período inválido e 404 para relatório desconhecido', async () => {
      await http().get(`${BASE}/FIN-01`).query({ de: PERIODO.ate, ate: PERIODO.de }).expect(400);
      await consultar('FIN-99').expect(404);
    });

    it('403 no relatório cuja tela o usuário não vê', async () => {
      const soReceber = await criarUsuarioTeste(app, {
        permissoes: [TELA_VER, 'financeiro.contas-receber.ver'],
      });
      await http(soReceber).get(`${BASE}/FIN-19`).query(PERIODO).expect(403);
    });

    it('403 para perfil restrito a profissionais (visão da administração)', async () => {
      const profissional = await prisma.profissional.create({ data: { nome: 'Dr. Teste' } });
      const restrito = await criarUsuarioTeste(app, {
        permissoes: TODAS,
        escopoDados: 'PROFISSIONAIS_VINCULADOS',
        profissionalIds: [profissional.id],
      });
      await http(restrito).get(`${BASE}/FIN-06`).query(PERIODO).expect(403);
    });

    it('exporta em Excel e grava a ação EXPORT no audit_log', async () => {
      await receber(1, 100);

      await http()
        .get(`${BASE}/FIN-06/export`)
        .query({ ...PERIODO, format: 'xlsx' })
        .buffer(true)
        .parse(binario)
        .expect(200);

      await expectAudit(prisma, {
        action: 'EXPORT',
        entity: ENTIDADE_RELATORIO,
        entityId: 'FIN-06',
        userId: usuario.id,
      });
    });
  });
});

function binario(res: request.Response, callback: (erro: Error | null, corpo: Buffer) => void) {
  const partes: Buffer[] = [];
  res.on('data', (parte: Buffer) => partes.push(parte));
  res.on('end', () => callback(null, Buffer.concat(partes)));
}
