import { CONSULTA_LOOKUP, txHostFalso } from '../../../../test/utils/tx-host-falso';
import { cidadeUf, FornecedoresService } from './fornecedores.service';

const FORNECEDOR = {
  id: '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f',
  nome: 'Distribuidora Teste',
  cidade: 'Cuiabá',
  uf: 'MT',
};

describe('FornecedoresService', () => {
  it('lookup: ativos, busca por nome ou documento, descrição cidade/UF', async () => {
    const { txHost, delegate } = txHostFalso('fornecedor', [FORNECEDOR]);

    const page = await new FornecedoresService(txHost).lookup({
      ...CONSULTA_LOOKUP,
      search: '112',
    });

    expect(delegate.count.mock.calls[0][0].where).toEqual({
      deletedAt: null,
      ativo: true,
      OR: [
        { nome: { contains: '112', mode: 'insensitive' } },
        { documento: { contains: '112', mode: 'insensitive' } },
      ],
    });
    expect(page.data[0]).toEqual({
      id: FORNECEDOR.id,
      label: 'Distribuidora Teste',
      descricao: 'Cuiabá/MT',
    });
  });

  it('cidadeUf com partes faltando', () => {
    expect(cidadeUf({ cidade: null, uf: 'SP' })).toBe('SP');
    expect(cidadeUf({ cidade: 'Recife', uf: null })).toBe('Recife');
    expect(cidadeUf({ cidade: null, uf: null })).toBeNull();
  });

  it('404 quando não existe', async () => {
    const { txHost } = txHostFalso('fornecedor', []);

    await expect(new FornecedoresService(txHost).findById(FORNECEDOR.id)).rejects.toMatchObject({
      message: 'Fornecedor não encontrado',
    });
  });
});
