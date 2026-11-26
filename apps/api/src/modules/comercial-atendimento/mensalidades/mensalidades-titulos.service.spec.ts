import type { TransactionHost } from '@nestjs-cls/transactional';
import type { Mensalidade } from '@torres/shared';
import type { AuditService } from '../../../common/audit/audit.service';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import type { ContasReceberService } from '../../financeiro/contas-receber/contas-receber.service';
import { escopoFalso } from '../../../../test/utils/escopo-falso';
import { MensalidadesTitulosService } from './mensalidades-titulos.service';
import type { MensalidadesService } from './mensalidades.service';

// Sem CLS no teste unitário: a transação é testada no e2e.
jest.mock('@nestjs-cls/transactional', () => ({
  ...jest.requireActual('@nestjs-cls/transactional'),
  Transactional: () => () => undefined,
}));

const PACIENTE = '1a2b3c4d-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const PROFISSIONAL = '4d5e6f70-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const FORMA = '2b3c4d5e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';

const mensalidade = (id: string, extra: Partial<Mensalidade> = {}): Mensalidade => ({
  id,
  pacienteId: PACIENTE,
  cliente: 'Cliente Teste',
  descricao: `Plano ${id}`,
  valor: '150.5',
  diaVencimento: 10,
  formaPagamentoId: FORMA,
  dataInicio: '2026-01-01',
  dataFim: null,
  observacoes: null,
  status: 'ATIVO',
  ...extra,
});

function setup(ativas: Mensalidade[], jaGeradas: string[] = [], restrito = false) {
  const mensalidadeTitulo = {
    findMany: jest.fn().mockResolvedValue(jaGeradas.map((mensalidadeId) => ({ mensalidadeId }))),
    create: jest
      .fn()
      .mockImplementation(({ data }) =>
        Promise.resolve({ id: `titulo-${data.mensalidadeId}`, ...data }),
      ),
  };
  const txHost = { tx: { mensalidadeTitulo } } as unknown as TransactionHost<PrismaAdapter>;
  const mensalidades = { ativas: jest.fn().mockResolvedValue(ativas) };
  const contasReceber = {
    criarDeOrigemExterna: jest
      .fn()
      .mockImplementation((dados) => Promise.resolve({ id: `conta-${dados.descricao}` })),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new MensalidadesTitulosService(
    txHost,
    mensalidades as unknown as MensalidadesService,
    contasReceber as unknown as ContasReceberService,
    audit as unknown as AuditService,
    escopoFalso(restrito ? [PROFISSIONAL] : undefined),
  );
  return { service, mensalidadeTitulo, contasReceber, audit, mensalidades };
}

describe('MensalidadesTitulosService.gerar', () => {
  it('gera o título das vigentes no mês, com vencimento no dia e a forma de pagamento', async () => {
    const { service, contasReceber, mensalidadeTitulo, audit } = setup([
      mensalidade('a'),
      mensalidade('fora', { dataInicio: '2026-12-01' }),
    ]);

    const resumo = await service.gerar('2026-11');

    expect(resumo).toEqual({ competencia: '2026-11', geradas: 1, jaExistentes: 0 });
    expect(contasReceber.criarDeOrigemExterna).toHaveBeenCalledTimes(1);
    expect(contasReceber.criarDeOrigemExterna).toHaveBeenCalledWith({
      descricao: 'Mensalidade - Plano a',
      pacienteId: PACIENTE,
      competencia: '2026-11',
      valor: 150.5,
      dataVencimento: '2026-11-10',
      formaPagamentoId: FORMA,
      planoContaId: null,
      documento: null,
      totalParcelas: 1,
      status: 'PENDENTE',
      observacoes: null,
    });
    expect(mensalidadeTitulo.create).toHaveBeenCalledWith({
      data: {
        mensalidadeId: 'a',
        competencia: '2026-11',
        contaReceberId: 'conta-Mensalidade - Plano a',
      },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CREATE',
        entity: 'MensalidadeTitulo',
        entityId: 'titulo-a',
      }),
    );
  });

  it('não duplica: pula as que já têm título no mês', async () => {
    const { service, contasReceber, mensalidadeTitulo } = setup(
      [mensalidade('a'), mensalidade('b')],
      ['a'],
    );

    expect(await service.gerar('2026-11')).toEqual({
      competencia: '2026-11',
      geradas: 1,
      jaExistentes: 1,
    });
    expect(mensalidadeTitulo.findMany).toHaveBeenCalledWith({
      where: { mensalidadeId: { in: ['a', 'b'] }, competencia: '2026-11' },
      select: { mensalidadeId: true },
    });
    expect(contasReceber.criarDeOrigemExterna).toHaveBeenCalledTimes(1);
  });

  it('sem mensalidades vigentes não consulta títulos nem gera nada', async () => {
    const { service, mensalidadeTitulo } = setup([]);
    expect(await service.gerar('2026-11')).toEqual({
      competencia: '2026-11',
      geradas: 0,
      jaExistentes: 0,
    });
    expect(mensalidadeTitulo.findMany).not.toHaveBeenCalled();
  });

  it('escopo restrito: 403, sem buscar nem gerar nada (cobrança em lote)', async () => {
    const { service, mensalidades, contasReceber } = setup([mensalidade('a')], [], true);
    await expect(service.gerar('2026-11')).rejects.toMatchObject({ status: 403 });
    expect(mensalidades.ativas).not.toHaveBeenCalled();
    expect(contasReceber.criarDeOrigemExterna).not.toHaveBeenCalled();
  });
});
