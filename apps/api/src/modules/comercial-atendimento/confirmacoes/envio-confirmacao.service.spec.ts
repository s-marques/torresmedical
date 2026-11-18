import { intervaloDoDia, somarDias } from './envio-confirmacao.service';
import { MODELO_PADRAO, textoDaEtapa } from './modelos-padrao';

describe('somarDias', () => {
  it('atravessa fim de mês e de ano', () => {
    expect(somarDias('2026-11-30', 1)).toBe('2026-12-01');
    expect(somarDias('2026-12-31', 2)).toBe('2027-01-02');
    expect(somarDias('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('intervaloDoDia', () => {
  it('é o dia inteiro no fuso da clínica (UTC-3)', () => {
    const { gte, lt } = intervaloDoDia('2026-11-18');
    expect(gte.toISOString()).toBe('2026-11-18T03:00:00.000Z');
    expect(lt.toISOString()).toBe('2026-11-19T03:00:00.000Z');
  });
});

describe('textoDaEtapa', () => {
  it('escolhe o texto da etapa e, no lembrete, o de confirmado ou não', () => {
    expect(textoDaEtapa(MODELO_PADRAO, 'MSG1', false)).toBe(MODELO_PADRAO.msg1);
    expect(textoDaEtapa(MODELO_PADRAO, 'MSG2', true)).toBe(MODELO_PADRAO.msg2);
    expect(textoDaEtapa(MODELO_PADRAO, 'MSG3', false)).toBe(MODELO_PADRAO.msg3);
    expect(textoDaEtapa(MODELO_PADRAO, 'LEMBRETE', true)).toBe(MODELO_PADRAO.lembreteConfirmado);
    expect(textoDaEtapa(MODELO_PADRAO, 'LEMBRETE', false)).toBe(
      MODELO_PADRAO.lembreteNaoConfirmado,
    );
  });
});
