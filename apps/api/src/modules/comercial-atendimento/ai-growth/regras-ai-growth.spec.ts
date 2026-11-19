import {
  contarAniversariantes,
  contarFaixasBaixaOcupacao,
  inativos,
  profissionaisSubutilizados,
} from './regras-ai-growth';

const AGORA = new Date('2026-06-18T15:00:00.000Z');
const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('regras do AI Growth', () => {
  describe('contarAniversariantes', () => {
    it('conta de hoje até 7 dias à frente, ignorando o ano', () => {
      const nascimentos = [
        dia('1990-06-18'),
        dia('1985-06-25'),
        dia('2000-06-26'),
        dia('1970-06-17'),
        dia('1999-12-01'),
      ];
      expect(contarAniversariantes(nascimentos, AGORA)).toBe(2);
    });

    it('atravessa a virada do ano', () => {
      expect(contarAniversariantes([dia('1990-01-02')], new Date('2026-12-30T15:00:00.000Z'))).toBe(
        1,
      );
    });

    it('lista vazia não tem aniversariantes', () => {
      expect(contarAniversariantes([], AGORA)).toBe(0);
    });
  });

  describe('contarFaixasBaixaOcupacao', () => {
    const naFaixa = (hora: number, vezes: number) =>
      Array.from(
        { length: vezes },
        () => new Date(`2026-06-15T${String(hora + 3).padStart(2, '0')}:10:00.000Z`),
      );

    it('sem agendamentos não há faixa', () => {
      expect(contarFaixasBaixaOcupacao([])).toBe(0);
    });

    it('conta as faixas abaixo de 50% da média das faixas com atendimento', () => {
      // média = (10 + 10 + 1) / 3 = 7; limite 3,5: só a faixa de 1 agendamento.
      const inicios = [...naFaixa(9, 10), ...naFaixa(10, 10), ...naFaixa(11, 1)];
      expect(contarFaixasBaixaOcupacao(inicios)).toBe(1);
    });

    it('faixas parecidas não disparam o ponto de atenção', () => {
      expect(contarFaixasBaixaOcupacao([...naFaixa(9, 5), ...naFaixa(10, 4)])).toBe(0);
    });
  });

  describe('profissionaisSubutilizados', () => {
    it('sem profissionais, nada a apontar', () => {
      expect(profissionaisSubutilizados([])).toEqual({ quantidade: 0, media: 0, faturado: 0 });
    });

    it('conta quem está abaixo de 50% da média e soma o faturado deles', () => {
      const resultado = profissionaisSubutilizados([
        { atendimentos: 30, faturado: 3000 },
        { atendimentos: 20, faturado: 2000 },
        { atendimentos: 4, faturado: 400.456 },
        { atendimentos: 0, faturado: 0 },
      ]);
      expect(resultado).toEqual({ quantidade: 2, media: 13.5, faturado: 400.46 });
    });

    it('quem não atendeu ninguém entra na média', () => {
      expect(profissionaisSubutilizados([{ atendimentos: 0, faturado: 0 }]).quantidade).toBe(0);
    });
  });

  describe('inativos', () => {
    const limite = dia('2026-04-19');
    const antigo = dia('2026-01-10');
    const recente = dia('2026-06-01');

    it('considera o último atendimento do paciente com qualquer profissional', () => {
      const resultado = inativos(
        [
          { pacienteId: 'p1', profissionalId: 'a', ultimo: antigo },
          { pacienteId: 'p1', profissionalId: 'b', ultimo: recente },
          { pacienteId: 'p2', profissionalId: 'a', ultimo: antigo },
        ],
        [],
        limite,
      );
      expect(resultado.pacientes).toBe(1);
      expect(resultado.profissionais).toBe(1);
    });

    it('consulta futura tira o paciente (e o vínculo) da lista', () => {
      const resultado = inativos(
        [
          { pacienteId: 'p1', profissionalId: 'a', ultimo: antigo },
          { pacienteId: 'p2', profissionalId: 'b', ultimo: antigo },
        ],
        [{ pacienteId: 'p1', profissionalId: 'a' }],
        limite,
      );
      expect(resultado).toEqual({ pacientes: 1, profissionais: 1 });
    });
  });
});
