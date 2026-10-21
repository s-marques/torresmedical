import { z } from 'zod';

const MB = 1024 * 1024;

/** Formatos aceitos, pela extensão. `mimes`: o primeiro é o gravado; os demais são aliases dos navegadores. */
export const ARQUIVO_FORMATOS = {
  jpg: { rotulo: 'JPG', mimes: ['image/jpeg', 'image/pjpeg'] },
  jpeg: { rotulo: 'JPG', mimes: ['image/jpeg', 'image/pjpeg'] },
  png: { rotulo: 'PNG', mimes: ['image/png'] },
  gif: { rotulo: 'GIF', mimes: ['image/gif'] },
  webp: { rotulo: 'WEBP', mimes: ['image/webp'] },
  pdf: { rotulo: 'PDF', mimes: ['application/pdf'] },
  ofx: { rotulo: 'OFX', mimes: ['application/x-ofx', 'application/ofx', 'text/plain'] },
  csv: {
    rotulo: 'CSV',
    mimes: ['text/csv', 'application/csv', 'application/vnd.ms-excel', 'text/plain'],
  },
  xml: { rotulo: 'XML', mimes: ['application/xml', 'text/xml'] },
  txt: { rotulo: 'TXT', mimes: ['text/plain'] },
  md: { rotulo: 'MD', mimes: ['text/markdown', 'text/x-markdown', 'text/plain'] },
  docx: {
    rotulo: 'DOCX',
    mimes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  },
  mp3: { rotulo: 'MP3', mimes: ['audio/mpeg', 'audio/mp3'] },
  ogg: { rotulo: 'OGG', mimes: ['audio/ogg', 'audio/opus', 'application/ogg'] },
  mp4: { rotulo: 'MP4', mimes: ['video/mp4'] },
} as const satisfies Record<string, { rotulo: string; mimes: readonly [string, ...string[]] }>;

export type ArquivoFormato = keyof typeof ARQUIVO_FORMATOS;

export interface ArquivoUsoConfig {
  descricao: string;
  formatos: readonly ArquivoFormato[];
  maxBytes: number;
  /** Permissão exigida para enviar e baixar. Preenchida com a issue de Autenticação (#79). */
  permissao?: string;
}

/**
 * Usos de arquivo e as regras de cada um (whitelist de formatos e tamanho máximo).
 * Cada tela ajusta o seu uso ao ser implementada.
 */
export const ARQUIVO_USOS = {
  avatar: {
    descricao: 'Avatar do usuário',
    formatos: ['jpg', 'jpeg', 'png', 'gif'],
    maxBytes: 2 * MB,
  },
  'logo-empresa': {
    descricao: 'Logo da empresa',
    formatos: ['jpg', 'jpeg', 'png'],
    maxBytes: 2 * MB,
  },
  'foto-profissional': {
    descricao: 'Foto do profissional',
    formatos: ['jpg', 'jpeg', 'png', 'webp'],
    maxBytes: 2 * MB,
  },
  'logo-receita': {
    descricao: 'Logo da receita do profissional',
    formatos: ['jpg', 'jpeg', 'png'],
    maxBytes: 2 * MB,
  },
  'extrato-conciliacao': {
    descricao: 'Extrato bancário para conciliação',
    formatos: ['ofx', 'csv'],
    maxBytes: 5 * MB,
  },
  'nfe-xml': { descricao: 'XML de NF-e de compra', formatos: ['xml'], maxBytes: 5 * MB },
  'whatsapp-anexo': {
    descricao: 'Anexo de mensagem do WhatsApp',
    formatos: ['jpg', 'jpeg', 'png', 'webp', 'pdf', 'mp3', 'ogg', 'mp4'],
    maxBytes: 16 * MB,
  },
  'base-conhecimento': {
    descricao: 'Documento da Base de Conhecimento',
    formatos: ['pdf', 'txt', 'md', 'docx'],
    maxBytes: 10 * MB,
  },
} as const satisfies Record<string, ArquivoUsoConfig>;

export type ArquivoUso = keyof typeof ARQUIVO_USOS;

export const ARQUIVO_USO_KEYS = Object.keys(ARQUIVO_USOS) as [ArquivoUso, ...ArquivoUso[]];

/** Maior tamanho aceito entre todos os usos. */
export const ARQUIVO_MAX_BYTES = Math.max(...Object.values(ARQUIVO_USOS).map((u) => u.maxBytes));

export function arquivoUsoConfig(uso: ArquivoUso): ArquivoUsoConfig {
  return ARQUIVO_USOS[uso];
}

/** Extensão em minúsculas, sem o ponto (`''` quando não há). */
export function extensaoArquivo(nome: string): string {
  const ponto = nome.lastIndexOf('.');
  return ponto > 0 ? nome.slice(ponto + 1).toLowerCase() : '';
}

