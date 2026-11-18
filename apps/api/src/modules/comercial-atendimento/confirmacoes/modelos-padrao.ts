import type { ConfirmacaoEtapa } from '@torres/shared';

/** Textos usados quando o tipo do agendamento não tem modelo próprio. */
export const MODELO_PADRAO = {
  msg1: 'Olá {nome}!\n\nSeu agendamento está marcado para:\n\n*Data:* {data}\n*Hora:* {hora}\n*Profissional:* {profissional}\n\nResponda: Confirmar | Reagendar | Cancelar.',
  msg2: 'Olá {nome}!\n\nAinda não recebemos a confirmação do seu agendamento de {data} às {hora} com {profissional}.\n\nResponda: Confirmar | Reagendar | Cancelar.',
  msg3: 'Olá {nome}!\n\n*Última tentativa de confirmação!* Seu agendamento é em {data} às {hora} com {profissional}.\n\nResponda: Confirmar | Reagendar | Cancelar.',
  lembreteConfirmado:
    'Bom dia {nome}!\n\nLembramos que seu agendamento é *HOJE* às *{hora}* com {profissional}.',
  lembreteNaoConfirmado:
    'Olá {nome}!\n\nVocê tem um agendamento *HOJE* às *{hora}* com {profissional} e ainda não o confirmou. Responda: Confirmar | Reagendar | Cancelar.',
} as const;

export type TextosModelo = { -readonly [K in keyof typeof MODELO_PADRAO]: string };

/** Qual texto do modelo vale para a etapa (o lembrete depende de o agendamento estar confirmado). */
export function textoDaEtapa(
  modelo: TextosModelo,
  etapa: ConfirmacaoEtapa,
  confirmado: boolean,
): string {
  switch (etapa) {
    case 'MSG1':
      return modelo.msg1;
    case 'MSG2':
      return modelo.msg2;
    case 'MSG3':
      return modelo.msg3;
    default:
      return confirmado ? modelo.lembreteConfirmado : modelo.lembreteNaoConfirmado;
  }
}
