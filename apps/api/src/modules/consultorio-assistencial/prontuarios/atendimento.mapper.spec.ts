import type { Atendimento } from '../../../generated/prisma/client';
import { hashDoSnapshot, snapshotDoAtendimento, toAtendimentoDto } from './atendimento.mapper';

const BASE = {
  tipo: 'CONSULTA',
  queixa: 'Queixa',
  evolucao: null,
  diagnostico: 'Diagnóstico',
  conduta: null,
  observacoes: null,
} as const;

describe('snapshot e hash do atendimento', () => {
  it('o hash é estável e muda com qualquer campo ou adendo', () => {
    const original = snapshotDoAtendimento(BASE, []);
    expect(hashDoSnapshot(original)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashDoSnapshot(snapshotDoAtendimento({ ...BASE }, []))).toBe(hashDoSnapshot(original));
    expect(hashDoSnapshot(snapshotDoAtendimento({ ...BASE, queixa: 'Outra' }, []))).not.toBe(
      hashDoSnapshot(original),
    );
    expect(hashDoSnapshot(snapshotDoAtendimento(BASE, ['Adendo']))).not.toBe(
      hashDoSnapshot(original),
    );
  });

  it('o snapshot copia a lista de adendos', () => {
    const adendos = ['a'];
    const snapshot = snapshotDoAtendimento(BASE, adendos);
    adendos.push('b');
    expect(snapshot.adendos).toEqual(['a']);
  });
});

describe('toAtendimentoDto', () => {
  const modelo = {
    id: 'a1',
    pacienteId: 'p1',
    profissionalId: 'pr1',
    ...BASE,
    status: 'FINALIZADO',
    assinadoEm: new Date('2026-11-24T12:00:00.000Z'),
    createdAt: new Date('2026-11-24T10:00:00.000Z'),
    updatedAt: new Date('2026-11-24T12:00:00.000Z'),
  } as unknown as Atendimento;

  it('inclui a assinatura e o total de adendos', () => {
    expect(
      toAtendimentoDto(modelo, 'Dr. A', { assinadoPorNome: 'Dr. A', totalAdendos: 2 }),
    ).toMatchObject({
      assinadoEm: '2026-11-24T12:00:00.000Z',
      assinadoPorNome: 'Dr. A',
      totalAdendos: 2,
    });
  });

  it('sem assinatura: campos vazios', () => {
    expect(toAtendimentoDto({ ...modelo, assinadoEm: null } as Atendimento, null)).toMatchObject({
      assinadoEm: null,
      assinadoPorNome: null,
      totalAdendos: 0,
    });
  });
});
