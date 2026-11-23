/**
 * Menu lateral: módulo → telas → rota → permissão, na ordem e com os nomes de
 * `docs/inventario/README.md` (9 módulos, 70 telas). As rotas são as URLs do sistema atual.
 *
 * O id do módulo é o do módulo Nest (`apps/api/src/modules/<modulo>`). O recurso é o nome da
 * tela em kebab-case, sem acento e sem conectivos (`Contas a Receber` → `contas-receber`).
 * A permissão para ver a tela no menu é `<modulo>.<recurso>.ver`.
 *
 * Aqui módulos e recursos são chaves em camelCase (`contasReceber`), convertidas para
 * kebab-case (`contas-receber`) nos ids. A definição é um objeto com tuplas `[nome, rota]`.
 */
const DEFINICAO = {
  painel: {
    nome: 'PAINEL',
    telas: {
      painel: ['Painel', '/'],
      buscaInteligente: ['Busca Inteligente', '/busca'],
    },
  },
  comercialAtendimento: {
    nome: 'COMERCIAL / ATENDIMENTO',
    telas: {
      pipeline: ['Pipeline', '/crm'],
      negocios: ['Negócios', '/negocios'],
      atividades: ['Atividades', '/atividades'],
      pacientes: ['Pacientes', '/clientes'],
      origensCliente: ['Origens de Cliente', '/origens-cliente'],
      agenda: ['Agenda', '/agenda'],
      confirmacoes: ['Confirmações', '/confirmacoes'],
      orcamentos: ['Orçamentos', '/orcamentos'],
      vendasPdv: ['Vendas/PDV', '/vendas'],
      pacotes: ['Pacotes', '/pacotes'],
      mensalidades: ['Mensalidades', '/mensalidades'],
      whatsapp: ['WhatsApp', '/atendimento'],
      campanhas: ['Campanhas', '/campanhas'],
      gruposWhatsapp: ['Grupos WhatsApp', '/grupos-whatsapp'],
      pesquisaNps: ['Pesquisa NPS', '/pesquisa-satisfacao'],
      pesquisaProfissional: ['Pesquisa do Profissional', '/pesquisa-profissional'],
      relatorios: ['Relatórios', '/crm/relatorios'],
    },
  },
  consultorioAssistencial: {
    nome: 'CONSULTÓRIO / ASSISTENCIAL',
    telas: {
      atendimentoMedico: ['Atendimento Médico', '/atendimento-medico'],
      receituarios: ['Receituários', '/receituarios'],
      prontuarios: ['Prontuários', '/prontuarios'],
      evolucaoVoz: ['Evolução por Voz', '/evolucoes'],
      soroterapia: ['Soroterapia', '/soroterapia'],
      prestadores: ['Prestadores', '/prestadores'],
      encaminhamentos: ['Encaminhamentos', '/encaminhamentos'],
      relatorios: ['Relatórios', '/assistencial/relatorios'],
    },
  },
  gestaoProfissionais: {
    nome: 'GESTÃO PROFISSIONAIS',
    telas: {
      salas: ['Salas', '/salas'],
      profissionais: ['Profissionais', '/profissionais'],
      servicosProfissionais: ['Serviços Profissionais', '/servicos-profissionais'],
      protocolos: ['Protocolos', '/protocolos'],
      receitaProfissionais: ['Receita Profissionais', '/receita-profissionais'],
      relatorios: ['Relatórios', '/receita-profissionais/relatorios'],
    },
  },
  financeiro: {
    nome: 'FINANCEIRO',
    telas: {
      caixas: ['Caixas', '/caixas'],
      contasReceber: ['Contas a Receber', '/receber'],
      contasPagar: ['Contas a Pagar', '/pagar'],
      conciliacao: ['Conciliação', '/conciliacao'],
      formasPagamento: ['Formas de Pagamento', '/formas-pgto'],
      planoContas: ['Plano de Contas', '/plano-contas'],
      relatorios: ['Relatórios', '/financeiro/relatorios'],
      indicadores: ['Indicadores', '/financeiro/indicadores'],
    },
  },
  patrimonioPessoal: {
    nome: 'PATRIMÔNIO & PESSOAL',
    telas: {
      patrimonio: ['Patrimônio', '/patrimonio'],
      imoveis: ['Imóveis', '/imoveis'],
      veiculos: ['Veículos', '/veiculos'],
    },
  },
  comprasEstoque: {
    nome: 'COMPRAS / ESTOQUE',
    telas: {
      estoque: ['Estoque', '/estoque'],
      entradaCompras: ['Entrada de Compras', '/compras'],
      fornecedores: ['Fornecedores', '/fornecedores'],
      produtosServicos: ['Produtos/Serviços', '/produtos'],
      categorias: ['Categorias', '/categorias'],
      baixaInsumos: ['Baixa de Insumos', '/baixa-insumos'],
      lotesValidade: ['Lotes / Validade', '/lotes'],
      pedidosTransito: ['Pedidos em Trânsito', '/pedidos-compra'],
      relatorios: ['Relatórios', '/estoque/relatorios'],
    },
  },
  regulatorioQualidade: {
    nome: 'REGULATÓRIO / QUALIDADE',
    telas: {
      alvarasLicencas: ['Alvarás e Licenças', '/alvaras'],
      funcionarios: ['Funcionários', '/funcionarios'],
      treinamentos: ['Treinamentos', '/treinamentos'],
      naoConformidades: ['Não Conformidades', '/nao-conformidades'],
      coletaResiduos: ['Coleta Resíduos', '/coletas-residuo'],
      fiscal: ['Fiscal', '/fiscal'],
      relatorios: ['Relatórios', '/regulatorio/relatorios'],
    },
  },
  configuracoesGestao: {
    nome: 'CONFIGURAÇÕES / GESTÃO',
    telas: {
      relatorios: ['Relatórios', '/gestao/relatorios'],
      usuarios: ['Usuários', '/usuarios'],
      perfisAcesso: ['Perfis de Acesso', '/perfis'],
      aiGrowth: ['AI Growth', '/ai-growth'],
      agentesIa: ['Agentes IA', '/agentes-ia'],
      instrucoesAgente: ['Instruções Agente', '/agentes-ia/instrucoes'],
      baseConhecimento: ['Base de Conhecimento', '/base-conhecimento'],
      bypassAgente: ['Bypass Agente', '/bypass-agente'],
      tiposAgendamento: ['Tipos de Agendamento', '/config/tipos-agendamento'],
      respostasRapidas: ['Respostas Rápidas', '/respostas-rapidas'],
      configuracoes: ['Configurações', '/settings'],
      minhaEmpresa: ['Minha Empresa', '/settings/empresa'],
    },
  },
} as const;

