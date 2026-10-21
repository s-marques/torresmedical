import { CONSULTA_LOOKUP, txHostFalso } from '../../../../test/utils/tx-host-falso';
import { EspecialidadesService } from './especialidades.service';

const ESPECIALIDADE = { id: '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f', nome: 'Pediatria' };

describe('EspecialidadesService', () => {
  it('lookup: ativas com busca por nome', async () => {
    const { txHost, delegate } = txHostFalso('especialidade', [ESPECIALIDADE]);

    const page = await new EspecialidadesService(txHost).lookup({
      ...CONSULTA_LOOKUP,
      search: 'ped',
    });

    expect(delegate.count).toHaveBeenCalledWith({
      where: {
        deletedAt: null,
        ativo: true,
        OR: [{ nome: { contains: 'ped', mode: 'insensitive' } }],
      },
    });
    expect(page.data).toEqual([{ id: ESPECIALIDADE.id, label: 'Pediatria', descricao: null }]);
  });

  it('404 quando não existe', async () => {
    const { txHost } = txHostFalso('especialidade', []);

    await expect(
      new EspecialidadesService(txHost).findLookupById(ESPECIALIDADE.id),
    ).rejects.toMatchObject({
      message: 'Especialidade não encontrada',
    });
  });
});

describe('EspecialidadesService (modal Gerenciar Especialidades)', () => {
  function setup(registros: unknown[] = [ESPECIALIDADE]) {
    const { txHost, delegate } = txHostFalso('especialidade', registros);
    const profissional = { count: jest.fn().mockResolvedValue(0) };
    (txHost.tx as unknown as Record<string, unknown>).profissional = profissional;
    return { service: new EspecialidadesService(txHost), delegate, profissional };
  }

  it('list: não excluídas, com busca e ordem por nome', async () => {
    const { service, delegate } = setup([
      { ...ESPECIALIDADE, createdAt: new Date(0), updatedAt: new Date(0) },
    ]);

    const page = await service.list({
      page: 1,
      pageSize: 100,
      sort: { field: 'nome', direction: 'asc' },
      search: 'ped',
    });

    expect(delegate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deletedAt: null, OR: [{ nome: { contains: 'ped', mode: 'insensitive' } }] },
        orderBy: [{ nome: 'asc' }, { id: 'asc' }],
      }),
    );
    expect(page.data[0]).toMatchObject({
      nome: 'Pediatria',
      createdAt: '1970-01-01T00:00:00.000Z',
    });
  });

  it('create: bloqueia nome repetido, sem diferenciar maiúsculas', async () => {
    const { service, delegate } = setup();

    await expect(service.create({ nome: 'pediatria' })).rejects.toMatchObject({
      code: 'ESPECIALIDADE_DUPLICADA',
      status: 409,
    });
    expect(delegate.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ nome: { equals: 'pediatria', mode: 'insensitive' } }),
      }),
    );
    expect(delegate.create).not.toHaveBeenCalled();
  });

  it('create e update gravam quando o nome está livre', async () => {
    const { service, delegate } = setup([
      { ...ESPECIALIDADE, createdAt: new Date(), updatedAt: new Date() },
    ]);
    delegate.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(ESPECIALIDADE)
      .mockResolvedValueOnce(null);

    await service.create({ nome: 'Nova' });
    await service.update(ESPECIALIDADE.id, { nome: 'Outra' });

    expect(delegate.create).toHaveBeenCalledWith({ data: { nome: 'Nova' } });
    expect(delegate.update).toHaveBeenCalledWith({
      where: { id: ESPECIALIDADE.id },
      data: { nome: 'Outra' },
    });
  });

  it('remove: exclusão lógica; 409 se houver profissional vinculado; 404 se não existe', async () => {
    const livre = setup([{ ...ESPECIALIDADE, createdAt: new Date(), updatedAt: new Date() }]);
    await livre.service.remove(ESPECIALIDADE.id);
    expect(livre.delegate.update.mock.calls[0][0].data.deletedAt).toBeInstanceOf(Date);

    const emUso = setup();
    emUso.profissional.count.mockResolvedValue(2);
    await expect(emUso.service.remove(ESPECIALIDADE.id)).rejects.toMatchObject({
      code: 'ESPECIALIDADE_EM_USO',
      status: 409,
    });
    expect(emUso.delegate.update).not.toHaveBeenCalled();

    await expect(setup([]).service.remove(ESPECIALIDADE.id)).rejects.toMatchObject({ status: 404 });
  });
});
