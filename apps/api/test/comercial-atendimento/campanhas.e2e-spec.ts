import { TransactionHost } from '@nestjs-cls/transactional';
import type { INestApplication } from '@nestjs/common';
import {
  campanhaPageSchema,
  campanhaSchema,
  destinatarioPageSchema,
  mensagemAutomaticaListaSchema,
  mensagemAutomaticaSchema,
  resumoCampanhasSchema,
} from '@torres/shared';
import { ClsService } from 'nestjs-cls';
import request from 'supertest';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import type { PrismaAdapter } from '../../src/common/prisma/prisma-transaction';
import { EnviosCampanhaService } from '../../src/modules/comercial-atendimento/campanhas/envios-campanha.service';
import { agoraNaClinica } from '../../src/modules/comercial-atendimento/campanhas/relogio-clinica';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit, expectNoAudit } from '../utils/expect-audit';

const BASE = '/api/comercial-atendimento/campanhas';
const AUTO = '/api/comercial-atendimento/mensagens-automaticas';
const PERMISSOES = [
  'comercial-atendimento.campanhas.ver',
  'comercial-atendimento.campanhas.criar',
  'comercial-atendimento.campanhas.editar',
  'comercial-atendimento.campanhas.excluir',
] as const;
const INEXISTENTE = '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';

