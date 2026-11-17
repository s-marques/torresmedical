import type { TransactionHost } from '@nestjs-cls/transactional';
import type { RequestContextService } from '../../../common/context/request-context.service';
import { BusinessException } from '../../../common/errors/api.exception';
import type { EventPublisher } from '../../../common/messaging/event-publisher';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import type { CanaisWhatsappService } from '../../configuracoes-gestao/canais-whatsapp/canais-whatsapp.service';
import type { UsuariosLookupService } from '../../configuracoes-gestao/usuarios/usuarios.service';
import type { PacientesService } from '../pacientes/pacientes.service';
import {
  AtendimentoWhatsappService,
  COMANDO_ENVIAR_MENSAGEM,
} from './atendimento-whatsapp.service';
import type { TagsAtendimentoService } from './tags-atendimento.service';

const ID = 'c0000000-0000-4000-8000-000000000001';
const USUARIO_ID = 'a0000000-0000-4000-8000-000000000001';
const OUTRO_USUARIO_ID = 'a0000000-0000-4000-8000-000000000002';
const TAG_ID = 'f0000000-0000-4000-8000-000000000001';
const PACIENTE_ID = 'b0000000-0000-4000-8000-000000000001';
const DATA = new Date('2026-10-14T12:00:00.000Z');
const FILTRO_ACESSO = { OR: [{ usuarios: { none: {} } }] };

function conversa(parcial: Record<string, unknown> = {}) {
  return {
    id: ID,
    status: 'EM_ATENDIMENTO',
    naoLidas: 0,
    ultimaMensagemEm: null,
    atendenteId: USUARIO_ID,
    anuncioOrigem: null,
    anuncioTitulo: null,
    anuncioUrl: null,
    createdAt: DATA,
    contato: { id: 'k1', nome: 'Contato', telefone: '5565900000001', pacienteId: null },
    canal: { id: 'n1', nome: 'Recepção' },
    tags: [],
    ...parcial,
  };
}

function setup(conversaAtual: ReturnType<typeof conversa> | null = conversa()) {
  const conversaWhatsapp = {
    findFirst: jest.fn().mockResolvedValue(conversaAtual),
    update: jest.fn().mockResolvedValue(undefined),
  };
  const mensagemWhatsapp = {
    create: jest
      .fn()
      .mockImplementation(({ data }) =>
        Promise.resolve({ id: 'm1', duracaoSegundos: null, respondeA: null, ...data }),
      ),
  };
  const conversaTag = {
    createMany: jest.fn().mockResolvedValue({ count: 1 }),
    deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
  };
  const txHost = {
    tx: { conversaWhatsapp, mensagemWhatsapp, conversaTag },
  } as unknown as TransactionHost<PrismaAdapter>;
  const pacientes = { findById: jest.fn() };
  const usuarios = {
    nomesPorIds: jest.fn().mockResolvedValue(new Map([[USUARIO_ID, 'Atendente Teste']])),
    selecionarPorId: jest.fn().mockResolvedValue({ id: OUTRO_USUARIO_ID, nome: 'Outro' }),
  };
  const tags = { findById: jest.fn().mockResolvedValue({ id: TAG_ID }) };
  const events = { publish: jest.fn().mockResolvedValue(undefined) };
  const contexto = { getUserId: jest.fn().mockReturnValue(USUARIO_ID) };
  const canais = { filtroAcesso: jest.fn().mockReturnValue(FILTRO_ACESSO) };
  const service = new AtendimentoWhatsappService(
    txHost,
    pacientes as unknown as PacientesService,
    usuarios as unknown as UsuariosLookupService,
    tags as unknown as TagsAtendimentoService,
    events as unknown as EventPublisher,
    contexto as unknown as RequestContextService,
    canais as unknown as CanaisWhatsappService,
  );
  return {
    service,
    conversaWhatsapp,
    mensagemWhatsapp,
    conversaTag,
    pacientes,
    usuarios,
    tags,
    events,
  };
}

async function erroDe(promessa: Promise<unknown>): Promise<BusinessException> {
  const erro = await promessa.catch((e: unknown) => e);
  expect(erro).toBeInstanceOf(BusinessException);
  return erro as BusinessException;
}

