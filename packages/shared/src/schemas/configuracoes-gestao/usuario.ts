import { z } from 'zod';
import { senhaNovaSchema } from '../auth/auth';
import { ativoStatusSchema, exportQuerySchema, listQuerySchema } from '../common/list-query';
import { textoObrigatorio } from '../common/obrigatorio';
import { paginatedResponseSchema } from '../common/pagination';

export const USUARIO_NOME_MAX = 200;
export const USUARIO_CARGO_MAX = 120;

/** Telefone opcional do usuário: só dígitos, 10 ou 11. Também usado em "Meu Perfil". */
export const telefoneUsuarioSchema = z
  .string({ error: 'Telefone inválido' })
  .nullish()
  .transform((valor) => (valor ? valor.replaceAll(/\D/g, '') : null))
  .refine((valor) => valor === null || [10, 11].includes(valor.length), {
    error: 'Telefone inválido',
  });

/** Cargo opcional do usuário. Também usado em "Meu Perfil". */
export const cargoUsuarioSchema = z
  .string({ error: 'Cargo inválido' })
  .trim()
  .max(USUARIO_CARGO_MAX, { error: `Cargo deve ter no máximo ${USUARIO_CARGO_MAX} caracteres` })
  .nullish()
  .transform((valor) => valor || null);

const email = z
  .string({
    error: (issue) => (issue.input === undefined ? 'Email é obrigatório.' : 'Email inválido'),
  })
  .trim()
  .toLowerCase()
  .min(1, { error: 'Email é obrigatório.' })
  .pipe(z.email({ error: 'Email inválido' }));

/** Limite de profissionais vinculados a um usuário (secretária de vários médicos). */
export const USUARIO_PROFISSIONAIS_MAX = 50;

/**
 * "Profissionais vinculados" (issue #153): de quem são os dados que o usuário vê quando o
 * perfil tem o escopo `PROFISSIONAIS_VINCULADOS`. Um para o médico; um ou mais para a
 * secretária particular (confirmado pelo dev). Ids repetidos são descartados.
 */
const profissionalIds = z
  .array(z.uuid({ error: 'Profissional inválido' }), { error: 'Profissional inválido' })
  .max(USUARIO_PROFISSIONAIS_MAX, {
    error: `Vincule no máximo ${USUARIO_PROFISSIONAIS_MAX} profissionais`,
  })
  .default([])
  .transform((ids) => [...new Set(ids)]);

/**
 * `POST /api/configuracoes-gestao/usuarios` (modal "Novo Usuario"). Nome, Email e Senha são
 * obrigatórios (confirmado pelo dev, issue #37); os demais campos, não.
 */
export const createUsuarioSchema = z.strictObject({
  nome: textoObrigatorio('Nome', { max: USUARIO_NOME_MAX }),
  email,
  senha: senhaNovaSchema,
  telefone: telefoneUsuarioSchema,
  cargo: cargoUsuarioSchema,
  /** "Perfil de Acesso (Páginas)": vazio = "Sem perfil (usa padrão da role)". */
  perfilId: z.uuid({ error: 'Perfil inválido' }).nullish().default(null),
  verDadosSensiveis: z.boolean({ error: 'Valor inválido' }).default(false),
  profissionalIds,
});

export type CreateUsuarioInput = z.output<typeof createUsuarioSchema>;
export type UsuarioFormulario = z.input<typeof createUsuarioSchema>;

/**
 * `PATCH /api/configuracoes-gestao/usuarios/:id` (modal "Editar Usuario"). Sem o campo Senha:
 * a troca de senha é só pela ação "Resetar Senha" (menu da linha).
 */
export const updateUsuarioSchema = z.strictObject({
  nome: textoObrigatorio('Nome', { max: USUARIO_NOME_MAX }),
  email,
  telefone: telefoneUsuarioSchema,
  cargo: cargoUsuarioSchema,
  perfilId: z.uuid({ error: 'Perfil inválido' }).nullish().default(null),
  verDadosSensiveis: z.boolean({ error: 'Valor inválido' }).default(false),
  profissionalIds,
  status: ativoStatusSchema.default('ativo'),
});

export type UpdateUsuarioInput = z.output<typeof updateUsuarioSchema>;
export type UsuarioEdicaoFormulario = z.input<typeof updateUsuarioSchema>;

/** `PATCH /api/configuracoes-gestao/usuarios/:id/resetar-senha` (modal "Resetar Senha"). */
export const resetarSenhaUsuarioSchema = z.strictObject({ senha: senhaNovaSchema });

export type ResetarSenhaUsuarioInput = z.output<typeof resetarSenhaUsuarioSchema>;

export const USUARIO_SORT_FIELDS = [
  'nome',
  'email',
  'telefone',
  'status',
  'ultimoLoginEm',
] as const;

/** `GET /api/configuracoes-gestao/usuarios`. */
export const listUsuariosQuerySchema = listQuerySchema({
  sortFields: USUARIO_SORT_FIELDS,
  defaultSort: 'nome:asc',
  filters: { status: ativoStatusSchema.optional() },
});

export type ListUsuariosQuery = z.infer<typeof listUsuariosQuerySchema>;

export const USUARIO_EXPORT_COLUMNS = [
  'nome',
  'email',
  'telefone',
  'cargo',
  'perfil',
  'status',
  'ultimoLogin',
] as const;
export type UsuarioExportColumn = (typeof USUARIO_EXPORT_COLUMNS)[number];

export const exportUsuariosQuerySchema = exportQuerySchema(
  listUsuariosQuerySchema,
  USUARIO_EXPORT_COLUMNS,
);

export type ExportUsuariosQuery = z.infer<typeof exportUsuariosQuerySchema>;

export const usuarioSchema = z.object({
  id: z.uuid(),
  nome: z.string(),
  email: z.string(),
  telefone: z.string().nullable(),
  cargo: z.string().nullable(),
  perfilId: z.uuid().nullable(),
  /** Nome do perfil, para as colunas "Role" e "Perfil" do grid. `null` = "Sem perfil (usa padrão da role)". */
  perfilNome: z.string().nullable(),
  verDadosSensiveis: z.boolean(),
  /** Profissionais vinculados (issue #153), por nome. */
  profissionais: z.array(z.object({ id: z.uuid(), nome: z.string() })),
  ativo: z.boolean(),
  ultimoLoginEm: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type Usuario = z.infer<typeof usuarioSchema>;

export const usuarioPageSchema = paginatedResponseSchema(usuarioSchema);

export type UsuarioPage = z.infer<typeof usuarioPageSchema>;

/**
 * `GET /api/configuracoes-gestao/usuarios` (aba Usuários de Minha Empresa). Somente leitura:
 * criar/editar/excluir usuário é a tela própria "Usuários" (`/usuarios`), fora desta issue.
 */
export const usuarioResumoSchema = z.object({
  id: z.uuid(),
  nome: z.string(),
  email: z.string(),
  perfilNome: z.string().nullable(),
  ativo: z.boolean(),
  ultimoLoginEm: z.iso.datetime().nullable(),
});

export type UsuarioResumo = z.infer<typeof usuarioResumoSchema>;

export const usuariosResponseSchema = z.object({ data: z.array(usuarioResumoSchema) });
