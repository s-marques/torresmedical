import type { INestApplication } from '@nestjs/common';
import {
  contadoresConversasWhatsappSchema,
  conversaWhatsappDetalheSchema,
  conversaWhatsappPageSchema,
  conversaWhatsappSchema,
  mensagemWhatsappPageSchema,
  mensagemWhatsappSchema,
  tagAtendimentoPageSchema,
  tagAtendimentoSchema,
} from '@torres/shared';
import request from 'supertest';
import type { ConversaWhatsappStatus } from '../../src/generated/prisma/client';
import { EventPublisher } from '../../src/common/messaging/event-publisher';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit, expectNoAudit } from '../utils/expect-audit';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';

const CONVERSAS = '/api/comercial-atendimento/conversas-whatsapp';
const TAGS = '/api/comercial-atendimento/tags-atendimento';
const PERMISSOES = [
  'comercial-atendimento.whatsapp.ver',
  'comercial-atendimento.whatsapp.criar',
  'comercial-atendimento.whatsapp.editar',
  'comercial-atendimento.whatsapp.excluir',
] as const;
const INEXISTENTE = '00000000-0000-4000-8000-000000000000';

describe('WhatsApp (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let usuario: UsuarioTeste;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    usuario = await criarUsuarioTeste(app, { permissoes: PERMISSOES });
  });

  afterAll(async () => {
    await app.close();
  });

  function http() {
    return comUsuario(app, usuario);
  }

  function criarCanal(nome: string, extra: { deletedAt?: Date } = {}) {
    return prisma.canalWhatsapp.create({
      data: { nome, numero: '5565900000000', status: 'CONECTADO', ...extra },
    });
  }

  async function criarConversa(
    canalId: string,
    contato: { nome: string | null; telefone: string },
    status: ConversaWhatsappStatus,
    mensagens: { conteudo: string; enviadaEm: Date }[] = [],
  ) {
    const { id: contatoId } = await prisma.contatoWhatsapp.create({ data: contato });
    const ultima = mensagens.at(-1)?.enviadaEm ?? null;
    return prisma.conversaWhatsapp.create({
      data: {
        canalId,
        contatoId,
        status,
        naoLidas: status === 'AGUARDANDO' ? 3 : 0,
        ultimaMensagemEm: ultima,
        mensagens: { create: mensagens.map((m) => ({ ...m, direcao: 'RECEBIDA' as const })) },
      },
    });
  }

  describe('GET /conversas-whatsapp e /contadores', () => {
    let recepcao: { id: string };
    let gerencia: { id: string };

    beforeEach(async () => {
      recepcao = await criarCanal('Recepção');
      gerencia = await criarCanal('Gerência');
      await criarConversa(
        recepcao.id,
        { nome: 'Ana Souza', telefone: '5565911110000' },
        'AGUARDANDO',
        [
          { conteudo: 'Bom dia', enviadaEm: new Date('2026-10-14T10:00:00Z') },
          { conteudo: 'Quero agendar uma avaliação', enviadaEm: new Date('2026-10-14T10:05:00Z') },
        ],
      );
      await criarConversa(
        gerencia.id,
        { nome: 'Bruno Lima', telefone: '5565922220000' },
        'AGUARDANDO',
        [{ conteudo: 'Ok', enviadaEm: new Date('2026-10-15T09:00:00Z') }],
      );
      await criarConversa(recepcao.id, { nome: null, telefone: '5565933330000' }, 'FINALIZADA', [
        { conteudo: 'Obrigado', enviadaEm: new Date('2026-10-13T08:00:00Z') },
      ]);
      await criarConversa(
        gerencia.id,
        { nome: 'Carla Dias', telefone: '5565944440000' },
        'EM_ATENDIMENTO',
      );
    });

    it('lista as mais recentes primeiro (sem mensagem no topo), com contato, canal e prévia', async () => {
      const res = await http().get(CONVERSAS).expect(200);

      const page = conversaWhatsappPageSchema.parse(res.body);
      expect(page.data.map((c) => [c.contato.nome, c.status, c.ultimaMensagem])).toEqual([
        ['Carla Dias', 'EM_ATENDIMENTO', null],
        ['Bruno Lima', 'AGUARDANDO', 'Ok'],
        ['Ana Souza', 'AGUARDANDO', 'Quero agendar uma avaliação'],
        [null, 'FINALIZADA', 'Obrigado'],
      ]);
      expect(page.data[1]).toMatchObject({
        naoLidas: 3,
        ultimaMensagemEm: '2026-10-15T09:00:00.000Z',
        canal: { id: gerencia.id, nome: 'Gerência' },
        contato: { telefone: '5565922220000' },
      });
      expect(page.meta).toEqual({ page: 1, pageSize: 10, total: 4, totalPages: 1 });
    });

    it('filtra por status e canal e pagina', async () => {
      const aguardando = await http()
        .get(CONVERSAS)
        .query({ status: 'aguardando', canalId: recepcao.id })
        .expect(200);
      expect(
        aguardando.body.data.map((c: { contato: { nome: string } }) => c.contato.nome),
      ).toEqual(['Ana Souza']);

      const pagina = await http().get(CONVERSAS).query({ pageSize: 1, page: 2 }).expect(200);
      expect(pagina.body.data[0].contato.nome).toBe('Bruno Lima');
      expect(pagina.body.meta).toEqual({ page: 2, pageSize: 1, total: 4, totalPages: 4 });
    });

    it('busca por nome, telefone, tag e palavra nas mensagens', async () => {
      const tag = await prisma.tagAtendimento.create({ data: { nome: 'Retorno', cor: '#3b82f6' } });
      const carla = await prisma.conversaWhatsapp.findFirstOrThrow({
        where: { contato: { nome: 'Carla Dias' } },
      });
      await prisma.conversaTag.create({ data: { conversaId: carla.id, tagId: tag.id } });

      async function nomes(search: string) {
        const res = await http().get(CONVERSAS).query({ search }).expect(200);
        return (res.body.data as { contato: { nome: string | null } }[]).map((c) => c.contato.nome);
      }

      expect(await nomes('bruno')).toEqual(['Bruno Lima']);
      expect(await nomes('3333')).toEqual([null]);
      expect(await nomes('retorno')).toEqual(['Carla Dias']);
      expect(await nomes('AVALIAÇÃO')).toEqual(['Ana Souza']);

      await prisma.tagAtendimento.update({
        where: { id: tag.id },
        data: { deletedAt: new Date() },
      });
      expect(await nomes('retorno')).toEqual([]);
    });

    it('400 "Digite pelo menos 2 caracteres" e para status ou canal inválidos', async () => {
      const curta = await http().get(CONVERSAS).query({ search: 'a' }).expect(400);
      expect(curta.body.details).toEqual([
        { field: 'search', message: 'Digite pelo menos 2 caracteres' },
      ]);
      const invalida = await http()
        .get(CONVERSAS)
        .query({ status: 'alertas', canalId: 'x' })
        .expect(400);
      expect(invalida.body.details.map((d: { field: string }) => d.field).sort()).toEqual([
        'canalId',
        'status',
      ]);
    });

    it('contadores por status, em todos os canais ou num canal', async () => {
      const todos = await http().get(`${CONVERSAS}/contadores`).expect(200);
      expect(contadoresConversasWhatsappSchema.parse(todos.body)).toEqual({
        BOT: 0,
        AGUARDANDO: 2,
        EM_ATENDIMENTO: 1,
        FINALIZADA: 1,
      });

      const recepcaoRes = await http()
        .get(`${CONVERSAS}/contadores`)
        .query({ canalId: recepcao.id })
        .expect(200);
      expect(recepcaoRes.body).toEqual({ BOT: 0, AGUARDANDO: 1, EM_ATENDIMENTO: 0, FINALIZADA: 1 });

      await http().get(`${CONVERSAS}/contadores`).query({ canalId: 'x' }).expect(400);
    });
  });

  describe('POST /conversas-whatsapp (Nova conversa)', () => {
    let canal: { id: string };

    beforeEach(async () => {
      canal = await criarCanal('Recepção');
    });

    function criarPaciente(dados: { celular?: string; telefone?: string } = {}) {
      return prisma.paciente.create({ data: { nome: 'Paciente Teste', ...dados } });
    }

    it('201: cria o contato do celular do paciente e a conversa em atendimento, auditando', async () => {
      const paciente = await criarPaciente({ celular: '(65) 99999-0000', telefone: '6533330000' });

      const res = await http()
        .post(CONVERSAS)
        .send({ pacienteId: paciente.id, canalId: canal.id })
        .expect(201);

      const conversa = conversaWhatsappSchema.parse(res.body);
      expect(conversa).toMatchObject({
        status: 'EM_ATENDIMENTO',
        naoLidas: 0,
        ultimaMensagem: null,
        contato: { nome: 'Paciente Teste', telefone: '5565999990000' },
        canal: { id: canal.id, nome: 'Recepção' },
      });
      const contato = await prisma.contatoWhatsapp.findUniqueOrThrow({
        where: { telefone: '5565999990000' },
      });
      expect(contato.pacienteId).toBe(paciente.id);
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: 'ConversaWhatsapp',
        entityId: conversa.id,
        before: null,
        after: { status: 'EM_ATENDIMENTO', canal: { id: canal.id } },
        userId: usuario.id,
      });
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: 'ContatoWhatsapp',
        entityId: contato.id,
        before: null,
        after: { telefone: '5565999990000', pacienteId: paciente.id },
        userId: usuario.id,
      });
    });

    it('usa o telefone sem celular e vincula ao paciente um contato que já existia', async () => {
      const paciente = await criarPaciente({ telefone: '6533330000' });
      const existente = await prisma.contatoWhatsapp.create({
        data: { nome: null, telefone: '556533330000' },
      });

      await http().post(CONVERSAS).send({ pacienteId: paciente.id, canalId: canal.id }).expect(201);

      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: 'ContatoWhatsapp',
        entityId: existente.id,
        before: { pacienteId: null, nome: null },
        after: { pacienteId: paciente.id, nome: 'Paciente Teste' },
      });
    });

    it('409 com outra conversa não finalizada no canal; finalizada não impede', async () => {
      const paciente = await criarPaciente({ celular: '65999990000' });
      const body = { pacienteId: paciente.id, canalId: canal.id };
      const primeira = await http().post(CONVERSAS).send(body).expect(201);

      const res = await http().post(CONVERSAS).send(body).expect(409);
      expect(res.body).toMatchObject({
        code: 'CONVERSA_EM_ANDAMENTO',
        message: 'Já existe uma conversa em andamento com este paciente neste canal.',
      });
      expect(await prisma.auditLog.count({ where: { entity: 'ConversaWhatsapp' } })).toBe(1);

      await prisma.conversaWhatsapp.update({
        where: { id: primeira.body.id },
        data: { status: 'FINALIZADA' },
      });
      await http().post(CONVERSAS).send(body).expect(201);
    });

    it('422 quando o paciente não tem telefone, sem criar contato nem auditar', async () => {
      const paciente = await criarPaciente();

      const res = await http()
        .post(CONVERSAS)
        .send({ pacienteId: paciente.id, canalId: canal.id })
        .expect(422);

      expect(res.body).toMatchObject({
        code: 'PACIENTE_SEM_TELEFONE',
        message: 'O paciente não tem celular nem telefone cadastrado.',
      });
      expect(await prisma.contatoWhatsapp.count()).toBe(0);
      await expectNoAudit(prisma, { entity: 'ConversaWhatsapp' });
    });

    it('400 "Paciente é obrigatório." e "Canal é obrigatório."; 404 para inexistentes', async () => {
      const vazio = await http().post(CONVERSAS).send({}).expect(400);
      expect(vazio.body.details).toEqual([
        { field: 'pacienteId', message: 'Paciente é obrigatório.' },
        { field: 'canalId', message: 'Canal é obrigatório.' },
      ]);

      const paciente = await criarPaciente({ celular: '65999990000' });
      const excluido = await criarCanal('Antigo', { deletedAt: new Date() });
      const semPaciente = await http()
        .post(CONVERSAS)
        .send({ pacienteId: INEXISTENTE, canalId: canal.id })
        .expect(404);
      expect(semPaciente.body.message).toBe('Paciente não encontrado');
      const semCanal = await http()
        .post(CONVERSAS)
        .send({ pacienteId: paciente.id, canalId: excluido.id })
        .expect(404);
      expect(semCanal.body.message).toBe('Canal não encontrado');
      await expectNoAudit(prisma, { entity: 'ConversaWhatsapp' });
    });
  });

  describe('Tags (modal Gerenciar Tags)', () => {
    it('GET lista por nome, sem as excluídas', async () => {
      await prisma.tagAtendimento.create({ data: { nome: 'Retorno', cor: '#3b82f6' } });
      await prisma.tagAtendimento.create({ data: { nome: 'Orçamento', cor: '#f59e0b' } });
      await prisma.tagAtendimento.create({
        data: { nome: 'Antiga', cor: '#000000', deletedAt: new Date() },
      });

      const res = await http().get(TAGS).expect(200);

      const page = tagAtendimentoPageSchema.parse(res.body);
      expect(page.data.map((t) => [t.nome, t.cor])).toEqual([
        ['Orçamento', '#f59e0b'],
        ['Retorno', '#3b82f6'],
      ]);
    });

    it('POST 201 com a cor padrão e audita CREATE', async () => {
      const res = await http().post(TAGS).send({ nome: '  VIP ' }).expect(201);

      const tag = tagAtendimentoSchema.parse(res.body);
      expect(tag).toMatchObject({ nome: 'VIP', cor: '#6b7280' });
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: 'TagAtendimento',
        entityId: tag.id,
        before: null,
        after: { nome: 'VIP', cor: '#6b7280' },
        userId: usuario.id,
      });
    });

    it('POST 400 "Nome da tag é obrigatório." e 409 para nome repetido (sem diferenciar maiúsculas)', async () => {
      const vazio = await http().post(TAGS).send({ nome: ' ' }).expect(400);
      expect(vazio.body.details).toEqual([
        { field: 'nome', message: 'Nome da tag é obrigatório.' },
      ]);

      await http().post(TAGS).send({ nome: 'Retorno' }).expect(201);
      const repetida = await http().post(TAGS).send({ nome: 'RETORNO' }).expect(409);
      expect(repetida.body).toMatchObject({
        code: 'TAG_ATENDIMENTO_DUPLICADA',
        message: "Já existe uma tag chamada 'RETORNO'.",
      });
      expect(await prisma.auditLog.count({ where: { entity: 'TagAtendimento' } })).toBe(1);
    });

    it('DELETE: exclusão lógica, audita DELETE, libera o nome; 404 depois', async () => {
      const tag = await prisma.tagAtendimento.create({ data: { nome: 'Retorno', cor: '#3b82f6' } });

      await http().delete(`${TAGS}/${tag.id}`).expect(200);

      await expectAudit(prisma, {
        action: 'DELETE',
        entity: 'TagAtendimento',
        entityId: tag.id,
        before: { nome: 'Retorno', deletedAt: null },
        after: null,
        userId: usuario.id,
      });
      await http().delete(`${TAGS}/${tag.id}`).expect(404);
      await http().delete(`${TAGS}/${INEXISTENTE}`).expect(404);
      await http().delete(`${TAGS}/abc`).expect(400);
      await http().post(TAGS).send({ nome: 'Retorno' }).expect(201);
    });
  });

  describe('Painel da conversa', () => {
    let canal: { id: string };
    let contador = 0;
    let publicar: jest.SpyInstance;

    beforeAll(() => {
      publicar = jest.spyOn(app.get(EventPublisher), 'publish');
    });

    beforeEach(async () => {
      contador = 0;
      publicar.mockClear();
      canal = await criarCanal('Recepção');
    });

    afterAll(() => {
      publicar.mockRestore();
    });

    async function nomeDoUsuario() {
      return (await prisma.usuario.findUniqueOrThrow({ where: { id: usuario.id } })).nome;
    }

    async function novaConversa(
      status: ConversaWhatsappStatus,
      extra: {
        pacienteId?: string;
        atendenteId?: string;
        anuncioOrigem?: string;
        anuncioTitulo?: string;
        anuncioUrl?: string;
      } = {},
    ) {
      const { pacienteId, ...conversa } = extra;
      contador += 1;
      const contato = await prisma.contatoWhatsapp.create({
        data: { nome: 'Contato Teste', telefone: `55659000000${contador}0`, pacienteId },
      });
      return prisma.conversaWhatsapp.create({
        data: { canalId: canal.id, contatoId: contato.id, status, ...conversa },
      });
    }

    describe('GET /:id', () => {
      it('200: contato com e-mail e observações do paciente, atendente, anúncio e tags', async () => {
        const paciente = await prisma.paciente.create({
          data: {
            nome: 'Paciente Teste',
            email: 'paciente@example.com',
            observacoes: 'Convênio X',
          },
        });
        const conversa = await novaConversa('EM_ATENDIMENTO', {
          pacienteId: paciente.id,
          atendenteId: usuario.id,
          anuncioOrigem: 'Facebook',
          anuncioTitulo: 'Anúncio de teste',
          anuncioUrl: 'https://example.com/anuncio',
        });
        const [b, a] = await Promise.all([
          prisma.tagAtendimento.create({ data: { nome: 'Beta', cor: '#000000' } }),
          prisma.tagAtendimento.create({ data: { nome: 'Alfa', cor: '#ffffff' } }),
        ]);
        const excluida = await prisma.tagAtendimento.create({
          data: { nome: 'Antiga', cor: '#111111', deletedAt: new Date() },
        });
        await prisma.conversaTag.createMany({
          data: [b, a, excluida].map((t) => ({ conversaId: conversa.id, tagId: t.id })),
        });

        const res = await http().get(`${CONVERSAS}/${conversa.id}`).expect(200);

        expect(conversaWhatsappDetalheSchema.parse(res.body)).toMatchObject({
          id: conversa.id,
          status: 'EM_ATENDIMENTO',
          contato: {
            nome: 'Contato Teste',
            email: 'paciente@example.com',
            observacoes: 'Convênio X',
            pacienteId: paciente.id,
          },
          canal: { id: canal.id, nome: 'Recepção' },
          atendente: { id: usuario.id, nome: await nomeDoUsuario() },
          anuncio: {
            origem: 'Facebook',
            titulo: 'Anúncio de teste',
            url: 'https://example.com/anuncio',
          },
        });
        expect(res.body.tags.map((t: { nome: string }) => t.nome)).toEqual(['Alfa', 'Beta']);
      });

      it('sem paciente, atendente nem anúncio: campos nulos e sem tags', async () => {
        const conversa = await novaConversa('AGUARDANDO');

        const res = await http().get(`${CONVERSAS}/${conversa.id}`).expect(200);

        expect(res.body).toMatchObject({
          contato: { email: null, observacoes: null, pacienteId: null },
          atendente: null,
          anuncio: null,
          tags: [],
        });
      });

      it('404 para conversa inexistente e 400 para id inválido', async () => {
        const res = await http().get(`${CONVERSAS}/${INEXISTENTE}`).expect(404);
        expect(res.body).toMatchObject({ code: 'NOT_FOUND', message: 'Conversa não encontrada' });
        await http().get(`${CONVERSAS}/abc`).expect(400);
      });
    });

    describe('GET /:id/mensagens', () => {
      it('as mais recentes primeiro, com autor, citação, áudio e paginação', async () => {
        const conversa = await novaConversa('EM_ATENDIMENTO');
        const cliente = await prisma.mensagemWhatsapp.create({
          data: {
            conversaId: conversa.id,
            direcao: 'RECEBIDA',
            conteudo: 'Pergunta do cliente',
            enviadaEm: new Date('2026-10-15T08:00:00Z'),
          },
        });
        await prisma.mensagemWhatsapp.create({
          data: {
            conversaId: conversa.id,
            direcao: 'ENVIADA',
            autor: 'ATENDENTE',
            autorUsuarioId: usuario.id,
            status: 'LIDA',
            conteudo: 'Resposta',
            respondeAId: cliente.id,
            enviadaEm: new Date('2026-10-15T08:05:00Z'),
          },
        });
        await prisma.mensagemWhatsapp.create({
          data: {
            conversaId: conversa.id,
            direcao: 'ENVIADA',
            autor: 'CELULAR',
            tipo: 'AUDIO',
            duracaoSegundos: 47,
            conteudo: '',
            enviadaEm: new Date('2026-10-15T08:10:00Z'),
          },
        });

        const res = await http().get(`${CONVERSAS}/${conversa.id}/mensagens`).expect(200);

        const page = mensagemWhatsappPageSchema.parse(res.body);
        expect(page.data.map((m) => [m.autor, m.tipo, m.status, m.duracaoSegundos])).toEqual([
          ['CELULAR', 'AUDIO', 'ENVIADA', 47],
          ['ATENDENTE', 'TEXTO', 'LIDA', null],
          ['CLIENTE', 'TEXTO', 'ENVIADA', null],
        ]);
        expect(page.data[1]).toMatchObject({
          autorNome: await nomeDoUsuario(),
          citacao: { autor: 'CLIENTE', autorNome: null, conteudo: 'Pergunta do cliente' },
        });
        expect(page.data[2]?.citacao).toBeNull();
        expect(page.meta).toEqual({ page: 1, pageSize: 10, total: 3, totalPages: 1 });

        const segunda = await http()
          .get(`${CONVERSAS}/${conversa.id}/mensagens`)
          .query({ pageSize: 2, page: 2 })
          .expect(200);
        expect(segunda.body.data).toHaveLength(1);
      });

      it('404 para conversa inexistente; só traz as mensagens da própria conversa', async () => {
        const conversa = await novaConversa('AGUARDANDO');
        const outra = await novaConversa('AGUARDANDO');
        await prisma.mensagemWhatsapp.create({
          data: {
            conversaId: outra.id,
            direcao: 'RECEBIDA',
            conteudo: 'De outra conversa',
            enviadaEm: new Date(),
          },
        });

        const res = await http().get(`${CONVERSAS}/${conversa.id}/mensagens`).expect(200);
        expect(res.body.data).toEqual([]);
        await http().get(`${CONVERSAS}/${INEXISTENTE}/mensagens`).expect(404);
      });
    });

    describe('POST /:id/mensagens', () => {
      it('201: grava como Pendente, atualiza a conversa, publica o comando e audita CREATE', async () => {
        const conversa = await novaConversa('EM_ATENDIMENTO', { atendenteId: usuario.id });

        const res = await http()
          .post(`${CONVERSAS}/${conversa.id}/mensagens`)
          .send({ conteudo: '  Olá, tudo bem?  ' })
          .expect(201);

        const mensagem = mensagemWhatsappSchema.parse(res.body);
        expect(mensagem).toMatchObject({
          autor: 'ATENDENTE',
          autorNome: await nomeDoUsuario(),
          status: 'PENDENTE',
          tipo: 'TEXTO',
          conteudo: 'Olá, tudo bem?',
        });
        const atual = await prisma.conversaWhatsapp.findUniqueOrThrow({
          where: { id: conversa.id },
        });
        expect(atual.ultimaMensagemEm?.toISOString()).toBe(mensagem.enviadaEm);
        // O payload leva só o id: nada de conteúdo da mensagem na fila.
        expect(publicar).toHaveBeenCalledWith('comercial.whatsapp.enviar-mensagem', {
          mensagemId: mensagem.id,
        });
        await expectAudit(prisma, {
          action: 'CREATE',
          entity: 'MensagemWhatsapp',
          entityId: mensagem.id,
          before: null,
          after: { status: 'PENDENTE', autor: 'ATENDENTE' },
          userId: usuario.id,
        });
      });

      it('409 "Assuma a conversa..." fora de atendimento, sem gravar, publicar nem auditar', async () => {
        for (const status of ['AGUARDANDO', 'FINALIZADA', 'BOT'] as const) {
          const conversa = await novaConversa(status);

          const res = await http()
            .post(`${CONVERSAS}/${conversa.id}/mensagens`)
            .send({ conteudo: 'Oi' })
            .expect(409);

          expect(res.body).toMatchObject({
            code: 'CONVERSA_FORA_DE_ATENDIMENTO',
            message: 'Assuma a conversa para enviar mensagens.',
          });
        }
        expect(await prisma.mensagemWhatsapp.count()).toBe(0);
        expect(publicar).not.toHaveBeenCalled();
        await expectNoAudit(prisma, { entity: 'MensagemWhatsapp' });
      });

      it('400 "Mensagem é obrigatória." e 404', async () => {
        const conversa = await novaConversa('EM_ATENDIMENTO');

        for (const body of [{}, { conteudo: '   ' }]) {
          const res = await http()
            .post(`${CONVERSAS}/${conversa.id}/mensagens`)
            .send(body)
            .expect(400);
          expect(res.body.details).toEqual([
            { field: 'conteudo', message: 'Mensagem é obrigatória.' },
          ]);
        }
        await http()
          .post(`${CONVERSAS}/${INEXISTENTE}/mensagens`)
          .send({ conteudo: 'Oi' })
          .expect(404);
        expect(publicar).not.toHaveBeenCalled();
        await expectNoAudit(prisma, { entity: 'MensagemWhatsapp' });
      });
    });

    describe('POST /:id/assumir', () => {
      it('200: Aguardando → Em Atendimento com o usuário como atendente, auditando UPDATE', async () => {
        const conversa = await novaConversa('AGUARDANDO');

        const res = await http().post(`${CONVERSAS}/${conversa.id}/assumir`).expect(200);

        expect(conversaWhatsappDetalheSchema.parse(res.body)).toMatchObject({
          status: 'EM_ATENDIMENTO',
          atendente: { id: usuario.id, nome: await nomeDoUsuario() },
        });
        await expectAudit(prisma, {
          action: 'UPDATE',
          entity: 'ConversaWhatsapp',
          entityId: conversa.id,
          before: { status: 'AGUARDANDO', atendenteId: null },
          after: { status: 'EM_ATENDIMENTO', atendente: { id: usuario.id } },
          userId: usuario.id,
        });
      });

      it('409 fora de Aguardando e 404, sem auditar', async () => {
        const emAtendimento = await novaConversa('EM_ATENDIMENTO');

        const res = await http().post(`${CONVERSAS}/${emAtendimento.id}/assumir`).expect(409);
        expect(res.body).toMatchObject({
          code: 'CONVERSA_STATUS_INVALIDO',
          message: 'Só é possível assumir uma conversa que aguarda atendimento.',
        });
        await http().post(`${CONVERSAS}/${INEXISTENTE}/assumir`).expect(404);
        await expectNoAudit(prisma, { entity: 'ConversaWhatsapp' });
      });
    });

    describe('POST /:id/encerrar', () => {
      it('200: Em Atendimento → Finalizada, mantendo o atendente, auditando UPDATE', async () => {
        const conversa = await novaConversa('EM_ATENDIMENTO', { atendenteId: usuario.id });

        const res = await http().post(`${CONVERSAS}/${conversa.id}/encerrar`).expect(200);

        expect(res.body).toMatchObject({ status: 'FINALIZADA', atendente: { id: usuario.id } });
        await expectAudit(prisma, {
          action: 'UPDATE',
          entity: 'ConversaWhatsapp',
          entityId: conversa.id,
          before: { status: 'EM_ATENDIMENTO' },
          after: { status: 'FINALIZADA' },
          userId: usuario.id,
        });
      });

      it('409 fora de Em Atendimento e 404', async () => {
        const conversa = await novaConversa('AGUARDANDO');

        const res = await http().post(`${CONVERSAS}/${conversa.id}/encerrar`).expect(409);
        expect(res.body.message).toBe('Só é possível encerrar uma conversa em atendimento.');
        await http().post(`${CONVERSAS}/${INEXISTENTE}/encerrar`).expect(404);
        await expectNoAudit(prisma, { entity: 'ConversaWhatsapp' });
      });
    });

    describe('POST /:id/transferir', () => {
      async function outroUsuario(extra: { ativo?: boolean; deletedAt?: Date } = {}) {
        return criarUsuarioTeste(app, {
          permissoes: PERMISSOES,
          empresaId: usuario.empresaId,
          ...extra,
        });
      }

      it('200: passa a conversa para outro usuário ativo, auditando UPDATE', async () => {
        const destino = await outroUsuario();
        const conversa = await novaConversa('EM_ATENDIMENTO', { atendenteId: usuario.id });

        const res = await http()
          .post(`${CONVERSAS}/${conversa.id}/transferir`)
          .send({ usuarioId: destino.id })
          .expect(200);

        expect(res.body).toMatchObject({ status: 'EM_ATENDIMENTO', atendente: { id: destino.id } });
        await expectAudit(prisma, {
          action: 'UPDATE',
          entity: 'ConversaWhatsapp',
          entityId: conversa.id,
          before: { atendenteId: usuario.id },
          after: { atendente: { id: destino.id } },
          userId: usuario.id,
        });
      });

      it('409 para o mesmo atendente ou fora de Em Atendimento', async () => {
        const destino = await outroUsuario();
        const emAtendimento = await novaConversa('EM_ATENDIMENTO', { atendenteId: usuario.id });
        const aguardando = await novaConversa('AGUARDANDO');

        const mesmo = await http()
          .post(`${CONVERSAS}/${emAtendimento.id}/transferir`)
          .send({ usuarioId: usuario.id })
          .expect(409);
        expect(mesmo.body.code).toBe('CONVERSA_MESMO_ATENDENTE');
        const status = await http()
          .post(`${CONVERSAS}/${aguardando.id}/transferir`)
          .send({ usuarioId: destino.id })
          .expect(409);
        expect(status.body.message).toBe('Só é possível transferir uma conversa em atendimento.');
        await expectNoAudit(prisma, { entity: 'ConversaWhatsapp' });
      });

      it('400 "Usuário é obrigatório." e 404 para usuário inexistente, inativo ou conversa', async () => {
        const conversa = await novaConversa('EM_ATENDIMENTO', { atendenteId: usuario.id });
        const inativo = await outroUsuario({ ativo: false });

        const vazio = await http()
          .post(`${CONVERSAS}/${conversa.id}/transferir`)
          .send({})
          .expect(400);
        expect(vazio.body.details).toEqual([
          { field: 'usuarioId', message: 'Usuário é obrigatório.' },
        ]);
        for (const usuarioId of [INEXISTENTE, inativo.id]) {
          const res = await http()
            .post(`${CONVERSAS}/${conversa.id}/transferir`)
            .send({ usuarioId })
            .expect(404);
          expect(res.body.message).toBe('Usuário não encontrado');
        }
        await http()
          .post(`${CONVERSAS}/${INEXISTENTE}/transferir`)
          .send({ usuarioId: usuario.id })
          .expect(404);
        await expectNoAudit(prisma, { entity: 'ConversaWhatsapp' });
      });
    });

    describe('PUT e DELETE /:id/tags/:tagId', () => {
      it('aplica a tag (idempotente) e audita UPDATE; remove com DELETE', async () => {
        const conversa = await novaConversa('EM_ATENDIMENTO');
        const tag = await prisma.tagAtendimento.create({
          data: { nome: 'Retorno', cor: '#3b82f6' },
        });
        const url = `${CONVERSAS}/${conversa.id}/tags/${tag.id}`;

        const aplicada = await http().put(url).expect(200);
        expect(aplicada.body.tags).toEqual([{ id: tag.id, nome: 'Retorno', cor: '#3b82f6' }]);
        await expectAudit(prisma, {
          action: 'UPDATE',
          entity: 'ConversaWhatsapp',
          entityId: conversa.id,
          after: { tags: [{ id: tag.id }] },
          userId: usuario.id,
        });
        await http().put(url).expect(200);
        expect(await prisma.conversaTag.count({ where: { conversaId: conversa.id } })).toBe(1);

        const removida = await http().delete(url).expect(200);
        expect(removida.body.tags).toEqual([]);
        await http().delete(url).expect(200);
        expect(await prisma.conversaTag.count({ where: { conversaId: conversa.id } })).toBe(0);
      });

      it('404 para conversa ou tag inexistente ou excluída; 400 para id inválido', async () => {
        const conversa = await novaConversa('EM_ATENDIMENTO');
        const excluida = await prisma.tagAtendimento.create({
          data: { nome: 'Antiga', cor: '#000000', deletedAt: new Date() },
        });

        const semTag = await http()
          .put(`${CONVERSAS}/${conversa.id}/tags/${INEXISTENTE}`)
          .expect(404);
        expect(semTag.body.message).toBe('Tag não encontrada');
        await http().put(`${CONVERSAS}/${conversa.id}/tags/${excluida.id}`).expect(404);
        await http().put(`${CONVERSAS}/${INEXISTENTE}/tags/${excluida.id}`).expect(404);
        await http().put(`${CONVERSAS}/${conversa.id}/tags/abc`).expect(400);
        expect(await prisma.conversaTag.count()).toBe(0);
        await expectNoAudit(prisma, { entity: 'ConversaWhatsapp' });
      });
    });
  });

  describe('acesso', () => {
    const ROTAS = [
      { metodo: 'get', caminho: CONVERSAS, permissao: 'ver', entity: 'ConversaWhatsapp' },
      {
        metodo: 'get',
        caminho: `${CONVERSAS}/contadores`,
        permissao: 'ver',
        entity: 'ConversaWhatsapp',
      },
      { metodo: 'post', caminho: CONVERSAS, permissao: 'criar', entity: 'ConversaWhatsapp' },
      {
        metodo: 'get',
        caminho: `${CONVERSAS}/${INEXISTENTE}`,
        permissao: 'ver',
        entity: 'ConversaWhatsapp',
      },
      {
        metodo: 'get',
        caminho: `${CONVERSAS}/${INEXISTENTE}/mensagens`,
        permissao: 'ver',
        entity: 'MensagemWhatsapp',
      },
      {
        metodo: 'post',
        caminho: `${CONVERSAS}/${INEXISTENTE}/mensagens`,
        permissao: 'criar',
        entity: 'MensagemWhatsapp',
      },
      ...(['assumir', 'encerrar', 'transferir'] as const).map((acao) => ({
        metodo: 'post' as const,
        caminho: `${CONVERSAS}/${INEXISTENTE}/${acao}`,
        permissao: 'editar' as const,
        entity: 'ConversaWhatsapp',
      })),
      ...(['put', 'delete'] as const).map((metodo) => ({
        metodo,
        caminho: `${CONVERSAS}/${INEXISTENTE}/tags/${INEXISTENTE}`,
        permissao: 'editar' as const,
        entity: 'ConversaWhatsapp',
      })),
      { metodo: 'get', caminho: TAGS, permissao: 'ver', entity: 'TagAtendimento' },
      { metodo: 'post', caminho: TAGS, permissao: 'criar', entity: 'TagAtendimento' },
      {
        metodo: 'delete',
        caminho: `${TAGS}/${INEXISTENTE}`,
        permissao: 'excluir',
        entity: 'TagAtendimento',
      },
    ] as const;

    it.each(ROTAS)('$metodo $caminho sem token responde 401', async ({ metodo, caminho }) => {
      await request(app.getHttpServer())[metodo](caminho).send({}).expect(401);
    });

    it.each(ROTAS)(
      '$metodo $caminho sem a permissão $permissao responde 403, sem auditar',
      async ({ metodo, caminho, permissao, entity }) => {
        const outras = PERMISSOES.filter((p) => !p.endsWith(`.${permissao}`));
        const semPermissao = await criarUsuarioTeste(app, { permissoes: outras });

        const res = await comUsuario(app, semPermissao)[metodo](caminho).send({}).expect(403);

        expect(res.body).toMatchObject({ code: 'FORBIDDEN', message: 'Sem permissão' });
        await expectNoAudit(prisma, { entity });
      },
    );
  });
});
