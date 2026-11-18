import type { TransactionHost } from '@nestjs-cls/transactional';
import type { ContratoSala } from '@torres/shared';
import { escopoFalso } from '../../../../test/utils/escopo-falso';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import type { ContratosSalaService } from './contratos-sala.service';
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

function setup(escopo?: string[]) {
  const sala = {
    findMany: jest.fn().mockResolvedValue([
      { id: SALA_1, nome: 'Sala 1' },
      { id: SALA_2, nome: 'Sala 2' },
    ]),
  };
  const txHost = { tx: { sala } } as unknown as TransactionHost<PrismaAdapter>;
  const contratos = { ativosNoPeriodo: jest.fn().mockResolvedValue(CONTRATOS) };
  return new SalasPainelService(
    txHost,
    contratos as unknown as ContratosSalaService,
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
