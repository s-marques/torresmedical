import type { TransactionHost } from '@nestjs-cls/transactional';
import type { RequestContextService } from '../../../common/context/request-context.service';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import type { UsuariosLookupService } from '../../configuracoes-gestao/usuarios/usuarios.service';
import type { ProfissionaisService } from '../../gestao-profissionais/profissionais/profissionais.service';
import type { AtendimentoAcessoService } from './atendimento-acesso.service';
import { AtendimentoAssinaturaService } from './atendimento-assinatura.service';

const PACIENTE = '2b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const ATENDIMENTO = '3b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const USUARIO = '4b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';

function atendimento(extra: Record<string, unknown> = {}) {
  return {
    id: ATENDIMENTO,
    pacienteId: PACIENTE,
    profissionalId: '5b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f',
    tipo: 'CONSULTA',
    queixa: 'Queixa',
    evolucao: null,
    diagnostico: null,
    conduta: null,
    observacoes: null,
    status: 'EM_ANDAMENTO',
    agendamentoId: null,
    finalizadoEm: null,
    assinadoEm: null,
    assinadoPorId: null,
    createdAt: new Date('2026-11-24T10:00:00Z'),
    updatedAt: new Date('2026-11-24T10:00:00Z'),
    ...extra,
  };
}

function setup({
  atual = atendimento(),
  vinculado = true,
  senhaOk = true,
  userId = USUARIO as string | null,
  versoes = [] as { numero: number; texto: string | null }[],
} = {}) {
  const tx = {
    atendimento: { update: jest.fn().mockImplementation(({ data }) => ({ ...atual, ...data })) },
    atendimentoVersao: {
      findMany: jest.fn().mockResolvedValue(versoes),
      groupBy: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation(({ data }) => ({
        id: 'v1',
        createdAt: new Date('2026-11-24T12:00:00Z'),
        texto: null,
        antes: null,
        ...data,
      })),
    },
  };
  const acesso = { carregar: jest.fn().mockResolvedValue(atual) };
  const usuarios = {
    vinculadoAoProfissional: jest.fn().mockResolvedValue(vinculado),
    confirmarSenha: jest.fn().mockResolvedValue(senhaOk),
    nomesPorIds: jest.fn().mockResolvedValue(new Map([[USUARIO, 'Dr. Fictício']])),
  };
  const profissionais = { detalhe: jest.fn().mockResolvedValue({ nome: 'Dr. Fictício' }) };
  const contexto = { getUserId: () => userId ?? undefined };
  const service = new AtendimentoAssinaturaService(
    { tx } as unknown as TransactionHost<PrismaAdapter>,
    acesso as unknown as AtendimentoAcessoService,
    usuarios as unknown as UsuariosLookupService,
    profissionais as unknown as ProfissionaisService,
    contexto as unknown as RequestContextService,
  );
  return { service, tx, usuarios };
}

