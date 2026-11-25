import { z } from 'zod';
import { permissaoSchema } from '../../auth/permissoes';
import { traduzirValidacao } from '../../i18n/validacao';
import { preferenciasSchema } from '../configuracoes-gestao/preferencias';

const msg = (chave: string, params?: Record<string, number>) => () =>
  traduzirValidacao(`validacao.${chave}`, params);

export const SENHA_MIN = 8;
export const SENHA_MAX = 128;

const email = z
  .string({
    error: (issue) =>
      issue.input === undefined ? msg('auth.informeEmail')() : msg('formato.email')(),
  })
  .trim()
  .toLowerCase()
  .min(1, { error: msg('auth.informeEmail') })
  .pipe(z.email({ error: msg('formato.email') }));

/** Senha nova (redefinição e, depois, cadastro de usuário). */
export const senhaNovaSchema = z
  .string({ error: msg('auth.informeSenha') })
  // `abort`: uma mensagem por vez, a do tamanho primeiro.
  .min(SENHA_MIN, { error: msg('auth.senhaMin', { min: SENHA_MIN }), abort: true })
  .max(SENHA_MAX, { error: msg('auth.senhaMax', { max: SENHA_MAX }), abort: true })
  .regex(/^(?=.*[A-Za-z])(?=.*\d)/, { error: msg('auth.senhaLetrasNumeros') });

/** `POST /api/auth/login`. */
export const loginSchema = z.strictObject({
  email,
  senha: z
    .string({ error: msg('auth.informeSenha') })
    .min(1, { error: msg('auth.informeSenha') })
    .max(SENHA_MAX, { error: msg('auth.credenciaisInvalidas') }),
});

export type LoginInput = z.infer<typeof loginSchema>;

/** `POST /api/auth/esqueci-senha`. */
export const esqueciSenhaSchema = z.strictObject({ email });

export type EsqueciSenhaInput = z.infer<typeof esqueciSenhaSchema>;

/** `POST /api/auth/redefinir-senha`. */
export const redefinirSenhaSchema = z.strictObject({
  token: z.string({ error: msg('auth.linkInvalido') }).min(1, { error: msg('auth.linkInvalido') }),
  senha: senhaNovaSchema,
});

export type RedefinirSenhaInput = z.infer<typeof redefinirSenhaSchema>;

/** Formulário de redefinição (front): a senha nova digitada duas vezes. */
export const redefinirSenhaFormSchema = z
  .object({ senha: senhaNovaSchema, confirmacao: z.string() })
  .refine((dados) => dados.senha === dados.confirmacao, {
    error: msg('auth.senhasNaoConferem'),
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
  /** Avatar da tela Configurações (issue #30), exibido no cabeçalho e no menu. */
  avatarArquivoId: z.uuid().nullable(),
  /** Senha provisória ou vencida (issue #156): até trocá-la, só a troca de senha é liberada. */
  trocarSenha: z.boolean().default(false),
  /** Preferências e aparência (issue #30): o front aplica tema, cor, densidade e idioma. */
  preferencias: preferenciasSchema,
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
