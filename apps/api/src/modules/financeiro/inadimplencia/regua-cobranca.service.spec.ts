import { MARCOS_COBRANCA, MENSAGEM_PADRAO_MARCO } from '@torres/shared';
import { escopoFalso } from '../../../../test/utils/escopo-falso';
import { Prisma } from '../../../generated/prisma/client';
import { ReguaCobrancaService } from './regua-cobranca.service';

const HOJE = '2026-11-26';

function marco(
  nome: (typeof MARCOS_COBRANCA)[number],
  extra: Partial<{ ativo: boolean; enviarWhatsapp: boolean; alertaInterno: boolean }> = {},
) {
  return {
    id: `id-${nome}`,
    marco: nome,
    ativo: true,
    enviarWhatsapp: true,
    alertaInterno: true,
    mensagem: MENSAGEM_PADRAO_MARCO[nome],
    updatedAt: new Date('2026-11-01T00:00:00.000Z'),
    ...extra,
  };
}

const TODOS_OS_MARCOS = MARCOS_COBRANCA.map((m) => marco(m));

function conta(extra: Record<string, unknown> = {}) {
  return {
    id: 'conta-1',
    numero: 321,
    valor: new Prisma.Decimal('1500.00'),
    profissionalSacado: { id: 'prof-1', nome: 'Profissional Fictício', telefone: '11999990000' },
    baixas: [{ valorRecebido: new Prisma.Decimal('500.00') }],
    ...extra,
  };
}

function criar(opcoes: { marcos?: ReturnType<typeof marco>[]; contas?: unknown[] } = {}) {
  const tx = {
    reguaCobranca: {
      findMany: jest.fn().mockResolvedValue(opcoes.marcos ?? TODOS_OS_MARCOS),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    contaReceber: {
      findMany: jest.fn().mockResolvedValue(opcoes.contas ?? [conta()]),
      count: jest.fn().mockResolvedValue(2),
    },
    cobrancaEnvio: {
      create: jest
        .fn()
        .mockImplementation(({ data }) =>
          Promise.resolve({ id: 'envio-1', canal: 'WHATSAPP', ...data }),
        ),
    },
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const canais = { canalParaProfissional: jest.fn().mockResolvedValue('canal-1') };
  const whatsapp = { registrar: jest.fn().mockResolvedValue('mensagem-1') };
  const service = new ReguaCobrancaService(
    { tx } as never,
    escopoFalso(),
    audit as never,
    canais as never,
    whatsapp as never,
  );
  return { service, tx, audit, canais, whatsapp };
}

describe('ReguaCobrancaService.executar', () => {
  it('procura, em cada marco ativo, os títulos do dia ainda não cobrados', async () => {
    const { service, tx } = criar({ contas: [] });
    await service.executar(HOJE);
    const vencimentos = tx.contaReceber.findMany.mock.calls.map(([args]) =>
      args.where.dataVencimento.toISOString().slice(0, 10),
    );
    // 3 dias antes, no vencimento, 3 e 7 dias depois.
    expect(vencimentos).toEqual(['2026-11-29', '2026-11-26', '2026-11-23', '2026-11-19']);
    for (const [args] of tx.contaReceber.findMany.mock.calls) {
      expect(args.where).toMatchObject({
        deletedAt: null,
        profissionalId: null,
        profissionalSacadoId: { not: null },
        status: { in: ['PENDENTE', 'PARCIAL'] },
      });
      expect(args.where.cobrancas.none.marco).toBeDefined();
    }
  });

  it('título que vence em 3 dias gera um aviso com o saldo em aberto e o grava no histórico', async () => {
    const { service, tx, whatsapp, audit } = criar({
      marcos: [marco('ANTES_3_DIAS')],
    });
    await expect(service.executar(HOJE)).resolves.toBe(1);

    expect(whatsapp.registrar).toHaveBeenCalledTimes(1);
    const mensagem = whatsapp.registrar.mock.calls[0][0];
    expect(mensagem).toMatchObject({ canalId: 'canal-1', telefone: '11999990000' });
    expect(mensagem.conteudo).toContain('Profissional Fictício');
    expect(mensagem.conteudo).toContain('#321');
    expect(mensagem.conteudo).toContain('29/11/2026');
    // 1.500,00 menos a baixa de 500,00.
    expect(mensagem.conteudo.replaceAll(' ', ' ')).toContain('R$ 1.000,00');

    expect(tx.cobrancaEnvio.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        contaReceberId: 'conta-1',
        marco: 'ANTES_3_DIAS',
        status: 'ENVIADO',
        erro: null,
        mensagemWhatsappId: 'mensagem-1',
      }),
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CREATE', entity: 'CobrancaEnvio', entityId: 'envio-1' }),
    );
  });

  it('não grava texto nem telefone na auditoria', async () => {
    const { service, audit } = criar({ marcos: [marco('NO_VENCIMENTO')] });
    await service.executar(HOJE);
    const gravado = JSON.stringify(audit.record.mock.calls[0][0]);
    expect(gravado).not.toContain('11999990000');
    expect(gravado).not.toContain('Profissional Fictício');
  });

  it('sem telefone, registra a falha e não envia', async () => {
    const { service, tx, whatsapp } = criar({
      marcos: [marco('NO_VENCIMENTO')],
      contas: [conta({ profissionalSacado: { id: 'p', nome: 'Fulano', telefone: '  ' } })],
    });
    await service.executar(HOJE);
    expect(whatsapp.registrar).not.toHaveBeenCalled();
    expect(tx.cobrancaEnvio.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: 'FALHA',
        erro: 'SEM_TELEFONE',
        mensagemWhatsappId: null,
      }),
    });
  });

  it('sem canal de WhatsApp conectado, registra a falha e não envia', async () => {
    const { service, tx, whatsapp, canais } = criar({ marcos: [marco('DEPOIS_3_DIAS')] });
    canais.canalParaProfissional.mockResolvedValue(null);
    await service.executar(HOJE);
    expect(whatsapp.registrar).not.toHaveBeenCalled();
    expect(tx.cobrancaEnvio.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: 'FALHA', erro: 'SEM_CANAL' }),
    });
  });

  it('marco desligado ou sem WhatsApp não consulta nem envia', async () => {
    const { service, tx, whatsapp } = criar({
      marcos: [
        marco('ANTES_3_DIAS', { ativo: false }),
        marco('NO_VENCIMENTO', { enviarWhatsapp: false }),
      ],
    });
    await expect(service.executar(HOJE)).resolves.toBe(0);
    expect(tx.contaReceber.findMany).not.toHaveBeenCalled();
    expect(whatsapp.registrar).not.toHaveBeenCalled();
  });

  it('ignora título sem saldo em aberto (baixas cobrem o valor)', async () => {
    const { service, tx, whatsapp } = criar({
      marcos: [marco('NO_VENCIMENTO')],
      contas: [conta({ baixas: [{ valorRecebido: new Prisma.Decimal('1500.00') }] })],
    });
    await expect(service.executar(HOJE)).resolves.toBe(0);
    expect(whatsapp.registrar).not.toHaveBeenCalled();
    expect(tx.cobrancaEnvio.create).not.toHaveBeenCalled();
  });
});

