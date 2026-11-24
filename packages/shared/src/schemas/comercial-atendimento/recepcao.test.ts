import { describe, expect, it } from 'vitest';
import { AGENDAMENTO_STATUS } from './agendamento';
import {
  listRecepcaoQuerySchema,
  RECEPCAO_STATUS_ACAO,
  RECEPCAO_STATUS_ROTULOS,
  RECEPCAO_STATUS_TRAVADOS,
  recepcaoItemSchema,
  recepcaoPodeAlterar,
  recepcaoStatusNaClinica,
  updateRecepcaoStatusSchema,
} from './recepcao';

const UUID = '00000000-0000-4000-8000-000000000001';

describe('status da recepção', () => {
  it('a recepção aplica Chegou, Aguardando, Confirmado, Faltou, Cancelou e Reagendou', () => {
    expect([...RECEPCAO_STATUS_ACAO].sort()).toEqual(
      ['AGUARDANDO', 'CANCELADO', 'CHECK_IN', 'CONFIRMADO', 'FALTOU', 'REAGENDAR'].sort(),
    );
    expect(Object.keys(RECEPCAO_STATUS_ROTULOS).sort()).toEqual([...RECEPCAO_STATUS_ACAO].sort());
  });

  it('em atendimento e finalizado são do médico: a recepção não os aplica nem altera', () => {
    for (const status of RECEPCAO_STATUS_TRAVADOS) {
      expect(RECEPCAO_STATUS_ACAO).not.toContain(status);
      expect(recepcaoPodeAlterar(status)).toBe(false);
    }
    const alteraveis = AGENDAMENTO_STATUS.filter(recepcaoPodeAlterar);
    expect(alteraveis).toHaveLength(AGENDAMENTO_STATUS.length - RECEPCAO_STATUS_TRAVADOS.length);
  });

  it('só Chegou e Aguardando contam a espera', () => {
    expect(AGENDAMENTO_STATUS.filter(recepcaoStatusNaClinica)).toEqual(['CHECK_IN', 'AGUARDANDO']);
  });
});

describe('updateRecepcaoStatusSchema', () => {
  it('aceita os status rápidos', () => {
    for (const status of RECEPCAO_STATUS_ACAO) {
      expect(updateRecepcaoStatusSchema.safeParse({ status }).success).toBe(true);
    }
  });

  it('recusa status do médico, desconhecido ou ausente', () => {
    for (const corpo of [
      { status: 'EM_ATENDIMENTO' },
      { status: 'ATENDIDO' },
      { status: 'X' },
      {},
    ]) {
      expect(updateRecepcaoStatusSchema.safeParse(corpo).success).toBe(false);
    }
  });
});

describe('listRecepcaoQuerySchema', () => {
  it('padrões: página 1, ordem por horário', () => {
    const query = listRecepcaoQuerySchema.parse({});
    expect(query).toMatchObject({ page: 1, sort: { field: 'inicio', direction: 'asc' } });
  });

  it('aceita filtros de profissional, sala e status', () => {
    const query = listRecepcaoQuerySchema.parse({
      profissionalId: UUID,
      salaId: UUID,
      status: 'AGUARDANDO',
      sort: 'sala:desc',
    });
    expect(query).toMatchObject({ profissionalId: UUID, salaId: UUID, status: 'AGUARDANDO' });
  });

  it('recusa id inválido e ordenação fora da lista', () => {
    expect(listRecepcaoQuerySchema.safeParse({ salaId: 'x' }).success).toBe(false);
    expect(listRecepcaoQuerySchema.safeParse({ profissionalId: 'x' }).success).toBe(false);
    expect(listRecepcaoQuerySchema.safeParse({ sort: 'cpf:asc' }).success).toBe(false);
  });
});

describe('recepcaoItemSchema', () => {
  it('não tem campo clínico nem financeiro', () => {
    expect(Object.keys(recepcaoItemSchema.shape).sort()).toEqual(
      [
        'chegadaEm',
        'entradaEm',
        'finalizadoEm',
        'id',
        'inicio',
        'pacienteNome',
        'profissionalId',
        'profissionalNome',
        'salaNome',
        'status',
      ].sort(),
    );
  });
});
