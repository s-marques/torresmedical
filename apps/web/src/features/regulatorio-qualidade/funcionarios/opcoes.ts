import {
  COMISSAO_STATUS_ROTULOS,
  FUNCIONARIO_TIPO_CONTRATO_ROTULOS,
  type ComissaoStatus,
} from '@torres/shared';
import type { OpcaoCampo } from '@/components/shared/form/tipos';

export const OPCOES_STATUS: readonly OpcaoCampo[] = [
  { valor: 'ativo', rotulo: 'Ativo' },
  { valor: 'inativo', rotulo: 'Inativo' },
];

export const OPCOES_TIPO_CONTRATO: readonly OpcaoCampo[] = [
  { valor: '', rotulo: 'Selecione' },
  ...Object.entries(FUNCIONARIO_TIPO_CONTRATO_ROTULOS).map(([valor, rotulo]) => ({
    valor,
    rotulo,
  })),
];

export const OPCOES_STATUS_COMISSAO: readonly OpcaoCampo[] = (
  Object.entries(COMISSAO_STATUS_ROTULOS) as [ComissaoStatus, string][]
).map(([valor, rotulo]) => ({ valor, rotulo }));
