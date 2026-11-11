import type { INestApplication } from '@nestjs/common';
import {
  contadoresConversasWhatsappSchema,
  conversaWhatsappPageSchema,
  conversaWhatsappSchema,
  tagAtendimentoPageSchema,
  tagAtendimentoSchema,
} from '@torres/shared';
import request from 'supertest';
import type { ConversaWhatsappStatus } from '../../src/generated/prisma/client';
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
