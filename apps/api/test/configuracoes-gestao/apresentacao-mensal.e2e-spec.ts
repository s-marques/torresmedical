import type { INestApplication } from '@nestjs/common';
import {
  apiErrorSchema,
  apresentacaoMensalSchema,
  INDICADORES_APRESENTACAO,
  type IndicadorApresentacao,
  type Permissao,
} from '@torres/shared';
import request from 'supertest';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { ENTIDADE_APRESENTACAO_MENSAL } from '../../src/modules/configuracoes-gestao/apresentacao-mensal/apresentacao-mensal.controller';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit, expectNoAudit } from '../utils/expect-audit';
import { respostaBinaria } from '../utils/resposta-binaria';

const BASE = '/api/configuracoes-gestao/apresentacao-mensal';
const PDF = `${BASE}/pdf`;
const TELA_VER = 'configuracoes-gestao.relatorios.ver';
const TELA_EXPORTAR = 'configuracoes-gestao.relatorios.exportar';
const DADOS: readonly Permissao[] = [
  'financeiro.contas-receber.ver',
  'financeiro.contas-pagar.ver',
  'gestao-profissionais.salas.ver',
  'compras-estoque.estoque.ver',
  'comercial-atendimento.pipeline.ver',
  'comercial-atendimento.pesquisa-profissional.ver',
  'comercial-atendimento.pesquisa-nps.ver',
];
const TODAS: readonly Permissao[] = [TELA_VER, TELA_EXPORTAR, ...DADOS];
const OUTUBRO = { mes: '2026-10' };

/** Instante em São Paulo (UTC-3), como o usuário vê. */
const emSaoPaulo = (dataHora: string): Date => new Date(`${dataHora}-03:00`);
const dia = (data: string): Date => new Date(`${data}T00:00:00.000Z`);

/** Páginas do PDF: o pdfkit escreve um objeto `/Type /Page` por página. */
const paginasDoPdf = (pdf: Buffer): number =>
  (pdf.toString('latin1').match(/\/Type \/Page(?![s\w])/g) ?? []).length;

