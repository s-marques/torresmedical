import type { INestApplication } from '@nestjs/common';
import {
  pesquisaProfissionalConfigSchema,
  pesquisaProfissionalPageSchema,
  pesquisaProfissionalPublicaSchema,
  resumoPesquisaProfissionalSchema,
} from '@torres/shared';
import request from 'supertest';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { agoraNaClinica } from '../../src/modules/comercial-atendimento/campanhas/relogio-clinica';
import { PesquisaProfissionalAgendador } from '../../src/modules/comercial-atendimento/pesquisa-profissional/pesquisa-profissional.agendador';
import { PesquisaProfissionalService } from '../../src/modules/comercial-atendimento/pesquisa-profissional/pesquisa-profissional.service';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit, expectNoAudit } from '../utils/expect-audit';

const BASE = '/api/comercial-atendimento/pesquisa-profissional';
const PUBLICA = '/api/pesquisa-profissional-publica';
// 17/11/2026: o contrato de 18/10 completa 30 dias hoje.
const AGORA = agoraNaClinica(new Date('2026-11-17T12:00:00.000Z'));
const NOVEMBRO = { de: '2026-11-01', ate: '2026-11-30' };
const RESPOSTA = {
  notaEstrutura: 5,
  notaRecepcao: 4,
  notaAgenda: 3,
  notaAtendimento: 5,
  nps: 10,
  comentario: 'Tudo certo por aqui',
};

