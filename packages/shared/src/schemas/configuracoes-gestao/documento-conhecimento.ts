import { z } from 'zod';
import { listQuerySchema } from '../common/list-query';
import { textoObrigatorio } from '../common/obrigatorio';
import { paginatedResponseSchema } from '../common/pagination';

export const DOCUMENTO_CONHECIMENTO_TITULO_MAX = 200;
export const DOCUMENTO_CONHECIMENTO_CONTEUDO_MAX = 20000;

/** Opções do dropdown Categoria (estado "Dropdown aberto: Todas" do inventário). */
export const DOCUMENTO_CONHECIMENTO_CATEGORIAS = [
  'Geral',
  'Procedimento',
  'Preparo de Exame',
  'Pós-procedimento',
  'Pergunta Frequente',
  'Convênio',
  'Protocolo',
  'Orientação',
] as const;

export const documentoConhecimentoCategoriaSchema = z.enum(DOCUMENTO_CONHECIMENTO_CATEGORIAS, {
  error: 'Categoria inválida',
});
export type DocumentoConhecimentoCategoria = z.infer<typeof documentoConhecimentoCategoriaSchema>;

export const DOCUMENTO_CONHECIMENTO_CATEGORIA_PADRAO: DocumentoConhecimentoCategoria = 'Geral';

/**
 * Corpo de `POST` e `PATCH /api/configuracoes-gestao/base-conhecimento`. O `PATCH` substitui todos
 * os campos (o modal Editar envia o formulário inteiro). Título e Conteúdo são obrigatórios
 * (asterisco no modal do inventário). Sem profissional, o documento vale para todos ("Geral").
 * Toda gravação indexa o documento ("Salvar e Indexar").
 */
export const documentoConhecimentoInputSchema = z.strictObject({
  titulo: textoObrigatorio('Título', { max: DOCUMENTO_CONHECIMENTO_TITULO_MAX }),
  profissionalId: z.uuid({ error: 'Profissional inválido' }).nullish().default(null),
  categoria: documentoConhecimentoCategoriaSchema.default(DOCUMENTO_CONHECIMENTO_CATEGORIA_PADRAO),
  conteudo: textoObrigatorio('Conteúdo', { max: DOCUMENTO_CONHECIMENTO_CONTEUDO_MAX }),
});

export type DocumentoConhecimentoFormulario = z.input<typeof documentoConhecimentoInputSchema>;
export type CreateDocumentoConhecimentoInput = z.output<typeof documentoConhecimentoInputSchema>;
export type UpdateDocumentoConhecimentoInput = CreateDocumentoConhecimentoInput;
export const createDocumentoConhecimentoSchema = documentoConhecimentoInputSchema;
export const updateDocumentoConhecimentoSchema = documentoConhecimentoInputSchema;

export const DOCUMENTO_CONHECIMENTO_SORT_FIELDS = ['titulo', 'categoria', 'createdAt'] as const;

/**
 * `GET /api/configuracoes-gestao/base-conhecimento`. Busca em título e conteúdo. O filtro
 * `profissionalId` traz os documentos do profissional e os gerais (sem profissional).
 */
export const listDocumentosConhecimentoQuerySchema = listQuerySchema({
  sortFields: DOCUMENTO_CONHECIMENTO_SORT_FIELDS,
  defaultSort: 'titulo:asc',
  filters: {
    profissionalId: z.uuid({ error: 'Profissional inválido' }).optional(),
    categoria: documentoConhecimentoCategoriaSchema.optional(),
  },
});

export type ListDocumentosConhecimentoQuery = z.infer<typeof listDocumentosConhecimentoQuerySchema>;

export const documentoConhecimentoSchema = z.object({
  id: z.uuid(),
  titulo: z.string(),
  profissionalId: z.uuid().nullable(),
  categoria: z.string(),
  conteudo: z.string(),
  indexadoEm: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type DocumentoConhecimento = z.infer<typeof documentoConhecimentoSchema>;

export const documentoConhecimentoPageSchema = paginatedResponseSchema(documentoConhecimentoSchema);

export type DocumentoConhecimentoPage = z.infer<typeof documentoConhecimentoPageSchema>;
