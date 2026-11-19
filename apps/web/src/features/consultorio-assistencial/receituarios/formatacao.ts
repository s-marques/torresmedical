import {
  formatarNumeracaoBloco,
  RECEITUARIO_TIPO_ROTULOS,
  type ReceituarioBloco,
} from '@torres/shared';

/** Data de hoje (`AAAA-MM-DD`) no fuso do navegador: o modal abre com hoje. */
export function hojeLocal(agora = new Date()): string {
  return agora.toLocaleDateString('en-CA');
}

/** Ex.: "Amarela (A) · 000001 - 000020 · Dr. Fulano (5/20)". */
export function rotuloBloco(bloco: ReceituarioBloco): string {
  return [
    RECEITUARIO_TIPO_ROTULOS[bloco.tipo],
    formatarNumeracaoBloco(bloco),
    `${bloco.profissionalNome ?? 'Sem médico'} (${bloco.usados}/${bloco.total})`,
  ].join(' · ');
}
