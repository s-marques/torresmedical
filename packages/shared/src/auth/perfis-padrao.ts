import { TELAS, type TelaId } from '../menu/menu';
import { PERMISSOES, PERMISSOES_EXTRAS, type Acao, type Permissao } from './permissoes';
import type { EscopoDadosPerfil } from '../schemas/configuracoes-gestao/perfil';

/**
 * Perfis de acesso padrão (issue #154; requisitos R §14: "acesso mínimo para cada função").
 * Fonte única do seed e da migration `perfis_padrao`. A matriz perfil × tela está em
 * `docs/requisitos-cliente/matriz-perfis-telas.md`, gerada daqui.
 *
 * **Telas novas:** declare a tela em ao menos um perfil abaixo ou em
 * `TELAS_SOMENTE_ADMINISTRADOR` (o teste do catálogo falha se faltar).
 */

/** Nível de acesso a uma tela: conjunto de ações liberadas. */
export const NIVEIS_ACESSO = {
  /** ver, criar, editar, excluir, exportar. */
  T: ['ver', 'criar', 'editar', 'excluir', 'exportar'],
  /** ver, criar, editar, exportar. */
  E: ['ver', 'criar', 'editar', 'exportar'],
  /** ver, criar, editar. */
  C: ['ver', 'criar', 'editar'],
  /** ver, exportar. */
  L: ['ver', 'exportar'],
  /** ver. */
  V: ['ver'],
} as const satisfies Record<string, readonly Acao[]>;

export type NivelAcesso = keyof typeof NIVEIS_ACESSO;

export type AcessosPorTela = Readonly<Partial<Record<TelaId, NivelAcesso>>>;

export interface PerfilPadrao {
  nome: string;
  descricao: string;
  escopoDados: EscopoDadosPerfil;
  /** Telas e o nível de acesso. O Administrador não lista nada: recebe todo o catálogo. */
  telas: AcessosPorTela;
  /** Permissões extras (fora das telas) concedidas ao perfil. */
  extras: readonly Permissao[];
}

export const PERFIL_ADMINISTRADOR = 'Administrador';
export const PERFIL_GERENCIA = 'Gerência';
export const PERFIL_RECEPCAO = 'Recepção';
export const PERFIL_MEDICO = 'Médico';
export const PERFIL_FINANCEIRO = 'Financeiro';
export const PERFIL_COMERCIAL = 'Comercial';

