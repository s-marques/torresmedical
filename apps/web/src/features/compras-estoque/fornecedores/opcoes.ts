import { FORNECEDOR_UFS } from '@torres/shared';
import type { OpcaoCampo } from '@/components/shared/form/tipos';

export const OPCOES_STATUS: readonly OpcaoCampo[] = [
  { valor: 'ativo', rotulo: 'Ativo' },
  { valor: 'inativo', rotulo: 'Inativo' },
];

/** Combobox UF do modal: "Selecione" (vazio) mais as 27 siglas. */
export const OPCOES_UF: readonly OpcaoCampo[] = [
  { valor: '', rotulo: 'Selecione' },
  ...FORNECEDOR_UFS.map((uf) => ({ valor: uf, rotulo: uf })),
];
