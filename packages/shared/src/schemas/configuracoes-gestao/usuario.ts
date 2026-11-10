import { z } from 'zod';

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
