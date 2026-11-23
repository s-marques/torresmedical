import type { ContratoSala, FiltrosPainel } from '@torres/shared';
import { escopoFalso } from '../../../../test/utils/escopo-falso';
import type { AgendaOcupacaoService } from '../../comercial-atendimento/agenda/agenda-ocupacao.service';
import type { MinhaEmpresaService } from '../../configuracoes-gestao/minha-empresa/minha-empresa.service';
import type { ProfissionaisService } from '../../gestao-profissionais/profissionais/profissionais.service';
import type { ContratosSalaService } from '../../gestao-profissionais/salas/contratos-sala.service';
import type { SalasBloqueiosService } from '../../gestao-profissionais/salas/salas-bloqueios.service';
import type { SalasService } from '../../gestao-profissionais/salas/salas.service';
import { OcupacaoService } from './ocupacao.service';

const S1 = '11111111-1111-4111-8111-111111111111';
const S2 = '22222222-2222-4222-8222-222222222222';
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const EMPRESA = 'empresa-1';

/** Outubro de 2026: dia 1 é quinta-feira. */
const FILTROS: FiltrosPainel = { modo: 'mes', mes: '2026-10', base: 'recebimento' };
const PERIODO = { de: '2026-10-01', ate: '2026-10-31' };

function contrato(salaId: string, profissionalId: string, diaSemana: number): ContratoSala {
  return {
    id: '99999999-9999-4999-8999-999999999999',
    salaId,
    locatarioTipo: 'PROFISSIONAL',
    locatarioId: profissionalId,
    dataInicio: '2026-01-01',
    dataFim: null,
    dias: [{ diaSemana, inicio: '08:00', fim: '12:00' }],
  } as unknown as ContratoSala;
}

function dia(diaSemana: number, fechado: boolean) {
  return {
    diaSemana,
    fechado,
    abre: fechado ? null : '08:00',
    fecha: fechado ? null : '18:00',
    intervalos: [],
  };
}

function montar(
  opcoes: {
    restrito?: readonly string[];
    contratos?: ContratoSala[];
    agendamentos?: Array<Record<string, unknown>>;
    horarios?: ReturnType<typeof dia>[];
  } = {},
) {
  const salas = {
    listarParaMatriz: jest.fn().mockResolvedValue([
      { id: S1, nome: 'Sala 1' },
      { id: S2, nome: 'Sala 2' },
    ]),
  };
  const contratos = { ativosNoPeriodo: jest.fn().mockResolvedValue(opcoes.contratos ?? []) };
  const bloqueios = { ocorrenciasNoPeriodo: jest.fn().mockResolvedValue([]) };
  const agenda = { doPeriodo: jest.fn().mockResolvedValue(opcoes.agendamentos ?? []) };
  const profissionais = {
    listarParaAgenda: jest.fn().mockResolvedValue([
      { id: A, nome: 'Ana', especialidade: 'Cardiologia', cor: 'azul' },
      { id: B, nome: 'Bruno', especialidade: null, cor: 'azul' },
    ]),
    nomesPorIds: jest.fn().mockResolvedValue(new Map()),
  };
  const minhaEmpresa = {
    listarHorarios: jest
      .fn()
      .mockResolvedValue(opcoes.horarios ?? Array.from({ length: 7 }, (_, d) => dia(d, false))),
  };
  const service = new OcupacaoService(
    salas as unknown as SalasService,
    contratos as unknown as ContratosSalaService,
    bloqueios as unknown as SalasBloqueiosService,
    agenda as unknown as AgendaOcupacaoService,
    profissionais as unknown as ProfissionaisService,
    minhaEmpresa as unknown as MinhaEmpresaService,
    escopoFalso(opcoes.restrito),
  );
  return { service, salas, contratos, bloqueios, agenda, profissionais, minhaEmpresa };
}

