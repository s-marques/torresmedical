import type { TransactionHost } from '@nestjs-cls/transactional';
import type { ModeloSecoesFormulario } from '@torres/shared';
import { modeloSecoesSchema } from '@torres/shared';
import type { EscopoDadosService } from '../../../common/auth/escopo-dados.service';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import type { ProfissionaisService } from '../../gestao-profissionais/profissionais/profissionais.service';
import { ModelosProntuarioService, toAtendimentoModelo } from './modelos-prontuario.service';
import { escopoFalso } from '../../../../test/utils/escopo-falso';

const ID = '1b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const PROF = '2b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const OUTRO = '3b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';

const secoesV1 = modeloSecoesSchema.parse([
  {
    titulo: 'Avaliação',
    campos: [{ chave: 'queixa', rotulo: 'Queixa', tipo: 'TEXTO', obrigatorio: true }],
  },
]);

function modelo(extra: Record<string, unknown> = {}, secoes = secoesV1) {
  return {
    id: ID,
    nome: 'Anamnese',
    profissao: 'MEDICO',
    especialidade: null,
    profissionalId: null,
    ativo: true,
    versaoAtual: 1,
    createdAt: new Date('2026-11-25T10:00:00Z'),
    updatedAt: new Date('2026-11-25T10:00:00Z'),
    deletedAt: null,
    versoes: [
      {
        id: 'v1',
        modeloId: ID,
        numero: 1,
        nome: 'Anamnese',
        secoes,
        createdAt: new Date('2026-11-25T10:00:00Z'),
      },
    ],
    ...extra,
  };
}

