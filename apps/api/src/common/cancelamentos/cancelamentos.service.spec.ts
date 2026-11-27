import type { TransactionHost } from '@nestjs-cls/transactional';
import type { PrismaAdapter } from '../prisma/prisma-transaction';
import type { RequestContextService } from '../context/request-context.service';
import { CancelamentosService } from './cancelamentos.service';

const MOTIVO = '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const ENTIDADE = '1b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const PROFISSIONAL = '2b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const USUARIO = '3b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';

const MOTIVO_VALOR = { id: MOTIVO, tipo: 'CONSULTA', nome: 'Paciente desistiu', exigeTexto: false };
const MOTIVO_OUTRO = { id: MOTIVO, tipo: 'CONSULTA', nome: 'Outro', exigeTexto: true };

function criar(motivo: Record<string, unknown> | null = MOTIVO_VALOR, usuario?: string) {
  const cancelamento = {
    create: jest.fn(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({
        id: '9b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f',
        canceladoEm: new Date('2026-11-25T12:00:00Z'),
        observacao: null,
        profissionalId: null,
        reagendouParaId: null,
        canceladoPorId: null,
        ...data,
      }),
    ),
  };
  const motivoCancelamento = {
    findFirst: jest.fn().mockResolvedValue(motivo),
    findMany: jest.fn().mockResolvedValue(motivo ? [motivo] : []),
  };
  const txHost = {
    tx: { cancelamento, motivoCancelamento },
  } as unknown as TransactionHost<PrismaAdapter>;
  const contexto = { getUserId: () => usuario } as unknown as RequestContextService;
  return { service: new CancelamentosService(txHost, contexto), cancelamento, motivoCancelamento };
}

const ENTRADA = {
  tipo: 'CONSULTA',
  entidade: 'Agendamento',
  entidadeId: ENTIDADE,
  motivoId: MOTIVO,
} as const;

async function detalhes(promessa: Promise<unknown>) {
  try {
    await promessa;
    return null;
  } catch (erro) {
    return erro as { getStatus: () => number; details?: { field: string; message: string }[] };
  }
}

