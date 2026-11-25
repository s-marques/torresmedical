import type { TransactionHost } from '@nestjs-cls/transactional';
import { POLITICA_PADRAO } from '@torres/shared';
import type { PrismaAdapter } from '../prisma/prisma-transaction';
import { PoliticaSegurancaService, SENHA_FORA_DA_POLITICA } from './politica-seguranca.service';

const EMPRESA = '11111111-1111-4111-8111-111111111111';

function montar(linha: Record<string, unknown> | null) {
  const delegate = {
    findUnique: jest.fn().mockResolvedValue(linha),
    upsert: jest.fn().mockResolvedValue(undefined),
  };
  const empresa = { findFirst: jest.fn().mockResolvedValue({ id: EMPRESA }) };
  const txHost = {
    tx: { politicaSeguranca: delegate, empresa },
  } as unknown as TransactionHost<PrismaAdapter>;
  return { service: new PoliticaSegurancaService(txHost), delegate, empresa };
}

describe('PoliticaSegurancaService', () => {
  it('sem registro devolve o padrão, sem data de atualização', async () => {
    const { service } = montar(null);

    expect(await service.obter(EMPRESA)).toEqual({ ...POLITICA_PADRAO, updatedAt: null });
  });

  it('com registro devolve os valores gravados', async () => {
    const updatedAt = new Date('2026-11-25T10:00:00Z');
    const { service } = montar({
      ...POLITICA_PADRAO,
      tamanhoMinimo: 12,
      expiracaoDias: 90,
      updatedAt,
    });

    expect(await service.obter(EMPRESA)).toMatchObject({
      tamanhoMinimo: 12,
      expiracaoDias: 90,
      updatedAt: updatedAt.toISOString(),
    });
  });

  it('a rotina sem usuário usa a política da primeira empresa', async () => {
    const { service, empresa, delegate } = montar(null);

    await service.obterDaPrimeiraEmpresa();

    expect(empresa.findFirst).toHaveBeenCalled();
    expect(delegate.findUnique).toHaveBeenCalledWith({ where: { empresaId: EMPRESA } });
  });

  it('atualizar faz upsert pela empresa', async () => {
    const { service, delegate } = montar(null);

    await service.atualizar(EMPRESA, POLITICA_PADRAO);

    expect(delegate.upsert).toHaveBeenCalledWith({
      where: { empresaId: EMPRESA },
      create: { empresaId: EMPRESA, ...POLITICA_PADRAO },
      update: POLITICA_PADRAO,
    });
  });

  it('garantirSenhaValida lança 400 com um detalhe por regra, no campo pedido', async () => {
    const { service } = montar({
      ...POLITICA_PADRAO,
      tamanhoMinimo: 12,
      exigirMaiuscula: true,
      updatedAt: new Date(),
    });

    const erro: unknown = await service
      .garantirSenhaValida(EMPRESA, 'abc123', 'senhaNova')
      .catch((e: unknown) => e);

    expect((erro as { getStatus(): number }).getStatus()).toBe(400);
    expect(erro).toMatchObject({
      code: SENHA_FORA_DA_POLITICA,
      details: [
        { field: 'senhaNova', message: 'A senha deve ter no mínimo 12 caracteres' },
        { field: 'senhaNova', message: 'A senha deve ter ao menos uma letra maiúscula' },
      ],
    });
  });

  it('garantirSenhaValida passa quando a senha cumpre a política', async () => {
    const { service } = montar(null);

    await expect(service.garantirSenhaValida(EMPRESA, 'abcdefg1')).resolves.toBeUndefined();
  });
});
