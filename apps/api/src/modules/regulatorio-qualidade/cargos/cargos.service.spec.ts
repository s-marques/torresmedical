import type { ExportService } from '../../../common/export/export.service';
import { CONSULTA_LOOKUP, txHostFalso } from '../../../../test/utils/tx-host-falso';
import { CargosService } from './cargos.service';

const CARGO = {
  id: '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f',
  nome: 'Recepção',
  departamento: null,
};
const EXPORT_SERVICE = {} as ExportService;

describe('CargosService', () => {
  it('lookup: ativos com busca por nome', async () => {
    const { txHost, delegate } = txHostFalso('cargo', [CARGO]);

    const page = await new CargosService(txHost, EXPORT_SERVICE).lookup(CONSULTA_LOOKUP);

    expect(delegate.count).toHaveBeenCalledWith({ where: { deletedAt: null, ativo: true } });
    expect(page.data).toEqual([{ id: CARGO.id, label: 'Recepção', descricao: null }]);
  });

  it('404 quando não existe', async () => {
    const { txHost } = txHostFalso('cargo', []);

    await expect(
      new CargosService(txHost, EXPORT_SERVICE).findById(CARGO.id),
    ).rejects.toMatchObject({
      message: 'Cargo não encontrado',
    });
  });
});
