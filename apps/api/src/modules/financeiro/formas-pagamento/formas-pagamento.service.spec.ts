import { CONSULTA_LOOKUP, txHostFalso } from '../../../../test/utils/tx-host-falso';
import { FormasPagamentoService } from './formas-pagamento.service';

const FORMA = { id: '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f', nome: 'Boleto', finalidade: 'PAGAR' };

describe('FormasPagamentoService', () => {
  it('lookup: ativas, filtro por finalidade, descrição com a finalidade', async () => {
    const { txHost, delegate } = txHostFalso('formaPagamento', [FORMA]);

    const page = await new FormasPagamentoService(txHost).lookup({
      ...CONSULTA_LOOKUP,
      finalidade: 'pagar',
    });

    expect(delegate.count).toHaveBeenCalledWith({
      where: { deletedAt: null, ativo: true, finalidade: 'PAGAR' },
    });
    expect(page.data[0]).toEqual({ id: FORMA.id, label: 'Boleto', descricao: 'Pagar' });
  });

  it('sem finalidade não filtra; 404 quando não existe', async () => {
    const { txHost, delegate } = txHostFalso('formaPagamento', [
      { ...FORMA, finalidade: 'RECEBER' },
    ]);

    const page = await new FormasPagamentoService(txHost).lookup({
      ...CONSULTA_LOOKUP,
      finalidade: 'receber',
    });
    await new FormasPagamentoService(txHost).lookup(CONSULTA_LOOKUP);

    expect(page.data[0]?.descricao).toBe('Receber');
    expect(delegate.count.mock.calls[1][0].where.finalidade).toBeUndefined();
    const vazio = txHostFalso('formaPagamento', []);
    await expect(new FormasPagamentoService(vazio.txHost).findById(FORMA.id)).rejects.toMatchObject(
      {
        message: 'Forma de pagamento não encontrada',
      },
    );
  });
});
