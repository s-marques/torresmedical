import type { TransactionHost } from '@nestjs-cls/transactional';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { MotivosCancelamentoService } from './motivos-cancelamento.service';

const ID = '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const DATA = new Date('2026-11-25T12:00:00Z');

function motivo(extra: Record<string, unknown> = {}) {
  return {
    id: ID,
    tipo: 'CONSULTA',
    nome: 'Paciente desistiu',
    codigo: 'paciente-desistiu',
    exigeTexto: false,
    sistema: false,
    ordem: 1,
    ativo: true,
    createdAt: DATA,
    updatedAt: DATA,
    deletedAt: null,
    ...extra,
  };
}

function criar(
  atual: Record<string, unknown> | null = motivo(),
  duplicado: unknown = null,
  buscaPorId = true,
) {
  const delegate = {
    findMany: jest.fn().mockResolvedValue(atual ? [atual] : []),
    count: jest.fn().mockResolvedValue(atual ? 1 : 0),
    // 1ª chamada: o registro pelo id; 2ª: conferência de nome duplicado.
    findFirst: buscaPorId
      ? jest.fn().mockResolvedValueOnce(atual).mockResolvedValue(duplicado)
      : jest.fn().mockResolvedValue(duplicado),
    aggregate: jest.fn().mockResolvedValue({ _max: { ordem: 3 } }),
    create: jest.fn(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve(motivo({ ...data, sistema: false, ativo: true })),
    ),
    update: jest.fn(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ ...(atual ?? motivo()), ...data }),
    ),
  };
  const txHost = {
    tx: { motivoCancelamento: delegate },
  } as unknown as TransactionHost<PrismaAdapter>;
  return { service: new MotivosCancelamentoService(txHost), delegate };
}

async function erroDe(promessa: Promise<unknown>) {
  try {
    await promessa;
    return null;
  } catch (erro) {
    return erro as { getStatus: () => number; code: string };
  }
}

