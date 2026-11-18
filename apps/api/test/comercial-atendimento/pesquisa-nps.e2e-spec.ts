import { TransactionHost } from '@nestjs-cls/transactional';
import type { INestApplication } from '@nestjs/common';
import { pesquisaNpsPageSchema, resumoNpsSchema } from '@torres/shared';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import type { PrismaAdapter } from '../../src/common/prisma/prisma-transaction';
import { EnvioPesquisaNpsService } from '../../src/modules/comercial-atendimento/pesquisa-nps/envio-pesquisa-nps.service';
import { PesquisaNpsService } from '../../src/modules/comercial-atendimento/pesquisa-nps/pesquisa-nps.service';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit, expectNoAudit } from '../utils/expect-audit';

const BASE = '/api/comercial-atendimento/pesquisa-nps';
const JUNHO = { de: '2026-06-01', ate: '2026-06-30' };
const AGOSTO = { de: '2026-08-01', ate: '2026-08-31' };
// Um atendimento qualquer: a pesquisa guarda só o id, sem FK.
const novoAtendimentoId = () => crypto.randomUUID();

describe('Pesquisa NPS (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let usuario: UsuarioTeste;
  let profissionalId: string;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    usuario = await criarUsuarioTeste(app, {
      permissoes: ['comercial-atendimento.pesquisa-nps.ver'],
    });
    profissionalId = (
      await prisma.profissional.create({ data: { nome: 'Dr. Fictício', corCalendario: 'verde' } })
    ).id;
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => comUsuario(app, usuario);
  const paciente = (nome: string, extra: Record<string, unknown> = {}) =>
    prisma.paciente.create({ data: { nome, celular: '65988887777', status: 'ATIVO', ...extra } });
  /** Roda como o consumidor de fila: sem request HTTP, dentro de uma transação. */
  const noContexto = <T>(fn: () => Promise<T>): Promise<T> =>
    app
      .get(ClsService)
      .run(() => app.get<TransactionHost<PrismaAdapter>>(TransactionHost).withTransaction(fn));

  async function pesquisa(
    pacienteId: string,
    dia: string,
    extra: { nota?: number; status?: 'ENVIADA' | 'RESPONDIDA' | 'FALHA'; comentario?: string } = {},
  ) {
    const status = extra.status ?? (extra.nota === undefined ? 'ENVIADA' : 'RESPONDIDA');
    return prisma.pesquisaNps.create({
      data: {
        atendimentoId: novoAtendimentoId(),
        pacienteId,
        profissionalId,
        status,
        nota: extra.nota,
        comentario: extra.comentario,
        enviadaEm: new Date(`${dia}T15:00:00.000Z`),
        respondidaEm: status === 'RESPONDIDA' ? new Date(`${dia}T16:00:00.000Z`) : null,
      },
    });
  }

  async function cenarioConhecido() {
    const p = await paciente('Ana Fictícia');
    // Junho: 6 promotores, 2 neutros, 2 detratores, 1 aguardando e 1 falha de envio.
    for (const nota of [10, 10, 9, 9, 10, 9, 7, 8, 3, 0])
      await pesquisa(p.id, '2026-06-10', { nota });
    await pesquisa(p.id, '2026-06-30');
    await pesquisa(p.id, '2026-06-15', { status: 'FALHA' });
    // Agosto: só um detrator. Fora do período de junho.
    await pesquisa(p.id, '2026-08-05', { nota: 2 });
    return p;
  }

  const resumo = async (query: Record<string, string> = {}) =>
    resumoNpsSchema.parse((await http().get(`${BASE}/resumo`).query(query).expect(200)).body);
  const lista = async (query: Record<string, string> = {}) =>
    pesquisaNpsPageSchema.parse((await http().get(BASE).query(query).expect(200)).body);

  describe('GET /resumo (aba Dashboard)', () => {
    it('calcula o score e os cartões de um período com dados conhecidos', async () => {
      await cenarioConhecido();
      expect(await resumo(JUNHO)).toEqual({
        ...JUNHO,
        score: 40, // 60% promotores − 20% detratores
        enviadas: 11, // 10 respondidas + 1 aguardando; a falha de envio não conta
        respondidas: 10,
        taxaResposta: 91,
        avaliacoes: 10,
        promotores: 6,
        neutros: 2,
        detratores: 2,
        percentualPromotores: 60,
        percentualNeutros: 20,
        percentualDetratores: 20,
      });
    });

    it('sem pesquisas no período devolve tudo zerado (como o print do legado)', async () => {
      await cenarioConhecido();
      expect(await resumo({ de: '2026-01-01', ate: '2026-01-31' })).toMatchObject({
        score: 0,
        enviadas: 0,
        respondidas: 0,
        taxaResposta: 0,
        avaliacoes: 0,
        promotores: 0,
        neutros: 0,
        detratores: 0,
      });
    });

    it('sem período usa os últimos 30 dias até hoje', async () => {
      const { de, ate } = await resumo();
      const dias = (new Date(ate).getTime() - new Date(de).getTime()) / 86_400_000;
      expect(dias).toBe(30);
    });

    it('400 período invertido ou data inválida; 403 sem permissão', async () => {
      const invertido = await http()
        .get(`${BASE}/resumo`)
        .query({ de: '2026-06-30', ate: '2026-06-01' })
        .expect(400);
      expect(invertido.body.code).toBe('PERIODO_INVALIDO');
      await http().get(`${BASE}/resumo`).query({ de: '30/06/2026' }).expect(400);
      const sem = await criarUsuarioTeste(app, { permissoes: [] });
      await comUsuario(app, sem).get(`${BASE}/resumo`).expect(403);
    });
  });

  describe('GET / (aba Respostas)', () => {
    it('lista só o período pedido, da mais recente para a mais antiga', async () => {
      await cenarioConhecido();
      const { data, meta } = await lista(JUNHO);
      expect(meta.total).toBe(12); // inclui a aguardando e a falha
      expect(data[0]).toMatchObject({ status: 'ENVIADA', nota: null, classificacao: null });
      expect(data.every((p) => p.enviadaEm.startsWith('2026-06'))).toBe(true);
      expect(data[0]).toMatchObject({ paciente: 'Ana Fictícia', profissional: 'Dr. Fictício' });
    });

    it('falha C3: o mês clicado no Dashboard abre as respostas do mesmo mês', async () => {
      await cenarioConhecido();
      for (const periodo of [JUNHO, AGOSTO]) {
        const r = await resumo(periodo);
        const respondidas = await lista({ ...periodo, classificacao: 'PROMOTOR', pageSize: '100' });
        const neutras = await lista({ ...periodo, classificacao: 'NEUTRO', pageSize: '100' });
        const detratoras = await lista({ ...periodo, classificacao: 'DETRATOR', pageSize: '100' });
        // Cada cartão do Dashboard bate com a lista filtrada do mesmo período.
        expect(respondidas.meta.total).toBe(r.promotores);
        expect(neutras.meta.total).toBe(r.neutros);
        expect(detratoras.meta.total).toBe(r.detratores);
      }
      // Junho tem NPS 40 e Agosto, −100: a lista de agosto nunca traz dados de junho.
      expect((await lista(AGOSTO)).data.map((p) => p.nota)).toEqual([2]);
      expect((await resumo(AGOSTO)).score).toBe(-100);
    });

    it('o limite do período é inclusivo e respeita o fuso da clínica', async () => {
      const p = await paciente('Ana Fictícia');
      // 01/07 02:30 UTC = 30/06 23:30 em São Paulo: entra em junho.
      await prisma.pesquisaNps.create({
        data: {
          atendimentoId: novoAtendimentoId(),
          pacienteId: p.id,
          profissionalId,
          status: 'ENVIADA',
          enviadaEm: new Date('2026-07-01T02:30:00.000Z'),
        },
      });
      expect((await lista(JUNHO)).meta.total).toBe(1);
      expect((await lista({ de: '2026-07-01', ate: '2026-07-31' })).meta.total).toBe(0);
    });

    it('busca por paciente ou profissional, ordena por nota e pagina', async () => {
      const ana = await paciente('Ana Fictícia');
      const bia = await paciente('Bia Fictícia');
      await pesquisa(ana.id, '2026-06-10', { nota: 4, comentario: 'Demorou' });
      await pesquisa(bia.id, '2026-06-11', { nota: 10 });
      expect((await lista({ ...JUNHO, search: 'bia' })).data.map((x) => x.paciente)).toEqual([
        'Bia Fictícia',
      ]);
      expect((await lista({ ...JUNHO, search: 'dr. fict' })).meta.total).toBe(2);
      expect((await lista({ ...JUNHO, sort: 'nota:desc' })).data.map((x) => x.nota)).toEqual([
        10, 4,
      ]);
      const pagina = await lista({ ...JUNHO, page: '2', pageSize: '1' });
      expect(pagina.meta).toMatchObject({ page: 2, pageSize: 1, total: 2, totalPages: 2 });
      expect((await lista({ ...JUNHO, sort: 'nota:asc' })).data[0]).toMatchObject({
        comentario: 'Demorou',
        classificacao: 'DETRATOR',
      });
    });

    it('400 ordenação ou classificação inválidas; 403 sem permissão', async () => {
      await http().get(BASE).query({ sort: 'inexistente:asc' }).expect(400);
      await http().get(BASE).query({ classificacao: 'X' }).expect(400);
      const sem = await criarUsuarioTeste(app, { permissoes: [] });
      await comUsuario(app, sem).get(BASE).expect(403);
    });
  });

  describe('envio da pesquisa (atendimento finalizado)', () => {
    const finalizado = (pacienteId: string) => ({
      atendimentoId: novoAtendimentoId(),
      pacienteId,
      profissionalId,
    });
    const conectarCanal = () =>
      prisma.canalWhatsapp.create({
        data: { nome: 'Clínica', numero: '5565999990000', status: 'CONECTADO' },
      });

    it('grava a mensagem no WhatsApp, cria a pesquisa e audita', async () => {
      await conectarCanal();
      const p = await paciente('Ana Fictícia');
      const atendimento = finalizado(p.id);
      expect(await noContexto(() => app.get(EnvioPesquisaNpsService).enviar(atendimento))).toBe(
        true,
      );

      const criada = await prisma.pesquisaNps.findUniqueOrThrow({
        where: { atendimentoId: atendimento.atendimentoId },
      });
      expect(criada).toMatchObject({ status: 'ENVIADA', erro: null, nota: null });
      const mensagem = await prisma.mensagemWhatsapp.findUniqueOrThrow({
        where: { id: criada.mensagemWhatsappId ?? '' },
      });
      expect(mensagem.conteudo).toContain('Ana Fictícia');
      expect(mensagem.conteudo).toContain('Dr. Fictício');
      expect(mensagem.status).toBe('PENDENTE');
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: 'PesquisaNps',
        entityId: criada.id,
        after: { status: 'ENVIADA' },
      });
    });

    it('é idempotente: o mesmo atendimento não manda a pesquisa duas vezes', async () => {
      await conectarCanal();
      const atendimento = finalizado((await paciente('Ana Fictícia')).id);
      const envio = () => noContexto(() => app.get(EnvioPesquisaNpsService).enviar(atendimento));
      expect(await envio()).toBe(true);
      expect(await envio()).toBe(false);
      expect(await prisma.pesquisaNps.count()).toBe(1);
      expect(await prisma.mensagemWhatsapp.count()).toBe(1);
    });

    it('respeita o opt-out: paciente que não aceita mensagens não recebe nem fica registrado', async () => {
      await conectarCanal();
      const p = await paciente('Ana Fictícia', { aceitaCampanhasWhatsapp: false });
      expect(
        await noContexto(() => app.get(EnvioPesquisaNpsService).enviar(finalizado(p.id))),
      ).toBe(false);
      expect(await prisma.pesquisaNps.count()).toBe(0);
      expect(await prisma.mensagemWhatsapp.count()).toBe(0);
      await expectNoAudit(prisma, { entity: 'PesquisaNps' });
    });

    it('sem canal ou sem celular registra FALHA e não envia', async () => {
      const comCelular = await paciente('Ana Fictícia');
      const semCelular = await paciente('Bia Fictícia', { celular: null });
      await conectarCanal();
      await prisma.canalWhatsapp.updateMany({ data: { status: 'DESCONECTADO' } });
      const a = finalizado(comCelular.id);
      const b = finalizado(semCelular.id);
      await noContexto(() => app.get(EnvioPesquisaNpsService).enviar(a));
      await noContexto(() => app.get(EnvioPesquisaNpsService).enviar(b));
      const falhas = await prisma.pesquisaNps.findMany({ orderBy: { createdAt: 'asc' } });
      expect(falhas.map((f) => [f.status, f.erro])).toEqual([
        ['FALHA', 'SEM_CANAL'],
        ['FALHA', 'SEM_CELULAR'],
      ]);
      expect(await prisma.mensagemWhatsapp.count()).toBe(0);
    });
  });

  describe('resposta do paciente', () => {
    const responder = (pacienteId: string, nota: number, comentario?: string) =>
      noContexto(() =>
        app.get(PesquisaNpsService).registrarResposta(pacienteId, { nota, comentario }),
      );

    it('grava nota e comentário na pesquisa aberta, audita e aparece no Dashboard', async () => {
      const p = await paciente('Ana Fictícia');
      const aberta = await pesquisa(p.id, '2026-06-10');
      expect(await responder(p.id, 9, 'Ótimo')).toBe(aberta.id);

      const depois = await prisma.pesquisaNps.findUniqueOrThrow({ where: { id: aberta.id } });
      expect(depois).toMatchObject({ status: 'RESPONDIDA', nota: 9, comentario: 'Ótimo' });
      expect(depois.respondidaEm).not.toBeNull();
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: 'PesquisaNps',
        entityId: aberta.id,
        before: { status: 'ENVIADA' },
        after: { status: 'RESPONDIDA', nota: 9 },
      });
      expect(await resumo(JUNHO)).toMatchObject({ score: 100, promotores: 1, respondidas: 1 });
    });

    it('só a primeira resposta vale e quem não tem pesquisa aberta é ignorado', async () => {
      const p = await paciente('Ana Fictícia');
      await pesquisa(p.id, '2026-06-10');
      expect(await responder(p.id, 3)).not.toBeNull();
      expect(await responder(p.id, 10)).toBeNull();
      expect((await prisma.pesquisaNps.findFirstOrThrow()).nota).toBe(3);
      const outro = await paciente('Bia Fictícia');
      expect(await responder(outro.id, 8)).toBeNull();
    });

    it('com mais de uma pesquisa aberta responde a mais recente', async () => {
      const p = await paciente('Ana Fictícia');
      const velha = await pesquisa(p.id, '2026-06-01');
      const nova = await pesquisa(p.id, '2026-06-20');
      expect(await responder(p.id, 8)).toBe(nova.id);
      expect((await prisma.pesquisaNps.findUniqueOrThrow({ where: { id: velha.id } })).status).toBe(
        'ENVIADA',
      );
    });
  });
});
