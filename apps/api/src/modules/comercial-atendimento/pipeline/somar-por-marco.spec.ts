import { somarPorMarco } from './negocios-lista.service';

describe('somarPorMarco (Painel "Hoje", #170)', () => {
  it('agrupa os negócios em aberto pelo marco do estágio; sem marco vai para SEM_MARCO', () => {
    const marcos = new Map<string, 'VISITA' | 'PROPOSTA' | null>([
      ['e1', 'VISITA'],
      ['e2', 'PROPOSTA'],
      ['e3', null],
    ]);

    const total = somarPorMarco(marcos, [
      { estagioId: 'e1', quantidade: 3 },
      { estagioId: 'e2', quantidade: 2 },
      { estagioId: 'e3', quantidade: 4 },
      { estagioId: 'removido', quantidade: 1 },
    ]);

    expect(total).toEqual({
      PRIMEIRO_CONTATO: 0,
      VISITA: 3,
      PROPOSTA: 2,
      CONTRATO: 0,
      SEM_MARCO: 5,
    });
  });
});
