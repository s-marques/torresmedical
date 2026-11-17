import type { TransactionHost } from '@nestjs-cls/transactional';
import type { AuditService } from '../../../common/audit/audit.service';
import { BusinessException } from '../../../common/errors/api.exception';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import type { CanaisWhatsappService } from '../../configuracoes-gestao/canais-whatsapp/canais-whatsapp.service';
import type { PacientesService } from '../pacientes/pacientes.service';
import { ConversasWhatsappService } from './conversas-whatsapp.service';

const PACIENTE_ID = '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const CANAL_ID = '7a1d3c52-8d0f-4b8e-9f4c-2b2f3c4d5e6f';
const CONTATO_ID = '3c2b1a00-1111-4222-8333-444455556666';
const DATA = new Date('2026-10-14T12:00:00.000Z');
const FILTRO_ACESSO = { OR: [{ usuarios: { none: {} } }] };

const CONTATO = {
  id: CONTATO_ID,
  nome: 'Contato',
  telefone: '5565999990000',
  pacienteId: null,
  createdAt: DATA,
  updatedAt: DATA,
};

const CONVERSA = {
  id: 'c0000000-0000-4000-8000-000000000001',
  status: 'AGUARDANDO',
  naoLidas: 2,
  ultimaMensagemEm: DATA,
  createdAt: DATA,
  contato: { id: CONTATO_ID, nome: 'Contato', telefone: '5565999990000' },
  canal: { id: CANAL_ID, nome: 'Recepção' },
  mensagens: [{ conteudo: 'x'.repeat(200) }],
};

