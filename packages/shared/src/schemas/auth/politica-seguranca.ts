import { z } from 'zod';
import { traduzirValidacao } from '../../i18n/validacao';
import { SENHA_MAX, SENHA_MIN, senhaNovaSchema } from './auth';

/** Limites da política configurável (issue #156). O piso do tamanho é o `SENHA_MIN` já existente. */
export const POLITICA_TAMANHO_MAX = 64;
export const POLITICA_TENTATIVAS_MIN = 3;
export const POLITICA_TENTATIVAS_MAX = 20;
export const POLITICA_BLOQUEIO_MINUTOS_MAX = 1440;
export const POLITICA_EXPIRACAO_MIN_DIAS = 30;
export const POLITICA_EXPIRACAO_MAX_DIAS = 365;
export const POLITICA_CARENCIA_MAX_DIAS = 365;

const msg = (chave: string, params?: Record<string, number>) => () =>
  traduzirValidacao(`validacao.${chave}`, params);

const inteiro = (chave: string, min: number, max: number) =>
  z
    .number({ error: msg('politica.numeroInvalido') })
    .int({ error: msg('politica.numeroInvalido') })
    .min(min, { error: msg('politica.entre', { min, max }) })
    .max(max, { error: msg('politica.entre', { min, max }) });

/**
 * Política de segurança da empresa (issue #156, R §41). Sem registro, vale `POLITICA_PADRAO`.
 * Os valores padrão foram confirmados pelo dev: mínimo 8, letras e números, bloqueio após 5
 * tentativas por 15 minutos, troca no primeiro acesso ligada, sem expiração periódica e sem
 * carência para o acesso do profissional.
 */
export const politicaSegurancaInputSchema = z.strictObject({
  /** Tamanho mínimo da senha. */
  tamanhoMinimo: inteiro('tamanhoMinimo', SENHA_MIN, POLITICA_TAMANHO_MAX),
  exigirMaiuscula: z.boolean({ error: msg('politica.booleano') }),
  exigirSimbolo: z.boolean({ error: msg('politica.booleano') }),
  /** Falhas seguidas de login até bloquear a conta. */
  tentativasBloqueio: inteiro(
    'tentativasBloqueio',
    POLITICA_TENTATIVAS_MIN,
    POLITICA_TENTATIVAS_MAX,
  ),
  /** Duração do bloqueio, em minutos. */
  minutosBloqueio: inteiro('minutosBloqueio', 1, POLITICA_BLOQUEIO_MINUTOS_MAX),
  /** Exige trocar a senha provisória (usuário novo ou senha redefinida por um administrador). */
  trocaPrimeiroAcesso: z.boolean({ error: msg('politica.booleano') }),
  /** Dias até a senha expirar. `null`: a senha não expira. */
  expiracaoDias: inteiro(
    'expiracaoDias',
    POLITICA_EXPIRACAO_MIN_DIAS,
    POLITICA_EXPIRACAO_MAX_DIAS,
  ).nullable(),
  /** Dias de acesso depois do fim do último contrato do profissional (0 = encerra no dia). */
  carenciaProfissionalDias: inteiro('carenciaProfissionalDias', 0, POLITICA_CARENCIA_MAX_DIAS),
});

export type PoliticaSegurancaInput = z.output<typeof politicaSegurancaInputSchema>;

export const POLITICA_PADRAO: PoliticaSegurancaInput = {
  tamanhoMinimo: SENHA_MIN,
  exigirMaiuscula: false,
  exigirSimbolo: false,
  tentativasBloqueio: 5,
  minutosBloqueio: 15,
  trocaPrimeiroAcesso: true,
  expiracaoDias: null,
  carenciaProfissionalDias: 0,
};

export const politicaSegurancaSchema = politicaSegurancaInputSchema.extend({
  updatedAt: z.iso.datetime().nullable(),
});

export type PoliticaSeguranca = z.infer<typeof politicaSegurancaSchema>;

/** Parte da política que o front mostra na tela de senha (sem login). */
export type RegrasSenha = Pick<
  PoliticaSegurancaInput,
  'tamanhoMinimo' | 'exigirMaiuscula' | 'exigirSimbolo'
>;

export const regrasSenhaSchema = politicaSegurancaInputSchema.pick({
  tamanhoMinimo: true,
  exigirMaiuscula: true,
  exigirSimbolo: true,
});

/**
 * Confere a senha com a política e devolve as mensagens (já traduzidas) do que falta. As regras
 * fixas (letras e números, máximo) estão em `senhaNovaSchema`; aqui ficam as configuráveis.
 */
export function validarSenhaPolitica(senha: string, regras: RegrasSenha): string[] {
  const erros: string[] = [];
  if (senha.length < regras.tamanhoMinimo) {
    erros.push(traduzirValidacao('validacao.auth.senhaMin', { min: regras.tamanhoMinimo }));
  }
  if (senha.length > SENHA_MAX) {
    erros.push(traduzirValidacao('validacao.auth.senhaMax', { max: SENHA_MAX }));
  }
  if (regras.exigirMaiuscula && !/\p{Lu}/u.test(senha)) {
    erros.push(traduzirValidacao('validacao.auth.senhaMaiuscula'));
  }
  if (regras.exigirSimbolo && !/[^\p{L}\p{N}\s]/u.test(senha)) {
    erros.push(traduzirValidacao('validacao.auth.senhaSimbolo'));
  }
  return erros;
}

/** `POST /api/auth/trocar-senha`: o próprio usuário informa a senha atual e a nova. */
export const trocarSenhaSchema = z
  .strictObject({
    senhaAtual: z
      .string({ error: msg('auth.informeSenha') })
      .min(1, { error: msg('auth.informeSenha') })
      .max(SENHA_MAX, { error: msg('auth.credenciaisInvalidas') }),
    senhaNova: senhaNovaSchema,
  })
  .refine((dados) => dados.senhaAtual !== dados.senhaNova, {
    error: msg('auth.senhaIgualAtual'),
    path: ['senhaNova'],
  });

export type TrocarSenhaInput = z.infer<typeof trocarSenhaSchema>;

/** Formulário de troca (front): a senha nova digitada duas vezes. */
export const trocarSenhaFormSchema = z
  .object({
    senhaAtual: z.string().min(1, { error: msg('auth.informeSenha') }),
    senhaNova: z.string().min(1, { error: msg('auth.informeSenha') }),
    confirmacao: z.string(),
  })
  .refine((dados) => dados.senhaNova === dados.confirmacao, {
    error: msg('auth.senhasNaoConferem'),
    path: ['confirmacao'],
  });

export type TrocarSenhaForm = z.infer<typeof trocarSenhaFormSchema>;
