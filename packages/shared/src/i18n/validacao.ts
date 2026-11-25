/**
 * Mensagens de validação com chave + parâmetros (issue #205).
 *
 * Os schemas Zod não guardam o texto pronto: pedem a mensagem a um tradutor no momento da
 * validação (`traduzirValidacao`). O padrão é o dicionário em português (`VALIDACAO_PT_BR`),
 * que vale no back; o front registra o seu tradutor (i18next) com `definirTradutorValidacao`
 * e passa a mostrar as mensagens no idioma do usuário.
 */

export type ParametrosValidacao = Readonly<Record<string, string | number>>;

export interface MensagemValidacao {
  /** Chave no dicionário, ex.: `validacao.obrigatorio`. */
  chave: string;
  params?: ParametrosValidacao;
}

export type TradutorValidacao = (mensagem: MensagemValidacao) => string;

/**
 * Dicionário em português. Convenções do i18next, para o mesmo formato servir no front:
 * `{{param}}` interpola, `_one`/`_other` escolhem pelo `count` e `_f` é a variante feminina
 * (parâmetro `genero: 'f'`).
 */
export const VALIDACAO_PT_BR = {
  obrigatorio: '{{campo}} é obrigatório.',
  obrigatorio_f: '{{campo}} é obrigatória.',
  campoMax_one: '{{campo}} deve ter no máximo {{count}} caractere',
  campoMax_other: '{{campo}} deve ter no máximo {{count}} caracteres',
  campoObrigatorio: 'Campo obrigatório',
  valorInvalido: 'Valor inválido',
  opcaoInvalida: 'Opção inválida',
  formatoInvalido: 'Formato inválido',
  formato: {
    email: 'E-mail inválido',
    uuid: 'Identificador inválido',
    guid: 'Identificador inválido',
    url: 'URL inválida',
    datetime: 'Data/hora inválida',
    date: 'Data inválida',
    time: 'Hora inválida',
  },
  textoMin_one: 'Deve ter no mínimo {{count}} caractere',
  textoMin_other: 'Deve ter no mínimo {{count}} caracteres',
  textoMax_one: 'Deve ter no máximo {{count}} caractere',
  textoMax_other: 'Deve ter no máximo {{count}} caracteres',
  itensMin_one: 'Deve ter no mínimo {{count}} item',
  itensMin_other: 'Deve ter no mínimo {{count}} itens',
  itensMax_one: 'Deve ter no máximo {{count}} item',
  itensMax_other: 'Deve ter no máximo {{count}} itens',
  maiorOuIgual: 'Deve ser maior ou igual a {{valor}}',
  maior: 'Deve ser maior que {{valor}}',
  menorOuIgual: 'Deve ser menor ou igual a {{valor}}',
  menor: 'Deve ser menor que {{valor}}',
  multiploDe: 'Deve ser múltiplo de {{valor}}',
  campoNaoPermitido: 'Campo não permitido',
  camposNaoPermitidos: 'Campo não permitido: {{campos}}',
  duplicado: 'Já existe um registro com este valor',
  auth: {
    informeEmail: 'Informe o e-mail',
    informeSenha: 'Informe a senha',
    senhaMin: 'A senha deve ter no mínimo {{min}} caracteres',
    senhaMax: 'A senha deve ter no máximo {{max}} caracteres',
    senhaLetrasNumeros: 'A senha deve ter letras e números',
    credenciaisInvalidas: 'E-mail ou senha inválidos',
    linkInvalido: 'Link de redefinição inválido',
    senhasNaoConferem: 'As senhas não conferem',
    senhaMaiuscula: 'A senha deve ter ao menos uma letra maiúscula',
    senhaSimbolo: 'A senha deve ter ao menos um símbolo (ex.: ! @ # $ %)',
    senhaIgualAtual: 'A senha nova deve ser diferente da atual',
  },
  politica: {
    entre: 'Informe um valor entre {{min}} e {{max}}',
    numeroInvalido: 'Informe um número inteiro',
    booleano: 'Valor inválido',
  },
  periodo: {
    informeDataInicial: 'Informe a data inicial',
    informeDataFinal: 'Informe a data final',
    dataInicialInvalida: 'Data inicial inválida',
    dataFinalInvalida: 'Data final inválida',
    invalido: 'A data inicial deve ser anterior ou igual à final',
  },
  arquivo: {
    selecione: 'Selecione um arquivo',
    vazio: 'O arquivo está vazio',
    tipoNaoPermitido: 'Tipo de arquivo não permitido. Envie {{formatos}}',
    tamanhoMax: 'O arquivo deve ter no máximo {{tamanho}}',
    ou: 'ou',
  },
  salaBloqueio: {
    horaFimAposInicio: 'A hora final deve ser depois da inicial',
    diasObrigatorio: 'Selecione ao menos um dia da semana',
    diaDuplicado: 'Dia da semana repetido',
    diaInvalido: 'Dia da semana inválido',
  },
};

