import { useQuery } from '@tanstack/react-query';
import { buscaGlobalQuerySchema, buscaGlobalResponseSchema, type GrupoBusca } from '@torres/shared';
import { useDebounce } from '@/hooks/use-debounce';
import { apiFetch } from '@/lib/api/client';

const URL_BUSCA = '/api/painel/busca';
const ATRASO_MS = 250;
const SEM_GRUPOS: readonly GrupoBusca[] = [];

/**
 * Busca global do ⌘K: pacientes, profissionais, contratos, fornecedores e leads. Só consulta com
 * o diálogo aberto e um termo válido, depois de uma pausa na digitação. O resultado traz dados
 * pessoais, então não fica em cache além da própria busca.
 */
export function useBuscaGlobal(termo: string, aberto: boolean) {
  const digitado = termo.trim();
  const atrasado = useDebounce(digitado, ATRASO_MS);
  const valido = buscaGlobalQuerySchema.safeParse({ q: atrasado }).success;
  const consulta = useQuery({
    queryKey: ['painel', 'busca', atrasado],
    queryFn: ({ signal }) =>
      apiFetch(URL_BUSCA, { query: { q: atrasado }, schema: buscaGlobalResponseSchema, signal }),
    enabled: aberto && valido,
    gcTime: 0,
    retry: false,
  });

  return {
    grupos: valido && atrasado === digitado ? (consulta.data?.grupos ?? SEM_GRUPOS) : SEM_GRUPOS,
    buscando: valido && (atrasado !== digitado || consulta.isFetching),
  };
}
