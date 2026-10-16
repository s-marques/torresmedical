import { formatarDia, inicioDoDia, intervaloDoPeriodo } from './periodo';

describe('período dos relatórios', () => {
  it('início do dia no fuso da clínica (UTC-3)', () => {
    expect(inicioDoDia('2026-10-16').toISOString()).toBe('2026-10-16T03:00:00.000Z');
  });

  it('intervalo com os dois dias inteiros, inclusive na virada de mês e de ano', () => {
    expect(intervaloDoPeriodo('2026-10-01', '2026-10-31')).toEqual({
      gte: new Date('2026-10-01T03:00:00.000Z'),
      lt: new Date('2026-11-01T03:00:00.000Z'),
    });
    expect(intervaloDoPeriodo('2026-12-31', '2026-12-31')).toEqual({
      gte: new Date('2026-12-31T03:00:00.000Z'),
      lt: new Date('2027-01-01T03:00:00.000Z'),
    });
  });

  it('formata o dia para o título da exportação', () => {
    expect(formatarDia('2026-10-01')).toBe('01/10/2026');
  });
});