describe('CancelamentosService', () => {
  it('motivosDoTipo: só os ativos e não excluídos do tipo, na ordem da lista', async () => {
    const { service, motivoCancelamento } = criar();

    const motivos = await service.motivosDoTipo('CONSULTA');

    expect(motivoCancelamento.findMany).toHaveBeenCalledWith({
      where: { tipo: 'CONSULTA', ativo: true, deletedAt: null },
      orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
    });
    expect(motivos).toEqual([{ id: MOTIVO, nome: 'Paciente desistiu', exigeTexto: false }]);
  });

  describe('registrar', () => {
    it('grava quem, quando, o motivo da lista, a observação e o profissional', async () => {
      const { service, cancelamento } = criar(MOTIVO_VALOR, USUARIO);

      const dto = await service.registrar({
        ...ENTRADA,
        observacao: '  Viagem  ',
        profissionalId: PROFISSIONAL,
      });

      expect(cancelamento.create).toHaveBeenCalledWith({
        data: {
          tipo: 'CONSULTA',
          entidade: 'Agendamento',
          entidadeId: ENTIDADE,
          motivoId: MOTIVO,
          motivoNome: 'Paciente desistiu',
          observacao: 'Viagem',
          canceladoPorId: USUARIO,
          profissionalId: PROFISSIONAL,
          reagendouParaId: null,
        },
      });
      expect(dto).toMatchObject({
        tipo: 'CONSULTA',
        motivo: 'Paciente desistiu',
        canceladoPorId: USUARIO,
        canceladoEm: '2026-11-25T12:00:00.000Z',
      });
    });

    it('sem usuário no contexto (rotina), grava como sistema', async () => {
      const { service, cancelamento } = criar();
      await service.registrar(ENTRADA);
      expect(cancelamento.create.mock.calls[0]?.[0].data.canceladoPorId).toBeNull();
    });

    it('guarda o novo agendamento quando a consulta foi reagendada', async () => {
      const novo = '4b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
      const { service, cancelamento } = criar();
      await service.registrar({ ...ENTRADA, reagendouParaId: novo });
      expect(cancelamento.create.mock.calls[0]?.[0].data.reagendouParaId).toBe(novo);
    });

    it('motivo inexistente, inativo, excluído ou de outro tipo: 400 no campo motivoId', async () => {
      const { service, cancelamento, motivoCancelamento } = criar(null);

      const erro = await detalhes(service.registrar(ENTRADA));

      expect(erro?.getStatus()).toBe(400);
      expect(erro?.details).toEqual([{ field: 'motivoId', message: 'Motivo inválido' }]);
      expect(motivoCancelamento.findFirst).toHaveBeenCalledWith({
        where: { id: MOTIVO, tipo: 'CONSULTA', ativo: true, deletedAt: null },
      });
      expect(cancelamento.create).not.toHaveBeenCalled();
    });

    it.each([undefined, null, '', '   '])(
      'motivo "Outro" exige a observação (%j): 400 no campo observacao',
      async (observacao) => {
        const { service, cancelamento } = criar(MOTIVO_OUTRO);

        const erro = await detalhes(service.registrar({ ...ENTRADA, observacao }));

        expect(erro?.getStatus()).toBe(400);
        expect(erro?.details).toEqual([
          { field: 'observacao', message: 'Observação é obrigatória.' },
        ]);
        expect(cancelamento.create).not.toHaveBeenCalled();
      },
    );

    it('motivo "Outro" com observação grava', async () => {
      const { service, cancelamento } = criar(MOTIVO_OUTRO);
      await service.registrar({ ...ENTRADA, observacao: 'Detalhe fictício' });
      expect(cancelamento.create).toHaveBeenCalledTimes(1);
    });

    it('reagendamento só vale para consulta: 400 nos demais tipos', async () => {
      const { service, cancelamento } = criar({ ...MOTIVO_VALOR, tipo: 'COBRANCA' });

      const erro = await detalhes(
        service.registrar({
          ...ENTRADA,
          tipo: 'COBRANCA',
          entidade: 'ContaPagar',
          reagendouParaId: ENTIDADE,
        }),
      );

      expect(erro?.getStatus()).toBe(400);
      expect(erro?.details?.[0]?.field).toBe('reagendouParaId');
      expect(cancelamento.create).not.toHaveBeenCalled();
    });
  });

  describe('registrarContratoCancelado', () => {
    it('usa o motivo de sistema "Contrato encerrado ou cancelado" do tipo cobrança', async () => {
      const { service, cancelamento, motivoCancelamento } = criar({
        id: MOTIVO,
        tipo: 'COBRANCA',
        nome: 'Contrato encerrado ou cancelado',
        exigeTexto: false,
      });

      await service.registrarContratoCancelado('ContaReceber', ENTIDADE);

      expect(motivoCancelamento.findFirst).toHaveBeenCalledWith({
        where: { tipo: 'COBRANCA', codigo: 'contrato_cancelado', deletedAt: null },
      });
      expect(cancelamento.create.mock.calls[0]?.[0].data).toMatchObject({
        tipo: 'COBRANCA',
        entidade: 'ContaReceber',
        motivoNome: 'Contrato encerrado ou cancelado',
      });
    });

    it('sem o motivo de sistema cadastrado, falha sem gravar', async () => {
      const { service, cancelamento } = criar(null);
      const erro = await detalhes(service.registrarContratoCancelado('ContaReceber', ENTIDADE));
      expect(erro?.getStatus()).toBe(422);
      expect(cancelamento.create).not.toHaveBeenCalled();
    });
  });

  it('registrarNegocioPerdido: guarda só o nome do motivo de perda, sem motivoId', async () => {
    const { service, cancelamento } = criar();

    await service.registrarNegocioPerdido(ENTIDADE, 'Preço', PROFISSIONAL);

    expect(cancelamento.create.mock.calls[0]?.[0].data).toMatchObject({
      tipo: 'PROPOSTA',
      entidade: 'Negocio',
      entidadeId: ENTIDADE,
      motivoId: null,
      motivoNome: 'Preço',
      profissionalId: PROFISSIONAL,
    });
  });
});
