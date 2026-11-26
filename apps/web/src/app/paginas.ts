import type { TelaId } from '@torres/shared';
import { lazy, type ComponentType } from 'react';

/**
 * Página de cada tela já implementada. Telas fora daqui abrem o placeholder "Em construção".
 * Ao implementar uma tela, registre a página com `lazy`, por exemplo:
 * `'financeiro.contas-receber': lazy(() => import('@/features/financeiro/contas-receber/ContasReceberPage'))`.
 */
export const PAGINAS: Partial<Record<TelaId, ComponentType>> = {
  'comercial-atendimento.relatorios': lazy(
    () => import('@/features/comercial-atendimento/relatorios/RelatoriosComercialPage'),
  ),
  'comercial-atendimento.agenda': lazy(
    () => import('@/features/comercial-atendimento/agenda/AgendaPage'),
  ),
  'comercial-atendimento.recepcao': lazy(
    () => import('@/features/comercial-atendimento/recepcao/RecepcaoPage'),
  ),
  'comercial-atendimento.pacientes': lazy(
    () => import('@/features/comercial-atendimento/pacientes/PacientesPage'),
  ),
  'comercial-atendimento.orcamentos': lazy(
    () => import('@/features/comercial-atendimento/orcamentos/OrcamentosPage'),
  ),
  'comercial-atendimento.pipeline': lazy(
    () => import('@/features/comercial-atendimento/pipeline/PipelinePage'),
  ),
  'comercial-atendimento.negocios': lazy(
    () => import('@/features/comercial-atendimento/negocios/NegociosPage'),
  ),
  'comercial-atendimento.campanhas': lazy(
    () => import('@/features/comercial-atendimento/campanhas/CampanhasPage'),
  ),
  'comercial-atendimento.confirmacoes': lazy(
    () => import('@/features/comercial-atendimento/confirmacoes/ConfirmacoesPage'),
  ),
  'comercial-atendimento.grupos-whatsapp': lazy(
    () => import('@/features/comercial-atendimento/grupos-whatsapp/GruposWhatsappPage'),
  ),
  'comercial-atendimento.pesquisa-nps': lazy(
    () => import('@/features/comercial-atendimento/pesquisa-nps/PesquisaNpsPage'),
  ),
  'comercial-atendimento.pesquisa-profissional': lazy(
    () => import('@/features/comercial-atendimento/pesquisa-profissional/PesquisaProfissionalPage'),
  ),
  'comercial-atendimento.atividades': lazy(
    () => import('@/features/comercial-atendimento/atividades/AtividadesPage'),
  ),
  'comercial-atendimento.mensalidades': lazy(
    () => import('@/features/comercial-atendimento/mensalidades/MensalidadesPage'),
  ),
  'comercial-atendimento.pacotes': lazy(
    () => import('@/features/comercial-atendimento/pacotes/PacotesPage'),
  ),
  'comercial-atendimento.vendas-pdv': lazy(
    () => import('@/features/comercial-atendimento/vendas/VendasPage'),
  ),
  'comercial-atendimento.origens-cliente': lazy(
    () => import('@/features/comercial-atendimento/origens-cliente/OrigensClientePage'),
  ),
  'comercial-atendimento.whatsapp': lazy(
    () => import('@/features/comercial-atendimento/whatsapp/WhatsappPage'),
  ),
  'consultorio-assistencial.atendimento-medico': lazy(
    () => import('@/features/consultorio-assistencial/atendimento-medico/AtendimentoMedicoPage'),
  ),
  'consultorio-assistencial.evolucao-voz': lazy(
    () => import('@/features/consultorio-assistencial/evolucao-voz/EvolucaoVozPage'),
  ),
  'consultorio-assistencial.encaminhamentos': lazy(
    () => import('@/features/consultorio-assistencial/encaminhamentos/EncaminhamentosPage'),
  ),
  'consultorio-assistencial.prestadores': lazy(
    () => import('@/features/consultorio-assistencial/prestadores/PrestadoresPage'),
  ),
  'consultorio-assistencial.prontuarios': lazy(
    () => import('@/features/consultorio-assistencial/prontuarios/ProntuariosPage'),
  ),
  'consultorio-assistencial.receituarios': lazy(
    () => import('@/features/consultorio-assistencial/receituarios/ReceituariosPage'),
  ),
  'consultorio-assistencial.soroterapia': lazy(
    () => import('@/features/consultorio-assistencial/soroterapia/SoroterapiaPage'),
  ),
  'patrimonio-pessoal.patrimonio': lazy(
    () => import('@/features/patrimonio-pessoal/patrimonio/PatrimonioPage'),
  ),
  'patrimonio-pessoal.imoveis': lazy(
    () => import('@/features/patrimonio-pessoal/imoveis/ImoveisPage'),
  ),
  'patrimonio-pessoal.veiculos': lazy(
    () => import('@/features/patrimonio-pessoal/veiculos/VeiculosPage'),
  ),
  'compras-estoque.relatorios': lazy(
    () => import('@/features/compras-estoque/relatorios/RelatoriosEstoquePage'),
  ),
  'compras-estoque.baixa-insumos': lazy(
    () => import('@/features/compras-estoque/baixa-insumos/BaixasInsumosPage'),
  ),
  'compras-estoque.categorias': lazy(
    () => import('@/features/compras-estoque/categorias/CategoriasPage'),
  ),
  'compras-estoque.entrada-compras': lazy(
    () => import('@/features/compras-estoque/compras/ComprasPage'),
  ),
  'compras-estoque.estoque': lazy(() => import('@/features/compras-estoque/estoque/EstoquePage')),
  'compras-estoque.fornecedores': lazy(
    () => import('@/features/compras-estoque/fornecedores/FornecedoresPage'),
  ),
  'compras-estoque.lotes-validade': lazy(
    () => import('@/features/compras-estoque/lotes-validade/LotesValidadePage'),
  ),
  'compras-estoque.pedidos-transito': lazy(
    () => import('@/features/compras-estoque/pedidos-compra/PedidosCompraPage'),
  ),
  'compras-estoque.produtos-servicos': lazy(
    () => import('@/features/compras-estoque/produtos-servicos/ProdutosServicosPage'),
  ),
  'financeiro.caixas': lazy(() => import('@/features/financeiro/caixas/CaixasPage')),
  'financeiro.conciliacao': lazy(() => import('@/features/financeiro/conciliacao/ConciliacaoPage')),
  'financeiro.indicadores': lazy(() => import('@/features/financeiro/indicadores/IndicadoresPage')),
  'financeiro.relatorios': lazy(
    () => import('@/features/financeiro/relatorios/RelatoriosFinanceiroPage'),
  ),
  'financeiro.inadimplencia': lazy(
    () => import('@/features/financeiro/inadimplencia/InadimplenciaPage'),
  ),
  'financeiro.contas-pagar': lazy(
    () => import('@/features/financeiro/contas-pagar/ContasPagarPage'),
  ),
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
  'gestao-profissionais.onboarding': lazy(
    () => import('@/features/gestao-profissionais/onboarding/OnboardingPage'),
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
  'gestao-profissionais.receita-profissionais': lazy(
    () => import('@/features/gestao-profissionais/receita-profissionais/ReceitaProfissionaisPage'),
  ),
  'painel.painel': lazy(() => import('@/features/painel/painel/PainelPage')),
  'regulatorio-qualidade.funcionarios': lazy(
    () => import('@/features/regulatorio-qualidade/funcionarios/FuncionariosPage'),
  ),
  'regulatorio-qualidade.alvaras-licencas': lazy(
    () => import('@/features/regulatorio-qualidade/alvaras-licencas/AlvarasLicencasPage'),
  ),
  'regulatorio-qualidade.nao-conformidades': lazy(
    () => import('@/features/regulatorio-qualidade/nao-conformidades/NaoConformidadesPage'),
  ),
  'regulatorio-qualidade.coleta-residuos': lazy(
    () => import('@/features/regulatorio-qualidade/coletas-residuo/ColetasResiduoPage'),
  ),
  'regulatorio-qualidade.treinamentos': lazy(
    () => import('@/features/regulatorio-qualidade/treinamentos/TreinamentosPage'),
  ),
  'configuracoes-gestao.perfis-acesso': lazy(
    () => import('@/features/configuracoes-gestao/perfis-acesso/PerfisAcessoPage'),
  ),
  'configuracoes-gestao.instrucoes-agente': lazy(
    () => import('@/features/configuracoes-gestao/instrucoes-agente/InstrucoesAgentePage'),
  ),
  'configuracoes-gestao.ai-growth': lazy(
    () => import('@/features/configuracoes-gestao/ai-growth/AiGrowthPage'),
  ),
  'configuracoes-gestao.bypass-agente': lazy(
    () => import('@/features/configuracoes-gestao/bypass-agente/BypassAgentePage'),
  ),
  'configuracoes-gestao.tipos-agendamento': lazy(
    () => import('@/features/configuracoes-gestao/tipos-agendamento/TiposAgendamentoPage'),
  ),
  'configuracoes-gestao.motivos-cancelamento': lazy(
    () => import('@/features/configuracoes-gestao/motivos-cancelamento/MotivosCancelamentoPage'),
  ),
  'configuracoes-gestao.agentes-ia': lazy(
    () => import('@/features/configuracoes-gestao/agentes-ia/AgentesIaPage'),
  ),
  'configuracoes-gestao.respostas-rapidas': lazy(
    () => import('@/features/configuracoes-gestao/respostas-rapidas/RespostasRapidasPage'),
  ),
  'configuracoes-gestao.base-conhecimento': lazy(
    () => import('@/features/configuracoes-gestao/base-conhecimento/BaseConhecimentoPage'),
  ),
  'configuracoes-gestao.relatorios': lazy(
    () => import('@/features/configuracoes-gestao/relatorios/RelatoriosGestaoPage'),
  ),
  'configuracoes-gestao.configuracoes': lazy(
    () => import('@/features/configuracoes-gestao/configuracoes/ConfiguracoesPage'),
  ),
  'configuracoes-gestao.minha-empresa': lazy(
    () => import('@/features/configuracoes-gestao/minha-empresa/MinhaEmpresaPage'),
  ),
  'configuracoes-gestao.auditoria': lazy(
    () => import('@/features/configuracoes-gestao/auditoria/AuditoriaPage'),
  ),
  'configuracoes-gestao.usuarios': lazy(
    () => import('@/features/configuracoes-gestao/usuarios/UsuariosPage'),
  ),
};
