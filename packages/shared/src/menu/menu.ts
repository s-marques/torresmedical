/**
 * Menu lateral: módulo → telas → rota → permissão, na ordem e com os nomes de
 * `docs/inventario/README.md` (9 módulos, 70 telas). As rotas são as URLs do sistema atual.
 *
 * O id do módulo é o do módulo Nest (`apps/api/src/modules/<modulo>`). O recurso é o nome da
 * tela em kebab-case, sem acento e sem conectivos (`Contas a Receber` → `contas-receber`).
 * A permissão para ver a tela no menu é `<modulo>.<recurso>.ver`.
 */
const DEFINICAO = [
  {
    id: 'painel',
    nome: 'PAINEL',
    telas: [
      { recurso: 'painel', nome: 'Painel', rota: '/' },
      { recurso: 'busca-inteligente', nome: 'Busca Inteligente', rota: '/busca' },
    ],
  },
  {
    id: 'comercial-atendimento',
    nome: 'COMERCIAL / ATENDIMENTO',
    telas: [
      { recurso: 'pipeline', nome: 'Pipeline', rota: '/crm' },
      { recurso: 'negocios', nome: 'Negócios', rota: '/negocios' },
      { recurso: 'atividades', nome: 'Atividades', rota: '/atividades' },
      { recurso: 'pacientes', nome: 'Pacientes', rota: '/clientes' },
      { recurso: 'origens-cliente', nome: 'Origens de Cliente', rota: '/origens-cliente' },
      { recurso: 'agenda', nome: 'Agenda', rota: '/agenda' },
      { recurso: 'confirmacoes', nome: 'Confirmações', rota: '/confirmacoes' },
      { recurso: 'orcamentos', nome: 'Orçamentos', rota: '/orcamentos' },
      { recurso: 'vendas-pdv', nome: 'Vendas/PDV', rota: '/vendas' },
      { recurso: 'pacotes', nome: 'Pacotes', rota: '/pacotes' },
      { recurso: 'mensalidades', nome: 'Mensalidades', rota: '/mensalidades' },
      { recurso: 'whatsapp', nome: 'WhatsApp', rota: '/atendimento' },
      { recurso: 'campanhas', nome: 'Campanhas', rota: '/campanhas' },
      { recurso: 'grupos-whatsapp', nome: 'Grupos WhatsApp', rota: '/grupos-whatsapp' },
      { recurso: 'pesquisa-nps', nome: 'Pesquisa NPS', rota: '/pesquisa-satisfacao' },
      { recurso: 'relatorios', nome: 'Relatórios', rota: '/crm/relatorios' },
    ],
  },
  {
    id: 'consultorio-assistencial',
    nome: 'CONSULTÓRIO / ASSISTENCIAL',
    telas: [
      { recurso: 'atendimento-medico', nome: 'Atendimento Médico', rota: '/atendimento-medico' },
      { recurso: 'receituarios', nome: 'Receituários', rota: '/receituarios' },
      { recurso: 'prontuarios', nome: 'Prontuários', rota: '/prontuarios' },
      { recurso: 'evolucao-voz', nome: 'Evolução por Voz', rota: '/evolucoes' },
      { recurso: 'soroterapia', nome: 'Soroterapia', rota: '/soroterapia' },
      { recurso: 'prestadores', nome: 'Prestadores', rota: '/prestadores' },
      { recurso: 'relatorios', nome: 'Relatórios', rota: '/assistencial/relatorios' },
    ],
  },
  {
    id: 'gestao-profissionais',
    nome: 'GESTÃO PROFISSIONAIS',
    telas: [
      { recurso: 'salas', nome: 'Salas', rota: '/salas' },
      { recurso: 'profissionais', nome: 'Profissionais', rota: '/profissionais' },
      {
        recurso: 'servicos-profissionais',
        nome: 'Serviços Profissionais',
        rota: '/servicos-profissionais',
      },
      { recurso: 'protocolos', nome: 'Protocolos', rota: '/protocolos' },
      {
        recurso: 'receita-profissionais',
        nome: 'Receita Profissionais',
        rota: '/receita-profissionais',
      },
      { recurso: 'relatorios', nome: 'Relatórios', rota: '/receita-profissionais/relatorios' },
    ],
  },
  {
    id: 'financeiro',
    nome: 'FINANCEIRO',
    telas: [
      { recurso: 'caixas', nome: 'Caixas', rota: '/caixas' },
      { recurso: 'contas-receber', nome: 'Contas a Receber', rota: '/receber' },
      { recurso: 'contas-pagar', nome: 'Contas a Pagar', rota: '/pagar' },
      { recurso: 'conciliacao', nome: 'Conciliação', rota: '/conciliacao' },
      { recurso: 'formas-pagamento', nome: 'Formas de Pagamento', rota: '/formas-pgto' },
      { recurso: 'plano-contas', nome: 'Plano de Contas', rota: '/plano-contas' },
      { recurso: 'relatorios', nome: 'Relatórios', rota: '/financeiro/relatorios' },
      { recurso: 'indicadores', nome: 'Indicadores', rota: '/financeiro/indicadores' },
    ],
  },
  {
    id: 'patrimonio-pessoal',
    nome: 'PATRIMÔNIO & PESSOAL',
    telas: [
      { recurso: 'patrimonio', nome: 'Patrimônio', rota: '/patrimonio' },
      { recurso: 'imoveis', nome: 'Imóveis', rota: '/imoveis' },
      { recurso: 'veiculos', nome: 'Veículos', rota: '/veiculos' },
    ],
  },
  {
    id: 'compras-estoque',
    nome: 'COMPRAS / ESTOQUE',
    telas: [
      { recurso: 'estoque', nome: 'Estoque', rota: '/estoque' },
      { recurso: 'entrada-compras', nome: 'Entrada de Compras', rota: '/compras' },
      { recurso: 'fornecedores', nome: 'Fornecedores', rota: '/fornecedores' },
      { recurso: 'produtos-servicos', nome: 'Produtos/Serviços', rota: '/produtos' },
      { recurso: 'categorias', nome: 'Categorias', rota: '/categorias' },
      { recurso: 'baixa-insumos', nome: 'Baixa de Insumos', rota: '/baixa-insumos' },
      { recurso: 'lotes-validade', nome: 'Lotes / Validade', rota: '/lotes' },
      { recurso: 'pedidos-transito', nome: 'Pedidos em Trânsito', rota: '/pedidos-compra' },
      { recurso: 'relatorios', nome: 'Relatórios', rota: '/estoque/relatorios' },
    ],
  },
  {
    id: 'regulatorio-qualidade',
    nome: 'REGULATÓRIO / QUALIDADE',
    telas: [
      { recurso: 'alvaras-licencas', nome: 'Alvarás e Licenças', rota: '/alvaras' },
      { recurso: 'funcionarios', nome: 'Funcionários', rota: '/funcionarios' },
      { recurso: 'treinamentos', nome: 'Treinamentos', rota: '/treinamentos' },
      { recurso: 'nao-conformidades', nome: 'Não Conformidades', rota: '/nao-conformidades' },
      { recurso: 'coleta-residuos', nome: 'Coleta Resíduos', rota: '/coletas-residuo' },
      { recurso: 'fiscal', nome: 'Fiscal', rota: '/fiscal' },
      { recurso: 'relatorios', nome: 'Relatórios', rota: '/regulatorio/relatorios' },
    ],
  },
  {
    id: 'configuracoes-gestao',
    nome: 'CONFIGURAÇÕES / GESTÃO',
    telas: [
      { recurso: 'relatorios', nome: 'Relatórios', rota: '/gestao/relatorios' },
      { recurso: 'usuarios', nome: 'Usuários', rota: '/usuarios' },
      { recurso: 'perfis-acesso', nome: 'Perfis de Acesso', rota: '/perfis' },
      { recurso: 'ai-growth', nome: 'AI Growth', rota: '/ai-growth' },
      { recurso: 'agentes-ia', nome: 'Agentes IA', rota: '/agentes-ia' },
      { recurso: 'instrucoes-agente', nome: 'Instruções Agente', rota: '/agentes-ia/instrucoes' },
      { recurso: 'base-conhecimento', nome: 'Base de Conhecimento', rota: '/base-conhecimento' },
      { recurso: 'bypass-agente', nome: 'Bypass Agente', rota: '/bypass-agente' },
      {
        recurso: 'tipos-agendamento',
        nome: 'Tipos de Agendamento',
        rota: '/config/tipos-agendamento',
      },
      { recurso: 'respostas-rapidas', nome: 'Respostas Rápidas', rota: '/respostas-rapidas' },
      { recurso: 'configuracoes', nome: 'Configurações', rota: '/settings' },
      { recurso: 'minha-empresa', nome: 'Minha Empresa', rota: '/settings/empresa' },
    ],
  },
] as const;

