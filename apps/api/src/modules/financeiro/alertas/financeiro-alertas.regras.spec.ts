import { FinanceiroAlertasRegras } from './financeiro-alertas.regras';

const HOJE = '2026-11-25';

function criar(quantidade = 3) {
  const contaPagar = { count: jest.fn().mockResolvedValue(quantidade) };
  const contaReceber = { count: jest.fn().mockResolvedValue(quantidade) };
  const regras = new FinanceiroAlertasRegras({ tx: { contaPagar, contaReceber } } as never);
  const porTipo = Object.fromEntries(regras.regras().map((regra) => [regra.tipo, regra]));
  return { porTipo, contaPagar, contaReceber };
}

describe('FinanceiroAlertasRegras', () => {
  it('expõe os tipos do financeiro', () => {
    expect(Object.keys(criar().porTipo)).toEqual([
      'CONTAS_PAGAR_VENCENDO',
      'CONTAS_PAGAR_VENCIDAS',
      'CONTAS_PAGAR_AGUARDANDO_APROVACAO',
      'RECEBIVEIS_VENCIDOS',
    ]);
  });

  it('contas a pagar aguardando aprovação: pendentes lançadas, não excluídas (issue #164)', async () => {
    const { porTipo, contaPagar } = criar(4);
    await expect(porTipo.CONTAS_PAGAR_AGUARDANDO_APROVACAO?.contar(HOJE)).resolves.toBe(4);
    expect(contaPagar.count).toHaveBeenCalledWith({
      where: { deletedAt: null, status: 'PENDENTE', aprovacao: 'LANCADA' },
    });
  });

  it('contas a pagar que vencem hoje: pendentes, não excluídas, vencimento = hoje', async () => {
    const { porTipo, contaPagar } = criar(2);
    await expect(porTipo.CONTAS_PAGAR_VENCENDO?.contar(HOJE)).resolves.toBe(2);
    expect(contaPagar.count).toHaveBeenCalledWith({
      where: {
        deletedAt: null,
        status: 'PENDENTE',
        dataVencimento: new Date('2026-11-25T00:00:00.000Z'),
      },
    });
  });

  it('contas a pagar vencidas: pendentes com vencimento antes de hoje', async () => {
    const { porTipo, contaPagar } = criar();
    await porTipo.CONTAS_PAGAR_VENCIDAS?.contar(HOJE);
    expect(contaPagar.count).toHaveBeenCalledWith({
      where: {
        deletedAt: null,
        status: 'PENDENTE',
        dataVencimento: { lt: new Date('2026-11-25T00:00:00.000Z') },
      },
    });
  });

  it('recebíveis vencidos: só os do Torres (sem a receita dos profissionais)', async () => {
    const { porTipo, contaReceber } = criar();
    await porTipo.RECEBIVEIS_VENCIDOS?.contar(HOJE);
    expect(contaReceber.count).toHaveBeenCalledWith({
      where: {
        deletedAt: null,
        profissionalId: null,
        status: { in: ['PENDENTE', 'PARCIAL'] },
        dataVencimento: { lt: new Date('2026-11-25T00:00:00.000Z') },
      },
    });
  });
});