describe('OcupacaoService', () => {
  it('consulta cada módulo dono pelo service, uma vez, cobrindo o período e o anterior', async () => {
    const { service, salas, contratos, bloqueios, agenda } = montar();

    await service.calcular({ ...FILTROS, salaId: S1 }, PERIODO, EMPRESA);

    expect(salas.listarParaMatriz).toHaveBeenCalledWith(S1);
    expect(contratos.ativosNoPeriodo).toHaveBeenCalledWith('2026-09-01', '2026-10-31', [S1, S2]);
    expect(bloqueios.ocorrenciasNoPeriodo).toHaveBeenCalledWith('2026-09-01', '2026-10-31', [
      S1,
      S2,
    ]);
    expect(agenda.doPeriodo).toHaveBeenCalledWith('2026-09-01', '2026-10-31', [S1, S2]);
  });

  it('só os dias de funcionamento entram na capacidade', async () => {
    // Fechado aos domingos (0) e sábados (6): outubro de 2026 tem 22 dias úteis.
    const horarios = [0, 1, 2, 3, 4, 5, 6].map((d) => dia(d, d === 0 || d === 6));
    const { service } = montar({ horarios });

    const r = await service.calcular(FILTROS, PERIODO, EMPRESA);

    expect(r.atual.total.capacidade).toBe(2 * 22 * 3);
  });

  it('sem horário de funcionamento cadastrado (todos fechados), vale a semana toda', async () => {
    const horarios = [0, 1, 2, 3, 4, 5, 6].map((d) => dia(d, true));
    const { service } = montar({ horarios });

    const r = await service.calcular(FILTROS, PERIODO, EMPRESA);

    expect(r.atual.total.capacidade).toBe(2 * 31 * 3);
  });

  it('filtro de dia da semana e de turno', async () => {
    const { service } = montar();

    // Quintas de outubro/2026: 1, 8, 15, 22 e 29.
    const r = await service.calcular(
      { ...FILTROS, diaSemana: 4, turno: 'MANHA' },
      PERIODO,
      EMPRESA,
    );

    expect(r.atual.total.capacidade).toBe(2 * 5);
  });

  it('compara com o mês anterior e informa o rótulo', async () => {
    const { service } = montar();

    const r = await service.calcular(FILTROS, PERIODO, EMPRESA);

    expect(r.periodoAnterior).toEqual({ de: '2026-09-01', ate: '2026-09-30' });
    expect(r.rotuloAnterior).toBe('mês anterior');
    expect(r.anterior.total.capacidade).toBe(2 * 30 * 3);
  });

  it('período já encerrado: a previsão é o realizado; futuro: sem previsão', async () => {
    const { service } = montar();

    const passado = await service.calcular(FILTROS, PERIODO, EMPRESA);
    expect(passado.previsao?.completo).toBe(true);

    const futuro = await service.calcular(
      { ...FILTROS, mes: '2099-01' },
      { de: '2099-01-01', ate: '2099-01-31' },
      EMPRESA,
    );
    expect(futuro.previsao).toBeNull();
  });

  it('todos os profissionais ativos aparecem, inclusive os sem contrato nem atendimento', async () => {
    const { service } = montar({ contratos: [contrato(S1, A, 4)] });

    const r = await service.calcular(FILTROS, PERIODO, EMPRESA);

    expect(r.atual.porProfissional.map((p) => p.profissionalId).sort()).toEqual([A, B]);
    expect(r.atual.porProfissional.find((p) => p.profissionalId === A)).toMatchObject({
      contratados: 5,
      utilizados: 0,
      taxaUso: 0,
    });
    expect(r.profissionais[A]).toEqual({ nome: 'Ana', especialidade: 'Cardiologia' });
  });

  it('restrito (#153): vê só as salas e os profissionais do escopo', async () => {
    const { service } = montar({
      restrito: [A],
      contratos: [contrato(S1, A, 4), contrato(S2, B, 4)],
    });

    const r = await service.calcular(FILTROS, PERIODO, EMPRESA);

    expect(r.atual.porSala.map((s) => s.salaId)).toEqual([S1]);
    expect(r.atual.porProfissional.map((p) => p.profissionalId)).toEqual([A]);
  });

  it('restrito sem vínculo não vê nenhuma sala nem profissional', async () => {
    const { service } = montar({ restrito: [], contratos: [contrato(S1, A, 4)] });

    const r = await service.calcular(FILTROS, PERIODO, EMPRESA);

    expect(r.atual.porSala).toEqual([]);
    expect(r.atual.total.capacidade).toBe(0);
    expect(r.atual.porProfissional).toEqual([]);
  });

  it('restrito pedindo o profissional de outro: 403', async () => {
    const { service } = montar({ restrito: [A] });

    await expect(
      service.calcular({ ...FILTROS, profissionalId: B }, PERIODO, EMPRESA),
    ).rejects.toMatchObject({
      status: 403,
    });
  });
});
