import type { Permissao } from '@torres/shared';
import type { ReactNode } from 'react';
import { usePermissao } from '@/lib/auth/use-sessao';

export interface SePermitidoProps {
  permissao: Permissao;
  children: ReactNode;
  /** O que mostrar sem a permissão. Padrão: nada. */
  senao?: ReactNode;
}

/**
 * Mostra o conteúdo só com a permissão, por exemplo:
 * `<SePermitido permissao="financeiro.caixas.criar"><Button>Novo caixa</Button></SePermitido>`.
 */
export function SePermitido({ permissao, children, senao = null }: Readonly<SePermitidoProps>) {
  return usePermissao(permissao) ? children : senao;
}
