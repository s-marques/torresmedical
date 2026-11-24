import type { TransactionHost } from '@nestjs-cls/transactional';
import { escopoFalso } from '../../../../test/utils/escopo-falso';
import type { RequestContextService } from '../../../common/context/request-context.service';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { AcessoProntuarioService } from './acesso-prontuario.service';

const PACIENTE = '2b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';

function setup(
  contexto: Partial<Record<'userId' | 'requestId' | 'ip', string>>,
  escopo?: string[],
) {
  const prontuarioAcesso = {
    create: jest.fn().mockResolvedValue({}),
    findMany: jest.fn().mockResolvedValue([
      {
        id: '3b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f',
        usuarioId: 'u1',
        pacienteId: PACIENTE,
        recurso: 'ANAMNESES',
        acessadoEm: new Date('2026-11-24T10:00:00Z'),
        requestId: null,
        ip: null,
      },
    ]),
    count: jest.fn().mockResolvedValue(1),
  };
  const txHost = { tx: { prontuarioAcesso } } as unknown as TransactionHost<PrismaAdapter>;
  const context = {
    getUserId: () => contexto.userId,
    getRequestId: () => contexto.requestId,
    getIp: () => contexto.ip,
  } as unknown as RequestContextService;
  return {
    service: new AcessoProntuarioService(txHost, context, escopoFalso(escopo)),
    prontuarioAcesso,
  };
}

describe('AcessoProntuarioService', () => {
  it('registra usuário, paciente, recurso e rastreio da requisição', async () => {
    const { service, prontuarioAcesso } = setup({ userId: 'u1', requestId: 'r1', ip: '10.0.0.1' });
    await service.registrar(PACIENTE, 'RECEITAS');
    expect(prontuarioAcesso.create).toHaveBeenCalledWith({
      data: {
        usuarioId: 'u1',
        pacienteId: PACIENTE,
        recurso: 'RECEITAS',
        requestId: 'r1',
        ip: '10.0.0.1',
      },
    });
  });

  it('fora de uma requisição, grava como system, sem rastreio', async () => {
    const { service, prontuarioAcesso } = setup({});
    await service.registrar(PACIENTE, 'PRONTUARIO');
    expect(prontuarioAcesso.create).toHaveBeenCalledWith({
      data: {
        usuarioId: 'system',
        pacienteId: PACIENTE,
        recurso: 'PRONTUARIO',
        requestId: null,
        ip: null,
      },
    });
  });

  it('lista com filtros e converte a data', async () => {
    const { service, prontuarioAcesso } = setup({ userId: 'u1' });
    const pagina = await service.listar({ page: 1, pageSize: 50, pacienteId: PACIENTE });
    expect(prontuarioAcesso.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { pacienteId: PACIENTE, usuarioId: undefined, recurso: undefined },
      }),
    );
    expect(pagina.data[0]).toMatchObject({
      recurso: 'ANAMNESES',
      acessadoEm: '2026-11-24T10:00:00.000Z',
    });
    expect(pagina.meta).toMatchObject({ total: 1, totalPages: 1 });
  });

  it('usuário com escopo restrito não consulta o log (403)', async () => {
    const { service, prontuarioAcesso } = setup({ userId: 'u1' }, ['p1']);
    await expect(service.listar({ page: 1, pageSize: 50 })).rejects.toMatchObject({ status: 403 });
    expect(prontuarioAcesso.findMany).not.toHaveBeenCalled();
  });
});
