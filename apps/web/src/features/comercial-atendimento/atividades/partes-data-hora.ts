const dois = (n: number) => String(n).padStart(2, '0');

/** Data e hora (`AAAA-MM-DD`, `HH:MM`) de um instante ISO, no fuso do navegador. */
export function partesDataHora(iso: string): { data: string; hora: string } {
  const d = new Date(iso);
  return {
    data: `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`,
    hora: `${dois(d.getHours())}:${dois(d.getMinutes())}`,
  };
}
