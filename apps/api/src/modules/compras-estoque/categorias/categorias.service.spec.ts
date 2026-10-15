import { CONSULTA_LOOKUP, txHostFalso } from '../../../../test/utils/tx-host-falso';
import { CategoriasService } from './categorias.service';

const CATEGORIA = { id: '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f', nome: 'Estética', tipo: 'SERVICO' };

describe('CategoriasService', () => {
  it('lookup: não excluídas (sem status), filtro por tipo, descrição com o tipo', async () => {
    const { txHost, delegate } = txHostFalso('categoria', [CATEGORIA]);

    const page = await new CategoriasService(txHost).lookup({
      ...CONSULTA_LOOKUP,
      tipo: 'servico',
    });

    expect(delegate.count).toHaveBeenCalledWith({ where: { deletedAt: null, tipo: 'SERVICO' } });
    expect(page.data[0]).toEqual({ id: CATEGORIA.id, label: 'Estética', descricao: 'Serviço' });
  });

  it('404 quando não existe', async () => {
    const { txHost } = txHostFalso('categoria', []);

    await expect(new CategoriasService(txHost).findById(CATEGORIA.id)).rejects.toMatchObject({
      message: 'Categoria não encontrada',
    });
  });
});