describe('AtendimentoAssinaturaService', () => {
  describe('assinar', () => {
    it('finaliza, grava hash e a versão 1', async () => {
      const { service, tx } = setup();
      const dto = await service.assinar(PACIENTE, ATENDIMENTO, { senha: 'x' });
      expect(dto.status).toBe('FINALIZADO');
      const data = tx.atendimento.update.mock.calls[0][0].data;
      expect(data).toMatchObject({ status: 'FINALIZADO', assinadoPorId: USUARIO });
      expect(data.assinaturaHash).toMatch(/^[0-9a-f]{64}$/);
      expect(tx.atendimentoVersao.create.mock.calls[0][0].data).toMatchObject({
        numero: 1,
        tipo: 'ASSINATURA',
        hash: data.assinaturaHash,
      });
    });

    it('mantém o finalizadoEm de quem já estava finalizado', async () => {
      const antes = new Date('2026-11-20T10:00:00Z');
      const { service, tx } = setup({
        atual: atendimento({ status: 'FINALIZADO', agendamentoId: 'ag', finalizadoEm: antes }),
      });
      await service.assinar(PACIENTE, ATENDIMENTO, { senha: 'x' });
      expect(tx.atendimento.update.mock.calls[0][0].data.finalizadoEm).toBe(antes);
    });

    it('recusa senha incorreta (422) sem gravar', async () => {
      const { service, tx } = setup({ senhaOk: false });
      await expect(service.assinar(PACIENTE, ATENDIMENTO, { senha: 'x' })).rejects.toMatchObject({
        status: 422,
        code: 'ASSINATURA_SENHA_INVALIDA',
      });
      expect(tx.atendimento.update).not.toHaveBeenCalled();
    });

    it('recusa quem não é o profissional vinculado ou não tem usuário (403), sem checar a senha', async () => {
      const semVinculo = setup({ vinculado: false });
      await expect(
        semVinculo.service.assinar(PACIENTE, ATENDIMENTO, { senha: 'x' }),
      ).rejects.toMatchObject({ status: 403 });
      expect(semVinculo.usuarios.confirmarSenha).not.toHaveBeenCalled();

      const semUsuario = setup({ userId: null });
      await expect(
        semUsuario.service.assinar(PACIENTE, ATENDIMENTO, { senha: 'x' }),
      ).rejects.toMatchObject({ status: 403 });
      const naoUuid = setup({ userId: 'system' });
      await expect(
        naoUuid.service.assinar(PACIENTE, ATENDIMENTO, { senha: 'x' }),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('recusa assinar duas vezes e atendimento da agenda não finalizado (409)', async () => {
      await expect(
        setup({ atual: atendimento({ assinadoEm: new Date() }) }).service.assinar(
          PACIENTE,
          ATENDIMENTO,
          { senha: 'x' },
        ),
      ).rejects.toMatchObject({ status: 409, code: 'ATENDIMENTO_JA_ASSINADO' });
      await expect(
        setup({ atual: atendimento({ agendamentoId: 'ag' }) }).service.assinar(
          PACIENTE,
          ATENDIMENTO,
          { senha: 'x' },
        ),
      ).rejects.toMatchObject({ status: 409, code: 'ATENDIMENTO_NAO_FINALIZADO' });
    });
  });

  describe('atualizar', () => {
    it('edita enquanto não assinado e recusa depois (409)', async () => {
      const livre = setup();
      await livre.service.atualizar(PACIENTE, ATENDIMENTO, { queixa: 'Nova' });
      expect(livre.tx.atendimento.update).toHaveBeenCalledWith({
        where: { id: ATENDIMENTO },
        data: { queixa: 'Nova' },
      });
      const assinado = setup({ atual: atendimento({ assinadoEm: new Date() }) });
      await expect(
        assinado.service.atualizar(PACIENTE, ATENDIMENTO, { queixa: 'Nova' }),
      ).rejects.toMatchObject({ status: 409, code: 'ATENDIMENTO_ASSINADO' });
      expect(assinado.tx.atendimento.update).not.toHaveBeenCalled();
    });
  });

  describe('adendo', () => {
    const assinado = atendimento({ assinadoEm: new Date('2026-11-24T11:00:00Z') });

    it('cria a próxima versão com o antes/depois acumulando os adendos', async () => {
      const { service, tx } = setup({
        atual: assinado,
        versoes: [
          { numero: 1, texto: null },
          { numero: 2, texto: 'Primeiro' },
        ],
      });
      const versao = await service.adendo(PACIENTE, ATENDIMENTO, { texto: 'Segundo' });
      expect(tx.atendimentoVersao.create.mock.calls[0][0].data).toMatchObject({
        numero: 3,
        tipo: 'ADENDO',
        texto: 'Segundo',
      });
      expect(versao.antes?.adendos).toEqual(['Primeiro']);
      expect(versao.depois.adendos).toEqual(['Primeiro', 'Segundo']);
      expect(versao.usuarioNome).toBe('Dr. Fictício');
    });

    it('exige atendimento assinado (409) e o profissional responsável (403)', async () => {
      await expect(
        setup().service.adendo(PACIENTE, ATENDIMENTO, { texto: 'x' }),
      ).rejects.toMatchObject({ status: 409, code: 'ATENDIMENTO_NAO_ASSINADO' });
      await expect(
        setup({ atual: assinado, vinculado: false }).service.adendo(PACIENTE, ATENDIMENTO, {
          texto: 'x',
        }),
      ).rejects.toMatchObject({ status: 403 });
    });
  });

  describe('resumos', () => {
    it('sem atendimento assinado não consulta nada', async () => {
      const { service, tx, usuarios } = setup();
      const resumos = await service.resumos([atendimento() as never]);
      expect(resumos.size).toBe(0);
      expect(tx.atendimentoVersao.groupBy).not.toHaveBeenCalled();
      expect(usuarios.nomesPorIds).not.toHaveBeenCalled();
    });

    it('traz quem assinou e o total de adendos', async () => {
      const { service, tx } = setup();
      tx.atendimentoVersao.groupBy.mockResolvedValue([
        { atendimentoId: ATENDIMENTO, _count: { _all: 3 } },
      ]);
      const resumos = await service.resumos([
        atendimento({ assinadoEm: new Date(), assinadoPorId: USUARIO }) as never,
      ]);
      expect(resumos.get(ATENDIMENTO)).toEqual({
        assinadoPorNome: 'Dr. Fictício',
        totalAdendos: 3,
      });
    });
  });
});
