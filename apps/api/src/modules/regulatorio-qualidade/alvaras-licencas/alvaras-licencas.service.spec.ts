import type { TransactionHost } from '@nestjs-cls/transactional';
import { statusDaLicenca } from '@torres/shared';
import type { ExportService } from '../../../common/export/export.service';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import type { UnidadesService } from '../../configuracoes-gestao/unidades/unidades.service';
import { AlvarasLicencasService, diasRestantes, hojeDaClinica } from './alvaras-licencas.service';

const UNIDADE_A = '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const UNIDADE_B = '1c0d2a8f-2b3c-4d4e-9fa0-1b2c3d4e5f60';
const TIPO_ID = '2d1e3b9a-3c4d-4e5f-8a1b-2c3d4e5f6071';

function criarServico(unidadeIds: string[]) {
  const tipoLicenca = {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn().mockResolvedValue({
      id: TIPO_ID,
      nome: 'Alvará Bombeiro',
      descricao: null,
      createdAt: new Date('2026-11-19T12:00:00Z'),
    }),
  };
  const licenca = { createMany: jest.fn().mockResolvedValue({ count: unidadeIds.length }) };
  const txHost = { tx: { tipoLicenca, licenca } } as unknown as TransactionHost<PrismaAdapter>;
  const unidades = {
    idsAtivas: jest.fn().mockResolvedValue(unidadeIds),
  } as unknown as UnidadesService;
  const servico = new AlvarasLicencasService(txHost, {} as ExportService, unidades);
  return { servico, tipoLicenca, licenca };
}

describe('statusDaLicenca', () => {
  it.each([
    [true, 10, 'na'],
    [false, null, 'ok'],
    [false, -1, 'vencido'],
    [false, 0, 'alerta-30'],
    [false, 30, 'alerta-30'],
    [false, 31, 'alerta-60'],
    [false, 60, 'alerta-60'],
    [false, 61, 'ok'],
  ] as const)('naoSeAplica=%s, dias=%s → %s', (naoSeAplica, dias, esperado) => {
    expect(statusDaLicenca(naoSeAplica, dias)).toBe(esperado);
  });
});

describe('datas', () => {
  it('hojeDaClinica usa a data de São Paulo (meia-noite UTC)', () => {
    // 02:00 UTC de 20/11 ainda é 19/11 em São Paulo (UTC-3).
    expect(hojeDaClinica(new Date('2026-11-20T02:00:00Z')).toISOString()).toBe(
      '2026-11-19T00:00:00.000Z',
    );
  });

  it('diasRestantes conta dias corridos e aceita vencimento nulo', () => {
    const hoje = new Date('2026-11-19T00:00:00Z');
    expect(diasRestantes(new Date('2026-12-19T00:00:00Z'), hoje)).toBe(30);
    expect(diasRestantes(new Date('2026-11-18T00:00:00Z'), hoje)).toBe(-1);
    expect(diasRestantes(null, hoje)).toBeNull();
  });
});

describe('AlvarasLicencasService.createTipo (regra de paridade)', () => {
  it('cria uma licença "Não se aplica" para cada unidade ativa', async () => {
    const { servico, tipoLicenca, licenca } = criarServico([UNIDADE_A, UNIDADE_B]);

    const tipo = await servico.createTipo({ nome: 'Alvará Bombeiro', descricao: null });

    expect(tipo).toMatchObject({ id: TIPO_ID, nome: 'Alvará Bombeiro' });
    expect(tipoLicenca.create).toHaveBeenCalledWith({
      data: { nome: 'Alvará Bombeiro', descricao: null },
    });
    expect(licenca.createMany).toHaveBeenCalledWith({
      data: [
        { unidadeId: UNIDADE_A, tipoLicencaId: TIPO_ID, naoSeAplica: true },
        { unidadeId: UNIDADE_B, tipoLicencaId: TIPO_ID, naoSeAplica: true },
      ],
    });
  });

  it('sem unidades, só cria o tipo', async () => {
    const { servico, licenca } = criarServico([]);

    await servico.createTipo({ nome: 'Alvará Bombeiro', descricao: null });

    expect(licenca.createMany).not.toHaveBeenCalled();
  });
});
