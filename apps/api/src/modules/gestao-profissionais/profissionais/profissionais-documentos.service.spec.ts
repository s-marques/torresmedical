import type { TransactionHost } from '@nestjs-cls/transactional';
import { escopoFalso } from '../../../../test/utils/escopo-falso';
import type { RequestContextService } from '../../../common/context/request-context.service';
import { BusinessException } from '../../../common/errors/api.exception';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import type { ArquivosService } from '../../../common/storage/arquivos.service';
import type { UsuariosLookupService } from '../../configuracoes-gestao/usuarios/usuarios.service';
import { ProfissionaisDocumentosService } from './profissionais-documentos.service';

const PROF = '11111111-1111-4111-8111-111111111111';
const OUTRO = '22222222-2222-4222-8222-222222222222';
const DOC = '33333333-3333-4333-8333-333333333333';
const ARQ = '44444444-4444-4444-8444-444444444444';
const USUARIO = '55555555-5555-4555-8555-555555555555';
const AGORA = new Date('2026-11-24T15:00:00.000Z');

function registro(parcial: Record<string, unknown> = {}) {
  return {
    id: DOC,
    profissionalId: PROF,
    tipo: 'CONTRATO',
    arquivoId: ARQ,
    numero: null,
    emissao: null,
    validade: null,
    observacao: null,
    situacao: 'ENVIADO',
    motivoRecusa: null,
    validadoPorId: null,
    validadoEm: null,
    createdAt: new Date('2026-11-01T12:00:00.000Z'),
    updatedAt: new Date('2026-11-01T12:00:00.000Z'),
    deletedAt: null,
    ...parcial,
  };
}

function montar(opcoes: { escopo?: readonly string[]; profissao?: string | null } = {}) {
  const prisma = {
    profissional: {
      findFirst: jest.fn(async ({ where }: { where: { id: string } }) =>
        where.id === PROF ? { id: PROF, profissao: opcoes.profissao ?? 'MEDICO' } : null,
      ),
    },
    profissionalDocumento: {
      findMany: jest.fn(async () => [] as unknown[]),
      findFirst: jest.fn(async () => registro() as unknown),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => registro(data)),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => registro(data)),
    },
  };
  const arquivos = {
    findById: jest.fn(async () => ({
      id: ARQ,
      uso: 'documento-profissional',
      nomeOriginal: 'a.pdf',
    })),
    link: jest.fn(async () => ({ url: '/u', expiraEm: '2026-11-24T15:05:00.000Z' })),
  };
  const usuarios = { nomesPorIds: jest.fn(async () => new Map([[USUARIO, 'Ana Revisora']])) };
  const contexto = { getUserId: () => USUARIO };
  const service = new ProfissionaisDocumentosService(
    { tx: prisma } as unknown as TransactionHost<PrismaAdapter>,
    arquivos as unknown as ArquivosService,
    usuarios as unknown as UsuariosLookupService,
    escopoFalso(opcoes.escopo),
    contexto as unknown as RequestContextService,
  );
  return { service, prisma, arquivos };
}

const INPUT = {
  tipo: 'CONTRATO' as const,
  arquivoId: ARQ,
  numero: null,
  emissao: null,
  validade: '2027-01-01',
  observacao: null,
};

