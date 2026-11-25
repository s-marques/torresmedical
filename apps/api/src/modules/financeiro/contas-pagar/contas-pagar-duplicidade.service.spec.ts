import type { TransactionHost } from '@nestjs-cls/transactional';
import { Prisma } from '../../../generated/prisma/client';
import type { AuditService } from '../../../common/audit/audit.service';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import type { FornecedoresService } from '../../compras-estoque/fornecedores/fornecedores.service';
import type { FuncionariosService } from '../../regulatorio-qualidade/funcionarios/funcionarios.service';
import {
  ContasPagarDuplicidadeService,
  ENTIDADE_DUPLICIDADE,
} from './contas-pagar-duplicidade.service';

const ID = '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const OUTRA = '3e9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const FORNECEDOR_ID = '1c9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';

const EXISTENTE = {
  id: OUTRA,
  numero: 4,
  descricao: 'Energia',
  beneficiarioTipo: 'FORNECEDOR' as const,
  fornecedorId: FORNECEDOR_ID,
  funcionarioId: null,
  valor: new Prisma.Decimal('300.00'),
  dataVencimento: new Date('2026-11-10T00:00:00.000Z'),
  documento: 'NF-123',
  status: 'PENDENTE' as const,
};

const TITULO = {
  beneficiarioTipo: 'FORNECEDOR' as const,
  beneficiarioId: FORNECEDOR_ID,
  valor: 300,
  dataVencimento: '2026-11-10',
  documento: null,
};

function setup(linhas: unknown[] = [EXISTENTE], atual: unknown = null) {
  const contaPagar = {
    findMany: jest.fn().mockResolvedValue(linhas),
    findFirst: jest.fn().mockResolvedValue(atual),
  };
  const txHost = { tx: { contaPagar } } as unknown as TransactionHost<PrismaAdapter>;
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const fornecedores = { findById: jest.fn().mockResolvedValue({ nome: 'Distribuidora Alfa' }) };
  const funcionarios = { findById: jest.fn() };
  const service = new ContasPagarDuplicidadeService(
    txHost,
    audit as unknown as AuditService,
    fornecedores as unknown as FornecedoresService,
    funcionarios as unknown as FuncionariosService,
  );
  return { service, contaPagar, audit };
}

describe('ContasPagarDuplicidadeService', () => {
  it('mesmo fornecedor, valor e vencimento é possível duplicidade', async () => {
    const { service, contaPagar } = setup();
    const res = await service.verificar({ ...TITULO });
    expect(res.candidatos).toEqual([
      expect.objectContaining({
        id: OUTRA,
        numero: 4,
        beneficiarioNome: 'Distribuidora Alfa',
        valor: '300',
        dataVencimento: '2026-11-10',
        motivos: ['MESMO_TITULO'],
      }),
    ]);
    const where = contaPagar.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ deletedAt: null, status: { not: 'CANCELADO' } });
  });

  it('mesmo número de documento também é possível duplicidade (sem diferenciar maiúsculas)', async () => {
    const { service, contaPagar } = setup();
    const res = await service.verificar({
      ...TITULO,
      beneficiarioId: null,
      valor: null,
      dataVencimento: null,
      documento: ' nf-123 ',
    });
    expect(res.candidatos[0]?.motivos).toEqual(['MESMO_DOCUMENTO']);
    expect(contaPagar.findMany.mock.calls[0][0].where.AND[0].OR).toEqual([
      { documento: { equals: 'nf-123', mode: 'insensitive' } },
    ]);
  });

  it('título e documento iguais trazem os dois motivos', async () => {
    const { service } = setup();
    const res = await service.verificar({ ...TITULO, documento: 'NF-123' });
    expect(res.candidatos[0]?.motivos).toEqual(['MESMO_TITULO', 'MESMO_DOCUMENTO']);
  });

  it('sem critério completo não consulta o banco', async () => {
    const { service, contaPagar } = setup();
    const res = await service.verificar({ ...TITULO, beneficiarioId: null });
    expect(res.candidatos).toEqual([]);
    expect(contaPagar.findMany).not.toHaveBeenCalled();
  });

  it('descarta o registro que a consulta trouxe mas que não bate em nenhum critério', async () => {
    const { service } = setup([{ ...EXISTENTE, valor: new Prisma.Decimal('999.00') }]);
    const res = await service.verificar({ ...TITULO });
    expect(res.candidatos).toEqual([]);
  });

  it('funcionário usa funcionarioId na busca', async () => {
    const { service, contaPagar } = setup([]);
    await service.verificar({ ...TITULO, beneficiarioTipo: 'FUNCIONARIO' });
    expect(contaPagar.findMany.mock.calls[0][0].where.AND[0].OR[0]).toMatchObject({
      beneficiarioTipo: 'FUNCIONARIO',
      funcionarioId: FORNECEDOR_ID,
    });
  });

  it('na edição a própria conta fica de fora e o que não mudou não conta', async () => {
    const atual = {
      ...EXISTENTE,
      id: ID,
    };
    const { service, contaPagar } = setup([], atual);
    await service.verificar({ ...TITULO, contaPagarId: ID, documento: 'NF-123' });
    // título e documento iguais aos da conta atual: nada novo a comparar.
    expect(contaPagar.findMany).not.toHaveBeenCalled();
  });

  it('na edição conta o que mudou: só o título, ou o título e o documento', async () => {
    const atual = { ...EXISTENTE, id: ID };
    const { service, contaPagar } = setup([EXISTENTE], atual);
    await service.verificar({ ...TITULO, contaPagarId: ID, valor: 450, documento: 'NF-123' });
    const primeira = contaPagar.findMany.mock.calls[0][0].where;
    expect(primeira.AND[0].OR).toHaveLength(1);
    expect(primeira.AND[1]).toEqual({ id: { not: ID } });
    await service.verificar({ ...TITULO, contaPagarId: ID, valor: 450, documento: 'NF-999' });
    expect(contaPagar.findMany.mock.calls[1][0].where.AND[0].OR).toHaveLength(2);
  });

  it('exigirConfirmacao devolve 409 com possível duplicidade não confirmada', async () => {
    const { service } = setup();
    await expect(service.exigirConfirmacao(TITULO, undefined)).rejects.toMatchObject({
      code: 'CONTA_PAGAR_POSSIVEL_DUPLICADA',
      status: 409,
    });
  });

  it('exigirConfirmacao deixa passar quando confirmado, e registrarConfirmacao audita', async () => {
    const { service, audit } = setup();
    const candidatos = await service.exigirConfirmacao(TITULO, true);
    expect(candidatos).toHaveLength(1);
    await service.registrarConfirmacao(ID, candidatos);
    expect(audit.record).toHaveBeenCalledWith({
      action: 'CREATE',
      entity: ENTIDADE_DUPLICIDADE,
      entityId: ID,
      after: {
        duplicidadeConfirmada: true,
        possiveisDuplicadas: [{ id: OUTRA, motivos: ['MESMO_TITULO'] }],
      },
    });
  });

  it('sem candidatos, exigirConfirmacao passa e registrarConfirmacao não grava nada', async () => {
    const { service, audit } = setup([]);
    const candidatos = await service.exigirConfirmacao(TITULO, undefined);
    expect(candidatos).toEqual([]);
    await service.registrarConfirmacao(ID, candidatos);
    expect(audit.record).not.toHaveBeenCalled();
  });
});
