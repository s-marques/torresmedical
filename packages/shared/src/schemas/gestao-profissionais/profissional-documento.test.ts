import { describe, expect, it } from 'vitest';
import {
  alertaDoDocumento,
  diasParaVencer,
  profissionalDocumentoDecisaoSchema,
  profissionalDocumentoInputSchema,
  situacaoEfetiva,
  tiposObrigatorios,
} from './profissional-documento';

const ARQUIVO = '11111111-1111-4111-8111-111111111111';
const HOJE = '2026-11-24';

describe('situacaoEfetiva e alertas de validade', () => {
  it('calcula os dias até a validade', () => {
    expect(diasParaVencer('2026-11-24', HOJE)).toBe(0);
    expect(diasParaVencer('2026-12-04', HOJE)).toBe(10);
    expect(diasParaVencer('2026-11-23', HOJE)).toBe(-1);
  });

  it('marca como vencido só depois da validade, qualquer que seja a situação gravada', () => {
    expect(situacaoEfetiva('VALIDADO', '2026-11-23', HOJE)).toBe('VENCIDO');
    expect(situacaoEfetiva('ENVIADO', '2026-11-23', HOJE)).toBe('VENCIDO');
    expect(situacaoEfetiva('VALIDADO', '2026-11-24', HOJE)).toBe('VALIDADO');
    expect(situacaoEfetiva('RECUSADO', null, HOJE)).toBe('RECUSADO');
  });

  it('classifica o alerta em 30 e 60 dias', () => {
    expect(alertaDoDocumento(null, HOJE)).toBeNull();
    expect(alertaDoDocumento('2026-11-23', HOJE)).toBe('vencido');
    expect(alertaDoDocumento('2026-12-24', HOJE)).toBe('alerta-30');
    expect(alertaDoDocumento('2026-12-25', HOJE)).toBe('alerta-60');
    expect(alertaDoDocumento('2027-01-23', HOJE)).toBe('alerta-60');
    expect(alertaDoDocumento('2027-01-24', HOJE)).toBeNull();
  });
});

describe('tiposObrigatorios', () => {
  it('exige registro no conselho de quem tem conselho, mas não de "outra" profissão', () => {
    expect(tiposObrigatorios('MEDICO')).toContain('REGISTRO_CONSELHO');
    expect(tiposObrigatorios('OUTRA')).not.toContain('REGISTRO_CONSELHO');
    expect(tiposObrigatorios(null)).toContain('CONTRATO');
  });
});

describe('profissionalDocumentoInputSchema', () => {
  const base = { tipo: 'CRM', arquivoId: ARQUIVO };

  it('aceita o mínimo (tipo e arquivo) e normaliza vazios para null', () => {
    const r = profissionalDocumentoInputSchema.safeParse({
      tipo: 'CONTRATO',
      arquivoId: ARQUIVO,
      numero: '  ',
      validade: '',
    });
    expect(r.success).toBe(true);
    expect(r.data).toMatchObject({ numero: null, emissao: null, validade: null });
  });

  it('recusa tipo fora da lista e arquivo ausente, com mensagem de obrigatório', () => {
    expect(profissionalDocumentoInputSchema.safeParse(base).success).toBe(false);
    const r = profissionalDocumentoInputSchema.safeParse({ tipo: 'CONTRATO' });
    expect(r.error?.issues.some((i) => i.path[0] === 'arquivoId')).toBe(true);
    const vazio = profissionalDocumentoInputSchema.safeParse({ tipo: '', arquivoId: ARQUIVO });
    expect(vazio.error?.issues[0]?.message).toBe('Tipo é obrigatório.');
  });

  it('recusa validade anterior à emissão', () => {
    const r = profissionalDocumentoInputSchema.safeParse({
      tipo: 'LICENCA',
      arquivoId: ARQUIVO,
      emissao: '2026-05-10',
      validade: '2026-05-09',
    });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(['validade']);
  });

  it('recusa data inválida', () => {
    const r = profissionalDocumentoInputSchema.safeParse({
      tipo: 'LICENCA',
      arquivoId: ARQUIVO,
      validade: '31/12/2026',
    });
    expect(r.success).toBe(false);
  });
});

describe('profissionalDocumentoDecisaoSchema', () => {
  it('validar descarta o motivo', () => {
    const r = profissionalDocumentoDecisaoSchema.safeParse({ decisao: 'VALIDAR', motivo: 'x' });
    expect(r.data).toEqual({ decisao: 'VALIDAR', motivo: null });
  });

  it('recusar exige motivo', () => {
    expect(profissionalDocumentoDecisaoSchema.safeParse({ decisao: 'RECUSAR' }).success).toBe(
      false,
    );
    expect(
      profissionalDocumentoDecisaoSchema.safeParse({ decisao: 'RECUSAR', motivo: 'Ilegível' })
        .success,
    ).toBe(true);
  });
});