const GERENCIA: AcessosPorTela = {
  'painel.painel': 'L',
  'comercial-atendimento.pipeline': 'L',
  'comercial-atendimento.negocios': 'L',
  'comercial-atendimento.atividades': 'L',
  'comercial-atendimento.pacientes': 'L',
  'comercial-atendimento.origens-cliente': 'L',
  'comercial-atendimento.agenda': 'L',
  'comercial-atendimento.recepcao': 'L',
  'comercial-atendimento.confirmacoes': 'L',
  'comercial-atendimento.orcamentos': 'L',
  'comercial-atendimento.vendas-pdv': 'L',
  'comercial-atendimento.pacotes': 'L',
  'comercial-atendimento.mensalidades': 'L',
  'comercial-atendimento.whatsapp': 'L',
  'comercial-atendimento.campanhas': 'L',
  'comercial-atendimento.grupos-whatsapp': 'L',
  'comercial-atendimento.pesquisa-nps': 'L',
  'comercial-atendimento.pesquisa-profissional': 'L',
  'comercial-atendimento.relatorios': 'L',
  'consultorio-assistencial.relatorios': 'L',
  'gestao-profissionais.salas': 'E',
  'gestao-profissionais.profissionais': 'E',
  'gestao-profissionais.onboarding': 'E',
  'gestao-profissionais.servicos-profissionais': 'E',
  'gestao-profissionais.protocolos': 'E',
  'gestao-profissionais.receita-profissionais': 'L',
  'gestao-profissionais.relatorios': 'L',
  'financeiro.caixas': 'L',
  'financeiro.contas-receber': 'L',
  'financeiro.contas-pagar': 'L',
  'financeiro.conciliacao': 'L',
  'financeiro.formas-pagamento': 'L',
  'financeiro.plano-contas': 'L',
  'financeiro.relatorios': 'L',
  'financeiro.indicadores': 'L',
  'financeiro.inadimplencia': 'L',
  'patrimonio-pessoal.patrimonio': 'L',
  'patrimonio-pessoal.imoveis': 'L',
  'patrimonio-pessoal.veiculos': 'L',
  'compras-estoque.estoque': 'L',
  'compras-estoque.entrada-compras': 'L',
  'compras-estoque.fornecedores': 'L',
  'compras-estoque.produtos-servicos': 'L',
  'compras-estoque.categorias': 'L',
  'compras-estoque.baixa-insumos': 'L',
  'compras-estoque.lotes-validade': 'L',
  'compras-estoque.pedidos-transito': 'L',
  'compras-estoque.relatorios': 'L',
  'regulatorio-qualidade.alvaras-licencas': 'L',
  'regulatorio-qualidade.funcionarios': 'E',
  'regulatorio-qualidade.treinamentos': 'E',
  'regulatorio-qualidade.nao-conformidades': 'E',
  'regulatorio-qualidade.coleta-residuos': 'L',
  'regulatorio-qualidade.fiscal': 'L',
  'regulatorio-qualidade.relatorios': 'L',
  'configuracoes-gestao.relatorios': 'L',
  'configuracoes-gestao.usuarios': 'E',
  'configuracoes-gestao.perfis-acesso': 'E',
  'configuracoes-gestao.ai-growth': 'L',
  'configuracoes-gestao.agentes-ia': 'V',
  'configuracoes-gestao.instrucoes-agente': 'V',
  'configuracoes-gestao.base-conhecimento': 'V',
  'configuracoes-gestao.bypass-agente': 'V',
  'configuracoes-gestao.tipos-agendamento': 'E',
  'configuracoes-gestao.respostas-rapidas': 'E',
  'configuracoes-gestao.configuracoes': 'V',
  'configuracoes-gestao.minha-empresa': 'E',
  'painel.busca-inteligente': 'V',
};

const RECEPCAO: AcessosPorTela = {
  'painel.painel': 'V',
  'painel.busca-inteligente': 'V',
  'comercial-atendimento.atividades': 'C',
  'comercial-atendimento.pacientes': 'E',
  'comercial-atendimento.origens-cliente': 'V',
  'comercial-atendimento.agenda': 'T',
  'comercial-atendimento.recepcao': 'T',
  'comercial-atendimento.confirmacoes': 'E',
  'comercial-atendimento.orcamentos': 'E',
  'comercial-atendimento.vendas-pdv': 'E',
  'comercial-atendimento.pacotes': 'V',
  'comercial-atendimento.mensalidades': 'V',
  'comercial-atendimento.whatsapp': 'C',
  'comercial-atendimento.pesquisa-nps': 'V',
  'gestao-profissionais.salas': 'V',
  'gestao-profissionais.profissionais': 'V',
  'gestao-profissionais.servicos-profissionais': 'V',
  'compras-estoque.produtos-servicos': 'V',
  'configuracoes-gestao.tipos-agendamento': 'V',
  'configuracoes-gestao.respostas-rapidas': 'V',
};

const MEDICO: AcessosPorTela = {
  'painel.painel': 'V',
  'painel.busca-inteligente': 'V',
  'comercial-atendimento.pacientes': 'V',
  'comercial-atendimento.agenda': 'C',
  'comercial-atendimento.pesquisa-profissional': 'V',
  'consultorio-assistencial.atendimento-medico': 'C',
  'consultorio-assistencial.receituarios': 'E',
  'consultorio-assistencial.prontuarios': 'E',
  'consultorio-assistencial.evolucao-voz': 'C',
  'consultorio-assistencial.soroterapia': 'E',
  'consultorio-assistencial.prestadores': 'V',
  'consultorio-assistencial.encaminhamentos': 'C',
  'consultorio-assistencial.relatorios': 'L',
  'gestao-profissionais.salas': 'V',
  'gestao-profissionais.profissionais': 'V',
  'gestao-profissionais.servicos-profissionais': 'V',
  'gestao-profissionais.protocolos': 'V',
  'gestao-profissionais.receita-profissionais': 'V',
  'compras-estoque.produtos-servicos': 'V',
};

