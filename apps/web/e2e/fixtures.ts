import {
  agendamentoListaSchema,
  atendimentoMedicoDetalheSchema,
  atendimentoMedicoPageSchema,
  atividadePageSchema,
  contaPagarPageSchema,
  contaReceberPageSchema,
  dashboardPainelSchema,
  evolucaoPageSchema,
  negocioPageSchema,
  pacienteDadosAtendimentoSchema,
  pacientePageSchema,
  receitaPageSchema,
  recepcaoFilaSchema,
  recepcaoPageSchema,
} from '@torres/shared';
import type { Fixtures } from './api-falsa';
import { amostra } from './amostra';

const rota = (schema: Parameters<typeof amostra>[0]) => () => ({ corpo: amostra(schema) });

/** Id que as amostras usam para qualquer `uuid` (ver `amostra.ts`). */
export const ID_AMOSTRA = '00000000-0000-4000-8000-000000000001';

const ATENDIMENTO = '/api/consultorio-assistencial/atendimento-medico';

/** Respostas com linhas reais (e textos longos) das telas essenciais. Mais específicas primeiro. */
export const FIXTURES: Fixtures = {
  '/api/comercial-atendimento/recepcao/fila': rota(recepcaoFilaSchema),
  '/api/comercial-atendimento/recepcao': rota(recepcaoPageSchema),
  '/api/comercial-atendimento/agendamentos': rota(agendamentoListaSchema),
  '/api/comercial-atendimento/pacientes': rota(pacientePageSchema),
  '/api/comercial-atendimento/negocios': rota(negocioPageSchema),
  '/api/comercial-atendimento/atividades': rota(atividadePageSchema),
  [`${ATENDIMENTO}/${ID_AMOSTRA}/evolucoes`]: rota(evolucaoPageSchema),
  [`${ATENDIMENTO}/${ID_AMOSTRA}/receitas`]: rota(receitaPageSchema),
  [`${ATENDIMENTO}/${ID_AMOSTRA}/paciente`]: rota(pacienteDadosAtendimentoSchema),
  [`${ATENDIMENTO}/${ID_AMOSTRA}`]: rota(atendimentoMedicoDetalheSchema),
  [ATENDIMENTO]: rota(atendimentoMedicoPageSchema),
  '/api/financeiro/contas-pagar': rota(contaPagarPageSchema),
  '/api/financeiro/contas-receber': rota(contaReceberPageSchema),
  '/api/painel/dashboard': rota(dashboardPainelSchema),
};
