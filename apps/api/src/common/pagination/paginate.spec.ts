import { paginate, searchWhere, toOrderBy } from './paginate';

describe('paginate', () => {
  it('calcula skip/take e meta', async () => {
    const findMany = jest.fn().mockResolvedValue(['c']);
    const count = jest.fn().mockResolvedValue(21);

    const page = await paginate({ page: 3, pageSize: 10 }, { findMany, count });

    expect(findMany).toHaveBeenCalledWith({ skip: 20, take: 10 });
    expect(page).toEqual({
      data: ['c'],
      meta: { page: 3, pageSize: 10, total: 21, totalPages: 3 },
    });
  });

  it('total zero tem zero páginas', async () => {
    const page = await paginate(
      { page: 1, pageSize: 10 },
      { findMany: async () => [], count: async () => 0 },
    );
    expect(page.meta).toEqual({ page: 1, pageSize: 10, total: 0, totalPages: 0 });
  });
});

describe('toOrderBy', () => {
  it('ordena pelo campo e desempata por id', () => {
    expect(toOrderBy({ field: 'nome', direction: 'desc' })).toEqual([
      { nome: 'desc' },
      { id: 'desc' },
    ]);
  });

  it('traduz o campo do grid para a coluna', () => {
    expect(toOrderBy({ field: 'status', direction: 'asc' }, { status: 'ativo' })).toEqual([
      { ativo: 'asc' },
      { id: 'asc' },
    ]);
  });

  it('não repete o id', () => {
    expect(toOrderBy({ field: 'id', direction: 'asc' })).toEqual([{ id: 'asc' }]);
  });
});

describe('searchWhere', () => {
  it('busca sem diferenciar maiúsculas em qualquer campo', () => {
    expect(searchWhere('ana', ['nome', 'email'])).toEqual({
      OR: [
        { nome: { contains: 'ana', mode: 'insensitive' } },
        { email: { contains: 'ana', mode: 'insensitive' } },
      ],
    });
  });

  it('sem busca, sem filtro', () => {
    expect(searchWhere(undefined, ['nome'])).toBeUndefined();
    expect(searchWhere('', ['nome'])).toBeUndefined();
  });
});