describe('Relatório mensal de apresentação da gestão (e2e)', () => {
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

  async function indicadores(quem: UsuarioTeste = usuario) {
    const res = await http(quem).get(BASE).query(OUTUBRO).expect(200);
    const { indicadores: lista } = apresentacaoMensalSchema.parse(res.body);
    return new Map(lista.map((i) => [i.id, i]));
  }

  const pontos = (i: IndicadorApresentacao | undefined) =>
    Object.fromEntries((i?.serie ?? []).map((p) => [p.rotulo, [p.valor, p.anterior]]));

  /**
   * Outubro/2026 (mês) contra setembro/2026 (anterior), com números fáceis de conferir à mão.
   * Tudo fictício.
   */
  async function cenario() {
    const sala = await prisma.sala.create({ data: { nome: 'Sala 1' } });
    const medico = await prisma.profissional.create({
      data: { nome: 'Dr. Fictício', corCalendario: 'verde' },
    });
    const contrato = await prisma.contratoSala.create({
      data: {
        salaId: sala.id,
        modalidade: 'MENSAL',
        locatarioTipo: 'PROFISSIONAL',
        profissionalId: medico.id,
        valorUnitario: 1000,
        diaVencimento: 10,
        dataInicio: dia('2026-04-01'),
      } as never,
    });

    // 1 e 3. Faturamento: com contrato (mensal) e avulso.
    const receber = (vencimento: string, valor: number, contratoSalaId?: string) =>
      prisma.contaReceber.create({
        data: {
          descricao: 'Aluguel',
          valor,
          dataVencimento: dia(vencimento),
          contratoSalaId,
        } as never,
      });
    await receber('2026-10-10', 1000, contrato.id);
    await receber('2026-10-15', 500);
    await receber('2026-09-10', 800, contrato.id);
    await receber('2026-09-15', 200);
    await receber('2026-08-10', 100);

    // 5. Despesas: centro "Limpeza" e uma despesa sem centro.
    const limpeza = await prisma.centroCusto.create({ data: { nome: 'Limpeza' } });
    const pagar = (vencimento: string, valor: number, centroCustoId?: string) =>
      prisma.contaPagar.create({
        data: { descricao: 'Conta', valor, dataVencimento: dia(vencimento), centroCustoId } as never,
      });
    await pagar('2026-10-05', 300, limpeza.id);
    await pagar('2026-10-06', 100);
    await pagar('2026-09-05', 900, limpeza.id); // média dos 90 dias: 900 / 90 × 31 = 310

    // 6. Estoque: consumo do mês e esperado pela média dos 90 dias.
    const categoria = await prisma.categoria.create({
      data: { nome: 'Material de limpeza', tipo: 'PRODUTO' } as never,
    });
    const produto = await prisma.produto.create({
      data: { nome: 'Detergente', tipo: 'PRODUTO', categoriaId: categoria.id } as never,
    });
    const saida = (quantidade: number, createdAt: Date) =>
      prisma.movimentacaoEstoque.create({
        data: { produtoId: produto.id, tipo: 'SAIDA', quantidade, createdAt },
      });
    await saida(12, emSaoPaulo('2026-10-10T12:00:00'));
    await saida(90, emSaoPaulo('2026-08-15T12:00:00')); // 90 / 90 × 31 = 31

    // 7 e 8. CRM: leads por origem e visitas.
    const pipeline = await prisma.pipeline.create({ data: { nome: 'Pipeline Torres', ordem: 1 } });
    const estagio = await prisma.estagioPipeline.create({
      data: { pipelineId: pipeline.id, nome: 'Contato inicial', cor: '#3b82f6', ordem: 1 },
    });
    const origem = await prisma.origemCliente.create({
      data: { nome: 'Instagram', codigo: 'instagram', ordem: 1 },
    });
    const negocio = (createdAt: Date, extra: Record<string, unknown> = {}) =>
      prisma.negocio.create({
        data: { titulo: 'Sala 10', pipelineId: pipeline.id, estagioId: estagio.id, createdAt, ...extra },
      });
    const visitado = await negocio(emSaoPaulo('2026-10-02T10:00:00'), {
      origemClienteId: origem.id,
      contatoTipo: 'PROFISSIONAL',
      contatoId: medico.id,
    });
    await negocio(emSaoPaulo('2026-10-20T10:00:00'), { origemClienteId: origem.id });
    await negocio(emSaoPaulo('2026-10-25T10:00:00')); // sem origem
    await negocio(emSaoPaulo('2026-09-12T10:00:00'), { origemClienteId: origem.id });
    const atividade = (
      tipo: 'VISITA' | 'LIGACAO',
      dataHora: Date,
      status: 'PENDENTE' | 'CONCLUIDA' | 'CANCELADA',
    ) =>
      prisma.atividadeNegocio.create({
        data: { negocioId: visitado.id, tipo, titulo: 'Visita', dataHora, status },
      });
    await atividade('VISITA', emSaoPaulo('2026-10-05T10:00:00'), 'CONCLUIDA');
    await atividade('VISITA', emSaoPaulo('2026-10-28T10:00:00'), 'PENDENTE');
    await atividade('VISITA', emSaoPaulo('2026-10-12T10:00:00'), 'CANCELADA'); // não conta
    await atividade('LIGACAO', emSaoPaulo('2026-10-06T10:00:00'), 'CONCLUIDA'); // não é visita
    await atividade('VISITA', emSaoPaulo('2026-09-05T10:00:00'), 'CONCLUIDA');

    // 9. NPS dos médicos: outubro 3 promotores e 1 detrator (50); setembro 1 promotor (100).
    const pesquisaMedico = (ciclo: number, dataDia: string, nps: number) =>
      prisma.pesquisaProfissional.create({
        data: {
          profissionalId: medico.id,
          ciclo,
          tipo: 'PERIODICA',
          status: 'RESPONDIDA',
          tokenHash: `hash-${ciclo}`,
          expiraEm: new Date('2027-12-31T00:00:00.000Z'),
          nps,
          enviadaEm: new Date(`${dataDia}T15:00:00.000Z`),
          respondidaEm: new Date(`${dataDia}T16:00:00.000Z`),
        },
      });
    await pesquisaMedico(1, '2026-10-02', 10);
    await pesquisaMedico(2, '2026-10-03', 9);
    await pesquisaMedico(3, '2026-10-04', 10);
    await pesquisaMedico(4, '2026-10-05', 2);
    await pesquisaMedico(5, '2026-09-05', 10);

    // 10. NPS dos pacientes: outubro 2 promotores e 2 detratores (0); setembro 1 promotor (100).
    const paciente = await prisma.paciente.create({ data: { nome: 'Ana Fictícia' } as never });
    const pesquisaPaciente = (dataDia: string, nota: number) =>
      prisma.pesquisaNps.create({
        data: {
          atendimentoId: crypto.randomUUID(),
          pacienteId: paciente.id,
          profissionalId: medico.id,
          status: 'RESPONDIDA',
          nota,
          enviadaEm: new Date(`${dataDia}T15:00:00.000Z`),
          respondidaEm: new Date(`${dataDia}T16:00:00.000Z`),
        },
      });
    await pesquisaPaciente('2026-10-02', 10);
    await pesquisaPaciente('2026-10-03', 9);
    await pesquisaPaciente('2026-10-04', 3);
    await pesquisaPaciente('2026-10-05', 1);
    await pesquisaPaciente('2026-09-05', 10);
  }

  describe('GET /configuracoes-gestao/apresentacao-mensal', () => {
    it('traz os 10 indicadores na ordem da apresentação, no contrato da API', async () => {
      const lista = await indicadores();

      expect([...lista.keys()]).toEqual([...INDICADORES_APRESENTACAO]);
      expect([...lista.values()].map((i) => i.numero)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    });

    it('1. faturamento: o mês, o anterior e a tendência dos 6 meses', async () => {
      await cenario();

      const faturamento = (await indicadores()).get('faturamento');

      expect(faturamento).toMatchObject({
        formato: 'moeda',
        grafico: 'tendencia',
        valor: 1500,
        anterior: 1000,
        variacao: 50,
      });
      expect(faturamento?.serie.map((p) => p.rotulo)).toEqual([
        '2026-05',
        '2026-06',
        '2026-07',
        '2026-08',
        '2026-09',
        '2026-10',
      ]);
      expect(faturamento?.serie.map((p) => p.valor)).toEqual([0, 0, 0, 100, 1000, 1500]);
    });

    it('2. faturamento futuro: os 3 meses seguintes, sem comparação', async () => {
      await cenario();

      const futuro = (await indicadores()).get('faturamento-futuro');

      expect(futuro?.serie.map((p) => p.rotulo)).toEqual(['2026-11', '2026-12', '2027-01']);
      expect(futuro).toMatchObject({ comparacao: 'NENHUMA', anterior: null, variacao: null });
      expect(futuro?.valor).toBe(futuro?.serie.reduce((t, p) => t + (p.valor ?? 0), 0));
    });

    it('3. faturamento por produto: por modalidade do contrato, mês contra o anterior', async () => {
      await cenario();

      const produto = (await indicadores()).get('faturamento-produto');

      expect(pontos(produto)).toEqual({ 'Mensal (Fixo)': [1000, 800] });
      expect(produto).toMatchObject({ valor: 1000, anterior: 800, variacao: 25 });
      expect(produto?.avisos).toEqual(['PRODUTO_POR_MODALIDADE']);
    });

    it('4. ocupação e vacância fecham 100% da capacidade, mais a previsão do mês seguinte', async () => {
      await cenario();

      const ocupacao = (await indicadores()).get('ocupacao');

      expect(ocupacao?.serie.map((p) => p.chave)).toEqual([
        'ocupacao',
        'vacancia',
        'ocupacao-prevista',
      ]);
      const [taxa, vacancia] = ocupacao?.serie ?? [];
      expect(taxa?.valor).not.toBeNull();
      expect((taxa?.valor ?? 0) + (vacancia?.valor ?? 0)).toBeCloseTo(100, 0);
      expect(ocupacao?.avisos).toEqual(['OCUPACAO_PREVISAO_CONTRATOS']);
    });

    it('4. sem salas não há capacidade: ocupação indisponível, nunca 0%', async () => {
      const ocupacao = (await indicadores()).get('ocupacao');

      expect(ocupacao?.valor).toBeNull();
      expect(ocupacao?.serie.map((p) => p.valor)).toEqual([null, null, null]);
    });

    it('5. despesa por centro de custo contra a média dos 90 dias anteriores', async () => {
      await cenario();

      const despesas = (await indicadores()).get('despesas-centro-custo');

      expect(pontos(despesas)).toEqual({
        Limpeza: [300, 310],
        'Sem centro de custo': [100, 0],
      });
      expect(despesas).toMatchObject({ comparacao: 'MEDIA_90_DIAS', valor: 400, anterior: 310 });
    });

    it('6. estoque: consumo do mês por categoria contra o esperado, sem total geral', async () => {
      await cenario();

      const estoque = (await indicadores()).get('estoque');

      expect(pontos(estoque)).toEqual({ 'Material de limpeza': [12, 31] });
      expect(estoque).toMatchObject({ valor: null, anterior: null });
      expect(estoque?.avisos).toEqual(['ESTOQUE_POR_CATEGORIA']);
    });

    it('7. leads por origem, mês contra o anterior', async () => {
      await cenario();

      const leads = (await indicadores()).get('leads');

      expect(pontos(leads)).toEqual({ Instagram: [2, 1], 'Sem origem': [1, 0] });
      expect(leads).toMatchObject({ valor: 3, anterior: 1, variacao: 200 });
    });

    it('8. visitas: marcadas e realizadas, médicos visitados e visitas recebidas indisponíveis', async () => {
      await cenario();

      const visitas = (await indicadores()).get('visitas');

      expect(visitas).toMatchObject({ valor: 1, anterior: 1 });
      expect(pontos(visitas)).toEqual({
        'Visitas agendadas': [2, 1],
        'Visitas realizadas': [1, 1],
        'Visitas recebidas na clínica': [null, null],
      });
      expect(visitas?.detalhe).toEqual([
        { rotulo: 'Dr. Fictício', chave: null, valor: 1, anterior: null },
      ]);
      expect(visitas?.avisos).toEqual(['VISITAS_RECEBIDAS_INDISPONIVEL']);
    });

    it('9. NPS dos médicos: o mês, o anterior (diferença em pontos) e meses sem resposta vazios', async () => {
      await cenario();

      const nps = (await indicadores()).get('nps-medicos');

      expect(nps).toMatchObject({ formato: 'nps', valor: 50, anterior: 100, variacao: -50 });
      expect(nps?.serie.map((p) => p.valor)).toEqual([null, null, null, null, 100, 50]);
    });

    it('10. NPS dos pacientes, avisando que a pesquisa não separa a recepção', async () => {
      await cenario();

      const nps = (await indicadores()).get('nps-pacientes');

      expect(nps).toMatchObject({ valor: 0, anterior: 100, variacao: -100 });
      expect(nps?.serie.map((p) => p.valor)).toEqual([null, null, null, null, 100, 0]);
      expect(nps?.avisos).toEqual(['NPS_PACIENTES_TODOS']);
    });

    it('mostra só os indicadores das telas que o usuário pode ver', async () => {
      const financeiro = await criarUsuarioTeste(app, {
        permissoes: [TELA_VER, 'financeiro.contas-receber.ver'],
      });

      const lista = await indicadores(financeiro);

      expect([...lista.keys()]).toEqual(['faturamento', 'faturamento-futuro', 'faturamento-produto']);
    });

    it('400 para mês ausente ou inválido', async () => {
      for (const query of [{}, { mes: '2026-13' }, { mes: 'outubro' }, { mes: '2026-10-01' }]) {
        const res = await http().get(BASE).query(query).expect(400);
        expect(apiErrorSchema.parse(res.body).code).toBe('VALIDATION_ERROR');
      }
    });

    it('403 sem a permissão da tela Relatórios', async () => {
      const semTela = await criarUsuarioTeste(app, { permissoes: DADOS });

      await http(semTela).get(BASE).query(OUTUBRO).expect(403);
    });

    it('403 para o usuário restrito aos profissionais vinculados', async () => {
      const medico = await prisma.profissional.create({
        data: { nome: 'Dra. Outra', corCalendario: 'azul' },
      });
      const restrito = await criarUsuarioTeste(app, {
        permissoes: TODAS,
        escopoDados: 'PROFISSIONAIS_VINCULADOS',
        profissionalIds: [medico.id],
      });

      const res = await http(restrito).get(BASE).query(OUTUBRO).expect(403);

      expect(apiErrorSchema.parse(res.body).message).toBe('Sem permissão');
    });

    it('401 sem login', async () => {
      await request(app.getHttpServer()).get(BASE).query(OUTUBRO).expect(401);
    });
  });

  describe('GET /configuracoes-gestao/apresentacao-mensal/pdf', () => {
    it('gera o PDF com uma página por indicador e audita a exportação', async () => {
      await cenario();

      const res = await respostaBinaria(http().get(PDF).query(OUTUBRO)).expect(200);

      expect(res.headers['content-type']).toContain('application/pdf');
      expect(res.headers['content-disposition']).toContain('apresentacao-mensal-2026-10.pdf');
      const pdf = res.body as Buffer;
      expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
      expect(paginasDoPdf(pdf)).toBe(10);
      await expectAudit(prisma, {
        action: 'EXPORT',
        entity: ENTIDADE_APRESENTACAO_MENSAL,
        entityId: '*',
        after: { filtros: OUTUBRO },
        userId: usuario.id,
      });
    });

    it('o PDF só leva os indicadores que o usuário pode ver', async () => {
      const financeiro = await criarUsuarioTeste(app, {
        permissoes: [TELA_VER, TELA_EXPORTAR, 'financeiro.contas-receber.ver'],
      });

      const res = await respostaBinaria(http(financeiro).get(PDF).query(OUTUBRO)).expect(200);

      expect(paginasDoPdf(res.body as Buffer)).toBe(3);
    });

    it('400 para mês inválido, sem auditar', async () => {
      await http().get(PDF).query({ mes: '2026-99' }).expect(400);

      await expectNoAudit(prisma, { action: 'EXPORT', entity: ENTIDADE_APRESENTACAO_MENSAL });
    });

    it('403 sem a permissão de exportar, sem auditar', async () => {
      const soVer = await criarUsuarioTeste(app, { permissoes: [TELA_VER, ...DADOS] });

      await http(soVer).get(PDF).query(OUTUBRO).expect(403);

      await expectNoAudit(prisma, { action: 'EXPORT', entity: ENTIDADE_APRESENTACAO_MENSAL });
    });

    it('403 para o usuário restrito, sem auditar', async () => {
      const medico = await prisma.profissional.create({
        data: { nome: 'Dra. Outra', corCalendario: 'azul' },
      });
      const restrito = await criarUsuarioTeste(app, {
        permissoes: TODAS,
        escopoDados: 'PROFISSIONAIS_VINCULADOS',
        profissionalIds: [medico.id],
      });

      await http(restrito).get(PDF).query(OUTUBRO).expect(403);

      await expectNoAudit(prisma, { action: 'EXPORT', entity: ENTIDADE_APRESENTACAO_MENSAL });
    });
  });
});
