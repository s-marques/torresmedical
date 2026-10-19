import type { AbaPainel, SecaoPainel } from '@torres/shared';
import { ABAS_PAINEL, dashboardPainelSchema } from '@torres/shared';
import type { PacientesService } from '../../comercial-atendimento/pacientes/pacientes.service';
import type { ProfissionaisService } from '../../gestao-profissionais/profissionais/profissionais.service';
import { DashboardService } from './dashboard.service';

const FILTROS = { modo: 'mes', mes: '2026-10', base: 'recebimento' } as const;

function setup() {
  const profissionais = { contarAtivos: jest.fn().mockResolvedValue(14) };
  const pacientes = { contar: jest.fn().mockResolvedValue(1284) };
  const service = new DashboardService(
    profissionais as unknown as ProfissionaisService,
    pacientes as unknown as PacientesService,
  );
  return { service, profissionais, pacientes };
}

function valorDoKpi(secoes: SecaoPainel[], id: string): number | null | undefined {
  for (const bloco of secoes.flatMap((s) => s.blocos)) {
    if (bloco.tipo === 'kpi' && bloco.id === id) return bloco.valor;
  }
  return undefined;
}

describe('DashboardService', () => {
  it.each(ABAS_PAINEL)('aba %s: resposta válida, com período e base dos filtros', async (aba) => {
    const { service } = setup();

    const dashboard = await service.obter(aba, FILTROS);

    expect(dashboardPainelSchema.parse(dashboard)).toBeTruthy();
    expect(dashboard).toMatchObject({
      aba,
      periodo: { de: '2026-10-01', ate: '2026-10-31' },
      base: 'recebimento',
    });
    expect(dashboard.secoes.length).toBeGreaterThan(0);
  });

  it('comercial: Médicos Ativos vem dos profissionais ativos; não consulta pacientes', async () => {
    const { service, profissionais, pacientes } = setup();

    const { secoes } = await service.obter('comercial', FILTROS);

    expect(valorDoKpi(secoes, 'medicos-ativos')).toBe(14);
    expect(profissionais.contarAtivos).toHaveBeenCalledTimes(1);
    expect(pacientes.contar).not.toHaveBeenCalled();
  });

  it('pacientes: Total Pacientes vem da contagem; não consulta profissionais', async () => {
    const { service, profissionais, pacientes } = setup();

    const { secoes } = await service.obter('pacientes', FILTROS);

    expect(valorDoKpi(secoes, 'total-pacientes')).toBe(1284);
    expect(pacientes.contar).toHaveBeenCalledTimes(1);
    expect(profissionais.contarAtivos).not.toHaveBeenCalled();
  });

  it.each<AbaPainel>(['executivo', 'ocupacao', 'financeiro'])(
    'aba %s não consulta o banco',
    async (aba) => {
      const { service, profissionais, pacientes } = setup();

      await service.obter(aba, FILTROS);

      expect(profissionais.contarAtivos).not.toHaveBeenCalled();
      expect(pacientes.contar).not.toHaveBeenCalled();
    },
  );

  it('indicadores sem módulo dono saem sem valor, nunca com número inventado', async () => {
    const { service } = setup();

    const { secoes } = await service.obter('executivo', FILTROS);

    expect(valorDoKpi(secoes, 'faturamento-total')).toBeNull();
    expect(secoes.flatMap((s) => s.blocos).some((b) => b.tipo === 'alerta')).toBe(false);
  });

  it('executivo: metas da tabela Meta vs Atual', async () => {
    const { service } = setup();

    const { secoes } = await service.obter('executivo', FILTROS);

    const meta = secoes.flatMap((s) => s.blocos).find((b) => b.tipo === 'meta-vs-atual');
    expect(meta?.tipo === 'meta-vs-atual' && meta.indicadores).toHaveLength(12);
    expect(
      meta?.tipo === 'meta-vs-atual' &&
        Object.fromEntries(meta.indicadores.filter((i) => i.meta).map((i) => [i.id, i.meta])),
    ).toEqual({ 'taxa-ocupacao': '≥85%', vacancia: '≤15%', cancelamentos: '0', nps: '≥40' });
  });
});
