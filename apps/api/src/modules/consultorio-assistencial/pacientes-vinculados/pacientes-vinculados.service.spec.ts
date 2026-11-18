import type { TransactionHost } from '@nestjs-cls/transactional';
import { escopoFalso } from '../../../../test/utils/escopo-falso';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { PacientesVinculadosService } from './pacientes-vinculados.service';

const PROF = '1b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const PACIENTE = '2b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';

function setup(escopo?: string[], atendimentos = 1) {
  const atendimento = {
    groupBy: jest.fn().mockResolvedValue([{ pacienteId: PACIENTE }]),
    count: jest.fn().mockResolvedValue(atendimentos),
  };
  const txHost = { tx: { atendimento } } as unknown as TransactionHost<PrismaAdapter>;
  return { service: new PacientesVinculadosService(txHost, escopoFalso(escopo)), atendimento };
}

describe('PacientesVinculadosService', () => {
  it('sem restrição: todos os pacientes, sem consultar atendimentos', async () => {
    const { service, atendimento } = setup();
    await expect(service.idsNoEscopo()).resolves.toBeNull();
    await expect(service.permite(PACIENTE)).resolves.toBe(true);
    expect(atendimento.groupBy).not.toHaveBeenCalled();
    expect(atendimento.count).not.toHaveBeenCalled();
  });

  it('restrito: pacientes com atendimento de um profissional vinculado', async () => {
    const { service, atendimento } = setup([PROF]);
    await expect(service.idsNoEscopo()).resolves.toEqual([PACIENTE]);
    expect(atendimento.groupBy).toHaveBeenCalledWith({
      by: ['pacienteId'],
      where: { profissionalId: { in: [PROF] }, deletedAt: null },
    });
    await expect(service.garantir(PACIENTE)).resolves.toBeUndefined();
  });

  it('restrito: paciente sem atendimento com o profissional dá 403', async () => {
    const { service } = setup([PROF], 0);
    await expect(service.permite(PACIENTE)).resolves.toBe(false);
    await expect(service.garantir(PACIENTE)).rejects.toMatchObject({ status: 403 });
  });

  it('restrito sem vínculo: nenhum paciente, sem consultar o banco', async () => {
    const { service, atendimento } = setup([]);
    await expect(service.idsNoEscopo()).resolves.toEqual([]);
    await expect(service.permite(PACIENTE)).resolves.toBe(false);
    expect(atendimento.groupBy).not.toHaveBeenCalled();
    expect(atendimento.count).not.toHaveBeenCalled();
  });
});
