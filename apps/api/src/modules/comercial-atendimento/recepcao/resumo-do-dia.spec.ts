import { resumirDia } from './recepcao.service';

describe('resumirDia (Painel "Hoje", #170)', () => {
  it('soma por status e conta profissionais sem cancelado/reagendar', () => {
    const resumo = resumirDia([
      { profissionalId: 'a', status: 'CONFIRMADO', quantidade: 2 },
      { profissionalId: 'a', status: 'FALTOU', quantidade: 1 },
      { profissionalId: 'b', status: 'CANCELADO', quantidade: 3 },
      { profissionalId: 'c', status: 'REAGENDAR', quantidade: 1 },
      { profissionalId: 'd', status: 'CONFIRMADO', quantidade: 1 },
    ]);

    expect(resumo.porStatus).toEqual({ CONFIRMADO: 3, FALTOU: 1, CANCELADO: 3, REAGENDAR: 1 });
    expect(resumo.profissionaisComAtendimento).toBe(2);
  });

  it('sem agendamentos: tudo zerado', () => {
    expect(resumirDia([])).toEqual({ porStatus: {}, profissionaisComAtendimento: 0 });
  });
});