describe('MotivosCancelamentoService', () => {
  it('list: sem excluídos, por tipo e situação, ordenando por tipo e depois pela lista', async () => {
    const { service, delegate } = criar();

    const page = await service.list({
      page: 1,
      pageSize: 10,
      sort: { field: 'ordem', direction: 'asc' },
      tipo: 'CONSULTA',
      status: 'ativo',
      search: 'desist',
    });

    expect(delegate.findMany).toHaveBeenCalledWith({
      where: {
        deletedAt: null,
        tipo: 'CONSULTA',
        ativo: true,
        OR: [{ nome: { contains: 'desist', mode: 'insensitive' } }],
      },
      orderBy: [{ tipo: 'asc' }, { ordem: 'asc' }, { id: 'asc' }],
      skip: 0,
      take: 10,
    });
    expect(page.meta.total).toBe(1);
    expect(page.data[0]).toMatchObject({ id: ID, nome: 'Paciente desistiu', ativo: true });
    expect(page.data[0]?.createdAt).toBe('2026-11-25T12:00:00.000Z');
  });

  it('findById: 404 quando não existe', async () => {
    const { service } = criar(null);
    expect((await erroDe(service.findById(ID)))?.getStatus()).toBe(404);
  });

  describe('create', () => {
    it('gera o código, coloca no fim da lista editável do tipo e não é de sistema', async () => {
      const { service, delegate } = criar(null, null, false);

      await service.create({ tipo: 'PROPOSTA', nome: 'Preço alto', exigeTexto: false });

      expect(delegate.aggregate).toHaveBeenCalledWith({
        where: { tipo: 'PROPOSTA', sistema: false, deletedAt: null },
        _max: { ordem: true },
      });
      expect(delegate.create).toHaveBeenCalledWith({
        data: {
          tipo: 'PROPOSTA',
          nome: 'Preço alto',
          codigo: 'preco_alto',
          exigeTexto: false,
          ordem: 4,
        },
      });
    });

    it('nome repetido no mesmo tipo (sem diferenciar maiúsculas ou código): 409', async () => {
      const { service, delegate } = criar(null, motivo(), false);

      const erro = await erroDe(
        service.create({ tipo: 'CONSULTA', nome: 'PACIENTE DESISTIU', exigeTexto: false }),
      );

      expect(erro?.getStatus()).toBe(409);
      expect(erro?.code).toBe('DUPLICATE');
      expect(delegate.create).not.toHaveBeenCalled();
    });

    it('nome sem letras nem números: 400', async () => {
      const { service, delegate } = criar(null, null, false);
      const erro = await erroDe(
        service.create({ tipo: 'CONSULTA', nome: '---', exigeTexto: false }),
      );
      expect(erro?.getStatus()).toBe(400);
      expect(delegate.create).not.toHaveBeenCalled();
    });

    it('a ordem nunca passa dos motivos de sistema (98)', async () => {
      const { service, delegate } = criar(null, null, false);
      delegate.aggregate.mockResolvedValue({ _max: { ordem: 98 } });
      await service.create({ tipo: 'CONSULTA', nome: 'Novo motivo', exigeTexto: false });
      expect(delegate.create.mock.calls[0]?.[0].data.ordem).toBe(98);
    });
  });

  describe('update', () => {
    it('renomeia e regera o código, conferindo duplicidade ignorando o próprio', async () => {
      const { service, delegate } = criar();

      await service.update(ID, { nome: 'Desistência do paciente' });

      expect(delegate.findFirst.mock.calls[1]?.[0].where).toMatchObject({
        tipo: 'CONSULTA',
        deletedAt: null,
        id: { not: ID },
      });
      expect(delegate.update).toHaveBeenCalledWith({
        where: { id: ID },
        data: {
          exigeTexto: undefined,
          ativo: undefined,
          nome: 'Desistência do paciente',
          codigo: 'desistencia_do_paciente',
        },
      });
    });

    it('desativa e muda o texto obrigatório sem tocar no nome', async () => {
      const { service, delegate } = criar();
      await service.update(ID, { ativo: false, exigeTexto: true });
      expect(delegate.update).toHaveBeenCalledWith({
        where: { id: ID },
        data: { exigeTexto: true, ativo: false },
      });
    });

    it('nome igual ao de outro motivo do tipo: 409', async () => {
      const { service, delegate } = criar(motivo(), motivo({ id: 'outro' }));
      expect((await erroDe(service.update(ID, { nome: 'Erro de agendamento' })))?.getStatus()).toBe(
        409,
      );
      expect(delegate.update).not.toHaveBeenCalled();
    });

    it.each([
      ['renomear', { nome: 'Outra coisa' }],
      ['desativar', { ativo: false }],
      ['tirar a exigência de texto', { exigeTexto: false }],
    ])('motivo de sistema não pode %s', async (_nome, alteracao) => {
      const { service, delegate } = criar(
        motivo({ nome: 'Outro', codigo: 'outro', sistema: true, exigeTexto: true }),
      );

      const erro = await erroDe(service.update(ID, alteracao));

      expect(erro?.getStatus()).toBe(422);
      expect(erro?.code).toBe('MOTIVO_CANCELAMENTO_SISTEMA');
      expect(delegate.update).not.toHaveBeenCalled();
    });

    it('motivo de sistema aceita uma alteração que não muda nada', async () => {
      const { service, delegate } = criar(
        motivo({ nome: 'Outro', codigo: 'outro', sistema: true, exigeTexto: true }),
      );
      await service.update(ID, { nome: 'Outro', ativo: true, exigeTexto: true });
      expect(delegate.update).toHaveBeenCalledTimes(1);
    });

    it('404 quando não existe', async () => {
      const { service } = criar(null);
      expect((await erroDe(service.update(ID, { ativo: false })))?.getStatus()).toBe(404);
    });
  });

  describe('remove', () => {
    it('exclusão lógica: cancelamentos antigos continuam apontando para o motivo', async () => {
      const { service, delegate } = criar();

      await service.remove(ID);

      expect(delegate.update).toHaveBeenCalledWith({
        where: { id: ID },
        data: { deletedAt: expect.any(Date) },
      });
    });

    it('motivo de sistema não é excluído', async () => {
      const { service, delegate } = criar(motivo({ sistema: true }));
      const erro = await erroDe(service.remove(ID));
      expect(erro?.code).toBe('MOTIVO_CANCELAMENTO_SISTEMA');
      expect(delegate.update).not.toHaveBeenCalled();
    });
  });
});