type Definicao = typeof DEFINICAO;
type ChaveModulo = keyof Definicao;

/** `contasReceber` → `contas-receber`, no tipo. */
type Kebab<S extends string> = S extends `${infer C}${infer R}`
  ? `${C extends Lowercase<C> ? C : `-${Lowercase<C>}`}${Kebab<R>}`
  : '';

/** Id de um módulo do inventário (igual ao módulo Nest). */
export type ModuloId = Kebab<ChaveModulo>;

/** Id de uma tela: `<modulo>.<recurso>`, por exemplo `financeiro.contas-receber`. */
export type TelaId = {
  [M in ChaveModulo]: `${Kebab<M>}.${Kebab<keyof Definicao[M]['telas'] & string>}`;
}[ChaveModulo];

export interface TelaMenu {
  id: TelaId;
  modulo: ModuloId;
  nome: string;
  /** URL do sistema atual. */
  rota: string;
  /** Permissão para ver a tela: `<modulo>.<recurso>.ver`. */
  permissao: `${TelaId}.ver`;
}

export interface ModuloMenu {
  id: ModuloId;
  nome: string;
  telas: readonly TelaMenu[];
}

/**
 * Telas que não estão em `docs/inventario/` (nasceram dos requisitos do cliente de 12/11/2026).
 * O teste do menu compara o inventário com as demais.
 */
export const TELAS_FORA_DO_INVENTARIO: readonly TelaId[] = [
  /** Encaminhamento de pacientes entre profissionais (issue #146, R §26). */
  'consultorio-assistencial.encaminhamentos',
  /** Pesquisa de experiência do profissional (issue #145, R §36). */
  'comercial-atendimento.pesquisa-profissional',
];

/** Ação de permissão que libera a tela no menu. */
export const ACAO_VER = 'ver';

function kebab(chave: string): string {
  return chave.replaceAll(/[A-Z]/g, (letra) => `-${letra.toLowerCase()}`);
}

export const MENU: readonly ModuloMenu[] = Object.entries(DEFINICAO).map(
  ([chaveModulo, { nome, telas }]) => {
    const modulo = kebab(chaveModulo) as ModuloId;
    return {
      id: modulo,
      nome,
      telas: Object.entries(telas).map(([chaveTela, [nomeTela, rota]]) => {
        const id = `${modulo}.${kebab(chaveTela)}` as TelaId;
        return { id, modulo, nome: nomeTela, rota, permissao: `${id}.${ACAO_VER}` };
      }),
    };
  },
);

/** Todas as telas do menu, na ordem do inventário. */
export const TELAS: readonly TelaMenu[] = MENU.flatMap((modulo) => modulo.telas);

/** Tela cuja rota é exatamente `rota` (sem query string), ou `undefined`. */
export function encontrarTelaPorRota(rota: string): TelaMenu | undefined {
  return TELAS.find((tela) => tela.rota === rota);
}

/**
 * Menu só com as telas permitidas. Sem lista de permissões, devolve o menu inteiro
 * (até a autenticação existir). Módulos sem nenhuma tela permitida saem do menu.
 */
export function filtrarMenu(
  menu: readonly ModuloMenu[],
  permissoes?: Iterable<string>,
): readonly ModuloMenu[] {
  if (permissoes === undefined) return menu;
  const permitidas = new Set(permissoes);
  return menu
    .map((modulo) => ({
      ...modulo,
      telas: modulo.telas.filter((tela) => permitidas.has(tela.permissao)),
    }))
    .filter((modulo) => modulo.telas.length > 0);
}
