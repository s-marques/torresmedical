import { describe, expect, it } from 'vitest';
import {
  CANCELAMENTO_OBSERVACAO_MAX,
  cancelarComMotivoSchema,
  cancelarSemReagendamentoSchema,
  createMotivoCancelamentoSchema,
  listMotivosCancelamentoQuerySchema,
  motivosDoTipoQuerySchema,
  TIPOS_CANCELAMENTO,
  TIPO_CANCELAMENTO_ROTULO,
  updateMotivoCancelamentoSchema,
} from './cancelamento';

const ID = '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';

function mensagens(resultado: { success: boolean; error?: { issues: { message: string }[] } }) {
  return resultado.error?.issues.map((i) => i.message) ?? [];
}

describe('tipos de cancelamento', () => {
  it('tem os cinco tipos do cliente, cada um com rótulo', () => {
    expect(TIPOS_CANCELAMENTO).toEqual(['CONSULTA', 'CONTRATO', 'COBRANCA', 'PERIODO', 'PROPOSTA']);
    for (const tipo of TIPOS_CANCELAMENTO) expect(TIPO_CANCELAMENTO_ROTULO[tipo]).toBeTruthy();
  });

  it('a consulta de motivos exige um tipo válido', () => {
    expect(motivosDoTipoQuerySchema.safeParse({ tipo: 'COBRANCA' }).success).toBe(true);
    expect(motivosDoTipoQuerySchema.safeParse({ tipo: 'OUTRO' }).success).toBe(false);
    expect(motivosDoTipoQuerySchema.safeParse({}).success).toBe(false);
  });
});

describe('cancelarComMotivoSchema', () => {
  it('motivo é obrigatório, com a mensagem padrão', () => {
    for (const entrada of [{}, { motivoId: '' }, { motivoId: 'abc' }]) {
      const resultado = cancelarComMotivoSchema.safeParse(entrada);
      expect(resultado.success).toBe(false);
      expect(mensagens(resultado)).toContain('Motivo é obrigatório.');
    }
  });

  it('aceita só o motivo; observação e reagendamento são opcionais', () => {
    expect(cancelarComMotivoSchema.parse({ motivoId: ID })).toEqual({
      motivoId: ID,
      observacao: undefined,
      reagendouParaId: undefined,
    });
  });

  it('a observação perde espaços nas pontas e vazia vira ausente', () => {
    expect(
      cancelarComMotivoSchema.parse({ motivoId: ID, observacao: '  Viagem  ' }).observacao,
    ).toBe('Viagem');
    for (const vazio of ['', '   ', null]) {
      expect(cancelarComMotivoSchema.parse({ motivoId: ID, observacao: vazio }).observacao).toBe(
        undefined,
      );
    }
  });

  it('a observação tem tamanho máximo', () => {
    const longa = 'x'.repeat(CANCELAMENTO_OBSERVACAO_MAX + 1);
    expect(cancelarComMotivoSchema.safeParse({ motivoId: ID, observacao: longa }).success).toBe(
      false,
    );
    const limite = 'x'.repeat(CANCELAMENTO_OBSERVACAO_MAX);
    expect(cancelarComMotivoSchema.safeParse({ motivoId: ID, observacao: limite }).success).toBe(
      true,
    );
  });

  it('reagendouParaId: select vazio e null viram "não reagendou"; id inválido é recusado', () => {
    for (const vazio of ['', null, undefined]) {
      expect(
        cancelarComMotivoSchema.parse({ motivoId: ID, reagendouParaId: vazio }).reagendouParaId,
      ).toBeUndefined();
    }
    expect(
      cancelarComMotivoSchema.parse({ motivoId: ID, reagendouParaId: ID }).reagendouParaId,
    ).toBe(ID);
    const invalido = cancelarComMotivoSchema.safeParse({ motivoId: ID, reagendouParaId: 'x' });
    expect(invalido.success).toBe(false);
    expect(mensagens(invalido)).toContain('Novo registro inválido');
  });

  it('não aceita campos fora do formulário', () => {
    expect(cancelarComMotivoSchema.safeParse({ motivoId: ID, extra: 1 }).success).toBe(false);
  });
});

describe('cancelarSemReagendamentoSchema', () => {
  it('só consulta reagenda: o campo não existe nos outros tipos', () => {
    expect(cancelarSemReagendamentoSchema.safeParse({ motivoId: ID }).success).toBe(true);
    expect(
      cancelarSemReagendamentoSchema.safeParse({ motivoId: ID, reagendouParaId: ID }).success,
    ).toBe(false);
  });
});

describe('cadastro de motivos', () => {
  it('create: nome obrigatório e tipo válido; exigeTexto começa desligado', () => {
    const resultado = createMotivoCancelamentoSchema.safeParse({ tipo: 'X', nome: '  ' });
    expect(resultado.success).toBe(false);
    expect(mensagens(resultado)).toContain('Nome é obrigatório.');
    expect(createMotivoCancelamentoSchema.parse({ tipo: 'CONSULTA', nome: ' Viagem ' })).toEqual({
      tipo: 'CONSULTA',
      nome: 'Viagem',
      exigeTexto: false,
    });
  });

  it('update: exige ao menos um campo e não troca o tipo', () => {
    expect(updateMotivoCancelamentoSchema.safeParse({}).success).toBe(false);
    expect(updateMotivoCancelamentoSchema.safeParse({ ativo: false }).success).toBe(true);
    expect(updateMotivoCancelamentoSchema.safeParse({ tipo: 'CONTRATO' }).success).toBe(false);
  });

  it('listagem: filtros de tipo e situação e ordenação pela lista', () => {
    const consulta = listMotivosCancelamentoQuerySchema.parse({ tipo: 'PERIODO', status: 'ativo' });
    expect(consulta).toMatchObject({
      tipo: 'PERIODO',
      status: 'ativo',
      sort: { field: 'ordem', direction: 'asc' },
    });
    expect(listMotivosCancelamentoQuerySchema.safeParse({ sort: 'deletedAt:asc' }).success).toBe(
      false,
    );
  });
});
