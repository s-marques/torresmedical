import type { ContaPagar } from '@torres/shared';
import { FornecedoresService } from '../../compras-estoque/fornecedores/fornecedores.service';
import { FuncionariosService } from '../../regulatorio-qualidade/funcionarios/funcionarios.service';

/** Nome do beneficiário pelo módulo dono; `null` se não há id ou o cadastro foi excluído depois. */
export async function nomeBeneficiario(
  fornecedores: FornecedoresService,
  funcionarios: FuncionariosService,
  tipo: ContaPagar['beneficiarioTipo'],
  beneficiarioId: string | null,
): Promise<string | null> {
  if (!beneficiarioId) return null;
  try {
    const registro =
      tipo === 'FORNECEDOR'
        ? await fornecedores.findById(beneficiarioId)
        : await funcionarios.findById(beneficiarioId);
    return registro.nome;
  } catch {
    return null;
  }
}