function setup(paciente: { celular?: string | null; telefone?: string | null } = {}) {
  const conversaWhatsapp = {
    findMany: jest.fn().mockResolvedValue([CONVERSA]),
    count: jest.fn().mockResolvedValue(1),
    groupBy: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({ ...CONVERSA, status: 'EM_ATENDIMENTO', mensagens: [] }),
  };
  const contatoWhatsapp = {
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue(CONTATO),
    update: jest.fn().mockResolvedValue({ ...CONTATO, pacienteId: PACIENTE_ID }),
  };
  const txHost = {
    tx: { conversaWhatsapp, contatoWhatsapp },
  } as unknown as TransactionHost<PrismaAdapter>;
  const pacientes = {
    findById: jest.fn().mockResolvedValue({
      id: PACIENTE_ID,
      nome: 'Paciente',
      celular: null,
      telefone: null,
      ...paciente,
    }),
  };
  const canais = {
    findById: jest.fn().mockResolvedValue({ id: CANAL_ID, nome: 'Recepção' }),
    filtroAcesso: jest.fn().mockReturnValue(FILTRO_ACESSO),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new ConversasWhatsappService(
    txHost,
    pacientes as unknown as PacientesService,
    canais as unknown as CanaisWhatsappService,
    audit as unknown as AuditService,
  );
  return { service, conversaWhatsapp, contatoWhatsapp, audit };
}

const QUERY = {
  page: 1,
  pageSize: 10,
  sort: { field: 'ultimaMensagemEm', direction: 'desc' },
  search: undefined,
} as const;

describe('ConversasWhatsappService', () => {
  describe('list', () => {
    it('ordena pela última mensagem (sem mensagem no topo) e corta a prévia', async () => {
      const { service, conversaWhatsapp } = setup();

      const page = await service.list({ ...QUERY, status: 'em-atendimento', canalId: CANAL_ID });

      expect(conversaWhatsapp.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            canalId: CANAL_ID,
            canal: FILTRO_ACESSO,
            status: 'EM_ATENDIMENTO',
            OR: undefined,
          },
          orderBy: [
            { ultimaMensagemEm: { sort: 'desc', nulls: 'first' } },
            { createdAt: 'desc' },
            { id: 'asc' },
          ],
          skip: 0,
          take: 10,
        }),
      );
      expect(page.data[0]?.ultimaMensagem).toHaveLength(120);
      expect(page.data[0]).not.toHaveProperty('mensagens');
      expect(page.meta.total).toBe(1);
    });

    it('em ordem crescente, as sem mensagem vão para o fim', async () => {
      const { service, conversaWhatsapp } = setup();

      await service.list({ ...QUERY, sort: { field: 'ultimaMensagemEm', direction: 'asc' } });

      expect(conversaWhatsapp.findMany.mock.calls[0][0].orderBy[0]).toEqual({
        ultimaMensagemEm: { sort: 'asc', nulls: 'last' },
      });
    });

    it('busca no telefone só quando há dígitos suficientes', async () => {
      const { service, conversaWhatsapp } = setup();

      await service.list({ ...QUERY, search: 'ana' });
      await service.list({ ...QUERY, search: '(65) 9' });

      const [comNome, comTelefone] = conversaWhatsapp.findMany.mock.calls.map((c) => c[0].where.OR);
      expect(comNome).toHaveLength(3);
      expect(comTelefone).toContainEqual({ contato: { telefone: { contains: '659' } } });
    });
  });

  it('contadores: zero para os status sem conversa', async () => {
    const { service, conversaWhatsapp } = setup();
    conversaWhatsapp.groupBy.mockResolvedValue([
      { status: 'AGUARDANDO', _count: { _all: 4 } },
      { status: 'FINALIZADA', _count: { _all: 9 } },
    ]);

    expect(await service.contadores({ canalId: CANAL_ID })).toEqual({
      BOT: 0,
      AGUARDANDO: 4,
      EM_ATENDIMENTO: 0,
      FINALIZADA: 9,
    });
    expect(conversaWhatsapp.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { canalId: CANAL_ID, canal: FILTRO_ACESSO } }),
    );
  });

  describe('criar (Nova conversa)', () => {
    const INPUT = { pacienteId: PACIENTE_ID, canalId: CANAL_ID };

    it('prefere o celular, normaliza com DDI e cria o contato auditado', async () => {
      const { service, contatoWhatsapp, conversaWhatsapp, audit } = setup({
        celular: '(65) 99999-0000',
        telefone: '6533330000',
      });

      const conversa = await service.criar(INPUT);

      expect(contatoWhatsapp.findUnique).toHaveBeenCalledWith({
        where: { telefone: '5565999990000' },
      });
      expect(contatoWhatsapp.create).toHaveBeenCalledWith({
        data: { telefone: '5565999990000', nome: 'Paciente', pacienteId: PACIENTE_ID },
      });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CREATE', entity: 'ContatoWhatsapp', before: null }),
      );
      expect(conversaWhatsapp.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { contatoId: CONTATO_ID, canalId: CANAL_ID, status: 'EM_ATENDIMENTO' },
        }),
      );
      expect(conversa).toMatchObject({ status: 'EM_ATENDIMENTO', ultimaMensagem: null });
    });

    it('reaproveita o contato já vinculado, sem auditar o contato', async () => {
      const { service, contatoWhatsapp, audit } = setup({ celular: '65999990000' });
      contatoWhatsapp.findUnique.mockResolvedValue({ ...CONTATO, pacienteId: 'outro' });

      await service.criar(INPUT);

      expect(contatoWhatsapp.create).not.toHaveBeenCalled();
      expect(contatoWhatsapp.update).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('vincula ao paciente o contato sem paciente, mantendo o nome dele', async () => {
      const { service, contatoWhatsapp, audit } = setup({ telefone: '6533330000' });
      contatoWhatsapp.findUnique.mockResolvedValue(CONTATO);

      await service.criar(INPUT);

      expect(contatoWhatsapp.update).toHaveBeenCalledWith({
        where: { id: CONTATO_ID },
        data: { pacienteId: PACIENTE_ID, nome: 'Contato' },
      });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'UPDATE', entity: 'ContatoWhatsapp', before: CONTATO }),
      );
    });

    it('PACIENTE_SEM_TELEFONE (422) sem celular nem telefone', async () => {
      const { service, contatoWhatsapp } = setup();

      const erro = await service.criar(INPUT).catch((e: unknown) => e);

      expect(erro).toBeInstanceOf(BusinessException);
      expect((erro as BusinessException).getStatus()).toBe(422);
      expect(contatoWhatsapp.findUnique).not.toHaveBeenCalled();
    });

    it('CONVERSA_EM_ANDAMENTO (409) com outra não finalizada no canal', async () => {
      const { service, conversaWhatsapp } = setup({ celular: '65999990000' });
      conversaWhatsapp.findFirst.mockResolvedValue({ id: CONVERSA.id });

      const erro = await service.criar(INPUT).catch((e: unknown) => e);

      expect((erro as BusinessException).getStatus()).toBe(409);
      expect(conversaWhatsapp.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { contatoId: CONTATO_ID, canalId: CANAL_ID, status: { not: 'FINALIZADA' } },
        }),
      );
      expect(conversaWhatsapp.create).not.toHaveBeenCalled();
    });
  });
});