type Definicao = (typeof DEFINICAO)[number];

/** Id de um módulo do inventário (igual ao módulo Nest). */
export type ModuloId = Definicao['id'];

type IdsDasTelas<M> = M extends { id: infer I extends string; telas: readonly (infer T)[] }
  ? T extends { recurso: infer R extends string }
    ? `${I}.${R}`
    : never
  : never;

/** Id de uma tela: `<modulo>.<recurso>`, por exemplo `financeiro.contas-receber`. */
export type TelaId = IdsDasTelas<Definicao>;

export interface TelaMenu {
  id: TelaId;
  modulo: ModuloId;
  nome: string;
  /** URL do sistema atual. */
  rota: string;
  /** Permissão para ver a tela: `<modulo>.<recurso>.ver`. */
  permissao: string;
}

export interface ModuloMenu {
  id: ModuloId;
  nome: string;
  telas: readonly TelaMenu[];
}

/** Ação de permissão que libera a tela no menu. */
export const ACAO_VER = 'ver';

export const MENU: readonly ModuloMenu[] = DEFINICAO.map((modulo) => ({
  id: modulo.id,
  nome: modulo.nome,
  telas: modulo.telas.map((tela) => {
    const id = `${modulo.id}.${tela.recurso}` as TelaId;
    return {
      id,
      modulo: modulo.id,
      nome: tela.nome,
      rota: tela.rota,
      permissao: `${id}.${ACAO_VER}`,
    };
  }),
}));

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