/** "JPG, PNG ou GIF". */
export function descreverFormatos(uso: ArquivoUso): string {
  const rotulos = [...new Set(ARQUIVO_USOS[uso].formatos.map((f) => ARQUIVO_FORMATOS[f].rotulo))];
  const ultimo = rotulos.pop() ?? '';
  return rotulos.length ? `${rotulos.join(', ')} ou ${ultimo}` : ultimo;
}

/** "2 MB". */
export function formatarTamanho(bytes: number): string {
  if (bytes >= MB) return `${Number((bytes / MB).toFixed(1))} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function mensagemTipoInvalido(uso: ArquivoUso): string {
  return `Tipo de arquivo não permitido. Envie ${descreverFormatos(uso)}`;
}

export function mensagemTamanhoExcedido(uso: ArquivoUso): string {
  return `O arquivo deve ter no máximo ${formatarTamanho(ARQUIVO_USOS[uso].maxBytes)}`;
}

export const ARQUIVO_OBRIGATORIO_MENSAGEM = 'Selecione um arquivo';
export const ARQUIVO_VAZIO_MENSAGEM = 'O arquivo está vazio';

/** Tipos que o navegador informa quando não reconhece a extensão. */
const MIMES_GENERICOS = new Set(['', 'application/octet-stream']);

export interface ArquivoCandidato {
  nome: string;
  /** MIME informado pelo navegador (pode vir vazio). */
  tipo?: string;
  tamanho: number;
}

/**
 * Valida extensão, MIME declarado e tamanho para o uso. Mesma regra no front (antes de
 * enviar) e no back. Retorna a mensagem de erro ou `null`. O back também confere o conteúdo.
 */
export function validarArquivo(arquivo: ArquivoCandidato, uso: ArquivoUso): string | null {
  const formato = formatoDoArquivo(arquivo.nome, uso);
  const tipo = (arquivo.tipo ?? '').toLowerCase();
  const mimes: readonly string[] = formato ? ARQUIVO_FORMATOS[formato].mimes : [];
  if (!formato || !(MIMES_GENERICOS.has(tipo) || mimes.includes(tipo))) {
    return mensagemTipoInvalido(uso);
  }
  if (arquivo.tamanho <= 0) return ARQUIVO_VAZIO_MENSAGEM;
  if (arquivo.tamanho > ARQUIVO_USOS[uso].maxBytes) return mensagemTamanhoExcedido(uso);
  return null;
}

/** Formato do arquivo pela extensão, se aceito no uso. */
export function formatoDoArquivo(nome: string, uso: ArquivoUso): ArquivoFormato | undefined {
  const extensao = extensaoArquivo(nome);
  const formatos: readonly string[] = ARQUIVO_USOS[uso].formatos;
  return formatos.includes(extensao) ? (extensao as ArquivoFormato) : undefined;
}

/** Valor do atributo `accept` do `<input type="file">` para o uso. */
export function acceptDoUso(uso: ArquivoUso): string {
  return ARQUIVO_USOS[uso].formatos.map((f) => `.${f}`).join(',');
}

export const arquivoUsoSchema = z.enum(ARQUIVO_USO_KEYS, {
  error: (issue) =>
    issue.input === undefined ? 'Informe o uso do arquivo' : 'Uso de arquivo inválido',
});

/** Query de `POST /api/arquivos` (o arquivo vai no campo multipart `arquivo`). */
export const uploadArquivoQuerySchema = z.strictObject({ uso: arquivoUsoSchema });

export type UploadArquivoQuery = z.infer<typeof uploadArquivoQuerySchema>;

/** Nome do campo multipart do upload. */
export const ARQUIVO_CAMPO = 'arquivo';

/** Metadados devolvidos pela API. A chave interna do storage não é exposta. */
export const arquivoSchema = z.object({
  id: z.uuid(),
  uso: arquivoUsoSchema,
  nomeOriginal: z.string(),
  contentType: z.string(),
  tamanho: z.number().int(),
  criadoPor: z.string().nullable(),
  createdAt: z.iso.datetime(),
});

export type Arquivo = z.infer<typeof arquivoSchema>;

/** `GET /api/arquivos/:id/link`: URL temporária de download. */
export const arquivoLinkSchema = z.object({
  url: z.string(),
  expiraEm: z.iso.datetime(),
});

export type ArquivoLink = z.infer<typeof arquivoLinkSchema>;

/** Query de `GET /api/arquivos/:id/conteudo` (vem da URL assinada). */
export const arquivoConteudoQuerySchema = z.strictObject({
  expira: z.coerce.number({ error: 'Link inválido' }).int({ error: 'Link inválido' }).positive({
    error: 'Link inválido',
  }),
  assinatura: z.string({ error: 'Link inválido' }).regex(/^[\w-]{43}$/, { error: 'Link inválido' }),
});

export type ArquivoConteudoQuery = z.infer<typeof arquivoConteudoQuerySchema>;
