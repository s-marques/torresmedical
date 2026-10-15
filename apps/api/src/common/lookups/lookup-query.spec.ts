import { ApiException } from '../errors/api.exception';
import {
  buscarPorId,
  EntidadeLookupService,
  juntarDescricao,
  listarLookup,
  type ConsultaLookup,
  type FonteLookup,
} from './lookup-query';

const ID = '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';

interface Registro {
  id: string;
  nome: string;
}

function fonteFalsa(registros: Registro[]) {
  return {
    findMany: jest.fn().mockResolvedValue(registros),
    count: jest.fn().mockResolvedValue(registros.length),
    findFirst: jest.fn().mockResolvedValue(registros[0] ?? null),
  } satisfies FonteLookup<object, Registro>;
}

const toItem = (r: Registro) => ({ id: r.id, label: r.nome, descricao: null });

async function erro(promessa: Promise<unknown>): Promise<ApiException> {
  try {
    await promessa;
  } catch (error) {
    if (error instanceof ApiException) return error;
  }
  throw new Error('esperava ApiException');
}

describe('listarLookup', () => {
  it('pagina, ordena por nome (desempate por id) e converte em itens', async () => {
    const fonte = fonteFalsa([{ id: ID, nome: 'Ana' }]);
    const where = { ativo: true };

    const page = await listarLookup(
      { page: 3, pageSize: 5, sort: { field: 'nome', direction: 'desc' } },
      fonte,
      where,
      toItem,
    );

    expect(fonte.findMany).toHaveBeenCalledWith({
      where,
      orderBy: [{ nome: 'desc' }, { id: 'desc' }],
      skip: 10,
      take: 5,
    });
    expect(fonte.count).toHaveBeenCalledWith({ where });
    expect(page).toEqual({
      data: [{ id: ID, label: 'Ana', descricao: null }],
      meta: { page: 3, pageSize: 5, total: 1, totalPages: 1 },
    });
  });
});

describe('buscarPorId', () => {
  it('busca não excluído pelo id', async () => {
    const fonte = fonteFalsa([{ id: ID, nome: 'Ana' }]);

    await expect(buscarPorId(fonte, ID, 'Não encontrado')).resolves.toEqual({
      id: ID,
      nome: 'Ana',
    });
    expect(fonte.findFirst).toHaveBeenCalledWith({ where: { id: ID, deletedAt: null } });
  });

  it('404 quando não existe', async () => {
    const e = await erro(buscarPorId(fonteFalsa([]), ID, 'Cargo não encontrado'));

    expect(e.getStatus()).toBe(404);
    expect(e.getResponse()).toMatchObject({ code: 'NOT_FOUND', message: 'Cargo não encontrado' });
  });

  it('404 sem consultar o banco quando o id não é uuid', async () => {
    const fonte = fonteFalsa([{ id: ID, nome: 'Ana' }]);

    expect((await erro(buscarPorId(fonte, 'abc', 'x'))).getStatus()).toBe(404);
    expect(fonte.findFirst).not.toHaveBeenCalled();
  });
});

describe('juntarDescricao', () => {
  it('junta só as partes preenchidas', () => {
    expect(juntarDescricao('Pediatria', null, '  ', undefined, 'CRM 1')).toBe('Pediatria · CRM 1');
    expect(juntarDescricao(null, '')).toBeNull();
  });
});

describe('EntidadeLookupService', () => {
  class Servico extends EntidadeLookupService<ConsultaLookup, object, Registro> {
    protected readonly naoEncontrado = 'Registro não encontrado';
    constructor(protected readonly fonte: FonteLookup<object, Registro>) {
      super();
    }
    protected filtro(): object {
      return { deletedAt: null };
    }
    protected toItem(registro: Registro) {
      return toItem(registro);
    }
  }

  it('lookup usa o filtro do service; findLookupById converte o registro', async () => {
    const fonte = fonteFalsa([{ id: ID, nome: 'Ana' }]);
    const servico = new Servico(fonte);

    const page = await servico.lookup({
      page: 1,
      pageSize: 10,
      sort: { field: 'nome', direction: 'asc' },
    });

    expect(fonte.count).toHaveBeenCalledWith({ where: { deletedAt: null } });
    expect(page.data).toEqual([{ id: ID, label: 'Ana', descricao: null }]);
    await expect(servico.findLookupById(ID)).resolves.toEqual({
      id: ID,
      label: 'Ana',
      descricao: null,
    });
  });

  it('findById responde 404 com a mensagem do service', async () => {
    const e = await erro(new Servico(fonteFalsa([])).findById(ID));

    expect(e.getResponse()).toMatchObject({ message: 'Registro não encontrado' });
  });
});