describe('ReguaCobrancaService.contarParaAlerta', () => {
  it('conta os títulos nos marcos ativos com alerta interno', async () => {
    const { service, tx } = criar({
      marcos: [
        marco('ANTES_3_DIAS'),
        marco('NO_VENCIMENTO', { alertaInterno: false }),
        marco('DEPOIS_3_DIAS', { ativo: false }),
        marco('DEPOIS_7_DIAS'),
      ],
    });
    await expect(service.contarParaAlerta(HOJE)).resolves.toBe(4);
    expect(tx.contaReceber.count).toHaveBeenCalledTimes(2);
    const dias = tx.contaReceber.count.mock.calls.map(([a]) =>
      a.where.dataVencimento.toISOString().slice(0, 10),
    );
    expect(dias).toEqual(['2026-11-29', '2026-11-19']);
  });
});

describe('ReguaCobrancaService.garantirMarcos', () => {
  it('cria os marcos que faltam com o texto padrão e devolve na ordem da régua', async () => {
    const { service, tx } = criar();
    tx.reguaCobranca.findMany
      .mockResolvedValueOnce([marco('DEPOIS_7_DIAS')])
      .mockResolvedValueOnce([marco('DEPOIS_7_DIAS'), marco('ANTES_3_DIAS')]);
    const marcos = await service.garantirMarcos();
    expect(tx.reguaCobranca.createMany).toHaveBeenCalledWith({
      data: [
        { marco: 'ANTES_3_DIAS', mensagem: MENSAGEM_PADRAO_MARCO.ANTES_3_DIAS },
        { marco: 'NO_VENCIMENTO', mensagem: MENSAGEM_PADRAO_MARCO.NO_VENCIMENTO },
        { marco: 'DEPOIS_3_DIAS', mensagem: MENSAGEM_PADRAO_MARCO.DEPOIS_3_DIAS },
      ],
      skipDuplicates: true,
    });
    expect(marcos.map((m) => m.marco)).toEqual(['ANTES_3_DIAS', 'DEPOIS_7_DIAS']);
  });
});

describe('escopo de dados (#153)', () => {
  it('usuário restrito a profissionais não vê nem altera a régua (403)', async () => {
    const { tx, audit, canais, whatsapp } = criar();
    const restrito = new ReguaCobrancaService(
      { tx } as never,
      escopoFalso(['prof-1']),
      audit as never,
      canais as never,
      whatsapp as never,
    );
    await expect(restrito.listar()).rejects.toMatchObject({ status: 403 });
    await expect(restrito.atualizar('id', { ativo: false })).rejects.toMatchObject({ status: 403 });
  });
});
