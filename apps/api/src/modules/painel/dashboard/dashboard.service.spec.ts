import type { AbaPainel, ResumoParceiros, SecaoPainel } from '@torres/shared';
import { ABAS_PAINEL, dashboardPainelSchema } from '@torres/shared';
import type { PacientesService } from '../../comercial-atendimento/pacientes/pacientes.service';
import type { ProfissionaisClassificacaoService } from '../../gestao-profissionais/profissionais/profissionais-classificacao.service';
import type { ProfissionaisService } from '../../gestao-profissionais/profissionais/profissionais.service';
import type { IndicadoresFinanceirosService } from '../../financeiro/indicadores/indicadores.service';
import { calcularOcupacao } from '../../../common/ocupacao/calculo-ocupacao';
import type { OcupacaoPainel, OcupacaoService } from '../ocupacao/ocupacao.service';
import { escopoFalso } from '../../../../test/utils/escopo-falso';
import type { AgendaOcupacaoService } from '../../comercial-atendimento/agenda/agenda-ocupacao.service';
import type { NegociosListaService } from '../../comercial-atendimento/pipeline/negocios-lista.service';
import type { RecepcaoService } from '../../comercial-atendimento/recepcao/recepcao.service';
import type { InadimplenciaService } from '../../financeiro/inadimplencia/inadimplencia.service';
import type { ContratosSalaService } from '../../gestao-profissionais/salas/contratos-sala.service';
import type { SalasService } from '../../gestao-profissionais/salas/salas.service';
import { DashboardService } from './dashboard.service';

const SEM_DADOS = calcularOcupacao({
  salas: [],
  dias: [],
  turnos: ['MANHA', 'TARDE', 'NOITE'],
  contratos: [],
  bloqueios: [],
  agendamentos: [],
  profissionalIds: [],
});
const OCUPACAO: OcupacaoPainel = {
  atual: SEM_DADOS,
  anterior: SEM_DADOS,
  periodoAnterior: { de: '2026-09-01', ate: '2026-09-30' },
  rotuloAnterior: 'mês anterior',
  previsao: null,
  profissionais: {},
};

const PARCEIROS: ResumoParceiros = {
  total: 6,
  porClassificacao: { NOVO: 1, ATIVO: 2, ESTRATEGICO: 0, EM_EXPANSAO: 1, EM_RISCO: 1, INATIVO: 1 },
  emRisco: [
    {
      profissionalId: '11111111-1111-4111-8111-111111111111',
      nome: 'Dra. Teste',
      motivoTexto: '1 de 4 períodos usados em 30 dias',
    },
  ],
};

const FILTROS = { modo: 'mes', mes: '2026-10', base: 'recebimento' } as const;

