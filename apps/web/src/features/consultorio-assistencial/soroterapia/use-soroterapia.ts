import { soroterapiaFilaDiaSchema, soroterapiaPacotesSchema } from '@torres/shared';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';

const URL_SOROTERAPIA = '/api/consultorio-assistencial/soroterapia';

export const URL_FILA_DIA = `${URL_SOROTERAPIA}/fila-dia`;
export const URL_PACOTES = `${URL_SOROTERAPIA}/pacotes`;
export const URL_EM_ANDAMENTO = `${URL_SOROTERAPIA}/em-andamento`;
export const URL_HISTORICO = `${URL_SOROTERAPIA}/historico`;

/** Aba "Fila do Dia": agendamentos de soroterapia de hoje. */
export function useFilaDia() {
  return useQuery({
    queryKey: ['soroterapia', 'fila-dia'] as const,
    queryFn: ({ signal }) => apiFetch(URL_FILA_DIA, { schema: soroterapiaFilaDiaSchema, signal }),
  });
}

/** Aba "Pacotes": protocolos de orçamentos aprovados. */
export function usePacotes() {
  return useQuery({
    queryKey: ['soroterapia', 'pacotes'] as const,
    queryFn: ({ signal }) => apiFetch(URL_PACOTES, { schema: soroterapiaPacotesSchema, signal }),
  });
}
