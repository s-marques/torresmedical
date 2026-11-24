import { textoMotivoClassificacao } from '@torres/shared';
import {
  classificarParceiro,
  diasEntre,
  type EntradaClassificacao,
} from './classificacao-parceiro';

const HOJE = '2026-11-24';

/** Parceiro ativo comum: contrato antigo, usa tudo o que contratou. */
function entrada(parcial: Partial<EntradaClassificacao> = {}): EntradaClassificacao {
  return {
    hoje: HOJE,
    profissionalAtivo: true,
    estrategico: false,
    contratoAtivo: true,
    inicioRelacionamento: '2026-01-10',
    contratados: 8,
    contratadosUsados: 8,
    utilizados: 8,
    semanaAtual: 2,
    semanaAnterior: 2,
    ...parcial,
  };
}

describe('classificarParceiro', () => {
  it('exemplo do documento: 4 períodos contratados e 1 usado em 30 dias é "Em risco"', () => {
    const r = classificarParceiro(entrada({ contratados: 4, contratadosUsados: 1, utilizados: 1 }));
    expect(r.classificacao).toBe('EM_RISCO');
    expect(r.motivo).toBe('BAIXO_USO');
    expect(textoMotivoClassificacao(r.motivo, r.parametros)).toBe(
      '1 de 4 períodos usados em 30 dias',
    );
  });

  it('50% de uso não é risco; abaixo de 50%, é', () => {
    expect(
      classificarParceiro(entrada({ contratados: 4, contratadosUsados: 2, utilizados: 2 }))
        .classificacao,
    ).toBe('ATIVO');
    expect(
      classificarParceiro(entrada({ contratados: 10, contratadosUsados: 4, utilizados: 4 }))
        .classificacao,
    ).toBe('EM_RISCO');
  });

  it('contratou períodos e não usou nenhum é "Em risco"', () => {
    const r = classificarParceiro(entrada({ contratados: 4, contratadosUsados: 0, utilizados: 0 }));
    expect(r.classificacao).toBe('EM_RISCO');
    expect(textoMotivoClassificacao(r.motivo, r.parametros)).toBe(
      '0 de 4 períodos usados em 30 dias',
    );
  });

  it('sem períodos contratados na janela não há base para risco', () => {
    const r = classificarParceiro(
      entrada({
        contratados: 0,
        contratadosUsados: 0,
        utilizados: 0,
        semanaAtual: 0,
        semanaAnterior: 0,
      }),
    );
    expect(r.classificacao).toBe('ATIVO');
  });

  describe('Inativo', () => {
    it('profissional inativo', () => {
      const r = classificarParceiro(entrada({ profissionalAtivo: false, estrategico: true }));
      expect(r).toMatchObject({ classificacao: 'INATIVO', motivo: 'PROFISSIONAL_INATIVO' });
    });

    it('sem contrato ativo, mesmo marcado como estratégico', () => {
      const r = classificarParceiro(
        entrada({ contratoAtivo: false, estrategico: true, inicioRelacionamento: null }),
      );
      expect(r).toMatchObject({ classificacao: 'INATIVO', motivo: 'SEM_CONTRATO_ATIVO' });
    });
  });

  describe('Estratégico', () => {
    it('vale sobre Novo, Em risco e Em expansão', () => {
      const r = classificarParceiro(
        entrada({
          estrategico: true,
          inicioRelacionamento: '2026-11-01',
          contratados: 4,
          contratadosUsados: 0,
          utilizados: 0,
          semanaAtual: 3,
        }),
      );
      expect(r).toMatchObject({ classificacao: 'ESTRATEGICO', motivo: 'MARCADO_ESTRATEGICO' });
    });
  });

  describe('Novo', () => {
    it('até 90 dias desde o início do contrato, inclusive', () => {
      const r = classificarParceiro(entrada({ inicioRelacionamento: '2026-08-26' }));
      expect(diasEntre('2026-08-26', HOJE)).toBe(90);
      expect(r).toMatchObject({ classificacao: 'NOVO', parametros: { dias: 90 } });
    });

    it('com 91 dias deixa de ser novo', () => {
      const r = classificarParceiro(entrada({ inicioRelacionamento: '2026-08-25' }));
      expect(r.classificacao).toBe('ATIVO');
    });

    it('vale sobre "Em risco": quem acabou de entrar ainda não é avaliado pelo uso', () => {
      const r = classificarParceiro(
        entrada({
          inicioRelacionamento: '2026-11-10',
          contratados: 4,
          contratadosUsados: 0,
          utilizados: 0,
        }),
      );
      expect(r.classificacao).toBe('NOVO');
    });

    it('sem data de relacionamento não é novo', () => {
      expect(classificarParceiro(entrada({ inicioRelacionamento: null })).classificacao).toBe(
        'ATIVO',
      );
    });
  });

  describe('Em expansão', () => {
    it('aumentou os períodos contratados por semana', () => {
      const r = classificarParceiro(entrada({ semanaAnterior: 2, semanaAtual: 3 }));
      expect(r).toMatchObject({
        classificacao: 'EM_EXPANSAO',
        motivo: 'MAIS_PERIODOS',
        parametros: { semanaAnterior: 2, semanaAtual: 3 },
      });
      expect(textoMotivoClassificacao(r.motivo, r.parametros)).toBe(
        'Períodos contratados por semana subiram de 2 para 3',
      );
    });

    it('reduzir os períodos não é expansão', () => {
      expect(
        classificarParceiro(entrada({ semanaAnterior: 3, semanaAtual: 2 })).classificacao,
      ).toBe('ATIVO');
    });

    it('atendeu em mais períodos do que contratou', () => {
      const r = classificarParceiro(
        entrada({ contratados: 8, contratadosUsados: 8, utilizados: 11 }),
      );
      expect(r).toMatchObject({
        classificacao: 'EM_EXPANSAO',
        motivo: 'USO_ACIMA_DO_CONTRATADO',
        parametros: { contratados: 8, utilizados: 11 },
      });
    });

    it('"Em risco" vale sobre "Em expansão"', () => {
      const r = classificarParceiro(
        entrada({
          contratados: 8,
          contratadosUsados: 2,
          utilizados: 12,
          semanaAnterior: 1,
          semanaAtual: 2,
        }),
      );
      expect(r.classificacao).toBe('EM_RISCO');
    });
  });

  describe('Ativo', () => {
    it('é o caso comum, com o uso no motivo', () => {
      const r = classificarParceiro(
        entrada({ contratados: 8, contratadosUsados: 6, utilizados: 6 }),
      );
      expect(r).toMatchObject({ classificacao: 'ATIVO', motivo: 'USO_REGULAR' });
      expect(textoMotivoClassificacao(r.motivo, r.parametros)).toBe(
        '6 de 8 períodos usados em 30 dias',
      );
    });
  });
});

describe('textoMotivoClassificacao', () => {
  it('descreve os motivos sem números', () => {
    expect(textoMotivoClassificacao('PROFISSIONAL_INATIVO')).toBe('Profissional inativo');
    expect(textoMotivoClassificacao('SEM_CONTRATO_ATIVO')).toBe('Sem contrato de sala ativo');
    expect(textoMotivoClassificacao('MARCADO_ESTRATEGICO')).toBe(
      'Marcado como estratégico pela gerência',
    );
    expect(textoMotivoClassificacao('CONTRATO_RECENTE', { dias: 12 })).toBe(
      'Contrato iniciado há 12 dias (até 90)',
    );
  });
});

describe('diasEntre', () => {
  it('conta dias inteiros, inclusive na virada de mês e de ano', () => {
    expect(diasEntre('2026-11-24', '2026-11-24')).toBe(0);
    expect(diasEntre('2026-12-30', '2027-01-02')).toBe(3);
  });
});
