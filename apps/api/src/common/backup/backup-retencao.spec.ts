import {
  carimboDaData,
  dataDaChave,
  selecionarExpirados,
  type DumpGuardado,
} from './backup-retencao';

function dump(data: string): DumpGuardado {
  const d = new Date(`${data}T02:00:00.000Z`);
  return { chave: `postgres/torres-${carimboDaData(d)}.dump.enc`, data: d };
}

function diasAtras(quantos: number, base = '2026-11-25'): DumpGuardado[] {
  return Array.from({ length: quantos }, (_, i) => {
    const d = new Date(`${base}T02:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() - i);
    return dump(d.toISOString().slice(0, 10));
  });
}

describe('carimbo e data da chave', () => {
  it('vai e volta', () => {
    const data = new Date('2026-11-25T05:03:09.123Z');
    const chave = `postgres/torres-${carimboDaData(data)}.dump.enc`;
    expect(carimboDaData(data)).toBe('20261125T050309Z');
    expect(dataDaChave(chave)?.toISOString()).toBe('2026-11-25T05:03:09.000Z');
  });

  it('devolve null para nome fora do padrão', () => {
    expect(dataDaChave('postgres/qualquer.dump.enc')).toBeNull();
  });
});

describe('selecionarExpirados', () => {
  const retencao = { diarios: 7, semanais: 4, mensais: 6 };

  it('não apaga nada quando há menos dumps que a retenção', () => {
    expect(selecionarExpirados(diasAtras(5), retencao)).toEqual([]);
  });

  it('mantém os 7 dias recentes e apaga os mais antigos que não são semanais nem mensais', () => {
    const dumps = diasAtras(40);
    const expirados = new Set(selecionarExpirados(dumps, retencao));
    // 7 diários mais recentes ficam
    for (const d of dumps.slice(0, 7)) expect(expirados.has(d.chave)).toBe(false);
    // há semanais/mensais além dos diários, mas muita coisa sai
    expect(expirados.size).toBeGreaterThan(15);
    expect(expirados.size).toBeLessThan(dumps.length - 7);
  });

  it('guarda o último dump de cada dia quando há vários no mesmo dia', () => {
    const manha = {
      chave: 'postgres/torres-20261125T020000Z.dump.enc',
      data: new Date('2026-11-25T02:00:00Z'),
    };
    const tarde = {
      chave: 'postgres/torres-20261125T150000Z.dump.enc',
      data: new Date('2026-11-25T15:00:00Z'),
    };
    expect(selecionarExpirados([manha, tarde], { diarios: 1, semanais: 0, mensais: 0 })).toEqual([
      manha.chave,
    ]);
  });

  it('guarda 1 por mês nos meses mais recentes', () => {
    const dumps = [
      dump('2026-11-25'),
      dump('2026-10-30'),
      dump('2026-10-02'),
      dump('2026-09-15'),
      dump('2026-08-01'),
    ];
    const expirados = selecionarExpirados(dumps, { diarios: 1, semanais: 0, mensais: 3 });
    expect(expirados).toEqual([dumps[2]?.chave, dumps[4]?.chave]);
  });

  it('nunca apaga o dump mais recente, mesmo com a retenção zerada', () => {
    const dumps = diasAtras(3);
    const expirados = selecionarExpirados(dumps, { diarios: 0, semanais: 0, mensais: 0 });
    expect(expirados).toHaveLength(2);
    expect(expirados).not.toContain(dumps[0]?.chave);
  });

  it('lida com lista vazia', () => {
    expect(selecionarExpirados([], retencao)).toEqual([]);
  });
});