function setup({ atual = modelo(), escopo = escopoFalso() } = {}) {
  const tx = {
    modeloProntuario: {
      findFirst: jest.fn().mockResolvedValue(atual),
      findMany: jest.fn().mockResolvedValue([atual]),
      findUniqueOrThrow: jest.fn().mockResolvedValue(atual),
      count: jest.fn().mockResolvedValue(1),
      create: jest.fn().mockResolvedValue(atual),
      update: jest.fn().mockResolvedValue(atual),
    },
    modeloProntuarioVersao: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const profissionais = {
    garantirExiste: jest.fn().mockResolvedValue(undefined),
    nomesPorIds: jest.fn().mockResolvedValue(new Map([[PROF, 'Dr. Fictício']])),
  };
  const service = new ModelosProntuarioService(
    { tx } as unknown as TransactionHost<PrismaAdapter>,
    profissionais as unknown as ProfissionaisService,
    escopo as unknown as EscopoDadosService,
  );
  return { service, tx, profissionais };
}

const novasSecoes: ModeloSecoesFormulario = [
  {
    titulo: 'Outra',
    campos: [{ chave: 'motivo', rotulo: 'Motivo', tipo: 'TEXTO' }],
  },
];

describe('ModelosProntuarioService', () => {
  describe('atualizar (versionamento)', () => {
    it('mudar as seções cria a próxima versão com as seções novas', async () => {
      const { service, tx } = setup();
      await service.atualizar(ID, { secoes: modeloSecoesSchema.parse(novasSecoes) }, true);
      const data = tx.modeloProntuario.update.mock.calls[0][0].data;
      expect(data.versaoAtual).toBe(2);
      expect(data.versoes.create).toMatchObject({ numero: 2, nome: 'Anamnese' });
    });

    it('mudar o nome também cria versão, copiando as seções', async () => {
      const { service, tx } = setup();
      await service.atualizar(ID, { nome: 'Revisada' }, true);
      const data = tx.modeloProntuario.update.mock.calls[0][0].data;
      expect(data.versaoAtual).toBe(2);
      expect(data.versoes.create).toMatchObject({ numero: 2, nome: 'Revisada', secoes: secoesV1 });
    });

    it('seções iguais ou só ativar/desativar não criam versão', async () => {
      const { service, tx } = setup();
      await service.atualizar(ID, { secoes: secoesV1, ativo: false }, true);
      const data = tx.modeloProntuario.update.mock.calls[0][0].data;
      expect(data.versaoAtual).toBe(1);
      expect(data.versoes).toBeUndefined();
      expect(data.ativo).toBe(false);
    });

    it('as mesmas seções com as chaves em outra ordem (jsonb) não criam versão', async () => {
      const { service, tx } = setup();
      const reordenadas = JSON.parse(
        JSON.stringify(secoesV1, (_c, v: unknown) =>
          v && typeof v === 'object' && !Array.isArray(v)
            ? Object.fromEntries(Object.entries(v).reverse())
            : v,
        ),
      );
      await service.atualizar(ID, { secoes: reordenadas }, true);
      const data = tx.modeloProntuario.update.mock.calls[0][0].data;
      expect(data.versaoAtual).toBe(1);
      expect(data.versoes).toBeUndefined();
    });

    it('a rota precisa bater com o tipo do modelo (404)', async () => {
      await expect(setup().service.atualizar(ID, { nome: 'x' }, false)).rejects.toMatchObject({
        status: 404,
      });
      const proprio = setup({ atual: modelo({ profissionalId: PROF }) });
      await expect(proprio.service.atualizar(ID, { nome: 'x' }, true)).rejects.toMatchObject({
        status: 404,
      });
      expect(proprio.tx.modeloProntuario.update).not.toHaveBeenCalled();
    });

    it('modelo próprio fora do escopo: 403', async () => {
      const { service, tx } = setup({
        atual: modelo({ profissionalId: PROF }),
        escopo: escopoFalso([OUTRO]),
      });
      await expect(service.atualizar(ID, { nome: 'x' }, false)).rejects.toMatchObject({
        status: 403,
      });
      expect(tx.modeloProntuario.update).not.toHaveBeenCalled();
    });

    it('404 para id inexistente, excluído ou que não é uuid', async () => {
      const { service, tx } = setup();
      tx.modeloProntuario.findFirst.mockResolvedValue(null);
      await expect(service.atualizar(ID, {}, true)).rejects.toMatchObject({ status: 404 });
      await expect(service.atualizar('abc', {}, true)).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('criar', () => {
    it('modelo próprio exige profissional no escopo e existente', async () => {
      const fora = setup({ escopo: escopoFalso([OUTRO]) });
      await expect(
        fora.service.criarProprio({
          nome: 'x',
          profissao: 'MEDICO',
          especialidade: null,
          secoes: secoesV1,
          profissionalId: PROF,
        }),
      ).rejects.toMatchObject({ status: 403 });
      expect(fora.tx.modeloProntuario.create).not.toHaveBeenCalled();

      const ok = setup({ atual: modelo({ profissionalId: PROF }), escopo: escopoFalso([PROF]) });
      const dto = await ok.service.criarProprio({
        nome: 'x',
        profissao: 'MEDICO',
        especialidade: null,
        secoes: secoesV1,
        profissionalId: PROF,
      });
      expect(ok.profissionais.garantirExiste).toHaveBeenCalledWith(PROF);
      expect(dto).toMatchObject({ padrao: false, profissionalNome: 'Dr. Fictício', versao: 1 });
    });

    it('modelo padrão nasce na versão 1, sem profissional e ativo', async () => {
      const { service, tx } = setup();
      await service.criarPadrao({
        nome: 'Padrão',
        profissao: 'PSICOLOGO',
        especialidade: null,
        secoes: secoesV1,
      });
      expect(tx.modeloProntuario.create.mock.calls[0][0].data).toMatchObject({
        profissionalId: null,
        ativo: true,
        versaoAtual: 1,
        versoes: { create: { numero: 1, nome: 'Padrão' } },
      });
    });
  });

  describe('listar', () => {
    it('restrito sem pedido: padrão ou profissionais do escopo', async () => {
      const { service, tx } = setup({ escopo: escopoFalso([PROF]) });
      await service.listar({
        page: 1,
        pageSize: 10,
        sort: { field: 'nome', direction: 'asc' },
        somenteAtivos: true,
        search: 'anam',
        tipo: undefined,
        profissao: undefined,
        profissionalId: undefined,
      } as never);
      const where = tx.modeloProntuario.findMany.mock.calls[0][0].where;
      expect(where).toMatchObject({ deletedAt: null, ativo: true });
      expect(where.AND).toEqual(
        expect.arrayContaining([
          { OR: [{ profissionalId: null }, { profissionalId: { in: [PROF] } }] },
        ]),
      );
    });

    it('sem restrição nem pedido não filtra por profissional', async () => {
      const { service, tx } = setup();
      await service.listar({
        page: 1,
        pageSize: 10,
        sort: { field: 'nome', direction: 'asc' },
        somenteAtivos: false,
      } as never);
      const where = tx.modeloProntuario.findMany.mock.calls[0][0].where;
      expect(where).toEqual({ deletedAt: null });
    });
  });

  describe('uso no atendimento', () => {
    it('versaoParaAtendimento aceita padrão e o próprio; recusa de outro, inativo e inexistente', async () => {
      expect((await setup().service.versaoParaAtendimento(ID, PROF)).numero).toBe(1);
      expect(
        (
          await setup({ atual: modelo({ profissionalId: PROF }) }).service.versaoParaAtendimento(
            ID,
            PROF,
          )
        ).numero,
      ).toBe(1);
      await expect(
        setup({ atual: modelo({ profissionalId: OUTRO }) }).service.versaoParaAtendimento(ID, PROF),
      ).rejects.toMatchObject({ status: 400, details: [{ field: 'modeloId' }] });
      await expect(
        setup({ atual: modelo({ ativo: false }) }).service.versaoParaAtendimento(ID, PROF),
      ).rejects.toMatchObject({ status: 400 });
      const inexistente = setup();
      inexistente.tx.modeloProntuario.findFirst.mockResolvedValue(null);
      await expect(inexistente.service.versaoParaAtendimento(ID, PROF)).rejects.toMatchObject({
        status: 400,
      });
    });

    it('conferirRespostas devolve normalizado ou falha com o campo respostas.<chave>', () => {
      const { service } = setup();
      expect(service.conferirRespostas(secoesV1, { queixa: 'Dor' }, true)).toEqual({
        queixa: 'Dor',
      });
      expect(service.conferirRespostas(secoesV1, {}, false)).toEqual({});
      expect(() => service.conferirRespostas(secoesV1, {}, true)).toThrow(
        expect.objectContaining({ status: 400 }),
      );
    });

    it('versoesPorId ignora nulos e não consulta sem ids', async () => {
      const { service, tx } = setup();
      expect((await service.versoesPorId([null])).size).toBe(0);
      expect(tx.modeloProntuarioVersao.findMany).not.toHaveBeenCalled();
      tx.modeloProntuarioVersao.findMany.mockResolvedValue([
        { id: 'v1', modeloId: ID, numero: 3, nome: 'N', secoes: secoesV1, createdAt: new Date() },
      ]);
      const mapa = await service.versoesPorId(['v1', 'v1', null]);
      expect(mapa.get('v1')).toMatchObject({ versao: 3, nome: 'N', modeloId: ID });
      expect(tx.modeloProntuarioVersao.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['v1'] } },
      });
    });
  });

  it('toAtendimentoModelo copia o nome e as seções da versão', () => {
    const versao = modelo().versoes[0];
    expect(toAtendimentoModelo(versao as never)).toEqual({
      modeloId: ID,
      versaoId: 'v1',
      nome: 'Anamnese',
      versao: 1,
      secoes: secoesV1,
    });
  });
});