const FINANCEIRO: AcessosPorTela = {
  'painel.painel': 'V',
  'comercial-atendimento.agenda': 'V',
  'comercial-atendimento.orcamentos': 'V',
  'comercial-atendimento.vendas-pdv': 'L',
  'comercial-atendimento.pacotes': 'V',
  'comercial-atendimento.mensalidades': 'E',
  'gestao-profissionais.profissionais': 'V',
  'gestao-profissionais.onboarding': 'V',
  'gestao-profissionais.receita-profissionais': 'L',
  'gestao-profissionais.relatorios': 'L',
  'financeiro.caixas': 'T',
  'financeiro.contas-receber': 'T',
  'financeiro.contas-pagar': 'T',
  'financeiro.conciliacao': 'T',
  'financeiro.formas-pagamento': 'T',
  'financeiro.plano-contas': 'T',
  'financeiro.relatorios': 'L',
  'financeiro.indicadores': 'L',
  'financeiro.inadimplencia': 'T',
  'patrimonio-pessoal.patrimonio': 'L',
  'patrimonio-pessoal.imoveis': 'L',
  'patrimonio-pessoal.veiculos': 'L',
  'compras-estoque.estoque': 'V',
  'compras-estoque.entrada-compras': 'E',
  'compras-estoque.fornecedores': 'E',
  'compras-estoque.produtos-servicos': 'V',
  'compras-estoque.categorias': 'V',
  'compras-estoque.pedidos-transito': 'V',
  'compras-estoque.relatorios': 'L',
  'regulatorio-qualidade.alvaras-licencas': 'V',
  'regulatorio-qualidade.funcionarios': 'V',
  'regulatorio-qualidade.fiscal': 'E',
  'regulatorio-qualidade.relatorios': 'L',
};

const COMERCIAL: AcessosPorTela = {
  'painel.painel': 'V',
  'painel.busca-inteligente': 'V',
  'comercial-atendimento.pipeline': 'T',
  'comercial-atendimento.negocios': 'T',
  'comercial-atendimento.atividades': 'T',
  'comercial-atendimento.pacientes': 'C',
  'comercial-atendimento.origens-cliente': 'T',
  'comercial-atendimento.agenda': 'V',
  'comercial-atendimento.orcamentos': 'E',
  'comercial-atendimento.vendas-pdv': 'V',
  'comercial-atendimento.pacotes': 'E',
  'comercial-atendimento.mensalidades': 'V',
  'comercial-atendimento.whatsapp': 'E',
  'comercial-atendimento.campanhas': 'T',
  'comercial-atendimento.grupos-whatsapp': 'T',
  'comercial-atendimento.pesquisa-nps': 'E',
  'comercial-atendimento.pesquisa-profissional': 'E',
  'comercial-atendimento.relatorios': 'L',
  'gestao-profissionais.profissionais': 'E',
  'gestao-profissionais.onboarding': 'V',
  'gestao-profissionais.servicos-profissionais': 'V',
  'gestao-profissionais.receita-profissionais': 'V',
  'gestao-profissionais.relatorios': 'L',
  'compras-estoque.produtos-servicos': 'V',
  'configuracoes-gestao.ai-growth': 'L',
  'configuracoes-gestao.respostas-rapidas': 'E',
};

