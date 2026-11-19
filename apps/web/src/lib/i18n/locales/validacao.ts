import type { DicionarioValidacao } from '@torres/shared';
import errosApiEn from './erros-api.en.json';
import errosApiEs from './erros-api.es.json';
import rotulosEn from './rotulos.en.json';
import rotulosEs from './rotulos.es.json';
import validacaoEn from './validacao.en.json';
import validacaoEs from './validacao.es.json';

/**
 * Mensagens de validação em inglês e espanhol (issue #205). O português vem de
 * `VALIDACAO_PT_BR` (`packages/shared`), que também vale no back.
 */
export const VALIDACAO_EN: DicionarioValidacao = validacaoEn;
export const VALIDACAO_ES: DicionarioValidacao = validacaoEs;

/**
 * Erros da API traduzidos pelo `code` (issue #205). Não há versão em português: nele vale a
 * mensagem do servidor. Código sem tradução também cai na mensagem do servidor.
 */
export const ERROS_API_EN: Readonly<Record<string, string>> = errosApiEn;
export const ERROS_API_ES: Readonly<Record<string, string>> = errosApiEs;

/**
 * Rótulos de campo usados nas mensagens de validação ("Nome é obrigatório."): a chave é o rótulo
 * em português, como está no schema. As issues de módulo acrescentam os rótulos das suas telas.
 */
export const ROTULOS_EN: Readonly<Record<string, string>> = rotulosEn;
export const ROTULOS_ES: Readonly<Record<string, string>> = rotulosEs;