function setup(profissionalIds?: readonly string[]) {
  const profissionais = { contarAtivos: jest.fn().mockResolvedValue(14) };
  const pacientes = { contar: jest.fn().mockResolvedValue(1284) };
  const indicadores: Record<string, jest.Mock> = {
    calcular: jest.fn().mockResolvedValue({
      faturamentoTotal: 9070,
      receitaRecorrente: 7910,
      receitaAvulsa: 1160,
      resultadoOperacional: 2091.75,
      despesasPagas: 6978.25,
    }),
  };
  const ocupacao = { calcular: jest.fn().mockResolvedValue(OCUPACAO) };
  const classificacao = { resumo: jest.fn().mockResolvedValue(PARCEIROS) };
  const recepcao = {
    resumoDoDia: jest.fn().mockResolvedValue({
      porStatus: {
        AGENDADO: 2,
        CONFIRMADO: 3,
        AGUARDANDO: 1,
        ATENDIDO: 4,
        FALTOU: 1,
        CANCELADO: 2,
      },
      profissionaisComAtendimento: 5,
    }),
  };
  const salas = {
    listarParaMatriz: jest.fn().mockResolvedValue([{ id: 's1' }, { id: 's2' }, { id: 's3' }]),
  };
  const agendaOcupacao = { salasOcupadasEm: jest.fn().mockResolvedValue(new Set(['s1', 'x'])) };
  const contratosSala = { contarAguardandoAssinatura: jest.fn().mockResolvedValue(2) };
  const negocios = {
    contarAbertosPorMarco: jest.fn().mockResolvedValue({
      PRIMEIRO_CONTATO: 4,
      VISITA: 3,
      PROPOSTA: 2,
      CONTRATO: 1,
      SEM_MARCO: 1,
    }),
  };
  const inadimplencia = {
    painel: jest.fn().mockResolvedValue({ vencidos: { valor: '350.50', quantidade: 3 } }),
  };
  indicadores.resumoReceber = jest
    .fn()
    .mockResolvedValue({ contratada: 1000, recebido: 600, aReceber: 400 });
  const service = new DashboardService(
    profissionais as unknown as ProfissionaisService,
    pacientes as unknown as PacientesService,
    indicadores as unknown as IndicadoresFinanceirosService,
    ocupacao as unknown as OcupacaoService,
    classificacao as unknown as ProfissionaisClassificacaoService,
    recepcao as unknown as RecepcaoService,
    agendaOcupacao as unknown as AgendaOcupacaoService,
    salas as unknown as SalasService,
    contratosSala as unknown as ContratosSalaService,
    negocios as unknown as NegociosListaService,
    inadimplencia as unknown as InadimplenciaService,
    indicadores as unknown as IndicadoresFinanceirosService,
    escopoFalso(profissionalIds),
  );
  return {
    service,
    profissionais,
    pacientes,
    indicadores,
    ocupacao,
    classificacao,
    recepcao,
    inadimplencia,
  };
}

function valorDoKpi(secoes: SecaoPainel[], id: string): number | null | undefined {
  for (const bloco of secoes.flatMap((s) => s.blocos)) {
    if (bloco.tipo === 'kpi' && bloco.id === id) return bloco.valor;
  }
  return undefined;
}

