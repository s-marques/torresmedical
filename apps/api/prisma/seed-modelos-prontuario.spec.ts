import { MODELO_PROFISSOES, modeloSecoesSchema } from '@torres/shared';
import { applySeedModelosProntuario, MODELOS_PRONTUARIO_INICIAIS } from './seed-modelos-prontuario';

describe('modelos de prontuário iniciais', () => {
  it('cobrem as profissões do cliente e passam no schema do modelo', () => {
    const profissoes = MODELOS_PRONTUARIO_INICIAIS.map((m) => m.profissao).sort();
    expect(profissoes).toEqual(MODELO_PROFISSOES.filter((p) => p !== 'OUTRA').sort());
    for (const modelo of MODELOS_PRONTUARIO_INICIAIS) {
      expect(modeloSecoesSchema.safeParse(modelo.secoes).success).toBe(true);
    }
    const ids = MODELOS_PRONTUARIO_INICIAIS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('cria só os que ainda não existem', async () => {
    const existente = MODELOS_PRONTUARIO_INICIAIS[0]?.id;
    const create = jest.fn();
    const tx = {
      modeloProntuario: {
        findUnique: jest.fn(({ where }: { where: { id: string } }) =>
          Promise.resolve(where.id === existente ? { id: existente } : null),
        ),
        create,
      },
    };
    await applySeedModelosProntuario(tx as never);
    expect(create).toHaveBeenCalledTimes(MODELOS_PRONTUARIO_INICIAIS.length - 1);
    expect(create.mock.calls[0]?.[0].data).toMatchObject({ profissionalId: null, versaoAtual: 1 });
  });
});
