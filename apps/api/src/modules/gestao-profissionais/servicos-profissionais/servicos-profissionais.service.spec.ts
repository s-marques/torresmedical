import type { TransactionHost } from '@nestjs-cls/transactional';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import type { ServicoEmUsoVerificador } from './servico-em-uso';
import { ServicosProfissionaisService } from './servicos-profissionais.service';

const ID = '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const PROFISSIONAL_ID = '1c0d2a8f-2b3c-4d4e-9fa0-1b2c3d4e5f60';
const AGORA = new Date('2026-10-21T12:00:00Z');
const SERVICO = {
  id: ID,
  profissionalId: PROFISSIONAL_ID,
  nome: 'Consulta',
  categoria: null,
  valor: '150.5',
  duracaoMinutos: 30,
  descricao: null,
  ativo: true,
  createdAt: AGORA,
  updatedAt: AGORA,
  profissional: { nome: 'Dra. Teste' },
};
const QUERY = {
  page: 1,
  pageSize: 100,
  sort: { field: 'nome', direction: 'asc' },
  search: undefined,
} as const;

function setup(opcoes: { servico?: unknown; profissionais?: number; emUso?: string[] } = {}) {
  const servico = {
    findMany: jest.fn().mockResolvedValue([SERVICO]),
    count: jest.fn().mockResolvedValue(1),
    findFirst: jest.fn().mockResolvedValue('servico' in opcoes ? opcoes.servico : SERVICO),
    create: jest.fn().mockResolvedValue(SERVICO),
    update: jest.fn().mockResolvedValue(SERVICO),
    delete: jest.fn().mockResolvedValue(SERVICO),
  };
  const profissional = { count: jest.fn().mockResolvedValue(opcoes.profissionais ?? 1) };
  const txHost = {
    tx: { servicoProfissional: servico, profissional },
  } as unknown as TransactionHost<PrismaAdapter>;
  const verificador: ServicoEmUsoVerificador = {
    emUso: jest.fn().mockResolvedValue(new Set(opcoes.emUso ?? [])),
  };
  return {
    service: new ServicosProfissionaisService(txHost, [verificador]),
    servico,
    profissional,
  };
}

describe('ServicosProfissionaisService', () => {
  it('list: agrupa por profissional, filtra e converte o valor', async () => {
    const { service, servico } = setup({ emUso: [ID] });

    const page = await service.list({
      ...QUERY,
      search: 'cons',
      profissionalId: PROFISSIONAL_ID,
      status: 'ativo',
    });

    expect(servico.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          profissionalId: PROFISSIONAL_ID,
          profissional: { deletedAt: null },
          ativo: true,
          OR: [
            { nome: { contains: 'cons', mode: 'insensitive' } },
            { categoria: { contains: 'cons', mode: 'insensitive' } },
            { descricao: { contains: 'cons', mode: 'insensitive' } },
          ],
        },
        orderBy: [{ profissional: { nome: 'asc' } }, { nome: 'asc' }, { id: 'asc' }],
      }),
    );
    expect(page.data[0]).toMatchObject({
      profissionalNome: 'Dra. Teste',
      valor: 150.5,
      emUso: true,
    });
  });

  it('create: 400 quando o profissional não existe', async () => {
    const { service, servico } = setup({ profissionais: 0 });

    await expect(
      service.create({
        profissionalId: PROFISSIONAL_ID,
        nome: 'X',
        categoria: null,
        valor: 0,
        duracaoMinutos: 30,
        descricao: null,
      }),
    ).rejects.toMatchObject({ code: 'PROFISSIONAL_INVALIDO', status: 400 });
    expect(servico.create).not.toHaveBeenCalled();
  });

  it('alterarStatus: ativa e desativa; 404 se não existe', async () => {
    const { service, servico } = setup();
    await service.alterarStatus(ID, false);
    expect(servico.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: ID }, data: { ativo: false } }),
    );

    await expect(setup({ servico: null }).service.alterarStatus(ID, true)).rejects.toMatchObject({
      status: 404,
    });
  });

  it('remove: exclui o serviço livre', async () => {
    const { service, servico } = setup();
    await service.remove(ID);
    expect(servico.delete).toHaveBeenCalledWith({ where: { id: ID } });
  });

  it('remove: 409 SERVICO_EM_USO quando algum cadastro o referencia', async () => {
    const { service, servico } = setup({ emUso: [ID] });
    await expect(service.remove(ID)).rejects.toMatchObject({
      code: 'SERVICO_EM_USO',
      status: 409,
    });
    expect(servico.delete).not.toHaveBeenCalled();
  });

  it('id que não é uuid vira 404', async () => {
    await expect(setup().service.findById('abc')).rejects.toMatchObject({ status: 404 });
  });
});