describe('AtendimentoWhatsappService', () => {
  describe('detalhe', () => {
    it('traz e-mail e observações do paciente vinculado, o atendente e as tags não excluídas', async () => {
      const { service, pacientes } = setup(
        conversa({
          contato: {
            id: 'k1',
            nome: 'Contato',
            telefone: '5565900000001',
            pacienteId: PACIENTE_ID,
          },
          anuncioOrigem: 'Facebook',
          anuncioTitulo: 'Título',
          anuncioUrl: 'https://example.com',
          tags: [
            { tag: { id: 't2', nome: 'Beta', cor: '#000000', deletedAt: null } },
            { tag: { id: 't1', nome: 'Alfa', cor: '#111111', deletedAt: null } },
            { tag: { id: 't3', nome: 'Antiga', cor: '#222222', deletedAt: DATA } },
          ],
        }),
      );
      pacientes.findById.mockResolvedValue({
        id: PACIENTE_ID,
        email: 'p@example.com',
        observacoes: 'Obs',
      });

      const detalhe = await service.detalhe(ID);

      expect(detalhe.contato).toMatchObject({
        email: 'p@example.com',
        observacoes: 'Obs',
        pacienteId: PACIENTE_ID,
      });
      expect(detalhe.atendente).toEqual({ id: USUARIO_ID, nome: 'Atendente Teste' });
      expect(detalhe.anuncio).toEqual({
        origem: 'Facebook',
        titulo: 'Título',
        url: 'https://example.com',
      });
      expect(detalhe.tags.map((t) => t.nome)).toEqual(['Alfa', 'Beta']);
    });

    it('paciente excluído equivale a "sem paciente"; outros erros continuam', async () => {
      const { service, pacientes } = setup(
        conversa({
          contato: { id: 'k1', nome: null, telefone: '5565900000001', pacienteId: PACIENTE_ID },
        }),
      );
      pacientes.findById.mockRejectedValueOnce(
        new BusinessException('NOT_FOUND', 'Paciente não encontrado', { status: 404 }),
      );

      expect((await service.detalhe(ID)).contato).toMatchObject({
        email: null,
        observacoes: null,
        pacienteId: null,
      });

      pacientes.findById.mockRejectedValueOnce(new Error('banco fora do ar'));
      await expect(service.detalhe(ID)).rejects.toThrow('banco fora do ar');
    });

    it('404 para conversa inexistente', async () => {
      const { service } = setup(null);

      expect((await erroDe(service.detalhe(ID))).getStatus()).toBe(404);
    });
  });

  describe('enviarMensagem', () => {
    it('grava como Pendente do usuário, atualiza a conversa e publica só o id', async () => {
      const { service, mensagemWhatsapp, conversaWhatsapp, events } = setup();

      const mensagem = await service.enviarMensagem(ID, { conteudo: 'Olá' });

      expect(mensagemWhatsapp.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            conversaId: ID,
            direcao: 'ENVIADA',
            autor: 'ATENDENTE',
            autorUsuarioId: USUARIO_ID,
            status: 'PENDENTE',
            tipo: 'TEXTO',
            conteudo: 'Olá',
          }),
        }),
      );
      expect(conversaWhatsapp.update).toHaveBeenCalledWith({
        where: { id: ID },
        data: { ultimaMensagemEm: expect.any(Date) },
      });
      expect(events.publish).toHaveBeenCalledWith(COMANDO_ENVIAR_MENSAGEM, { mensagemId: 'm1' });
      expect(mensagem).toMatchObject({ autorNome: 'Atendente Teste', status: 'PENDENTE' });
    });

    it('409 fora de Em Atendimento, sem gravar nem publicar', async () => {
      const { service, mensagemWhatsapp, events } = setup(conversa({ status: 'AGUARDANDO' }));

      const erro = await erroDe(service.enviarMensagem(ID, { conteudo: 'Olá' }));

      expect(erro.getStatus()).toBe(409);
      expect(mensagemWhatsapp.create).not.toHaveBeenCalled();
      expect(events.publish).not.toHaveBeenCalled();
    });
  });

  describe('assumir, encerrar e transferir', () => {
    it('assumir: só Aguardando, com o usuário do contexto como atendente', async () => {
      const { service, conversaWhatsapp } = setup(
        conversa({ status: 'AGUARDANDO', atendenteId: null }),
      );

      await service.assumir(ID);

      expect(conversaWhatsapp.update).toHaveBeenCalledWith({
        where: { id: ID },
        data: { status: 'EM_ATENDIMENTO', atendenteId: USUARIO_ID },
      });
      const outra = setup();
      expect((await erroDe(outra.service.assumir(ID))).getStatus()).toBe(409);
    });

    it('encerrar: só Em Atendimento', async () => {
      const { service, conversaWhatsapp } = setup();

      await service.encerrar(ID);

      expect(conversaWhatsapp.update).toHaveBeenCalledWith({
        where: { id: ID },
        data: { status: 'FINALIZADA' },
      });
      const outra = setup(conversa({ status: 'FINALIZADA' }));
      expect((await erroDe(outra.service.encerrar(ID))).getStatus()).toBe(409);
    });

    it('transferir: só Em Atendimento, para outro usuário ativo', async () => {
      const { service, conversaWhatsapp, usuarios } = setup();

      await service.transferir(ID, { usuarioId: OUTRO_USUARIO_ID });

      expect(usuarios.selecionarPorId).toHaveBeenCalledWith(OUTRO_USUARIO_ID);
      expect(conversaWhatsapp.update).toHaveBeenCalledWith({
        where: { id: ID },
        data: { atendenteId: OUTRO_USUARIO_ID },
      });
      const mesmo = setup();
      mesmo.usuarios.selecionarPorId.mockResolvedValue({ id: USUARIO_ID, nome: 'Atendente Teste' });
      expect(
        (await erroDe(mesmo.service.transferir(ID, { usuarioId: USUARIO_ID }))).getStatus(),
      ).toBe(409);
      const aguardando = setup(conversa({ status: 'AGUARDANDO' }));
      expect(
        (
          await erroDe(aguardando.service.transferir(ID, { usuarioId: OUTRO_USUARIO_ID }))
        ).getStatus(),
      ).toBe(409);
    });
  });

  describe('tags', () => {
    it('aplicar ignora duplicata e valida a tag; remover apaga só o par', async () => {
      const { service, conversaTag, tags } = setup();

      await service.aplicarTag(ID, TAG_ID);
      await service.removerTag(ID, TAG_ID);

      expect(tags.findById).toHaveBeenCalledWith(TAG_ID);
      expect(conversaTag.createMany).toHaveBeenCalledWith({
        data: [{ conversaId: ID, tagId: TAG_ID }],
        skipDuplicates: true,
      });
      expect(conversaTag.deleteMany).toHaveBeenCalledWith({
        where: { conversaId: ID, tagId: TAG_ID },
      });
    });
  });
});
