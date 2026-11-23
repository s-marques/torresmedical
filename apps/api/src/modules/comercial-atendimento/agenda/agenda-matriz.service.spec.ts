import type { ContratoSala } from '@torres/shared';
import type { ProfissionaisService } from '../../gestao-profissionais/profissionais/profissionais.service';
import type { ContratosSalaService } from '../../gestao-profissionais/salas/contratos-sala.service';
import type { SalasBloqueiosService } from '../../gestao-profissionais/salas/salas-bloqueios.service';
import type { SalasService } from '../../gestao-profissionais/salas/salas.service';
import { escopoFalso } from '../../../../test/utils/escopo-falso';
import { AgendaMatrizService } from './agenda-matriz.service';

const SALA = '4b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const PROF = '1b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const OUTRO = '3b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const ID = '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
/** Quinta-feira (dia da semana 4). */
const DIA = '2026-10-22';

function contrato(profissionalId: string, nome: string, extra: Partial<ContratoSala> = {}) {
  return {
    id: ID,
    salaId: SALA,
    locatarioTipo: 'PROFISSIONAL',
    locatarioId: profissionalId,
    locatarioNome: nome,
    valorTotalMensal: 900,
    dataInicio: '2026-09-01',
    dataFim: null,
    dias: [{ diaSemana: 4, inicio: '08:00', fim: '12:00' }],
    ...extra,
  } as ContratoSala;
}

function montar(
  opcoes: {
    contratos?: ContratoSala[];
    agendamentos?: unknown[];
    especialidade?: string[];
    restrito?: readonly string[];
  } = {},
) {
  const findMany = jest.fn().mockResolvedValue(opcoes.agendamentos ?? []);
  const txHost = { tx: { agendamento: { findMany } } } as unknown as { tx: unknown };
  const salas = {
    listarParaMatriz: jest.fn().mockResolvedValue([{ id: SALA, nome: 'Sala 1' }]),
  } as unknown as SalasService;
  const contratos = {
    ativosNoPeriodo: jest.fn().mockResolvedValue(opcoes.contratos ?? []),
  } as unknown as ContratosSalaService;
  const bloqueios = {
    ocorrenciasNoPeriodo: jest.fn().mockResolvedValue([]),
  } as unknown as SalasBloqueiosService;
  const profissionais = {
    idsDaEspecialidade: jest.fn().mockResolvedValue(opcoes.especialidade ?? []),
  } as unknown as ProfissionaisService;
  const service = new AgendaMatrizService(
    txHost as unknown as ConstructorParameters<typeof AgendaMatrizService>[0],
    salas,
    contratos,
    bloqueios,
    profissionais,
    escopoFalso(opcoes.restrito),
  );
  return { service, findMany, salas, contratos, bloqueios, profissionais };
}

const celulaManha = (m: Awaited<ReturnType<AgendaMatrizService['matriz']>>) =>
  m.salas[0]?.celulas.find((c) => c.data === DIA && c.coluna === 'MANHA');

