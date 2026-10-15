import { CONSULTA_LOOKUP, txHostFalso } from '../../../../test/utils/tx-host-falso';
import { UnidadesMedidaService } from './unidades-medida.service';

const UNIDADE = { id: '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f', sigla: 'CX', nome: 'Caixa' };

describe('UnidadesMedidaService', () => {
  it('lookup: busca por sigla ou nome, rótulo "sigla – nome"', async () => {
    const { txHost, delegate } = txHostFalso('unidadeMedida', [UNIDADE]);

    const page = await new UnidadesMedidaService(txHost).lookup({
      ...CONSULTA_LOOKUP,
      search: 'cx',
    });

    expect(delegate.count.mock.calls[0][0].where).toEqual({
      deletedAt: null,
      OR: [
        { sigla: { contains: 'cx', mode: 'insensitive' } },
        { nome: { contains: 'cx', mode: 'insensitive' } },
      ],
    });
    expect(page.data[0]).toEqual({ id: UNIDADE.id, label: 'CX – Caixa', descricao: null });
  });

  it('404 quando não existe', async () => {
    const { txHost } = txHostFalso('unidadeMedida', []);

    await expect(new UnidadesMedidaService(txHost).findById(UNIDADE.id)).rejects.toMatchObject({
      message: 'Unidade de medida não encontrada',
    });
  });
});
