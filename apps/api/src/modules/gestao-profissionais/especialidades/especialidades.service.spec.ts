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
