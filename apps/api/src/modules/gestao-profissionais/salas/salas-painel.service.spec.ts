import type { TransactionHost } from '@nestjs-cls/transactional';
import type { ContratoSala, SalaBloqueio, SalaBloqueioTipo } from '@torres/shared';
import { escopoFalso } from '../../../../test/utils/escopo-falso';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import type { ContratosSalaService } from './contratos-sala.service';
import type { OcorrenciaBloqueioSala, SalasBloqueiosService } from './salas-bloqueios.service';
import { LOCATARIO_OCULTO, SalasPainelService } from './salas-painel.service';

const SALA_1 = '11111111-1111-4111-8111-111111111111';
const SALA_2 = '22222222-2222-4222-8222-222222222222';
const PROF_A = '33333333-3333-4333-8333-333333333333';
const PROF_B = '44444444-4444-4444-8444-444444444444';
const SEGUNDA = '2026-11-16';

function contrato(id: string, salaId: string, profissionalId: string, nome: string): ContratoSala {
  return {
    id,
    salaId,
    locatarioTipo: 'PROFISSIONAL',
    locatarioId: profissionalId,
    locatarioNome: nome,
    dataInicio: '2026-01-01',
    dataFim: null,
    dias: [{ diaSemana: 1, inicio: '08:00', fim: '12:00' }],
    permuta: false,
    valorTotalMensal: 1000,
  } as unknown as ContratoSala;
}

const CONTRATOS = [
  contrato('55555555-5555-4555-8555-555555555555', SALA_1, PROF_A, 'Dra. A'),
  contrato('66666666-6666-4666-8666-666666666666', SALA_1, PROF_B, 'Dr. B'),
  contrato('77777777-7777-4777-8777-777777777777', SALA_2, PROF_B, 'Dr. B'),
];

function ocorrencia(
  id: string,
  salaId: string,
  tipo: SalaBloqueioTipo,
  profissionalId: string | null = null,
  oculto = false,
): OcorrenciaBloqueioSala {
  return {
    data: SEGUNDA,
    inicio: '14:00',
    fim: '18:00',
    bloqueio: {
      id,
      salaId,
      tipo,
      profissionalId,
      profissionalNome: oculto ? null : 'Prof.',
      oculto,
    } as unknown as SalaBloqueio,
  };
}

const BLOQ_1 = '88888888-8888-4888-8888-888888888888';
const BLOQ_2 = '99999999-9999-4999-8999-999999999999';

const SALA_3 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SALA_4 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SALAS = [
  { id: SALA_1, nome: 'Sala 1' },
  { id: SALA_2, nome: 'Sala 2' },
];

function setup(escopo?: string[], ocorrencias: OcorrenciaBloqueioSala[] = [], salas = SALAS) {
  const sala = { findMany: jest.fn().mockResolvedValue(salas) };
  const txHost = { tx: { sala } } as unknown as TransactionHost<PrismaAdapter>;
  const contratos = { ativosNoPeriodo: jest.fn().mockResolvedValue(CONTRATOS) };
  const bloqueios = { ocorrenciasNoPeriodo: jest.fn().mockResolvedValue(ocorrencias) };
  return new SalasPainelService(
    txHost,
    contratos as unknown as ContratosSalaService,
    bloqueios as unknown as SalasBloqueiosService,
    escopoFalso(escopo),
  );
}