describe('AgendaMatrizService', () => {
  it('consulta os módulos donos só pelos services, com o período e as salas da grade', async () => {
    const { service, contratos, bloqueios, salas } = montar();
    const m = await service.matriz({ visao: 'semana', data: DIA, salaId: SALA });
    expect(salas.listarParaMatriz).toHaveBeenCalledWith(SALA);
    expect(contratos.ativosNoPeriodo).toHaveBeenCalledWith('2026-10-19', '2026-10-25', [SALA]);
    expect(bloqueios.ocorrenciasNoPeriodo).toHaveBeenCalledWith('2026-10-19', '2026-10-25', [SALA]);
    expect(m.dias).toHaveLength(7);
    expect(m.salas[0]?.celulas.every((c) => c.status === 'DISPONIVEL')).toBe(true);
  });

  it('sem salas, não consulta contratos nem agendamentos', async () => {
    const { service, contratos, findMany, salas } = montar();
    (salas.listarParaMatriz as jest.Mock).mockResolvedValue([]);
    const m = await service.matriz({ visao: 'dia', data: DIA });
    expect(m.salas).toEqual([]);
    expect(contratos.ativosNoPeriodo).not.toHaveBeenCalled();
    expect(findMany).not.toHaveBeenCalled();
  });

  it('contrato do período: contratado sem uso; agendamento no turno vira agendado', async () => {
    const livre = montar({ contratos: [contrato(PROF, 'Dra. Ana Teste')] });
    expect(celulaManha(await livre.service.matriz({ visao: 'semana', data: DIA }))).toMatchObject({
      status: 'CONTRATADO',
      semUso: true,
    });
    const usado = montar({
      contratos: [contrato(PROF, 'Dra. Ana Teste')],
      agendamentos: [
        {
          id: ID,
          salaId: SALA,
          profissionalId: PROF,
          // 09:00 locais (UTC-3) são 12:00 UTC.
          inicio: new Date('2026-10-22T12:00:00Z'),
          duracaoMinutos: 30,
          status: 'AGENDADO',
          profissional: { nome: 'Dra. Ana Teste' },
        },
      ],
    });
    expect(celulaManha(await usado.service.matriz({ visao: 'semana', data: DIA }))).toMatchObject({
      status: 'AGENDADO',
      semUso: false,
    });
  });

  it('consulta só agendamentos não cancelados nem excluídos das salas do período', async () => {
    const { service, findMany } = montar({ contratos: [contrato(PROF, 'Dra. Ana Teste')] });
    await service.matriz({ visao: 'dia', data: DIA });
    expect(findMany.mock.calls[0]?.[0]?.where).toMatchObject({
      deletedAt: null,
      status: { not: 'CANCELADO' },
      salaId: { in: [SALA] },
    });
  });

  it('especialidade sem profissionais deixa a sala só com horários livres', async () => {
    const { service, profissionais } = montar({
      contratos: [contrato(PROF, 'Dra. Ana Teste')],
      especialidade: [],
    });
    const m = await service.matriz({ visao: 'semana', data: DIA, especialidadeId: ID });
    expect(profissionais.idsDaEspecialidade).toHaveBeenCalledWith(ID);
    expect(celulaManha(m)).toBeUndefined();
  });

  it('profissional e especialidade juntos: vale a interseção', async () => {
    const { service } = montar({
      contratos: [contrato(PROF, 'Dra. Ana Teste')],
      especialidade: [OUTRO],
    });
    const m = await service.matriz({
      visao: 'semana',
      data: DIA,
      especialidadeId: ID,
      profissionalId: PROF,
    });
    expect(celulaManha(m)).toBeUndefined();
  });

  it('restrito: o contrato de outro profissional vem oculto e a sala só aparece com item seu', async () => {
    const { service } = montar({
      contratos: [contrato(PROF, 'Dra. Ana Teste'), contrato(OUTRO, 'Dr. Bruno Teste')],
      restrito: [PROF],
    });
    const m = await service.matriz({ visao: 'semana', data: DIA });
    const itens = celulaManha(m)?.itens ?? [];
    expect(itens.map((i) => [i.nome, i.oculto])).toEqual([
      ['Dra. Ana Teste', false],
      [null, true],
    ]);
    expect(itens[1]?.valorMensal).toBeNull();

    const semMeu = montar({ contratos: [contrato(OUTRO, 'Dr. Bruno Teste')], restrito: [PROF] });
    expect((await semMeu.service.matriz({ visao: 'semana', data: DIA })).salas).toEqual([]);
  });

  it('restrito: filtrar por profissional de fora do escopo é 403', async () => {
    const { service } = montar({ restrito: [PROF] });
    await expect(
      service.matriz({ visao: 'semana', data: DIA, profissionalId: OUTRO }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('sem data usa hoje e a visão mês cobre o mês inteiro', async () => {
    const { service } = montar();
    const m = await service.matriz({ visao: 'mes', data: DIA });
    expect(m.inicio).toBe('2026-10-01');
    expect(m.fim).toBe('2026-10-31');
    expect(m.colunas.map((c) => c.chave)).toEqual(['MANHA', 'TARDE', 'NOITE']);
    const hoje = await service.matriz({ visao: 'dia' });
    expect(hoje.inicio).toBe(hoje.fim);
  });
});
