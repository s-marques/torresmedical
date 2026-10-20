import type { AuditLogItem } from '@torres/shared';

export function iniciaisDe(nome: string): string {
  const palavras = nome.split(/\s+/).filter(Boolean);
  const letras = palavras.length > 1 ? [palavras[0], palavras.at(-1)] : [palavras[0]];
  return (
    letras
      .map((p) => p?.[0] ?? '')
      .join('')
      .toUpperCase() || '-'
  );
}

/** `AAAA-MM-DD` → `DD/MM/AAAA`, sem passar por fuso horário. */
export function formatarData(data: string | null): string {
  if (!data) return '-';
  const [ano, mes, dia] = data.split('-');
  return `${dia}/${mes}/${ano}`;
}

function objeto(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === 'object' ? (valor as Record<string, unknown>) : {};
}

/** Nomes dos campos que mudaram (nunca os valores: o histórico não expõe dados pessoais). */
export function camposAlterados(item: AuditLogItem): string[] {
  const antes = objeto(item.before);
  const depois = objeto(item.after);
  const ignorados = new Set(['updatedAt', 'createdAt', 'origemNome']);
  return Object.keys(depois).filter(
    (campo) =>
      !ignorados.has(campo) && JSON.stringify(antes[campo]) !== JSON.stringify(depois[campo]),
  );
}
