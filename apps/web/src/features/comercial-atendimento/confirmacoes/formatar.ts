const DATA_HORA = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const HORA = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });

/** `18/11/2026 20:00` (sem a vírgula do formato padrão). */
export function formatarDataHoraCurta(valor: string): string {
  return DATA_HORA.format(new Date(valor)).replace(',', '');
}

export function formatarHora(valor: string): string {
  return HORA.format(new Date(valor));
}

/** Hoje como `AAAA-MM-DD` no fuso do navegador (valor do `<input type="date">`). */
export function hojeIso(agora = new Date()): string {
  const mes = String(agora.getMonth() + 1).padStart(2, '0');
  const dia = String(agora.getDate()).padStart(2, '0');
  return `${agora.getFullYear()}-${mes}-${dia}`;
}
