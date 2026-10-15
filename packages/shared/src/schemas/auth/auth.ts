import { z } from 'zod';
import { permissaoSchema } from '../../auth/permissoes';

export const SENHA_MIN = 8;
export const SENHA_MAX = 128;

const email = z
  .string({
    error: (issue) => (issue.input === undefined ? 'Informe o e-mail' : 'E-mail inválido'),
  })
  .trim()
  .toLowerCase()
  .min(1, { error: 'Informe o e-mail' })
  .pipe(z.email({ error: 'E-mail inválido' }));

/** Senha nova (redefinição e, depois, cadastro de usuário). */
export const senhaNovaSchema = z
  .string({ error: 'Informe a senha' })
  // `abort`: uma mensagem por vez, a do tamanho primeiro.
  .min(SENHA_MIN, { error: `A senha deve ter no mínimo ${SENHA_MIN} caracteres`, abort: true })
  .max(SENHA_MAX, { error: `A senha deve ter no máximo ${SENHA_MAX} caracteres`, abort: true })
  .regex(/^(?=.*[A-Za-z])(?=.*\d)/, { error: 'A senha deve ter letras e números' });

/** `POST /api/auth/login`. */
export const loginSchema = z.strictObject({
  email,
  senha: z
    .string({ error: 'Informe a senha' })
    .min(1, { error: 'Informe a senha' })
    .max(SENHA_MAX, { error: 'E-mail ou senha inválidos' }),
});

export type LoginInput = z.infer<typeof loginSchema>;

/** `POST /api/auth/esqueci-senha`. */
export const esqueciSenhaSchema = z.strictObject({ email });

export type EsqueciSenhaInput = z.infer<typeof esqueciSenhaSchema>;

/** `POST /api/auth/redefinir-senha`. */
export const redefinirSenhaSchema = z.strictObject({
  token: z
    .string({ error: 'Link de redefinição inválido' })
    .min(1, { error: 'Link de redefinição inválido' }),
  senha: senhaNovaSchema,
});

export type RedefinirSenhaInput = z.infer<typeof redefinirSenhaSchema>;

/** Formulário de redefinição (front): a senha nova digitada duas vezes. */
export const redefinirSenhaFormSchema = z
  .object({ senha: senhaNovaSchema, confirmacao: z.string() })
  .refine((dados) => dados.senha === dados.confirmacao, {
    error: 'As senhas não conferem',
    path: ['confirmacao'],
  });

export type RedefinirSenhaForm = z.infer<typeof redefinirSenhaFormSchema>;

/** Usuário logado, com as permissões do perfil. Nunca traz a senha. */
export const usuarioSessaoSchema = z.object({
  id: z.uuid(),
  nome: z.string(),
  email: z.string(),
  perfil: z.object({ id: z.uuid(), nome: z.string() }).nullable(),
  permissoes: z.array(permissaoSchema),
});

export type UsuarioSessao = z.infer<typeof usuarioSessaoSchema>;

/** Resposta do login e do refresh. O refresh token vai só no cookie httpOnly. */
export const sessaoSchema = z.object({
  accessToken: z.string(),
  /** Validade do access token. */
  expiraEm: z.iso.datetime(),
  usuario: usuarioSessaoSchema,
});

export type Sessao = z.infer<typeof sessaoSchema>;
