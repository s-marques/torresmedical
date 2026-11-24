const CPF_DIGITOS = 11;

/** CPF parcialmente oculto para diferenciar homônimos sem expor o documento: `***.456.789-**`. */
export function mascararCpf(documento: string | null): string | null {
  if (documento?.length !== CPF_DIGITOS) return null;
  return `***.${documento.slice(3, 6)}.${documento.slice(6, 9)}-**`;
}