/** Formato que os outros idiomas precisam seguir (mesmas chaves). */
export type DicionarioValidacao = {
  [K in keyof typeof VALIDACAO_PT_BR]: (typeof VALIDACAO_PT_BR)[K] extends string
    ? string
    : { [F in keyof (typeof VALIDACAO_PT_BR)[K]]: string };
};

const PREFIXO = 'validacao.';

function buscar(caminho: string): string | undefined {
  let atual: unknown = VALIDACAO_PT_BR;
  for (const parte of caminho.split('.')) {
    if (typeof atual !== 'object' || atual === null) return undefined;
    atual = (atual as Record<string, unknown>)[parte];
  }
  return typeof atual === 'string' ? atual : undefined;
}

function interpolar(texto: string, params: ParametrosValidacao): string {
  return texto.replaceAll(/\{\{(\w+)\}\}/g, (trecho, nome: string) =>
    nome in params ? String(params[nome]) : trecho,
  );
}

/** Tradutor padrão: dicionário em português, sem dependências (usado no back e nos testes). */
export function traduzirPtBr({ chave, params = {} }: MensagemValidacao): string {
  const caminho = chave.startsWith(PREFIXO) ? chave.slice(PREFIXO.length) : chave;
  const bases = params.genero === 'f' ? [`${caminho}_f`, caminho] : [caminho];
  const plural = params.count === 1 ? '_one' : '_other';
  const candidatos =
    typeof params.count === 'number'
      ? [...bases.map((base) => `${base}${plural}`), ...bases]
      : bases;
  for (const candidato of candidatos) {
    const texto = buscar(candidato);
    if (texto !== undefined) return interpolar(texto, params);
  }
  return chave;
}

let tradutorAtual: TradutorValidacao = traduzirPtBr;

/** Registra o tradutor das mensagens (o front usa o i18next). Sem argumento, volta ao português. */
export function definirTradutorValidacao(tradutor?: TradutorValidacao): void {
  tradutorAtual = tradutor ?? traduzirPtBr;
}

/** Texto da mensagem no idioma do tradutor registrado. */
export function traduzirValidacao(chave: string, params?: ParametrosValidacao): string {
  return tradutorAtual(params ? { chave, params } : { chave });
}

/**
 * Executa `fn` com outro tradutor e restaura o anterior. Só para código síncrono
 * (ex.: `schema.safeParse`), como faz o `ZodValidationPipe` da API.
 */
export function comTradutorValidacao<T>(tradutor: TradutorValidacao, fn: () => T): T {
  const anterior = tradutorAtual;
  tradutorAtual = tradutor;
  try {
    return fn();
  } finally {
    tradutorAtual = anterior;
  }
}

/** Marca invisível que identifica uma mensagem codificada. */
const MARCA = '⁣i18n:';

/** Tradutor que devolve a chave e os parâmetros codificados (a API decodifica em `details`). */
export const codificarMensagemValidacao: TradutorValidacao = (mensagem) =>
  `${MARCA}${JSON.stringify(mensagem)}`;

/** Lê uma mensagem codificada por `codificarMensagemValidacao`; texto comum devolve `null`. */
export function decodificarMensagemValidacao(texto: string): MensagemValidacao | null {
  if (!texto.startsWith(MARCA)) return null;
  try {
    const mensagem = JSON.parse(texto.slice(MARCA.length)) as MensagemValidacao;
    return typeof mensagem.chave === 'string' ? mensagem : null;
  } catch {
    return null;
  }
}
