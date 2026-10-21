import { txHostFalso } from '../../../../test/utils/tx-host-falso';
import { BandeirasService } from './bandeiras.service';

const BANDEIRA = { id: '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f', nome: 'Visa', icone: 'fa-cc-visa' };

describe('BandeirasService', () => {
  it('list: não excluídas, busca por nome, ordenação e paginação', async () => {
    const { txHost, delegate } = txHostFalso('bandeira', [BANDEIRA]);

    const page = await new BandeirasService(txHost).list({
      page: 1,
      pageSize: 10,
      sort: { field: 'nome', direction: 'asc' },
      search: 'vi',
    });

    const where = { deletedAt: null, OR: [{ nome: { contains: 'vi', mode: 'insensitive' } }] };
    expect(delegate.findMany).toHaveBeenCalledWith({
      where,
      orderBy: [{ nome: 'asc' }, { id: 'asc' }],
      skip: 0,
      take: 10,
    });
    expect(page.meta.total).toBe(1);
  });

  it('create grava nome e ícone', async () => {
    const { txHost, delegate } = txHostFalso('bandeira', [BANDEIRA]);

    await new BandeirasService(txHost).create({ nome: 'Visa', icone: 'fa-cc-visa' });

    expect(delegate.create).toHaveBeenCalledWith({ data: { nome: 'Visa', icone: 'fa-cc-visa' } });
  });
});