describe('Campanhas (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let usuario: UsuarioTeste;
  let canalId: string;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    usuario = await criarUsuarioTeste(app, { permissoes: PERMISSOES });
    canalId = (
      await prisma.canalWhatsapp.create({ data: { nome: 'Recepção', numero: '5565999990000' } })
    ).id;
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => comUsuario(app, usuario);
  const corpo = (extra: Record<string, unknown> = {}) => ({
    nome: 'Promoção de Maio',
    canalId,
    mensagem: 'Olá {nome}, temos novidades!',
    ...extra,
  });
  const criar = async (extra: Record<string, unknown> = {}) =>
    campanhaSchema.parse((await http().post(BASE).send(corpo(extra)).expect(201)).body);
  const paciente = (nome: string, extra: Record<string, unknown> = {}) =>
    prisma.paciente.create({ data: { nome, celular: '65988887777', status: 'ATIVO', ...extra } });
  /** Roda um passo do ciclo de envio como o agendador/consumidor fariam. */
  const ciclo = <T>(fn: (envios: EnviosCampanhaService) => Promise<T>) =>
    app
      .get(ClsService)
      .run(() =>
        app
          .get<TransactionHost<PrismaAdapter>>(TransactionHost)
          .withTransaction(() => fn(app.get(EnviosCampanhaService))),
      );

  describe('Envios Agendados', () => {
    it('201: cria com os padrões do modal e audita CREATE', async () => {
      const criada = await criar({ data: '2099-12-01', hora: '09:00' });
      expect(criada).toMatchObject({
        tipoEnvio: 'TEXTO',
        canal: 'Recepção',
        filtro: 'TODOS',
        intervaloSegundos: 5,
        quantidade: null,
        status: 'AGENDADA',
        agendadaPara: '2099-12-01T12:00:00.000Z',
        totalDestinatarios: 0,
      });
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: 'Campanha',
        entityId: criada.id,
        before: null,
        after: { nome: 'Promoção de Maio', status: 'AGENDADA' },
        userId: usuario.id,
      });
    });

    it('400 formulário vazio com as mensagens padrão; 404 canal inexistente', async () => {
      const res = await http().post(BASE).send({}).expect(400);
      expect(
        Object.fromEntries(
          res.body.details.map((d: { field: string; message: string }) => [d.field, d.message]),
        ),
      ).toEqual({
        nome: 'Nome da Campanha é obrigatório.',
        canalId: 'Canal WhatsApp é obrigatório.',
        mensagem: 'Mensagem é obrigatória.',
      });
      await http()
        .post(BASE)
        .send(corpo({ canalId: INEXISTENTE }))
        .expect(404);
      await expectNoAudit(prisma, { entity: 'Campanha', action: 'CREATE' });
    });

    it('lista, detalhe, edita agendada e audita UPDATE; 422 fora de agendada', async () => {
      const { id } = await criar({ data: '2099-12-01', hora: '09:00' });
      await criar({ nome: 'Outra', data: '2099-11-01', hora: '09:00' });
      const lista = campanhaPageSchema.parse((await http().get(BASE).expect(200)).body);
      expect(lista.data.map((c) => c.nome)).toEqual(['Promoção de Maio', 'Outra']);
      expect((await http().get(`${BASE}/${id}`).expect(200)).body.id).toBe(id);
      await http().get(`${BASE}/${INEXISTENTE}`).expect(404);

      await http()
        .patch(`${BASE}/${id}`)
        .send(corpo({ nome: 'Editada', data: '2099-12-02', hora: '10:00' }))
        .expect(200);
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: 'Campanha',
        entityId: id,
        before: { nome: 'Promoção de Maio' },
        after: { nome: 'Editada' },
      });

      await prisma.campanha.update({ where: { id }, data: { status: 'CONCLUIDA' } });
      const res = await http().patch(`${BASE}/${id}`).send(corpo()).expect(422);
      expect(res.body.code).toBe('CAMPANHA_NAO_EDITAVEL');
    });

    it('cancela e exclui (lógica) com auditoria', async () => {
      const { id } = await criar({ data: '2099-12-01', hora: '09:00' });
      const cancelada = await http().patch(`${BASE}/${id}/cancelar`).expect(200);
      expect(cancelada.body).toMatchObject({ status: 'CANCELADA' });
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: 'Campanha',
        entityId: id,
        after: { status: 'CANCELADA' },
      });
      await http().patch(`${BASE}/${id}/cancelar`).expect(422);
      await http().delete(`${BASE}/${id}`).expect(200);
      await expectAudit(prisma, { action: 'DELETE', entity: 'Campanha', entityId: id });
      await http().delete(`${BASE}/${id}`).expect(404);
    });
  });

  describe('Visualizar Clientes', () => {
    it('só ativos com celular; filtros de origem, compra recente e aniversário', async () => {
      const origem = await prisma.origemCliente.create({
        data: { nome: 'Instagram', codigo: 'instagram', ordem: 1 },
      });
      const hoje = agoraNaClinica();
      const ana = await paciente('Ana Teste', { origemClienteId: origem.id });
      await paciente('Bia Teste', {
        dataNascimento: new Date(`1990-${hoje.dia.slice(5)}T00:00:00.000Z`),
      });
      await paciente('Inativa Teste', { status: 'INATIVO' });
      await paciente('Sem Celular', { celular: null });
      await prisma.venda.create({
        data: { pacienteId: ana.id, subtotal: 10, total: 10, status: 'FINALIZADA' },
      });

      const nomes = async (query: Record<string, string>) =>
        destinatarioPageSchema
          .parse((await http().get(`${BASE}/destinatarios`).query(query).expect(200)).body)
          .data.map((d) => d.nome);
      expect(await nomes({})).toEqual(['Ana Teste', 'Bia Teste']);
      expect(await nomes({ filtro: 'ORIGEM', origemClienteId: origem.id })).toEqual(['Ana Teste']);
      expect(await nomes({ filtro: 'COMPRA_RECENTE', diasCompra: '30' })).toEqual(['Ana Teste']);
      expect(await nomes({ filtro: 'ANIVERSARIANTES_DIA' })).toEqual(['Bia Teste']);

      const res = await http().get(`${BASE}/destinatarios`).expect(200);
      expect(res.body.data[0].telefone).toBe('(65) 9****-7777');
      await http().get(`${BASE}/destinatarios`).query({ filtro: 'ORIGEM' }).expect(400);
    });
  });

  describe('ciclo de envio', () => {
    it('agendada → enviando → destinatários → mensagens pendentes no WhatsApp → concluída', async () => {
      const ana = await paciente('Ana Teste');
      await prisma.venda.create({
        data: { pacienteId: ana.id, subtotal: 10, total: 10, status: 'FINALIZADA' },
      });
      await paciente('Bia Teste');
      const { id } = await criar({
        quantidade: 1,
        mensagem: 'Oi {nome}! Última compra: {ultima_compra}',
      });

      const agora = agoraNaClinica(new Date(Date.now() + 60_000));
      expect(await ciclo((e) => e.dispararCampanhas(agora))).toBe(1);
      expect(
        await prisma.outboxEvent.count({ where: { type: 'comercial.campanha.preparar-envios' } }),
      ).toBe(1);
      await ciclo((e) => e.prepararCampanha(id, agora));
      // Idempotente.
      await ciclo((e) => e.prepararCampanha(id, agora));
      expect(await prisma.envioCampanha.count({ where: { campanhaId: id } })).toBe(1);

      expect(await ciclo((e) => e.enfileirar(agora))).toBe(1);
      const mensagem = await prisma.mensagemWhatsapp.findFirstOrThrow({
        include: { conversa: true },
      });
      expect(mensagem).toMatchObject({ autor: 'CAMPANHA', status: 'PENDENTE', direcao: 'ENVIADA' });
      expect(mensagem.conteudo).toMatch(/^Oi Ana Teste! Última compra: \d{2}\/\d{2}\/\d{4}$/);
      expect(mensagem.conversa.status).toBe('FINALIZADA');
      expect(
        await prisma.outboxEvent.count({ where: { type: 'comercial.whatsapp.enviar-mensagem' } }),
      ).toBe(1);

      const final = campanhaSchema.parse((await http().get(`${BASE}/${id}`).expect(200)).body);
      expect(final).toMatchObject({
        status: 'CONCLUIDA',
        totalDestinatarios: 1,
        totalEnviados: 1,
      });
      const resumo = resumoCampanhasSchema.parse(
        (await http().get(`${BASE}/resumo`).expect(200)).body,
      );
      expect(resumo).toMatchObject({
        totalCampanhas: 1,
        concluidas: 1,
        destinatarios: 1,
        mensagensEnviadas: 0,
        taxaSucesso: 0,
      });
    });
  });

  describe('consentimento (LGPD, #148)', () => {
    it('quem revogou campanhas ou comunicação sai dos destinatários', async () => {
      await paciente('Ana Teste');
      await paciente('Bia Teste', { aceitaCampanhasWhatsapp: false });
      await paciente('Caio Teste', { aceitaComunicacao: false });

      const res = await http().get(`${BASE}/destinatarios`).expect(200);

      expect(destinatarioPageSchema.parse(res.body).data.map((d) => d.nome)).toEqual(['Ana Teste']);
    });

    it('revogação depois de o envio entrar na fila cancela o envio e não manda mensagem', async () => {
      const ana = await paciente('Ana Teste');
      await paciente('Bia Teste');
      const { id } = await criar({ quantidade: 2, mensagem: 'Oi {nome}!' });
      const agora = agoraNaClinica(new Date(Date.now() + 60_000));
      await ciclo((e) => e.dispararCampanhas(agora));
      await ciclo((e) => e.prepararCampanha(id, agora));
      expect(await prisma.envioCampanha.count({ where: { campanhaId: id } })).toBe(2);

      await prisma.paciente.update({
        where: { id: ana.id },
        data: { aceitaCampanhasWhatsapp: false },
      });
      // Os envios saem escalonados: no dia seguinte os dois já estão na hora.
      const depois = agoraNaClinica(new Date(Date.now() + 86_400_000));
      expect(await ciclo((e) => e.enfileirar(depois))).toBe(1);

      const envios = await prisma.envioCampanha.findMany({ where: { campanhaId: id } });
      expect(envios.find((e) => e.pacienteId === ana.id)?.status).toBe('CANCELADO');
      const mensagens = await prisma.mensagemWhatsapp.findMany();
      expect(mensagens.map((m) => m.conteudo)).toEqual(['Oi Bia Teste!']);
    });
  });

  describe('Mensagens Automáticas', () => {
    const automacao = (extra: Record<string, unknown> = {}) => ({
      nome: 'Aniversariantes do Dia',
      canalId,
      filtro: 'ANIVERSARIANTES_DIA',
      horario: '00:00',
      diasSemana: [0, 1, 2, 3, 4, 5, 6],
      mensagem: 'Feliz aniversário, {nome}!',
      ...extra,
    });

    it('CRUD, switch e auditoria; 400 com as mensagens padrão', async () => {
      const vazia = await http().post(AUTO).send({}).expect(400);
      expect(vazia.body.details.map((d: { field: string }) => d.field).sort()).toEqual([
        'canalId',
        'diasSemana',
        'horario',
        'mensagem',
        'nome',
      ]);

      const criada = mensagemAutomaticaSchema.parse(
        (await http().post(AUTO).send(automacao()).expect(201)).body,
      );
      expect(criada).toMatchObject({ ativa: true, canal: 'Recepção', totalEnviados: 0 });
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: 'MensagemAutomatica',
        entityId: criada.id,
      });

      const desligada = await http()
        .patch(`${AUTO}/${criada.id}/ativa`)
        .send({ ativa: false })
        .expect(200);
      expect(desligada.body.ativa).toBe(false);
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: 'MensagemAutomatica',
        entityId: criada.id,
        before: { ativa: true },
        after: { ativa: false },
      });

      await http()
        .patch(`${AUTO}/${criada.id}`)
        .send(automacao({ nome: 'Editada', horario: '08:30' }))
        .expect(200);
      const lista = mensagemAutomaticaListaSchema.parse((await http().get(AUTO).expect(200)).body);
      expect(lista.map((a) => [a.nome, a.horario])).toEqual([['Editada', '08:30']]);

      await http().delete(`${AUTO}/${criada.id}`).expect(200);
      await expectAudit(prisma, {
        action: 'DELETE',
        entity: 'MensagemAutomatica',
        entityId: criada.id,
      });
      await http().get(`${AUTO}/${criada.id}`).expect(404);
    });

    it('dispara uma vez por dia para os aniversariantes', async () => {
      const hoje = agoraNaClinica();
      await paciente('Ana Teste', {
        dataNascimento: new Date(`1985-${hoje.dia.slice(5)}T00:00:00.000Z`),
      });
      await paciente('Bia Teste');
      const { id } = mensagemAutomaticaSchema.parse(
        (await http().post(AUTO).send(automacao()).expect(201)).body,
      );

      expect(await ciclo((e) => e.dispararAutomacoes(hoje))).toBe(1);
      expect(await ciclo((e) => e.dispararAutomacoes(hoje))).toBe(0);
      await ciclo((e) => e.prepararAutomacao(id, hoje.dia, hoje));
      await ciclo((e) => e.prepararAutomacao(id, hoje.dia, hoje));
      expect(await prisma.envioCampanha.count({ where: { mensagemAutomaticaId: id } })).toBe(1);

      await ciclo((e) => e.enfileirar(agoraNaClinica(new Date(Date.now() + 60_000))));
      const lista = mensagemAutomaticaListaSchema.parse((await http().get(AUTO).expect(200)).body);
      expect(lista[0]).toMatchObject({ totalEnviados: 1 });
      expect(lista[0]?.ultimoEnvioEm).not.toBeNull();
    });
  });

  describe('acesso', () => {
    const ROTAS = [
      { metodo: 'get', caminho: BASE, permissao: 'ver' },
      { metodo: 'get', caminho: `${BASE}/resumo`, permissao: 'ver' },
      { metodo: 'get', caminho: `${BASE}/destinatarios`, permissao: 'ver' },
      { metodo: 'post', caminho: BASE, permissao: 'criar' },
      { metodo: 'patch', caminho: `${BASE}/${INEXISTENTE}`, permissao: 'editar' },
      { metodo: 'patch', caminho: `${BASE}/${INEXISTENTE}/cancelar`, permissao: 'editar' },
      { metodo: 'delete', caminho: `${BASE}/${INEXISTENTE}`, permissao: 'excluir' },
      { metodo: 'get', caminho: AUTO, permissao: 'ver' },
      { metodo: 'post', caminho: AUTO, permissao: 'criar' },
      { metodo: 'patch', caminho: `${AUTO}/${INEXISTENTE}/ativa`, permissao: 'editar' },
      { metodo: 'delete', caminho: `${AUTO}/${INEXISTENTE}`, permissao: 'excluir' },
    ] as const;

    it.each(ROTAS)('$metodo $caminho sem token responde 401', async ({ metodo, caminho }) => {
      await request(app.getHttpServer())[metodo](caminho).send({}).expect(401);
    });

    it.each(ROTAS)(
      '$metodo $caminho sem a permissão $permissao responde 403',
      async ({ metodo, caminho, permissao }) => {
        const sem = PERMISSOES.filter((p) => !p.endsWith(`.${permissao}`));
        const cliente = comUsuario(app, await criarUsuarioTeste(app, { permissoes: sem }));
        await cliente[metodo](caminho).send({}).expect(403);
        await expectNoAudit(prisma, { entity: 'Campanha' });
      },
    );
  });
});