describe('SalasPainelService: escopo de dados (issue #153)', () => {
  it('sem restrição: todas as salas com os nomes dos locatários', async () => {
    const ocupacao = await setup().ocupacao({ inicio: SEGUNDA });
    expect(ocupacao.salas.map((s) => s.salaId)).toEqual([SALA_1, SALA_2]);
    expect(ocupacao.salas[0]?.blocos.map((b) => b.locatarioNome)).toEqual(['Dra. A', 'Dr. B']);
  });

  it('restrito: só as salas do profissional, com os outros locatários ocultos', async () => {
    const ocupacao = await setup([PROF_A]).ocupacao({ inicio: SEGUNDA });
    expect(ocupacao.salas.map((s) => s.salaId)).toEqual([SALA_1]);
    expect(ocupacao.salas[0]?.blocos.map((b) => b.locatarioNome)).toEqual([
      'Dra. A',
      LOCATARIO_OCULTO,
    ]);
  });

  it('restrito sem vínculo: nenhuma sala', async () => {
    const ocupacao = await setup([]).ocupacao({ inicio: SEGUNDA });
    expect(ocupacao.salas).toEqual([]);
  });

  it('dashboard: 403 para restrito, liberado sem restrição', async () => {
    await expect(setup([PROF_A]).dashboard({})).rejects.toMatchObject({ status: 403 });
    await expect(setup().dashboard({ data: SEGUNDA })).resolves.toMatchObject({ totalSalas: 2 });
  });
});

describe('SalasPainelService: bloqueios e reservas de sala (issue #138)', () => {
  it('mapa: cada sala traz os seus dias de bloqueio, com o tipo', async () => {
    const ocupacao = await setup(undefined, [
      ocorrencia(BLOQ_1, SALA_2, 'MANUTENCAO'),
      ocorrencia(BLOQ_2, SALA_1, 'RESERVA', PROF_A),
    ]).ocupacao({ inicio: SEGUNDA });
    expect(ocupacao.salas[0]?.bloqueios).toEqual([
      {
        bloqueioId: BLOQ_2,
        tipo: 'RESERVA',
        data: SEGUNDA,
        inicio: '14:00',
        fim: '18:00',
        profissionalNome: 'Prof.',
        oculto: false,
      },
    ]);
    expect(ocupacao.salas[1]?.bloqueios.map((b) => b.tipo)).toEqual(['MANUTENCAO']);
  });

  it('mapa restrito: sala com reserva do seu profissional aparece mesmo sem contrato', async () => {
    const ocupacao = await setup(
      ['00000000-0000-4000-8000-000000000001'],
      [ocorrencia(BLOQ_1, SALA_2, 'USO_AVULSO', '00000000-0000-4000-8000-000000000001')],
    ).ocupacao({ inicio: SEGUNDA });
    expect(ocupacao.salas.map((s) => s.salaId)).toEqual([SALA_2]);
  });

  it('mapa restrito: bloqueio de outro profissional vem oculto', async () => {
    const ocupacao = await setup(
      [PROF_A],
      [ocorrencia(BLOQ_1, SALA_1, 'RESERVA', PROF_B, true)],
    ).ocupacao({ inicio: SEGUNDA });
    expect(ocupacao.salas[0]?.bloqueios[0]).toMatchObject({ oculto: true, profissionalNome: null });
  });

  it.each([
    ['RESERVA', 3],
    ['USO_AVULSO', 3],
    ['CORTESIA', 2],
    ['MANUTENCAO', 2],
    ['BLOQUEIO', 2],
  ] as const)('dashboard: %s na sala sem contrato deixa %i ocupadas', async (tipo, ocupadas) => {
    // Contratos ocupam a Sala 1 e a Sala 2; a Sala 3 só tem o bloqueio e a Sala 4 está livre.
    const salas = [...SALAS, { id: SALA_3, nome: 'Sala 3' }, { id: SALA_4, nome: 'Sala 4' }];
    const dashboard = await setup(undefined, [ocorrencia(BLOQ_1, SALA_3, tipo)], salas).dashboard({
      data: SEGUNDA,
    });
    expect(dashboard).toMatchObject({ totalSalas: 4, ocupadas, disponiveis: 4 - ocupadas });
  });

  it('dashboard: bloqueio de sala excluída não conta', async () => {
    const dashboard = await setup(undefined, [
      ocorrencia(BLOQ_2, '00000000-0000-4000-8000-0000000000ff', 'RESERVA'),
    ]).dashboard({ data: SEGUNDA });
    expect(dashboard).toMatchObject({ totalSalas: 2, ocupadas: 2 });
  });
});
