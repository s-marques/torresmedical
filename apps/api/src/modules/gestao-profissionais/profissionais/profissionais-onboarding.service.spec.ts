import type { TransactionHost } from '@nestjs-cls/transactional';
import type { Onboarding, OnboardingEtapaItem } from '@torres/shared';
import { escopoFalso } from '../../../../test/utils/escopo-falso';
import type { AuditService } from '../../../common/audit/audit.service';
import type { RequestContextService } from '../../../common/context/request-context.service';
import { BusinessException } from '../../../common/errors/api.exception';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import type { UsuariosLookupService } from '../../configuracoes-gestao/usuarios/usuarios.service';
import type { PacientesVinculadosService } from '../../consultorio-assistencial/pacientes-vinculados/pacientes-vinculados.service';
import { ProfissionaisOnboardingService } from './profissionais-onboarding.service';

const PROF = '11111111-1111-4111-8111-111111111111';
const OUTRO = '22222222-2222-4222-8222-222222222222';
const ONB = '33333333-3333-4333-8333-333333333333';
const CONTRATO = '44444444-4444-4444-8444-444444444444';
const USUARIO = '55555555-5555-4555-8555-555555555555';
/** Dia 24 de novembro de 2026 em São Paulo. */
const AGORA = new Date('2026-11-24T15:00:00.000Z');

const CADASTRO_COMPLETO = {
  nome: 'Dra. Teste',
  profissao: 'MEDICO',
  registro: 'CRM 1',
  especialidadeId: '66666666-6666-4666-8666-666666666666',
  cpf: '00000000000',
  rg: '1',
  dataNascimento: new Date('1990-01-01T00:00:00.000Z'),
  endereco: 'Rua Fictícia, 1',
  telefone: '11999999999',
  email: null,
  cnpj: '00000000000000',
};

const DOCUMENTOS_VALIDOS = ['CONTRATO', 'DOCUMENTO_PESSOAL', 'REGISTRO_CONSELHO', 'LICENCA'].map(
  (tipo) => ({ tipo, situacao: 'VALIDADO', validade: null }),
);

interface Cenario {
  iniciadoEm?: string;
  profissional?: Record<string, unknown>;
  recepcao?: boolean;
  acesso?: boolean;
  atendimento?: boolean;
}

function registro(c: Cenario = {}) {
  const completo = c.profissional === undefined;
  return {
    id: ONB,
    profissionalId: PROF,
    contratoSalaId: CONTRATO,
    iniciadoEm: new Date(`${c.iniciadoEm ?? '2026-11-20'}T00:00:00.000Z`),
    recepcaoOrientadaEm: c.recepcao ? new Date('2026-11-23T12:00:00.000Z') : null,
    recepcaoOrientadaPorId: c.recepcao ? USUARIO : null,
    profissional: {
      id: PROF,
      ativo: false,
      ...CADASTRO_COMPLETO,
      _count: { rqes: 0, contatosAdministrativos: completo ? 1 : 0, horarios: 1 },
      documentos: completo ? DOCUMENTOS_VALIDOS : [],
      contratosSala: [{ id: CONTRATO }],
      ...c.profissional,
    },
    contrato: {
      sala: { nome: 'Sala 1' },
      dias: [{ diaSemana: 2, inicio: '08:00', fim: '12:00' }],
    },
  };
}

function montar(
  opcoes: { escopo?: readonly string[]; cenario?: Cenario; semRegistro?: boolean } = {},
) {
  const c = opcoes.cenario ?? {};
  const prisma = {
    profissional: {
      count: jest.fn(async ({ where }: { where: { id: string } }) => (where.id === PROF ? 1 : 0)),
    },
    profissionalOnboarding: {
      findUnique: jest.fn(async () => (opcoes.semRegistro ? null : registro(c))),
      findMany: jest.fn(async (_args: unknown) => [registro(c)]),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: ONB,
        ...data,
      })),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        ...registro(c),
        ...data,
      })),
    },
  };
  const usuarios = {
    profissionaisComAcesso: jest.fn(async () => new Set(c.acesso ? [PROF] : [])),
    nomesPorIds: jest.fn(async () => new Map([[USUARIO, 'Usuária Fictícia']])),
  };
  const atendimentos = {
    profissionaisComAtendimentoFinalizado: jest.fn(
      async () => new Set(c.atendimento ? [PROF] : []),
    ),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const contexto = { getUserId: jest.fn(() => USUARIO) };
  const service = new ProfissionaisOnboardingService(
    { tx: prisma } as unknown as TransactionHost<PrismaAdapter>,
    usuarios as unknown as UsuariosLookupService,
    atendimentos as unknown as PacientesVinculadosService,
    audit as unknown as AuditService,
    escopoFalso(opcoes.escopo),
    contexto as unknown as RequestContextService,
  );
  return { service, prisma, usuarios, atendimentos, audit };
}

