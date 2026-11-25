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

describe('respostas do modelo de prontuário (#152)', () => {
  it('sem respostas o snapshot e o hash são os de antes do modelo', () => {
    const snapshot = snapshotDoAtendimento({ ...BASE, respostas: null }, []);
    expect('respostas' in snapshot).toBe(false);
    expect(hashDoSnapshot(snapshot)).toBe(hashDoSnapshot(snapshotDoAtendimento(BASE, [])));
  });

  it('com respostas o hash muda com o valor, não com a ordem das chaves', () => {
    const a = snapshotDoAtendimento({ ...BASE, respostas: { a: '1', b: 2 } }, []);
    const mesmaOrdemTroca = snapshotDoAtendimento({ ...BASE, respostas: { b: 2, a: '1' } }, []);
    const outroValor = snapshotDoAtendimento({ ...BASE, respostas: { a: '1', b: 3 } }, []);
    expect(hashDoSnapshot(a)).toBe(hashDoSnapshot(mesmaOrdemTroca));
    expect(hashDoSnapshot(a)).not.toBe(hashDoSnapshot(outroValor));
    expect(hashDoSnapshot(a)).not.toBe(hashDoSnapshot(snapshotDoAtendimento(BASE, [])));
  });

  it('o dto traz o modelo e as respostas', () => {
    const atendimento = {
      id: 'a1',
      pacienteId: 'p1',
      profissionalId: 'pr1',
      ...BASE,
      status: 'EM_ANDAMENTO',
      assinadoEm: null,
      respostas: { queixa: 'Dor' },
      createdAt: new Date('2026-11-25T10:00:00.000Z'),
      updatedAt: new Date('2026-11-25T10:00:00.000Z'),
    } as unknown as Atendimento;
    const modelo = { modeloId: 'm', versaoId: 'v', nome: 'N', versao: 2, secoes: [] };
    expect(toAtendimentoDto(atendimento, null, undefined, modelo)).toMatchObject({
      modelo,
      respostas: { queixa: 'Dor' },
    });
    expect(toAtendimentoDto(atendimento, null)).toMatchObject({ modelo: null });
  });
});
