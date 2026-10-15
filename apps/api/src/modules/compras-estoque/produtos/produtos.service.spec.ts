import { CONSULTA_LOOKUP, txHostFalso } from '../../../../test/utils/tx-host-falso';
import { ProdutosService } from './produtos.service';

const PRODUTO = {
  id: '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f',
  nome: 'Soro fisiológico',
  tipo: 'PRODUTO',
  codigo: '7890000000001',
};

describe('ProdutosService', () => {
  it('lookup: ativos, filtro por tipo, busca por nome ou código', async () => {
    const { txHost, delegate } = txHostFalso('produto', [PRODUTO]);

    const page = await new ProdutosService(txHost).lookup({
      ...CONSULTA_LOOKUP,
      search: '789',
      tipo: 'produto',
    });

    expect(delegate.count.mock.calls[0][0].where).toEqual({
      deletedAt: null,
      ativo: true,
      tipo: 'PRODUTO',
      OR: [
        { nome: { contains: '789', mode: 'insensitive' } },
        { codigo: { contains: '789', mode: 'insensitive' } },
      ],
    });
    expect(page.data[0]).toEqual({
      id: PRODUTO.id,
      label: 'Soro fisiológico',
      descricao: 'Produto · 7890000000001',
    });
  });

  it('serviço sem código e sem filtro de tipo', async () => {
    const { txHost, delegate } = txHostFalso('produto', [
      { ...PRODUTO, tipo: 'SERVICO', codigo: null },
    ]);

    const page = await new ProdutosService(txHost).lookup(CONSULTA_LOOKUP);

    expect(delegate.count.mock.calls[0][0].where.tipo).toBeUndefined();
    expect(page.data[0]?.descricao).toBe('Serviço');
  });
});
