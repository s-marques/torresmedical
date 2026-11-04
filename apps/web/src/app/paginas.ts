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
  'comercial-atendimento.orcamentos': lazy(
    () => import('@/features/comercial-atendimento/orcamentos/OrcamentosPage'),
  ),
  'comercial-atendimento.vendas-pdv': lazy(
    () => import('@/features/comercial-atendimento/vendas/VendasPage'),
  ),
  'comercial-atendimento.origens-cliente': lazy(
    () => import('@/features/comercial-atendimento/origens-cliente/OrigensClientePage'),
  ),
  'compras-estoque.categorias': lazy(
    () => import('@/features/compras-estoque/categorias/CategoriasPage'),
  ),
  'compras-estoque.fornecedores': lazy(
    () => import('@/features/compras-estoque/fornecedores/FornecedoresPage'),
  ),
  'compras-estoque.produtos-servicos': lazy(
    () => import('@/features/compras-estoque/produtos-servicos/ProdutosServicosPage'),
  ),
  'financeiro.caixas': lazy(() => import('@/features/financeiro/caixas/CaixasPage')),
  'financeiro.contas-receber': lazy(
    () => import('@/features/financeiro/contas-receber/ContasReceberPage'),
  ),
  'financeiro.formas-pagamento': lazy(
    () => import('@/features/financeiro/formas-pagamento/FormasPagamentoPage'),
  ),
  'financeiro.plano-contas': lazy(
    () => import('@/features/financeiro/plano-contas/PlanoContasPage'),
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
  'gestao-profissionais.protocolos': lazy(
    () => import('@/features/gestao-profissionais/protocolos/ProtocolosPage'),
  ),
  'painel.painel': lazy(() => import('@/features/painel/painel/PainelPage')),
  'regulatorio-qualidade.funcionarios': lazy(
    () => import('@/features/regulatorio-qualidade/funcionarios/FuncionariosPage'),
  ),
  'configuracoes-gestao.tipos-agendamento': lazy(
    () => import('@/features/configuracoes-gestao/tipos-agendamento/TiposAgendamentoPage'),
  ),
  'configuracoes-gestao.respostas-rapidas': lazy(
    () => import('@/features/configuracoes-gestao/respostas-rapidas/RespostasRapidasPage'),
  ),
  'configuracoes-gestao.relatorios': lazy(
    () => import('@/features/configuracoes-gestao/relatorios/RelatoriosGestaoPage'),
  ),
};
