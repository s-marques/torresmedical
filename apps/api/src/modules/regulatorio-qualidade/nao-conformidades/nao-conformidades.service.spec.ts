import type { TransactionHost } from '@nestjs-cls/transactional';
import type { ExportService } from '../../../common/export/export.service';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { NaoConformidadesService } from './nao-conformidades.service';

function criarServico() {
  const naoConformidade = {
    create: jest.fn().mockImplementation(({ data }) =>
      Promise.resolve({
        id: '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f',
        descricao: null,
        setor: null,
        dataLimiteCorrecao: null,
        responsavel: null,
        acaoCorretiva: null,
        observacoes: null,
        createdAt: new Date('2026-11-20T12:00:00Z'),
        updatedAt: new Date('2026-11-20T12:00:00Z'),
        ...data,
      }),
    ),
    findFirst: jest.fn(),
  };
  const txHost = { tx: { naoConformidade } } as unknown as TransactionHost<PrismaAdapter>;
  return { servico: new NaoConformidadesService(txHost, {} as ExportService), naoConformidade };
}

const BASE = {
  titulo: 'Falha',
  descricao: null,
  setor: null,
  tipo: 'seguranca',
  dataOcorrencia: null,
  dataLimiteCorrecao: null,
  responsavel: null,
  acaoCorretiva: null,
  observacoes: null,
} as const;

describe('NaoConformidadesService', () => {
  it('create grava o tipo em maiúsculas, converte datas e força o status Aberta', async () => {
    const { servico, naoConformidade } = criarServico();
    const dto = await servico.create({
      ...BASE,
      dataOcorrencia: '2026-11-10',
      dataLimiteCorrecao: '2026-11-30',
    });
    expect(naoConformidade.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tipo: 'SEGURANCA',
        status: 'ABERTA',
        dataOcorrencia: new Date('2026-11-10T00:00:00.000Z'),
        dataLimiteCorrecao: new Date('2026-11-30T00:00:00.000Z'),
      }),
    });
    expect(dto).toMatchObject({
      tipo: 'seguranca',
      status: 'aberta',
      dataOcorrencia: '2026-11-10',
      dataLimiteCorrecao: '2026-11-30',
    });
  });

  it('create mantém datas ausentes como nulas', async () => {
    const { servico } = criarServico();
    const dto = await servico.create(BASE);
    expect(dto.dataOcorrencia).toBeNull();
    expect(dto.dataLimiteCorrecao).toBeNull();
  });

  it('findById lança 404 quando a NC não existe', async () => {
    const { servico, naoConformidade } = criarServico();
    naoConformidade.findFirst.mockResolvedValue(null);
    await expect(servico.findById('x')).rejects.toMatchObject({ status: 404 });
  });
});
