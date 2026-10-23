import type { TelaId } from '@torres/shared';
import { lazy, type ComponentType } from 'react';

/**
 * Página de cada tela já implementada. Telas fora daqui abrem o placeholder "Em construção".
 * Ao implementar uma tela, registre a página com `lazy`, por exemplo:
 * `'financeiro.contas-receber': lazy(() => import('@/features/financeiro/contas-receber/ContasReceberPage'))`.
 */
export const PAGINAS: Partial<Record<TelaId, ComponentType>> = {
  'comercial-atendimento.agenda': lazy(
    () => import('@/features/comercial-atendimento/agenda/AgendaPage'),
  ),
  'comercial-atendimento.pacientes': lazy(
    () => import('@/features/comercial-atendimento/pacientes/PacientesPage'),
  ),
  'comercial-atendimento.origens-cliente': lazy(
    () => import('@/features/comercial-atendimento/origens-cliente/OrigensClientePage'),
  ),
  'compras-estoque.categorias': lazy(
    () => import('@/features/compras-estoque/categorias/CategoriasPage'),
  ),
  'compras-estoque.produtos-servicos': lazy(
    () => import('@/features/compras-estoque/produtos-servicos/ProdutosServicosPage'),
  ),
  'financeiro.formas-pagamento': lazy(
    () => import('@/features/financeiro/formas-pagamento/FormasPagamentoPage'),
  ),
  'gestao-profissionais.profissionais': lazy(
    () => import('@/features/gestao-profissionais/profissionais/ProfissionaisPage'),
  ),
  'gestao-profissionais.salas': lazy(
    () => import('@/features/gestao-profissionais/salas/SalasPage'),
  ),
  'gestao-profissionais.servicos-profissionais': lazy(
    () =>
      import('@/features/gestao-profissionais/servicos-profissionais/ServicosProfissionaisPage'),
  ),
  'painel.painel': lazy(() => import('@/features/painel/painel/PainelPage')),
  'configuracoes-gestao.tipos-agendamento': lazy(
    () => import('@/features/configuracoes-gestao/tipos-agendamento/TiposAgendamentoPage'),
  ),
  'configuracoes-gestao.relatorios': lazy(
    () => import('@/features/configuracoes-gestao/relatorios/RelatoriosGestaoPage'),
  ),
};