export const PERFIS_PADRAO: readonly PerfilPadrao[] = [
  {
    nome: PERFIL_ADMINISTRADOR,
    descricao: 'Acesso total ao sistema',
    escopoDados: 'TODOS',
    telas: {},
    extras: PERMISSOES_EXTRAS,
  },
  {
    nome: PERFIL_GERENCIA,
    descricao: 'Indicadores, contratos, ocupação, financeiro e gestão',
    escopoDados: 'TODOS',
    telas: GERENCIA,
    extras: [
      'gestao-profissionais.profissionais-documentos.validar',
      'configuracoes-gestao.dados-pessoais.exportar',
      // Quem lança e dá baixa (Financeiro) não aprova a conta (issue #164).
      'financeiro.contas-pagar.aprovar',
    ],
  },
  {
    nome: PERFIL_RECEPCAO,
    descricao: 'Agenda e dados administrativos necessários ao atendimento',
    escopoDados: 'TODOS',
    telas: RECEPCAO,
    extras: [],
  },
  {
    nome: PERFIL_MEDICO,
    descricao: 'Agenda e prontuário dos pacientes vinculados ao médico',
    escopoDados: 'PROFISSIONAIS_VINCULADOS',
    telas: MEDICO,
    // Só o médico assina o atendimento e registra adendo (issue #151).
    extras: ['consultorio-assistencial.prontuarios.assinar'],
  },
  {
    nome: PERFIL_FINANCEIRO,
    descricao: 'Financeiro, documentos e contratos necessários',
    escopoDados: 'TODOS',
    telas: FINANCEIRO,
    extras: ['configuracoes-gestao.dados-pessoais.exportar'],
  },
  {
    nome: PERFIL_COMERCIAL,
    descricao: 'CRM dos profissionais e leads, sem acesso ao conteúdo clínico',
    escopoDados: 'TODOS',
    telas: COMERCIAL,
    extras: [],
  },
];

/** Telas que só o Administrador acessa (declaradas de propósito). */
export const TELAS_SOMENTE_ADMINISTRADOR: readonly TelaId[] = [
  /** Consulta da trilha de auditoria (issue #155). */
  'configuracoes-gestao.auditoria',
  /** Cadastro dos motivos de cancelamento (issue #162). */
  'configuracoes-gestao.motivos-cancelamento',
];

/** Perfis que nunca recebem permissão clínica (R §14). */
export const PERFIS_SEM_ACESSO_CLINICO: readonly string[] = [
  PERFIL_RECEPCAO,
  PERFIL_COMERCIAL,
  PERFIL_FINANCEIRO,
];

/** Permissões clínicas: todo o módulo assistencial e a consulta do audit_log. */
export const PERMISSOES_CLINICAS: readonly Permissao[] = PERMISSOES.filter(
  (permissao) =>
    permissao.startsWith('consultorio-assistencial.') ||
    permissao.startsWith('configuracoes-gestao.auditoria.'),
);

/** Permissões de um perfil padrão (o Administrador recebe todo o catálogo). */
export function permissoesDoPerfilPadrao(perfil: PerfilPadrao): Permissao[] {
  if (perfil.nome === PERFIL_ADMINISTRADOR) return [...PERMISSOES];
  const permissoes = new Set<Permissao>(perfil.extras);
  for (const [telaId, nivel] of Object.entries(perfil.telas) as [TelaId, NivelAcesso][]) {
    for (const acao of NIVEIS_ACESSO[nivel]) permissoes.add(`${telaId}.${acao}`);
  }
  return [...permissoes];
}

export function perfilPadraoPorNome(nome: string): PerfilPadrao | undefined {
  return PERFIS_PADRAO.find((perfil) => perfil.nome === nome);
}

/** Telas do menu que nenhum perfil padrão (nem a lista só-Administrador) declara. */
export function telasSemPerfilPadrao(): TelaId[] {
  const declaradas = new Set<TelaId>(TELAS_SOMENTE_ADMINISTRADOR);
  for (const perfil of PERFIS_PADRAO) {
    for (const telaId of Object.keys(perfil.telas) as TelaId[]) declaradas.add(telaId);
  }
  return TELAS.filter((tela) => !declaradas.has(tela.id)).map((tela) => tela.id);
}
