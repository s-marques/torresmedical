import { CONSULTA_LOOKUP, txHostFalso } from '../../../../test/utils/tx-host-falso';
import { EmpresasService } from './empresas.service';

const EMPRESA = { id: '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f', nome: 'Clínica Teste' };

describe('EmpresasService', () => {
  it('lookup: não excluídas (sem status) com busca por nome', async () => {
    const { txHost, delegate } = txHostFalso('empresa', [EMPRESA]);

    const page = await new EmpresasService(txHost).lookup({ ...CONSULTA_LOOKUP, search: 'cli' });

    expect(delegate.count).toHaveBeenCalledWith({
      where: { deletedAt: null, OR: [{ nome: { contains: 'cli', mode: 'insensitive' } }] },
    });
    expect(page.data).toEqual([{ id: EMPRESA.id, label: 'Clínica Teste', descricao: null }]);
  });

  it('404 quando não existe', async () => {
    const { txHost } = txHostFalso('empresa', []);

    await expect(new EmpresasService(txHost).findById(EMPRESA.id)).rejects.toMatchObject({
      message: 'Empresa não encontrada',
    });
  });
});