describe('DashboardService', () => {
  it.each(ABAS_PAINEL)('aba %s: resposta válida, com período e base dos filtros', async (aba) => {
    const { service } = setup();

    const dashboard = await service.obter(aba, FILTROS);

    expect(dashboardPainelSchema.parse(dashboard)).toBeTruthy();
    expect(dashboard).toMatchObject({
      aba,
      periodo: { de: '2026-10-01', ate: '2026-10-31' },
      base: 'recebimento',
    });
    expect(dashboard.secoes.length).toBeGreaterThan(0);
  });

  it('comercial: Médicos Ativos vem dos profissionais ativos; não consulta pacientes', async () => {
    const { service, profissionais, pacientes } = setup();

    const { secoes } = await service.obter('comercial', FILTROS);

    expect(valorDoKpi(secoes, 'medicos-ativos')).toBe(14);
    expect(profissionais.contarAtivos).toHaveBeenCalledTimes(1);
    expect(pacientes.contar).not.toHaveBeenCalled();
  });

  it('pacientes: Total Pacientes vem da contagem; não consulta profissionais', async () => {
    const { service, profissionais, pacientes } = setup();

    const { secoes } = await service.obter('pacientes', FILTROS);

    expect(valorDoKpi(secoes, 'total-pacientes')).toBe(1284);
    expect(pacientes.contar).toHaveBeenCalledTimes(1);
    expect(profissionais.contarAtivos).not.toHaveBeenCalled();
  });

  it.each<AbaPainel>(['executivo', 'ocupacao'])('aba %s não consulta o banco', async (aba) => {
    const { service, profissionais, pacientes } = setup();

    await service.obter(aba, FILTROS);

    expect(profissionais.contarAtivos).not.toHaveBeenCalled();
    expect(pacientes.contar).not.toHaveBeenCalled();
  });

  it('ocupação: calcula com os filtros, o período e a empresa; as outras abas não calculam', async () => {
    const { service, ocupacao } = setup();
    const filtros = { ...FILTROS, salaId: '11111111-1111-4111-8111-111111111111' };

    const { secoes } = await service.obter('ocupacao', filtros, 'empresa-1');

    expect(ocupacao.calcular).toHaveBeenCalledWith(
      filtros,
      { de: '2026-10-01', ate: '2026-10-31' },
      'empresa-1',
    );
    expect(valorDoKpi(secoes, 'total-periodos')).toBe(0);
    expect(valorDoKpi(secoes, 'taxa-uso')).toBeNull();
    await service.obter('executivo', FILTROS);
    expect(ocupacao.calcular).toHaveBeenCalledTimes(1);
  });

  it('financeiro: receita e despesa vêm do service de Indicadores, com o período e a base', async () => {
    const { service, indicadores } = setup();

    const { secoes } = await service.obter('financeiro', FILTROS);

    expect(indicadores.calcular).toHaveBeenCalledWith('2026-10-01', '2026-10-31', 'recebimento');
    expect(valorDoKpi(secoes, 'faturamento-total')).toBe(9070);
    expect(valorDoKpi(secoes, 'receita-recorrente')).toBe(7910);
    expect(valorDoKpi(secoes, 'receita-avulsa')).toBe(1160);
    expect(valorDoKpi(secoes, 'resultado-operacional')).toBe(2091.75);
    expect(valorDoKpi(secoes, 'despesas')).toBe(6978.25);
  });

  it('as outras abas não calculam os indicadores financeiros', async () => {
    const { service, indicadores } = setup();

    await service.obter('executivo', FILTROS);

    expect(indicadores.calcular).not.toHaveBeenCalled();
  });

  it('indicadores sem módulo dono saem sem valor, nunca com número inventado', async () => {
    const { service } = setup();

    const { secoes } = await service.obter('executivo', FILTROS);

    expect(valorDoKpi(secoes, 'faturamento-total')).toBeNull();
  });

  it('executivo: profissionais em risco e em expansão vêm da classificação (#143)', async () => {
    const { service, classificacao } = setup();

    const { secoes } = await service.obter('executivo', FILTROS);

    expect(classificacao.resumo).toHaveBeenCalledTimes(1);
    expect(valorDoKpi(secoes, 'parceiros-em-risco')).toBe(1);
    expect(valorDoKpi(secoes, 'parceiros-em-expansao')).toBe(1);
  });

  it('executivo: alerta de baixa utilização lista quem está em risco e o motivo', async () => {
    const { service } = setup();

    const { secoes } = await service.obter('executivo', FILTROS);

    const alertas = secoes.flatMap((s) => s.blocos).filter((b) => b.tipo === 'alerta');
    expect(alertas).toHaveLength(1);
    expect(alertas[0]).toMatchObject({
      id: 'baixa-utilizacao',
      titulo: '1 profissional com baixa utilização',
      itens: [{ rotulo: 'Dra. Teste', valor: '1 de 4 períodos usados em 30 dias' }],
    });
  });

  it('executivo: sem ninguém em risco não há alerta, e o plural vale para vários', async () => {
    const { service, classificacao } = setup();
    classificacao.resumo.mockResolvedValue({
      ...PARCEIROS,
      porClassificacao: { ...PARCEIROS.porClassificacao, EM_RISCO: 0 },
      emRisco: [],
    });
    const vazio = await service.obter('executivo', FILTROS);
    expect(vazio.secoes.flatMap((s) => s.blocos).some((b) => b.tipo === 'alerta')).toBe(false);

    const outro = {
      ...PARCEIROS.emRisco[0],
      profissionalId: '22222222-2222-4222-8222-222222222222',
    };
    classificacao.resumo.mockResolvedValue({
      ...PARCEIROS,
      emRisco: [...PARCEIROS.emRisco, outro],
    });
    const dois = await service.obter('executivo', FILTROS);
    expect(dois.secoes.flatMap((s) => s.blocos).find((b) => b.tipo === 'alerta')).toMatchObject({
      titulo: '2 profissionais com baixa utilização',
    });
  });

  it('as outras abas não consultam a classificação', async () => {
    const { service, classificacao } = setup();

    await service.obter('comercial', FILTROS);

    expect(classificacao.resumo).not.toHaveBeenCalled();
  });

  it('executivo: metas da tabela Meta vs Atual', async () => {
    const { service } = setup();

    const { secoes } = await service.obter('executivo', FILTROS);

    const meta = secoes.flatMap((s) => s.blocos).find((b) => b.tipo === 'meta-vs-atual');
    expect(meta?.tipo === 'meta-vs-atual' && meta.indicadores).toHaveLength(12);
    expect(
      meta?.tipo === 'meta-vs-atual' &&
        Object.fromEntries(meta.indicadores.filter((i) => i.meta).map((i) => [i.id, i.meta])),
    ).toEqual({ 'taxa-ocupacao': '≥85%', vacancia: '≤15%', cancelamentos: '0', nps: '≥40' });
  });

  describe('aba hoje (#170)', () => {
    const kpis = (secoes: SecaoPainel[]) =>
      Object.fromEntries(
        secoes.flatMap((s) => s.blocos).flatMap((b) => (b.tipo === 'kpi' ? [[b.id, b]] : [])),
      );

    it('confere os números com os dados conhecidos e traz o período nos links do mês', async () => {
      const { service } = setup();

      const { secoes } = await service.obter('hoje', FILTROS);
      const k = kpis(secoes);

      expect(k['profissionais-ativos']?.valor).toBe(14);
      expect(k['profissionais-atendendo-hoje']?.valor).toBe(5);
      expect(k['salas-ocupadas']?.valor).toBe(1);
      expect(k['salas-disponiveis']?.valor).toBe(2);
      // 2 agendados + 3 confirmados + 1 aguardando + 4 atendidos + 1 falta (cancelados ficam fora).
      expect(k['pacientes-agendados']?.valor).toBe(11);
      expect(k['confirmados']?.valor).toBe(3);
      expect(k['faltas']?.valor).toBe(1);
      expect(k['cancelamentos']?.valor).toBe(2);
      expect(k['receita-contratada']?.valor).toBe(1000);
      expect(k['recebido']?.valor).toBe(600);
      expect(k['a-receber']?.valor).toBe(400);
      expect(k['inadimplencia']?.valor).toBe(350.5);
      expect(k['leads-ativos']?.valor).toBe(5);
      expect(k['visitas-agendadas']?.valor).toBe(3);
      expect(k['propostas-abertas']?.valor).toBe(2);
      expect(k['negociacoes']?.valor).toBe(1);
      expect(k['contratos-aguardando-assinatura']?.valor).toBe(2);
      // C3/C5 do DrIntelli: o clique mantém o período escolhido (outubro), não abre outro mês.
      const periodo = 'vencimentoDe=2026-10-01&vencimentoAte=2026-10-31';
      expect(k['receita-contratada']?.link).toBe(`/receber?${periodo}`);
      expect(k['recebido']?.link).toBe(`/receber?${periodo}`);
      expect(k['faltas']?.link).toBe('/recepcao?status=FALTOU');
    });

    it('perfil restrito vê só a agenda dos seus profissionais, sem salas, financeiro e comercial', async () => {
      const { service, inadimplencia } = setup(['11111111-1111-4111-8111-111111111111']);

      const { secoes } = await service.obter('hoje', FILTROS);
      const k = kpis(secoes);

      expect(secoes.map((s) => s.id)).toEqual(['operacao']);
      expect(k['salas-ocupadas']).toBeUndefined();
      expect(k['profissionais-ativos']).toBeUndefined();
      expect(k['pacientes-agendados']?.valor).toBe(11);
      expect(inadimplencia.painel).not.toHaveBeenCalled();
    });
  });
});
