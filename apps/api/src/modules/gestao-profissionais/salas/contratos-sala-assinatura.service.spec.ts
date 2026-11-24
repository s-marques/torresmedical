import type { TransactionHost } from '@nestjs-cls/transactional';
import type { ContratoSala } from '@torres/shared';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import type { ArquivosService } from '../../../common/storage/arquivos.service';
import type { ProfissionaisOnboardingService } from '../profissionais/profissionais-onboarding.service';
import { ContratosSalaAssinaturaService } from './contratos-sala-assinatura.service';
import type { ContratosSalaCobrancaService } from './contratos-sala-cobranca.service';
import type { ContratosSalaService } from './contratos-sala.service';

const ID = '11111111-1111-4111-8111-111111111111';
const PROF = '22222222-2222-4222-8222-222222222222';
const PDF = '33333333-3333-4333-8333-333333333333';
/** 24 de novembro de 2026, 12h em São Paulo. */
const AGORA = new Date('2026-11-24T15:00:00.000Z');

function contrato(parcial: Partial<ContratoSala> = {}): ContratoSala {
  return {
    id: ID,
    status: 'AGUARDANDO_ASSINATURA',
    modalidade: 'MENSAL',
    locatarioTipo: 'PROFISSIONAL',
    locatarioId: PROF,
    permuta: false,
    valorUnitario: 1500,
    diaVencimento: 10,
    dataInicio: '2026-11-01',
    ...parcial,
  } as ContratoSala;
}

function montar(atual: ContratoSala) {
  const update = jest.fn().mockResolvedValue({});
  const ativo = { ...atual, status: 'ATIVO' as const };
  const contratos = {
    findById: jest.fn().mockResolvedValueOnce(atual).mockResolvedValue(ativo),
  };
  const cobrancas = { gerarParcela: jest.fn().mockResolvedValue(ativo) };
  const onboarding = { iniciar: jest.fn().mockResolvedValue(undefined) };
  const arquivos = { findById: jest.fn().mockResolvedValue({ uso: 'contrato-sala' }) };
  const service = new ContratosSalaAssinaturaService(
    { tx: { contratoSala: { update } } } as unknown as TransactionHost<PrismaAdapter>,
    contratos as unknown as ContratosSalaService,
    cobrancas as unknown as ContratosSalaCobrancaService,
    onboarding as unknown as ProfissionaisOnboardingService,
    arquivos as unknown as ArquivosService,
  );
  return { service, update, contratos, cobrancas, onboarding, arquivos };
}

describe('ContratosSalaAssinaturaService', () => {
  it('assina: ativa o contrato, grava a data e cria o onboarding', async () => {
    const { service, update, onboarding } = montar(contrato());

    const resultado = await service.assinar(
      ID,
      { assinadoEm: '2026-11-20', pdfArquivoId: PDF },
      AGORA,
    );

    expect(update).toHaveBeenCalledWith({
      where: { id: ID },
      data: {
        status: 'ATIVO',
        assinadoEm: new Date('2026-11-20T00:00:00.000Z'),
        pdfArquivoId: PDF,
      },
    });
    expect(onboarding.iniciar).toHaveBeenCalledWith(PROF, ID, new Date('2026-11-20T00:00:00.000Z'));
    expect(resultado.status).toBe('ATIVO');
  });

  it('não troca o PDF quando nenhum é informado', async () => {
    const { service, update } = montar(contrato());

    await service.assinar(ID, { assinadoEm: '2026-11-20', pdfArquivoId: null }, AGORA);

    expect(update.mock.calls[0]?.[0].data).not.toHaveProperty('pdfArquivoId');
  });

  it('gera a cobrança do mês atual de contrato Mensal, no dia de vencimento', async () => {
    const { service, cobrancas } = montar(contrato());

    await service.assinar(ID, { assinadoEm: '2026-11-20', pdfArquivoId: null }, AGORA);

    expect(cobrancas.gerarParcela).toHaveBeenCalledWith(ID, {
      competencia: '2026-11',
      valor: 1500,
      dataVencimento: '2026-11-10',
    });
  });

  it('contrato que começa em outro mês cobra o mês do início', async () => {
    const { service, cobrancas } = montar(contrato({ dataInicio: '2026-12-15' }));

    await service.assinar(ID, { assinadoEm: '2026-11-20', pdfArquivoId: null }, AGORA);

    expect(cobrancas.gerarParcela.mock.calls[0]?.[1]).toMatchObject({ competencia: '2026-12' });
  });

  it.each([
    ['Por Turno', { modalidade: 'TURNO' as const }],
    ['Hora Avulsa', { modalidade: 'HORA' as const }],
    ['permuta', { permuta: true }],
    ['sem valor', { valorUnitario: 0 }],
  ])('não gera cobrança automática (%s)', async (_nome, parcial) => {
    const { service, cobrancas } = montar(contrato(parcial));

    await service.assinar(ID, { assinadoEm: '2026-11-20', pdfArquivoId: null }, AGORA);

    expect(cobrancas.gerarParcela).not.toHaveBeenCalled();
  });

  it('409 quando o contrato não está aguardando assinatura', async () => {
    const { service, update, onboarding } = montar(contrato({ status: 'ATIVO' }));

    await expect(
      service.assinar(ID, { assinadoEm: '2026-11-20', pdfArquivoId: null }, AGORA),
    ).rejects.toMatchObject({ status: 409, code: 'CONTRATO_NAO_AGUARDA_ASSINATURA' });
    expect(update).not.toHaveBeenCalled();
    expect(onboarding.iniciar).not.toHaveBeenCalled();
  });

  it('400 para data de assinatura no futuro', async () => {
    const { service, update } = montar(contrato());

    await expect(
      service.assinar(ID, { assinadoEm: '2026-11-25', pdfArquivoId: null }, AGORA),
    ).rejects.toMatchObject({ status: 400 });
    expect(update).not.toHaveBeenCalled();
  });

  it('400 para PDF de outro uso de arquivo', async () => {
    const { service, arquivos, update } = montar(contrato());
    arquivos.findById.mockResolvedValue({ uso: 'avatar' });

    await expect(
      service.assinar(ID, { assinadoEm: '2026-11-20', pdfArquivoId: PDF }, AGORA),
    ).rejects.toMatchObject({ status: 400, code: 'ARQUIVO_USO_INVALIDO' });
    expect(update).not.toHaveBeenCalled();
  });
});
