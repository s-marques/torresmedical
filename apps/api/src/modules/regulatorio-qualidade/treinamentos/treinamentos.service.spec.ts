import type { TransactionHost } from '@nestjs-cls/transactional';
import type { ExportService } from '../../../common/export/export.service';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { statusTreinamento, TreinamentosService } from './treinamentos.service';

const FUNCIONARIO_ID = '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const TIPO_ID = '1c0d2a8f-2b3c-4d4e-9fa0-1b2c3d4e5f60';

function criarServico(existentes: { funcionario?: boolean; tipo?: boolean } = {}) {
  const { funcionario = true, tipo = true } = existentes;
  const treinamento = {
    create: jest.fn().mockImplementation(({ data }) =>
      Promise.resolve({
        id: '2d1e3b9a-3c4d-4e5f-8a1b-2c3d4e5f6071',
        createdAt: new Date('2026-11-20T12:00:00Z'),
        updatedAt: new Date('2026-11-20T12:00:00Z'),
        funcionario: { nome: 'Fulana de Teste' },
        tipoTreinamento: { nome: 'NR-32' },
        ...data,
      }),
    ),
  };
  const tx = {
    treinamento,
    funcionario: { findFirst: jest.fn().mockResolvedValue(funcionario ? { id: 'f' } : null) },
    tipoTreinamento: { findFirst: jest.fn().mockResolvedValue(tipo ? { id: 't' } : null) },
  };
  const txHost = { tx } as unknown as TransactionHost<PrismaAdapter>;
  return { servico: new TreinamentosService(txHost, {} as ExportService), treinamento };
}

const BASE = {
  funcionarioId: FUNCIONARIO_ID,
  tipoTreinamentoId: TIPO_ID,
  descricao: null,
  dataRealizacao: null,
  dataVencimento: null,
  cargaHoraria: null,
  instituicao: null,
  observacoes: null,
} as const;

describe('statusTreinamento', () => {
  const hoje = new Date('2026-11-20T00:00:00.000Z');

  it('sem vencimento é Válido', () => {
    expect(statusTreinamento(null, hoje)).toBe('valido');
  });

  it('vence hoje ainda é Válido; no dia anterior é Vencido', () => {
    expect(statusTreinamento(new Date('2026-11-20T00:00:00.000Z'), hoje)).toBe('valido');
    expect(statusTreinamento(new Date('2026-11-19T00:00:00.000Z'), hoje)).toBe('vencido');
  });
});

describe('TreinamentosService', () => {
  it('create converte as datas e devolve o status calculado', async () => {
    const { servico, treinamento } = criarServico();
    const dto = await servico.create({
      ...BASE,
      dataRealizacao: '2020-01-10',
      dataVencimento: '2021-01-10',
      cargaHoraria: 8,
    });
    expect(treinamento.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          dataRealizacao: new Date('2020-01-10T00:00:00.000Z'),
          dataVencimento: new Date('2021-01-10T00:00:00.000Z'),
          cargaHoraria: 8,
        }),
      }),
    );
    expect(dto).toMatchObject({
      funcionarioNome: 'Fulana de Teste',
      tipoNome: 'NR-32',
      status: 'vencido',
    });
  });

  it('create sem datas grava nulos e o status é Válido', async () => {
    const { servico } = criarServico();
    const dto = await servico.create(BASE);
    expect(dto).toMatchObject({ dataRealizacao: null, dataVencimento: null, status: 'valido' });
  });

  it('create rejeita funcionário ou tipo inexistente, sem gravar', async () => {
    const semFuncionario = criarServico({ funcionario: false });
    await expect(semFuncionario.servico.create(BASE)).rejects.toMatchObject({ status: 404 });
    expect(semFuncionario.treinamento.create).not.toHaveBeenCalled();

    const semTipo = criarServico({ tipo: false });
    await expect(semTipo.servico.create(BASE)).rejects.toMatchObject({ status: 404 });
    expect(semTipo.treinamento.create).not.toHaveBeenCalled();
  });
});
