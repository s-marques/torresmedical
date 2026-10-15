import { PATH_METADATA } from '@nestjs/common/constants';
import { LOOKUP_PERMISSOES, type LookupEntidade } from '@torres/shared';
import { PERMISSION_METADATA } from '../auth/auth.decorators';
import { criarLookupController, type ProvedorLookup } from './lookup.controller';

const ITEM = { id: '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f', label: 'PIX', descricao: 'Receber' };
const PAGE = { data: [ITEM], meta: { page: 1, pageSize: 10, total: 1, totalPages: 1 } };

class ProvedorFalso implements ProvedorLookup<LookupEntidade> {
  lookup = jest.fn().mockResolvedValue(PAGE);
  findLookupById = jest.fn().mockResolvedValue(ITEM);
}

describe('criarLookupController', () => {
  const Controller = criarLookupController('formas-pagamento', ProvedorFalso);

  it('rota, nome e permissões (qualquer uma das telas que usam a entidade)', () => {
    expect(Controller.name).toBe('FormasPagamentoLookupController');
    expect(Reflect.getMetadata(PATH_METADATA, Controller)).toBe('lookups/formas-pagamento');
    expect(Reflect.getMetadata(PERMISSION_METADATA, Controller)).toEqual(
      LOOKUP_PERMISSOES['formas-pagamento'],
    );
  });

  it('delega a listagem e o item ao service do módulo dono', async () => {
    const provedor = new ProvedorFalso();
    const controller = new Controller(provedor) as {
      list(query: unknown): Promise<unknown>;
      findById(id: string): Promise<unknown>;
    };
    const query = { page: 1, pageSize: 10, sort: { field: 'nome', direction: 'asc' } };

    await expect(controller.list(query)).resolves.toBe(PAGE);
    await expect(controller.findById(ITEM.id)).resolves.toBe(ITEM);
    expect(provedor.lookup).toHaveBeenCalledWith(query);
    expect(provedor.findLookupById).toHaveBeenCalledWith(ITEM.id);
  });
});
