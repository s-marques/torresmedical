import { UNIDADE_UFS } from '@torres/shared';
import type { OpcaoCampo } from '@/components/shared/form/tipos';

/** Combobox UF do modal "Nova Unidade": "Selecione" (vazio) mais as 27 siglas. */
export const OPCOES_UF: readonly OpcaoCampo[] = [
  { valor: '', rotulo: 'Selecione' },
  ...UNIDADE_UFS.map((uf) => ({ valor: uf, rotulo: uf })),
];