describe('Pesquisa do Profissional (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let usuario: UsuarioTeste;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    usuario = await criarUsuarioTeste(app, {
      permissoes: [
        'comercial-atendimento.pesquisa-profissional.ver',
        'comercial-atendimento.pesquisa-profissional.editar',
      ],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => comUsuario(app, usuario);
  const publico = () => request(app.getHttpServer());
  const rodar = () => app.get(PesquisaProfissionalAgendador).rodar(AGORA);
  const conectarCanal = () =>
    prisma.canalWhatsapp.create({
      data: { nome: 'Clínica', numero: '5565999990000', status: 'CONECTADO' },
    });

  async function profissional(nome = 'Dr. Fictício', extra: Record<string, unknown> = {}) {
    return prisma.profissional.create({
      data: { nome, corCalendario: 'verde', telefone: '65988887777', ...extra },
    });
  }

  async function contrato(profissionalId: string, dataInicio: string, extra = {}) {
    const sala = await prisma.sala.create({ data: { nome: `Sala ${Math.random()}` } });
    return prisma.contratoSala.create({
      data: {
        salaId: sala.id,
        modalidade: 'MENSAL',
        locatarioTipo: 'PROFISSIONAL',
        profissionalId,
        valorUnitario: 1000,
        dataInicio: new Date(`${dataInicio}T00:00:00.000Z`),
        ...extra,
      },
    });
  }

  /** Token do link, lido da mensagem que o sistema gravou para o profissional. */
  async function tokenEnviado(pesquisaId: string): Promise<string> {
    const pesquisa = await prisma.pesquisaProfissional.findUniqueOrThrow({
      where: { id: pesquisaId },
      include: { mensagemWhatsapp: true },
    });
    const token = /token=([^\s]+)/.exec(pesquisa.mensagemWhatsapp?.conteudo ?? '')?.[1];
    expect(token).toBeDefined();
    return decodeURIComponent(token as string);
  }

  async function enviarUma() {
    await conectarCanal();
    const prof = await profissional();
    await contrato(prof.id, '2026-10-18');
    expect(await rodar()).toBe(1);
    const pesquisa = await prisma.pesquisaProfissional.findFirstOrThrow({
      where: { profissionalId: prof.id },
    });
    return { prof, pesquisa, token: await tokenEnviado(pesquisa.id) };
  }

  describe('envio automático (agendador)', () => {
    it('manda a pesquisa dos 30 dias uma única vez, por WhatsApp, com link e audit_log', async () => {
      const { prof, pesquisa } = await enviarUma();

      expect(pesquisa).toMatchObject({
        ciclo: 0,
        tipo: 'TRINTA_DIAS',
        status: 'ENVIADA',
        erro: null,
        mensagemWhatsappId: expect.any(String),
      });
      // O banco guarda só o hash: o token em si não está em nenhuma coluna da pesquisa.
      const mensagem = await prisma.mensagemWhatsapp.findUniqueOrThrow({
        where: { id: pesquisa.mensagemWhatsappId as string },
      });
      expect(mensagem.conteudo).toContain('/pesquisa-profissional/responder?token=');
      expect(mensagem.conteudo).toContain(prof.nome);
      expect(JSON.stringify(pesquisa)).not.toContain(await tokenEnviado(pesquisa.id));
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: 'PesquisaProfissional',
        entityId: pesquisa.id,
        before: null,
        after: { profissionalId: prof.id, ciclo: 0, status: 'ENVIADA' },
      });

      // Rodar de novo (outra rodada do agendador) não manda outra.
      expect(await rodar()).toBe(0);
      expect(await prisma.pesquisaProfissional.count()).toBe(1);
      expect(await prisma.mensagemWhatsapp.count()).toBe(1);
    });

    it('não manda antes dos 30 dias do contrato, nem para contrato encerrado ou profissional inativo', async () => {
      await conectarCanal();
      const recente = await profissional('Recente');
      await contrato(recente.id, '2026-10-19'); // 29 dias
      const encerrado = await profissional('Encerrado');
      await contrato(encerrado.id, '2026-09-01', { status: 'ENCERRADO' });
      const inativo = await profissional('Inativo', { ativo: false });
      await contrato(inativo.id, '2026-09-01');

      expect(await rodar()).toBe(0);
      expect(await prisma.pesquisaProfissional.count()).toBe(0);
    });

    it('sem canal conectado fica FALHA (SEM_CANAL) e é reenviada quando o canal volta', async () => {
      const prof = await profissional();
      await contrato(prof.id, '2026-10-18');

      expect(await rodar()).toBe(1);
      const falha = await prisma.pesquisaProfissional.findFirstOrThrow();
      expect(falha).toMatchObject({ status: 'FALHA', erro: 'SEM_CANAL', mensagemWhatsappId: null });

      await conectarCanal();
      expect(await rodar()).toBe(1);
      const reenviada = await prisma.pesquisaProfissional.findFirstOrThrow();
      expect(reenviada).toMatchObject({ id: falha.id, status: 'ENVIADA', erro: null });
      expect(await prisma.pesquisaProfissional.count()).toBe(1);
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: 'PesquisaProfissional',
        entityId: falha.id,
        before: { status: 'FALHA', erro: 'SEM_CANAL' },
        after: { status: 'ENVIADA' },
      });
    });

    it('profissional sem telefone fica FALHA (SEM_TELEFONE)', async () => {
      await conectarCanal();
      const prof = await profissional('Sem Telefone', { telefone: null });
      await contrato(prof.id, '2026-10-18');
      await rodar();
      expect(await prisma.pesquisaProfissional.findFirstOrThrow()).toMatchObject({
        profissionalId: prof.id,
        status: 'FALHA',
        erro: 'SEM_TELEFONE',
      });
    });

    it('depois da periodicidade configurada manda a pesquisa periódica (ciclo 1)', async () => {
      const { pesquisa } = await enviarUma();
      await http()
        .put(`${BASE}/configuracao`)
        .send({
          ativo: true,
          periodicidadeMeses: 3,
          mensagem: 'Oi {nome}, responda: {link}',
        })
        .expect(200);

      // 3 meses depois dos 30 dias (17/11 → 17/02).
      const depois = agoraNaClinica(new Date('2027-02-17T12:00:00.000Z'));
      expect(await app.get(PesquisaProfissionalAgendador).rodar(depois)).toBe(1);
      const ciclos = await prisma.pesquisaProfissional.findMany({ orderBy: { ciclo: 'asc' } });
      expect(ciclos.map((c) => [c.ciclo, c.tipo])).toEqual([
        [0, 'TRINTA_DIAS'],
        [1, 'PERIODICA'],
      ]);
      expect(ciclos[0]?.id).toBe(pesquisa.id);
    });

    it('configuração inativa não envia', async () => {
      await conectarCanal();
      const prof = await profissional();
      await contrato(prof.id, '2026-10-18');
      await http()
        .put(`${BASE}/configuracao`)
        .send({
          ativo: false,
          periodicidadeMeses: 6,
          mensagem: 'Oi {nome}: {link}',
        })
        .expect(200);
      expect(await rodar()).toBe(0);
    });
  });

  describe('resposta pelo link (público)', () => {
    it('GET devolve o nome do profissional e se está aberta; 404 para token desconhecido', async () => {
      const { prof, token } = await enviarUma();
      const corpo = pesquisaProfissionalPublicaSchema.parse(
        (await publico().get(`${PUBLICA}/${token}`).expect(200)).body,
      );
      expect(corpo).toEqual({ profissional: prof.nome, aberta: true, motivo: null });
      await publico()
        .get(`${PUBLICA}/${'x'.repeat(43)}`)
        .expect(404);
      await publico().get(`${PUBLICA}/curto`).expect(400);
    });

    it('POST registra a resposta, grava o audit_log e só a primeira vale (409)', async () => {
      const { pesquisa, token } = await enviarUma();
      await publico().post(`${PUBLICA}/${token}`).send(RESPOSTA).expect(204);

      expect(
        await prisma.pesquisaProfissional.findUniqueOrThrow({ where: { id: pesquisa.id } }),
      ).toMatchObject({ ...RESPOSTA, status: 'RESPONDIDA', respondidaEm: expect.any(Date) });
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: 'PesquisaProfissional',
        entityId: pesquisa.id,
        before: { status: 'ENVIADA' },
        after: { status: 'RESPONDIDA', nps: 10 },
      });

      const outra = await publico()
        .post(`${PUBLICA}/${token}`)
        .send({ ...RESPOSTA, nps: 0 })
        .expect(409);
      expect(outra.body.code).toBe('PESQUISA_JA_RESPONDIDA');
      expect(
        (await prisma.pesquisaProfissional.findUniqueOrThrow({ where: { id: pesquisa.id } })).nps,
      ).toBe(10);
      expect((await publico().get(`${PUBLICA}/${token}`).expect(200)).body).toMatchObject({
        aberta: false,
        motivo: 'RESPONDIDA',
      });
    });

    it('400 com estrela fora de 1 a 5, NPS fora de 0 a 10 ou campo faltando; nada é gravado', async () => {
      const { pesquisa, token } = await enviarUma();
      await publico()
        .post(`${PUBLICA}/${token}`)
        .send({ ...RESPOSTA, notaAgenda: 6 })
        .expect(400);
      await publico()
        .post(`${PUBLICA}/${token}`)
        .send({ ...RESPOSTA, notaAgenda: 0 })
        .expect(400);
      await publico()
        .post(`${PUBLICA}/${token}`)
        .send({ ...RESPOSTA, nps: 11 })
        .expect(400);
      const semNps = Object.fromEntries(
        Object.entries(RESPOSTA).filter(([campo]) => campo !== 'nps'),
      );
      const faltando = await publico().post(`${PUBLICA}/${token}`).send(semNps).expect(400);
      expect(faltando.body.details).toMatchObject([
        { field: 'nps', message: 'Nota NPS é obrigatória.' },
      ]);
      expect(
        (await prisma.pesquisaProfissional.findUniqueOrThrow({ where: { id: pesquisa.id } }))
          .status,
      ).toBe('ENVIADA');
      await expectNoAudit(prisma, { entity: 'PesquisaProfissional', action: 'UPDATE' });
    });

    it('410 quando o link expirou', async () => {
      const { pesquisa, token } = await enviarUma();
      await prisma.pesquisaProfissional.update({
        where: { id: pesquisa.id },
        data: { expiraEm: new Date('2026-01-01T00:00:00.000Z') },
      });
      expect((await publico().get(`${PUBLICA}/${token}`).expect(200)).body).toMatchObject({
        aberta: false,
        motivo: 'EXPIRADA',
      });
      const res = await publico().post(`${PUBLICA}/${token}`).send(RESPOSTA).expect(410);
      expect(res.body.code).toBe('PESQUISA_EXPIRADA');
    });

    it('pesquisa com falha de envio não é acessível pelo link (404)', async () => {
      const prof = await profissional();
      await contrato(prof.id, '2026-10-18');
      await rodar(); // sem canal: FALHA
      const falha = await prisma.pesquisaProfissional.findFirstOrThrow();
      expect(falha.status).toBe('FALHA');
      // Mesmo com o hash conhecido, o link nunca foi entregue.
      await publico()
        .get(`${PUBLICA}/${'y'.repeat(43)}`)
        .expect(404);
    });
  });

  /** Uma respondida por profissional, no período de novembro, com valores conhecidos. */
  async function cenarioConhecido() {
    const a = await profissional('Dra. Ana Fictícia');
    const b = await profissional('Dr. Beto Fictício');
    const nova = (
      profissionalId: string,
      ciclo: number,
      dia: string,
      dados: Record<string, unknown> = {},
    ) =>
      prisma.pesquisaProfissional.create({
        data: {
          profissionalId,
          ciclo,
          tipo: ciclo === 0 ? 'TRINTA_DIAS' : 'PERIODICA',
          status: dados.nps === undefined ? 'ENVIADA' : 'RESPONDIDA',
          tokenHash: `hash-${profissionalId}-${ciclo}`,
          expiraEm: new Date('2027-12-31T00:00:00.000Z'),
          enviadaEm: new Date(`${dia}T15:00:00.000Z`),
          respondidaEm: dados.nps === undefined ? null : new Date(`${dia}T16:00:00.000Z`),
          ...dados,
        },
      });
    // Novembro: 2 promotores e 1 detrator respondidos, 1 aguardando e 1 falha de envio.
    await nova(a.id, 0, '2026-11-10', {
      notaEstrutura: 5,
      notaRecepcao: 4,
      notaAgenda: 3,
      notaAtendimento: 5,
      nps: 10,
    });
    await nova(a.id, 1, '2026-11-12', {
      notaEstrutura: 4,
      notaRecepcao: 4,
      notaAgenda: 5,
      notaAtendimento: 5,
      nps: 9,
    });
    await nova(b.id, 0, '2026-11-14', {
      notaEstrutura: 3,
      notaRecepcao: 2,
      notaAgenda: 1,
      notaAtendimento: 2,
      nps: 4,
    });
    await nova(b.id, 1, '2026-11-20');
    await nova(b.id, 2, '2026-11-21', { status: 'FALHA', erro: 'SEM_CANAL' });
    // Outubro: fora do período de novembro.
    await nova(a.id, 2, '2026-10-05', {
      notaEstrutura: 1,
      notaRecepcao: 1,
      notaAgenda: 1,
      notaAtendimento: 1,
      nps: 0,
    });
    return { a, b };
  }

  const resumo = async (query: Record<string, string> = {}) =>
    resumoPesquisaProfissionalSchema.parse(
      (await http().get(`${BASE}/resumo`).query(query).expect(200)).body,
    );
  const lista = async (query: Record<string, string> = {}) =>
    pesquisaProfissionalPageSchema.parse((await http().get(BASE).query(query).expect(200)).body);

  describe('GET /resumo (painel)', () => {
    it('calcula NPS, taxa de resposta e média por categoria com dados conhecidos', async () => {
      await cenarioConhecido();
      expect(await resumo(NOVEMBRO)).toEqual({
        ...NOVEMBRO,
        score: 33, // 2 promotores e 1 detrator em 3: (2 − 1) / 3
        enviadas: 4, // 3 respondidas + 1 aguardando; a falha de envio não conta
        respondidas: 3,
        taxaResposta: 75,
        avaliacoes: 3,
        promotores: 2,
        neutros: 0,
        detratores: 1,
        categorias: [
          { categoria: 'ESTRUTURA', media: 4, avaliacoes: 3 },
          { categoria: 'RECEPCAO', media: 3.3, avaliacoes: 3 },
          { categoria: 'AGENDA', media: 3, avaliacoes: 3 },
          { categoria: 'ATENDIMENTO', media: 4, avaliacoes: 3 },
        ],
      });
    });

    it('filtra por profissional e por período; sem dados devolve zerado', async () => {
      const { a } = await cenarioConhecido();
      expect(await resumo({ ...NOVEMBRO, profissionalId: a.id })).toMatchObject({
        score: 100,
        avaliacoes: 2,
        promotores: 2,
        detratores: 0,
      });
      expect(await resumo({ de: '2026-01-01', ate: '2026-01-31' })).toMatchObject({
        score: 0,
        enviadas: 0,
        avaliacoes: 0,
        categorias: expect.arrayContaining([{ categoria: 'AGENDA', media: 0, avaliacoes: 0 }]),
      });
    });

    it('400 período invertido; 403 sem permissão', async () => {
      const res = await http()
        .get(`${BASE}/resumo`)
        .query({ de: '2026-11-30', ate: '2026-11-01' })
        .expect(400);
      expect(res.body.code).toBe('PERIODO_INVALIDO');
      const sem = await criarUsuarioTeste(app, { permissoes: [] });
      await comUsuario(app, sem).get(`${BASE}/resumo`).expect(403);
    });

    it('perfil restrito só enxerga os profissionais vinculados (403 em outro)', async () => {
      const { a, b } = await cenarioConhecido();
      const restrito = await criarUsuarioTeste(app, {
        permissoes: ['comercial-atendimento.pesquisa-profissional.ver'],
        escopoDados: 'PROFISSIONAIS_VINCULADOS',
        profissionalIds: [a.id],
      });
      const cliente = comUsuario(app, restrito);
      const corpo = resumoPesquisaProfissionalSchema.parse(
        (await cliente.get(`${BASE}/resumo`).query(NOVEMBRO).expect(200)).body,
      );
      expect(corpo).toMatchObject({ avaliacoes: 2, detratores: 0 });
      await cliente
        .get(`${BASE}/resumo`)
        .query({ ...NOVEMBRO, profissionalId: b.id })
        .expect(403);
      const linhas = pesquisaProfissionalPageSchema.parse(
        (await cliente.get(BASE).query(NOVEMBRO).expect(200)).body,
      );
      expect(new Set(linhas.data.map((l) => l.profissionalId))).toEqual(new Set([a.id]));
    });

    it('perfil restrito sem vínculo não vê nada', async () => {
      await cenarioConhecido();
      const restrito = await criarUsuarioTeste(app, {
        permissoes: ['comercial-atendimento.pesquisa-profissional.ver'],
        escopoDados: 'PROFISSIONAIS_VINCULADOS',
      });
      const corpo = resumoPesquisaProfissionalSchema.parse(
        (await comUsuario(app, restrito).get(`${BASE}/resumo`).query(NOVEMBRO).expect(200)).body,
      );
      expect(corpo.enviadas).toBe(0);
    });
  });

  describe('GET / (respostas)', () => {
    it('lista o período com paginação, e o mesmo recorte do resumo', async () => {
      await cenarioConhecido();
      const pagina = await lista({ ...NOVEMBRO, pageSize: '2', page: '1' });
      expect(pagina.meta).toMatchObject({ total: 5, totalPages: 3, pageSize: 2 });
      expect(pagina.data).toHaveLength(2);
      // O resumo e a lista usam o mesmo período (falha C3 do legado).
      const todas = await lista({ ...NOVEMBRO, pageSize: '50' });
      expect(todas.data.filter((p) => p.status !== 'FALHA')).toHaveLength(
        (await resumo(NOVEMBRO)).enviadas,
      );
    });

    it('filtra por profissional, status e busca pelo nome; ordena por NPS', async () => {
      const { b } = await cenarioConhecido();
      expect((await lista({ ...NOVEMBRO, profissionalId: b.id })).meta.total).toBe(3);
      expect((await lista({ ...NOVEMBRO, status: 'RESPONDIDA' })).meta.total).toBe(3);
      expect((await lista({ ...NOVEMBRO, search: 'beto' })).meta.total).toBe(3);
      const porNps = await lista({ ...NOVEMBRO, status: 'RESPONDIDA', sort: 'nps:asc' });
      expect(porNps.data.map((p) => p.nps)).toEqual([4, 9, 10]);
    });

    it('400 parâmetro inválido; 403 sem permissão', async () => {
      await http().get(BASE).query({ status: 'QUALQUER' }).expect(400);
      await http().get(BASE).query({ sort: 'campoInexistente:asc' }).expect(400);
      const sem = await criarUsuarioTeste(app, { permissoes: [] });
      await comUsuario(app, sem).get(BASE).expect(403);
    });
  });

  describe('configuração', () => {
    it('GET devolve os padrões enquanto nada foi salvo', async () => {
      const config = pesquisaProfissionalConfigSchema.parse(
        (await http().get(`${BASE}/configuracao`).expect(200)).body,
      );
      expect(config).toMatchObject({ ativo: true, periodicidadeMeses: 6, atualizadoEm: null });
      expect(config.mensagem).toContain('{link}');
    });

    it('PUT salva e grava o audit_log com antes e depois', async () => {
      await http()
        .put(`${BASE}/configuracao`)
        .send({
          ativo: true,
          periodicidadeMeses: 3,
          mensagem: 'Oi {nome}, responda: {link}',
        })
        .expect(200);
      const salva = pesquisaProfissionalConfigSchema.parse(
        (await http().get(`${BASE}/configuracao`).expect(200)).body,
      );
      expect(salva).toMatchObject({
        periodicidadeMeses: 3,
        mensagem: 'Oi {nome}, responda: {link}',
      });
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: 'ConfiguracaoPesquisaProfissional',
        entityId: '1',
        before: { periodicidadeMeses: 6 },
        after: { periodicidadeMeses: 3 },
      });
    });

    it('400 sem {link}, periodicidade fora de 1 a 24 ou mensagem vazia; nada é gravado', async () => {
      const base = { ativo: true, periodicidadeMeses: 6, mensagem: 'Oi {nome}: {link}' };
      const semLink = await http()
        .put(`${BASE}/configuracao`)
        .send({ ...base, mensagem: 'Sem variável' })
        .expect(400);
      expect(semLink.body.details[0].field).toBe('mensagem');
      await http()
        .put(`${BASE}/configuracao`)
        .send({ ...base, periodicidadeMeses: 0 })
        .expect(400);
      await http()
        .put(`${BASE}/configuracao`)
        .send({ ...base, periodicidadeMeses: 25 })
        .expect(400);
      await http()
        .put(`${BASE}/configuracao`)
        .send({ ...base, mensagem: '  ' })
        .expect(400);
      await expectNoAudit(prisma, { entity: 'ConfiguracaoPesquisaProfissional' });
    });

    it('403 sem a permissão de editar e para perfil restrito; ver não basta', async () => {
      const soVer = await criarUsuarioTeste(app, {
        permissoes: ['comercial-atendimento.pesquisa-profissional.ver'],
      });
      const corpo = { ativo: true, periodicidadeMeses: 6, mensagem: 'Oi {nome}: {link}' };
      await comUsuario(app, soVer).put(`${BASE}/configuracao`).send(corpo).expect(403);
      const restrito = await criarUsuarioTeste(app, {
        permissoes: [
          'comercial-atendimento.pesquisa-profissional.ver',
          'comercial-atendimento.pesquisa-profissional.editar',
        ],
        escopoDados: 'PROFISSIONAIS_VINCULADOS',
      });
      await comUsuario(app, restrito).put(`${BASE}/configuracao`).send(corpo).expect(403);
      await expectNoAudit(prisma, { entity: 'ConfiguracaoPesquisaProfissional' });
    });
  });

  describe('NPS do mês (relatório mensal)', () => {
    it('devolve o NPS dos profissionais do mês, no mesmo recorte do painel', async () => {
      await cenarioConhecido();
      const service = app.get(PesquisaProfissionalService);
      expect(await service.npsDoMes('2026-11')).toEqual({
        mes: '2026-11',
        score: 33,
        avaliacoes: 3,
      });
      // Outubro tem só uma resposta, de detrator.
      expect(await service.npsDoMes('2026-10')).toEqual({
        mes: '2026-10',
        score: -100,
        avaliacoes: 1,
      });
      expect(await service.npsDoMes('2026-09')).toEqual({
        mes: '2026-09',
        score: 0,
        avaliacoes: 0,
      });
    });
  });
});
