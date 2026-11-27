import type { AgendamentoStatus } from '@torres/shared';
import { kpi, secao, type ConstrutorAba, type DadosHoje } from '../blocos';

/** Cancelado e "reagendar" saem do dia: o paciente não está mais agendado para hoje. */
const FORA_DO_DIA: readonly AgendamentoStatus[] = ['CANCELADO', 'REAGENDAR'];

function dataBr(dia: string): string {
  const [ano, mes, d] = dia.split('-');
  return `${d}/${mes}/${ano}`;
}

/** Query da lista de Contas a Receber com o mesmo vencimento do período do painel. */
export function linkReceber({ de, ate }: { de: string; ate: string }): string {
  return `/receber?vencimentoDe=${de}&vencimentoAte=${ate}`;
}

/** Atendimentos de hoje com o status do indicador (a Recepção filtra por `status`). */
function linkRecepcao(status?: AgendamentoStatus): string {
  return status ? `/recepcao?status=${status}` : '/recepcao';
}

function secaoOperacao({ atendimento, geral }: DadosHoje) {
  const quantidade = (status: AgendamentoStatus) => atendimento.porStatus[status] ?? 0;
  const agendados = Object.entries(atendimento.porStatus)
    .filter(([status]) => !FORA_DO_DIA.includes(status as AgendamentoStatus))
    .reduce((total, [, n]) => total + n, 0);
  return secao('operacao', 'OPERAÇÃO — HOJE', [
    ...(geral
      ? [
          kpi(
            'profissionais-ativos',
            'Profissionais ativos',
            'inteiro',
            geral.profissionaisAtivos,
            null,
            '/profissionais',
          ),
        ]
      : []),
    kpi(
      'profissionais-atendendo-hoje',
      'Atendendo hoje',
      'inteiro',
      atendimento.profissionaisComAtendimento,
      'com atendimento no dia',
      linkRecepcao(),
    ),
    ...(geral
      ? [
          kpi(
            'salas-ocupadas',
            'Salas ocupadas',
            'inteiro',
            geral.salasOcupadas,
            'agora',
            '/salas',
          ),
          kpi(
            'salas-disponiveis',
            'Salas disponíveis',
            'inteiro',
            Math.max(geral.salasTotal - geral.salasOcupadas, 0),
            'agora',
            '/salas',
          ),
        ]
      : []),
    kpi(
      'pacientes-agendados',
      'Pacientes agendados',
      'inteiro',
      agendados,
      'hoje, sem cancelados',
      linkRecepcao(),
    ),
    kpi(
      'confirmados',
      'Confirmados',
      'inteiro',
      quantidade('CONFIRMADO'),
      null,
      linkRecepcao('CONFIRMADO'),
    ),
    kpi(
      'aguardando',
      'Aguardando',
      'inteiro',
      quantidade('AGUARDANDO'),
      null,
      linkRecepcao('AGUARDANDO'),
    ),
    kpi(
      'atendidos',
      'Atendidos',
      'inteiro',
      quantidade('ATENDIDO'),
      null,
      linkRecepcao('ATENDIDO'),
    ),
    kpi('faltas', 'Faltas', 'inteiro', quantidade('FALTOU'), null, linkRecepcao('FALTOU')),
    kpi(
      'cancelamentos',
      'Cancelamentos',
      'inteiro',
      quantidade('CANCELADO'),
      null,
      linkRecepcao('CANCELADO'),
    ),
  ]);
}

function secaoFinanceiro({ financeiro, periodo }: DadosHoje) {
  if (!financeiro) return [];
  const link = linkReceber(periodo);
  const rotuloPeriodo = `${dataBr(periodo.de)} a ${dataBr(periodo.ate)}`;
  return [
    secao('financeiro', `FINANCEIRO — ${rotuloPeriodo}`, [
      kpi(
        'receita-contratada',
        'Receita contratada',
        'moeda',
        financeiro.receber.contratada,
        'títulos com vencimento no período',
        link,
      ),
      kpi('recebido', 'Recebido', 'moeda', financeiro.receber.recebido, null, link),
      kpi('a-receber', 'A receber', 'moeda', financeiro.receber.aReceber, 'saldo em aberto', link),
      kpi(
        'inadimplencia',
        'Inadimplência',
        'moeda',
        financeiro.vencido.valor,
        `${financeiro.vencido.quantidade} ${financeiro.vencido.quantidade === 1 ? 'título vencido' : 'títulos vencidos'}`,
        '/financeiro/inadimplencia',
      ),
    ]),
  ];
}

function secaoComercial({ comercial }: DadosHoje) {
  if (!comercial) return [];
  const { porMarco } = comercial;
  return [
    secao('comercial', 'COMERCIAL', [
      kpi(
        'leads-ativos',
        'Leads ativos',
        'inteiro',
        porMarco.PRIMEIRO_CONTATO + porMarco.SEM_MARCO,
        'negócios em aberto até o primeiro contato',
        '/crm',
      ),
      kpi(
        'visitas-agendadas',
        'Visitas agendadas',
        'inteiro',
        porMarco.VISITA,
        'negócios em aberto na etapa de visita',
        '/crm',
      ),
      kpi(
        'propostas-abertas',
        'Propostas abertas',
        'inteiro',
        porMarco.PROPOSTA,
        'negócios em aberto na etapa de proposta',
        '/crm',
      ),
      kpi(
        'negociacoes',
        'Negociações',
        'inteiro',
        porMarco.CONTRATO,
        'negócios em aberto na etapa de contrato',
        '/crm',
      ),
      kpi(
        'contratos-aguardando-assinatura',
        'Contratos aguardando assinatura',
        'inteiro',
        comercial.contratosAguardandoAssinatura,
        null,
        '/salas',
      ),
    ]),
  ];
}

/**
 * Visão "Hoje" (#170, R §45 e §29). Os alertas do dia vêm da central de notificações (#160) e o
 * front os mostra acima destes blocos.
 */
export const abaHoje: ConstrutorAba = ({ hoje }) => {
  if (!hoje) return [];
  return [secaoOperacao(hoje), ...secaoFinanceiro(hoje), ...secaoComercial(hoje)];
};
