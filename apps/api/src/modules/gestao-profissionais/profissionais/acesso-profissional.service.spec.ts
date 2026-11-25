import { contratoDaAcesso } from './acesso-profissional.service';

const dia = (v: string) => new Date(`${v}T00:00:00Z`);
const HOJE = '2026-11-25';

describe('contratoDaAcesso', () => {
  it('ativo sem data final dá acesso', () => {
    expect(contratoDaAcesso({ status: 'ATIVO', dataFim: null, encerradoEm: null }, HOJE, 0)).toBe(
      true,
    );
  });

  it('aguardando assinatura dá acesso (onboarding em andamento)', () => {
    expect(
      contratoDaAcesso(
        { status: 'AGUARDANDO_ASSINATURA', dataFim: null, encerradoEm: null },
        HOJE,
        0,
      ),
    ).toBe(true);
  });

  it('ativo com data final no futuro ou hoje dá acesso; vencido, não', () => {
    const c = (dataFim: string) => ({
      status: 'ATIVO' as const,
      dataFim: dia(dataFim),
      encerradoEm: null,
    });

    expect(contratoDaAcesso(c('2026-11-26'), HOJE, 0)).toBe(true);
    expect(contratoDaAcesso(c(HOJE), HOJE, 0)).toBe(true);
    expect(contratoDaAcesso(c('2026-11-24'), HOJE, 0)).toBe(false);
  });

  it.each(['ENCERRADO', 'CANCELADO'] as const)(
    '%s: o acesso acaba depois da carência',
    (status) => {
      const contrato = { status, dataFim: null, encerradoEm: dia('2026-11-20') };

      expect(contratoDaAcesso(contrato, HOJE, 0)).toBe(false);
      expect(contratoDaAcesso(contrato, HOJE, 4)).toBe(false);
      expect(contratoDaAcesso(contrato, HOJE, 5)).toBe(true);
    },
  );
});
