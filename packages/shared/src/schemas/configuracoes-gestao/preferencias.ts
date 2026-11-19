import { z } from 'zod';

/**
 * Preferências do usuário logado: abas "Preferências" e "Aparência" da tela Configurações
 * (`/settings`, issue #30). Gravadas por usuário no banco (confirmado pelo dev) e enviadas na
 * sessão (`/api/auth/me`), para o front aplicar tema, cor, densidade e idioma ao entrar.
 *
 * Sem imports de outros schemas: `auth.ts` usa este arquivo na sessão.
 */

export const TEMAS = ['claro', 'escuro', 'sistema'] as const;
export type Tema = (typeof TEMAS)[number];

/** "Esquema de Cores" da aba Aparência, na ordem do print. */
export const ESQUEMAS_COR = ['esmeralda', 'azul', 'violeta', 'rosa', 'laranja', 'ardosia'] as const;
export type EsquemaCor = (typeof ESQUEMAS_COR)[number];

export const DENSIDADES = ['compacto', 'confortavel', 'espacoso'] as const;
export type Densidade = (typeof DENSIDADES)[number];

/** Português (padrão), inglês e espanhol (confirmado pelo dev). */
export const IDIOMAS = ['pt-BR', 'en', 'es'] as const;
export type Idioma = (typeof IDIOMAS)[number];

/** Interruptores da aba "Preferências", na ordem do print. */
export const PREFERENCIAS_NOTIFICACAO = [
  'notificacoesAgenda',
  'novidadesSistema',
  'alertasSeguranca',
  'notificacoesPush',
  'resumoSemanal',
] as const;
export type PreferenciaNotificacao = (typeof PREFERENCIAS_NOTIFICACAO)[number];

const opcao = <T extends readonly [string, ...string[]]>(valores: T) =>
  z.enum(valores, { error: 'Opção inválida' });

const ligado = z.boolean({ error: 'Valor inválido' });

export const preferenciasSchema = z.object({
  notificacoesAgenda: ligado,
  novidadesSistema: ligado,
  alertasSeguranca: ligado,
  notificacoesPush: ligado,
  resumoSemanal: ligado,
  tema: opcao(TEMAS),
  esquemaCor: opcao(ESQUEMAS_COR),
  densidade: opcao(DENSIDADES),
  idioma: opcao(IDIOMAS),
});

export type Preferencias = z.infer<typeof preferenciasSchema>;

/** Valores de quem nunca alterou nada (interruptores como no print do inventário). */
export const PREFERENCIAS_PADRAO: Preferencias = {
  notificacoesAgenda: true,
  novidadesSistema: false,
  alertasSeguranca: true,
  notificacoesPush: true,
  resumoSemanal: false,
  tema: 'sistema',
  esquemaCor: 'esmeralda',
  densidade: 'confortavel',
  idioma: 'pt-BR',
};

/**
 * `PATCH /api/configuracoes-gestao/configuracoes/preferencias`: grava ao alternar um
 * interruptor ou escolher uma opção (as abas não têm botão de salvar). Só os campos enviados.
 */
export const atualizarPreferenciasSchema = preferenciasSchema
  .partial()
  .strict()
  .refine((valor) => Object.keys(valor).length > 0, { error: 'Informe ao menos uma preferência' });

export type AtualizarPreferenciasInput = z.infer<typeof atualizarPreferenciasSchema>;