describe('ProfissionaisDocumentosService', () => {
  describe('listar', () => {
    it('sem documentos: todos os obrigatórios do médico ficam pendentes', async () => {
      const { service } = montar();
      const r = await service.listar(PROF, AGORA);
      expect(r.pendentes).toEqual(['CONTRATO', 'DOCUMENTO_PESSOAL', 'REGISTRO_CONSELHO']);
      expect(r.documentacaoValidada).toBe(false);
    });

    it('profissão "outra" não exige registro no conselho', async () => {
      const { service } = montar({ profissao: 'OUTRA' });
      expect((await service.listar(PROF, AGORA)).pendentes).toEqual([
        'CONTRATO',
        'DOCUMENTO_PESSOAL',
      ]);
    });

    it('documento validado com validade vencida vira Vencido e não completa a documentação', async () => {
      const { service, prisma } = montar({ profissao: 'OUTRA' });
      prisma.profissionalDocumento.findMany.mockResolvedValue([
        registro({ situacao: 'VALIDADO', validade: new Date('2026-11-23T00:00:00.000Z') }),
        registro({ id: OUTRO, tipo: 'DOCUMENTO_PESSOAL', situacao: 'VALIDADO' }),
      ]);
      const r = await service.listar(PROF, AGORA);
      expect(r.data[0]).toMatchObject({
        situacao: 'VENCIDO',
        alerta: 'vencido',
        diasParaVencer: -1,
      });
      expect(r.documentacaoValidada).toBe(false);
    });

    it('todos os obrigatórios validados e em dia: documentação validada', async () => {
      const { service, prisma } = montar({ profissao: 'OUTRA' });
      prisma.profissionalDocumento.findMany.mockResolvedValue([
        registro({ situacao: 'VALIDADO', validadoPorId: USUARIO, validadoEm: AGORA }),
        registro({ id: OUTRO, tipo: 'DOCUMENTO_PESSOAL', situacao: 'VALIDADO' }),
      ]);
      const r = await service.listar(PROF, AGORA);
      expect(r).toMatchObject({ pendentes: [], documentacaoValidada: true });
      expect(r.data[0]?.validadoPorNome).toBe('Ana Revisora');
    });

    it('404 sem profissional e 403 fora do escopo', async () => {
      await expect(montar().service.listar(OUTRO)).rejects.toMatchObject({ status: 404 });
      await expect(montar({ escopo: [OUTRO] }).service.listar(PROF)).rejects.toMatchObject({
        status: 403,
      });
    });
  });

  describe('criar e atualizar', () => {
    it('cria como Enviado com datas convertidas', async () => {
      const { service, prisma } = montar();
      await service.criar(PROF, INPUT);
      expect(prisma.profissionalDocumento.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          profissionalId: PROF,
          validade: new Date('2027-01-01T00:00:00.000Z'),
          emissao: null,
        }),
      });
    });

    it('recusa arquivo de outro uso com ARQUIVO_USO_INVALIDO', async () => {
      const { service, arquivos } = montar();
      arquivos.findById.mockResolvedValue({ id: ARQ, uso: 'avatar', nomeOriginal: 'a.png' });
      await expect(service.criar(PROF, INPUT)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'ARQUIVO_USO_INVALIDO' }),
      });
    });

    it('atualizar devolve para Enviado e limpa a validação', async () => {
      const { service, prisma } = montar();
      await service.atualizar(PROF, DOC, INPUT);
      expect(prisma.profissionalDocumento.update).toHaveBeenCalledWith({
        where: { id: DOC },
        data: expect.objectContaining({
          situacao: 'ENVIADO',
          motivoRecusa: null,
          validadoPorId: null,
          validadoEm: null,
        }),
      });
    });

    it('atualizar com o mesmo arquivo não consulta o arquivo de novo', async () => {
      const { service, arquivos } = montar();
      await service.atualizar(PROF, DOC, INPUT);
      expect(arquivos.findById).toHaveBeenCalledTimes(1); // só o nome, na resposta
    });

    it('documento inexistente ou de outro profissional: 404', async () => {
      const { service, prisma } = montar();
      prisma.profissionalDocumento.findFirst.mockResolvedValue(null);
      await expect(service.atualizar(PROF, DOC, INPUT)).rejects.toBeInstanceOf(BusinessException);
      await expect(service.remover(PROF, 'x')).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('decidir', () => {
    it('valida gravando quem e quando', async () => {
      const { service, prisma } = montar();
      await service.decidir(PROF, DOC, { decisao: 'VALIDAR', motivo: null });
      expect(prisma.profissionalDocumento.update).toHaveBeenCalledWith({
        where: { id: DOC },
        data: expect.objectContaining({
          situacao: 'VALIDADO',
          motivoRecusa: null,
          validadoPorId: USUARIO,
          validadoEm: expect.any(Date),
        }),
      });
    });

    it('recusa guardando o motivo', async () => {
      const { service, prisma } = montar();
      await service.decidir(PROF, DOC, { decisao: 'RECUSAR', motivo: 'Ilegível' });
      expect(prisma.profissionalDocumento.update).toHaveBeenCalledWith({
        where: { id: DOC },
        data: expect.objectContaining({ situacao: 'RECUSADO', motivoRecusa: 'Ilegível' }),
      });
    });
  });

  describe('remover e link', () => {
    it('remove logicamente', async () => {
      const { service, prisma } = montar();
      await service.remover(PROF, DOC);
      expect(prisma.profissionalDocumento.update).toHaveBeenCalledWith({
        where: { id: DOC },
        data: { deletedAt: expect.any(Date) },
      });
    });

    it('link usa o arquivo do documento depois de conferir o escopo', async () => {
      const { service, arquivos } = montar();
      await service.link(PROF, DOC);
      expect(arquivos.link).toHaveBeenCalledWith(ARQ);
      await expect(montar({ escopo: [OUTRO] }).service.link(PROF, DOC)).rejects.toMatchObject({
        status: 403,
      });
    });
  });

  describe('alertas', () => {
    it('consulta vencidos e a vencer em 60 dias, sem recusados, com o escopo do usuário', async () => {
      const { service, prisma } = montar({ escopo: [PROF] });
      prisma.profissionalDocumento.findMany.mockResolvedValue([
        {
          ...registro({ validade: new Date('2026-12-01T00:00:00.000Z') }),
          profissional: { nome: 'Dra. Ana' },
        },
      ]);
      const alertas = await service.alertas(AGORA);
      expect(alertas).toHaveLength(1);
      expect(alertas[0]).toMatchObject({ profissionalNome: 'Dra. Ana', alerta: 'alerta-30' });
      expect(prisma.profissionalDocumento.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            situacao: { not: 'RECUSADO' },
            validade: { not: null, lte: new Date('2027-01-23T00:00:00.000Z') },
            profissionalId: { in: [PROF] },
          }),
        }),
      );
    });
  });
});
