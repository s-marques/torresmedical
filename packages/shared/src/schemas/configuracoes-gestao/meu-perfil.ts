import { z } from 'zod';
import { traduzirValidacao } from '../../i18n/validacao';
import { erroObrigatorio, textoObrigatorio } from '../common/obrigatorio';
import { cargoUsuarioSchema, telefoneUsuarioSchema, USUARIO_NOME_MAX } from './usuario';

const emailObrigatorio = erroObrigatorio('E-mail');
const emailInvalido = () => traduzirValidacao('validacao.formato.email');

const email = z
  .string({
    error: (issue) => (issue.input === undefined ? emailObrigatorio() : emailInvalido()),
  })
  .trim()
  .toLowerCase()
  .min(1, { error: emailObrigatorio })
  .pipe(z.email({ error: emailInvalido }));

/**
 * `PUT /api/configuracoes-gestao/configuracoes/perfil`: aba "Perfil" da tela Configurações,
 * botão "Salvar Alterações". Nome e E-mail obrigatórios (o e-mail é o login); Telefone e
 * Cargo opcionais. Todos editáveis pelo próprio usuário (confirmado pelo dev, issue #30).
 */
export const meuPerfilInputSchema = z.strictObject({
  nome: textoObrigatorio('Nome', { max: USUARIO_NOME_MAX }),
  email,
  telefone: telefoneUsuarioSchema,
  cargo: cargoUsuarioSchema,
});

export type MeuPerfilInput = z.output<typeof meuPerfilInputSchema>;
export type MeuPerfilFormulario = z.input<typeof meuPerfilInputSchema>;

export const meuPerfilSchema = z.object({
  id: z.uuid(),
  nome: z.string(),
  email: z.string(),
  telefone: z.string().nullable(),
  cargo: z.string().nullable(),
  avatarArquivoId: z.uuid().nullable(),
  updatedAt: z.iso.datetime(),
});

export type MeuPerfil = z.infer<typeof meuPerfilSchema>;

/** `PUT /api/configuracoes-gestao/configuracoes/perfil/avatar` (enviado antes em `/api/arquivos`). */
export const meuAvatarInputSchema = z.strictObject({
  arquivoId: z.uuid({ error: 'Arquivo inválido' }).nullable(),
});

export type MeuAvatarInput = z.infer<typeof meuAvatarInputSchema>;