const etapa = (o: Onboarding, nome: string): OnboardingEtapaItem =>
  o.etapas.find((e) => e.etapa === nome) as OnboardingEtapaItem;

describe('ProfissionaisOnboardingService', () => {
  describe('obter', () => {
    it('devolve null quando o profissional não tem onboarding', async () => {
      const { service } = montar({ semRegistro: true });

      await expect(service.obter(PROF, AGORA)).resolves.toBeNull();
    });

    it('404 para profissional inexistente e para id inválido', async () => {
      const { service } = montar();

      await expect(service.obter(OUTRO, AGORA)).rejects.toMatchObject({ status: 404 });
      await expect(service.obter('xx', AGORA)).rejects.toMatchObject({ status: 404 });
    });

    it('403 para profissional fora do escopo do usuário', async () => {
      const { service } = montar({ escopo: [OUTRO] });

      await expect(service.obter(PROF, AGORA)).rejects.toMatchObject({ status: 403 });
    });

    it('etapas automáticas mudam sozinhas conforme o dado de origem', async () => {
      const { service } = montar({ cenario: { acesso: true, atendimento: true } });

      const o = (await service.obter(PROF, AGORA))!;

      expect(etapa(o, 'CONTRATO_ASSINADO').concluida).toBe(true);
      expect(etapa(o, 'CADASTRO_COMPLETO').concluida).toBe(true);
      expect(etapa(o, 'DOCUMENTACAO_VALIDADA').concluida).toBe(true);
      expect(etapa(o, 'SALA_DEFINIDA').concluida).toBe(true);
      expect(etapa(o, 'AGENDA_CONFIGURADA').concluida).toBe(true);
      expect(etapa(o, 'ACESSO_CRIADO').concluida).toBe(true);
      expect(etapa(o, 'PRIMEIRO_ATENDIMENTO').concluida).toBe(true);
      expect(etapa(o, 'RECEPCAO_ORIENTADA').concluida).toBe(false);
      expect(etapa(o, 'PROFISSIONAL_ATIVO').concluida).toBe(false);
      expect(o.concluidas).toBe(7);
      expect(o.total).toBe(9);
      expect(o.podeAtivar).toBe(false);
    });

    it('só a recepção orientada é manual, com quem e quando', async () => {
      const { service } = montar({ cenario: { recepcao: true, acesso: true, atendimento: true } });

      const o = (await service.obter(PROF, AGORA))!;

      const recepcao = etapa(o, 'RECEPCAO_ORIENTADA');
      expect(recepcao.automatica).toBe(false);
      expect(recepcao.concluida).toBe(true);
      expect(recepcao.concluidaPorNome).toBe('Usuária Fictícia');
      expect(o.etapas.filter((e) => !e.automatica)).toHaveLength(1);
      expect(o.podeAtivar).toBe(true);
    });

    it('cadastro incompleto lista os campos que faltam (essenciais e fiscais)', async () => {
      const { service } = montar({
        cenario: {
          profissional: {
            ...CADASTRO_COMPLETO,
            cnpj: null,
            rg: null,
            telefone: null,
            _count: { rqes: 0, contatosAdministrativos: 0, horarios: 1 },
            documentos: DOCUMENTOS_VALIDOS,
          },
        },
      });

      const cadastro = etapa((await service.obter(PROF, AGORA))!, 'CADASTRO_COMPLETO');

      expect(cadastro.concluida).toBe(false);
      expect(cadastro.pendencias).toEqual(['rg', 'contato', 'cnpj', 'contatoAdministrativo']);
    });

    it('documentação exige contrato, pessoal, conselho e licença validados e dentro da validade', async () => {
      const { service } = montar({
        cenario: {
          profissional: {
            _count: { rqes: 0, contatosAdministrativos: 1, horarios: 1 },
            documentos: [
              { tipo: 'CONTRATO', situacao: 'VALIDADO', validade: null },
              { tipo: 'DOCUMENTO_PESSOAL', situacao: 'ENVIADO', validade: null },
              {
                tipo: 'REGISTRO_CONSELHO',
                situacao: 'VALIDADO',
                validade: new Date('2026-11-23T00:00:00.000Z'),
              },
            ],
          },
        },
      });

      const documentos = etapa((await service.obter(PROF, AGORA))!, 'DOCUMENTACAO_VALIDADA');

      expect(documentos.concluida).toBe(false);
      expect(documentos.pendencias).toEqual(['DOCUMENTO_PESSOAL', 'REGISTRO_CONSELHO', 'LICENCA']);
    });

    it('com RQE no cadastro, o documento de RQE também é exigido', async () => {
      const { service } = montar({
        cenario: {
          profissional: {
            _count: { rqes: 1, contatosAdministrativos: 1, horarios: 1 },
            documentos: DOCUMENTOS_VALIDOS,
          },
        },
      });

      const documentos = etapa((await service.obter(PROF, AGORA))!, 'DOCUMENTACAO_VALIDADA');

      expect(documentos.pendencias).toEqual(['RQE']);
    });

    it('etapa pendente fica atrasada depois de 7 dias da assinatura, não antes', async () => {
      const noPrazo = montar({ cenario: { iniciadoEm: '2026-11-17' } });
      const vencido = montar({ cenario: { iniciadoEm: '2026-11-16' } });

      const a = (await noPrazo.service.obter(PROF, AGORA))!;
      const b = (await vencido.service.obter(PROF, AGORA))!;

      expect(a.diasEmAndamento).toBe(7);
      expect(a.atrasada).toBe(false);
      expect(b.diasEmAndamento).toBe(8);
      expect(b.atrasada).toBe(true);
      expect(etapa(b, 'RECEPCAO_ORIENTADA').atrasada).toBe(true);
      expect(etapa(b, 'CONTRATO_ASSINADO').atrasada).toBe(false);
    });

    it('sugere o horário do contrato e a criação do usuário quando faltam', async () => {
      const { service } = montar({
        cenario: { profissional: { _count: { rqes: 0, contatosAdministrativos: 1, horarios: 0 } } },
      });

      const o = (await service.obter(PROF, AGORA))!;

      expect(o.sugestoes).toEqual({
        horarios: [{ diaSemana: 2, inicio: '08:00', fim: '12:00' }],
        criarUsuario: true,
      });
    });

    it('não sugere o que já existe', async () => {
      const { service } = montar({ cenario: { acesso: true } });

      const o = (await service.obter(PROF, AGORA))!;

      expect(o.sugestoes).toEqual({ horarios: [], criarUsuario: false });
    });
  });

  describe('listar', () => {
    const query = {
      page: 1,
      pageSize: 10,
      sort: { field: 'iniciadoEm', direction: 'asc' },
      search: undefined,
      situacao: undefined,
    } as const;

    it('lista os onboardings em andamento e aplica o escopo no filtro', async () => {
      const { service, prisma } = montar({ escopo: [PROF] });

      const pagina = await service.listar(query, AGORA);

      expect(pagina.data).toHaveLength(1);
      expect(pagina.meta).toEqual({ page: 1, pageSize: 10, total: 1, totalPages: 1 });
      expect(prisma.profissionalOnboarding.findMany.mock.calls[0]?.[0]).toMatchObject({
        where: { profissionalId: { in: [PROF] } },
      });
    });

    it('não lista o que já está completo', async () => {
      const { service } = montar({
        cenario: {
          recepcao: true,
          acesso: true,
          atendimento: true,
          profissional: {
            ativo: true,
            ...CADASTRO_COMPLETO,
            _count: { rqes: 0, contatosAdministrativos: 1, horarios: 1 },
            documentos: DOCUMENTOS_VALIDOS,
            contratosSala: [{ id: CONTRATO }],
          },
        },
      });

      const pagina = await service.listar(query, AGORA);

      expect(pagina.data).toHaveLength(0);
      expect(pagina.meta.total).toBe(0);
    });

    it('filtra só os atrasados', async () => {
      const emDia = montar({ cenario: { iniciadoEm: '2026-11-24' } });
      const atrasado = montar({ cenario: { iniciadoEm: '2026-11-01' } });
      const filtro = { ...query, situacao: 'ATRASADO' } as const;

      expect((await emDia.service.listar(filtro, AGORA)).data).toHaveLength(0);
      expect((await atrasado.service.listar(filtro, AGORA)).data).toHaveLength(1);
    });

    it('usuário restrito sem vínculo não vê nada', async () => {
      const { service, prisma } = montar({ escopo: [] });

      await service.listar(query, AGORA);

      expect(prisma.profissionalOnboarding.findMany.mock.calls[0]?.[0]).toMatchObject({
        where: { profissionalId: { in: [] } },
      });
    });
  });

  describe('iniciar', () => {
    it('cria o checklist e audita a criação', async () => {
      const { service, prisma, audit } = montar({ semRegistro: true });
      const data = new Date('2026-11-24T00:00:00.000Z');

      await service.iniciar(PROF, CONTRATO, data);

      expect(prisma.profissionalOnboarding.create).toHaveBeenCalledWith({
        data: { profissionalId: PROF, contratoSalaId: CONTRATO, iniciadoEm: data },
      });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CREATE',
          entity: 'ProfissionalOnboarding',
          entityId: ONB,
          before: null,
        }),
      );
    });

    it('um segundo contrato não cria outro checklist', async () => {
      const { service, prisma, audit } = montar();

      await service.iniciar(PROF, CONTRATO, new Date());

      expect(prisma.profissionalOnboarding.create).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });
  });

  describe('definirRecepcao', () => {
    it('marca com o usuário e a data', async () => {
      const { service, prisma } = montar();

      await service.definirRecepcao(ONB, true, AGORA);

      expect(prisma.profissionalOnboarding.update.mock.calls[0]?.[0]).toMatchObject({
        where: { id: ONB },
        data: { recepcaoOrientadaEm: AGORA, recepcaoOrientadaPorId: USUARIO },
      });
    });

    it('desmarca limpando quem e quando', async () => {
      const { service, prisma } = montar();

      await service.definirRecepcao(ONB, false, AGORA);

      expect(prisma.profissionalOnboarding.update.mock.calls[0]?.[0]).toMatchObject({
        data: { recepcaoOrientadaEm: null, recepcaoOrientadaPorId: null },
      });
    });

    it('404 para onboarding inexistente', async () => {
      const { service } = montar({ semRegistro: true });

      await expect(service.definirRecepcao(ONB, true, AGORA)).rejects.toBeInstanceOf(
        BusinessException,
      );
    });

    it('403 fora do escopo', async () => {
      const { service } = montar({ escopo: [OUTRO] });

      await expect(service.definirRecepcao(ONB, true, AGORA)).rejects.toMatchObject({
        status: 403,
      });
    });
  });

  describe('garantirPodeAtivar', () => {
    it('sem onboarding nada muda (cadastros anteriores à #142)', async () => {
      const { service } = montar({ semRegistro: true });

      await expect(service.garantirPodeAtivar(PROF, AGORA)).resolves.toBeUndefined();
    });

    it('bloqueia com 409 e lista as etapas pendentes', async () => {
      const { service } = montar();

      await expect(service.garantirPodeAtivar(PROF, AGORA)).rejects.toMatchObject({
        status: 409,
        code: 'ONBOARDING_INCOMPLETO',
      });
    });

    it('libera com as etapas obrigatórias concluídas', async () => {
      const { service } = montar({ cenario: { recepcao: true, acesso: true, atendimento: true } });

      await expect(service.garantirPodeAtivar(PROF, AGORA)).resolves.toBeUndefined();
    });
  });
});
