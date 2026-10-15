import { useEffect, useState } from 'react';

/** Valor atrasado: só muda depois de `atraso` ms sem novas alterações (ex.: busca ao digitar). */
export function useDebounce<T>(valor: T, atraso: number): T {
  const [atrasado, setAtrasado] = useState(valor);

  useEffect(() => {
    const timer = setTimeout(() => setAtrasado(valor), atraso);
    return () => clearTimeout(timer);
  }, [valor, atraso]);

  return atrasado;
}
