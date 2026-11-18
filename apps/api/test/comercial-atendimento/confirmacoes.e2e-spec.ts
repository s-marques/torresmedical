import type { INestApplication } from '@nestjs/common';
import {
  confirmacaoConfigSchema,
  confirmacaoHistoricoPageSchema,
  confirmacaoModeloListaSchema,
  confirmacaoModeloSchema,
  confirmacaoPageSchema,
  confirmacaoSchema,
  resumoConfirmacoesSchema,
} from '@torres/shared';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { agoraNaClinica } from '../../src/modules/comercial-atendimento/campanhas/relogio-clinica';
import { ConfirmacoesAgendador } from '../../src/modules/comercial-atendimento/confirmacoes/confirmacoes.agendador';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit, expectNoAudit } from '../utils/expect-audit';

const BASE = '/api/comercial-atendimento/confirmacoes';
const PERMISSOES = [
  'comercial-atendimento.confirmacoes.ver',
  'comercial-atendimento.confirmacoes.criar',
  'comercial-atendimento.confirmacoes.editar',
  'comercial-atendimento.confirmacoes.excluir',
  'comercial-atendimento.confirmacoes.exportar',
] as const;
const INEXISTENTE = '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
// 17/11/2026 09:00 em São Paulo: janela da MSG1 (08:00–12:00); a consulta é em 18/11.
const AGORA = agoraNaClinica(new Date('2026-11-17T12:00:00.000Z'));
const DIA_ENVIO = '2026-11-17';
// 18/11/2026 14:00 em São Paulo.
const CONSULTA = new Date('2026-11-18T17:00:00.000Z');

describe('Confirmações (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let usuario: UsuarioTeste;
  let profissionalId: string;
  let tipoId: string;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    usuario = await criarUsuarioTeste(app, { permissoes: PERMISSOES });
    profissionalId = (
      await prisma.profissional.create({ data: { nome: 'Dr. Fictício', corCalendario: 'verde' } })
    ).id;
    tipoId = (await prisma.tipoAgendamento.create({ data: { nome: 'Consulta', duracaoMinutos: 30 } }))
      .id;
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => comUsuario(app, usuario);
  const paciente = (nome: string, extra: Record<string, unknown> = {}) =>
    prisma.paciente.create({ data: { nome, celular: '65988887777', status: 'ATIVO', ...extra } });
  const agendar = async (nome = 'Ana Fictícia', extra: Record<string, unknown> = {}) => {
    const p = await paciente(nome);
    return prisma.agendamento.create({
      data: {
        pacienteId: p.id,
        profissionalId,
        tipoAgendamentoId: tipoId,
        inicio: CONSULTA,
        ...extra,
      },
    });
  };
  const conectarCanal = (extra: Record<string, unknown> = {}) =>
    prisma.canalWhatsapp.create({
      data: { nome: 'Clínica', numero: '5565999990000', status: 'CONECTADO', ...extra },
    });
  const rodar = () => app.get(ConfirmacoesAgendador).rodar(AGORA);
  const lista = async (query: Record<string, string> = {}) =>
    confirmacaoPageSchema.parse(
      (await http().get(BASE).query({ dataEnvio: DIA_ENVIO, ...query }).expect(200)).body,
    );

  describe('Aba Pendentes', () => {
    it('lista os agendamentos do dia seguinte ao envio, com resumo e status', async () => {
      const a = await agendar('Ana Fictícia');
      await agendar('Bia Fictícia', { status: 'CONFIRMADO' });
      await agendar('Cris Fictícia', { deletedAt: new Date() });
      await agendar('Dani Fictícia', { inicio: new Date('2026-11-19T17:00:00.000Z') });

      const { data, meta } = await lista();
      expect(meta.total).toBe(2);
      expect(data.map((c) => [c.paciente, c.status, c.tipo, c.enviadoEm])).toEqual([
        ['Ana Fictícia', 'PENDENTE', 'Consulta', null],
        ['Bia Fictícia', 'CONFIRMADO', 'Consulta', null],
      ]);
      expect(data[0]).toMatchObject({ id: a.id, numero: a.numero, telefone: '65988887777' });

      const resumo = resumoConfirmacoesSchema.parse(
        (await http().get(`${BASE}/resumo`).query({ dataEnvio: DIA_ENVIO }).expect(200)).body,
      );
      expect(resumo).toEqual({ pendentes: 1, msg1: 0, msg2: 0, msg3: 0 });
    });

    it('busca por paciente, ordena e pagina', async () => {
      await agendar('Ana Fictícia');
      await agendar('Bia Fictícia');
      expect((await lista({ search: 'bia' })).data.map((c) => c.paciente)).toEqual(['Bia Fictícia']);
      expect((await lista({ sort: 'paciente:desc' })).data.map((c) => c.paciente)).toEqual([
        'Bia Fictícia',
        'Ana Fictícia',
      ]);
      const pagina = await lista({ page: '2', pageSize: '1' });
      expect(pagina.data).toHaveLength(1);
      expect(pagina.meta).toMatchObject({ page: 2, pageSize: 1, total: 2, totalPages: 2 });
    });

    it('400 data ou ordenação inválidas; 403 sem permissão', async () => {
      await http().get(BASE).query({ dataEnvio: '17/11/2026' }).expect(400);
      await http().get(BASE).query({ sort: 'inexistente:asc' }).expect(400);
      const sem = await criarUsuarioTeste(app, { permissoes: [] });
      await comUsuario(app, sem).get(BASE).expect(403);
    });

    it('exporta em Excel, audita EXPORT e exige permissão', async () => {
      await agendar();
      const res = await http()
        .get(`${BASE}/export`)
        .query({ dataEnvio: DIA_ENVIO, format: 'xlsx' })
        .expect(200);
      expect(res.headers['content-type']).toContain('spreadsheetml');
      await expectAudit(prisma, {
        action: 'EXPORT',
        entity: 'Confirmacao',
        entityId: '*',
        userId: usuario.id,
      });
      const sem = await criarUsuarioTeste(app, { permissoes: ['comercial-atendimento.confirmacoes.ver'] });
      await comUsuario(app, sem).get(`${BASE}/export`).query({ format: 'xlsx' }).expect(403);
    });
  });

  describe('Ações da linha', () => {
    it('Enviar confirmacao: manda MSG1, MSG2 e MSG3 em ordem e audita', async () => {
      await conectarCanal();
      const a = await agendar();
      for (const etapa of ['MSG1', 'MSG2', 'MSG3']) {
        const res = await http().post(`${BASE}/${a.id}/enviar`).expect(200);
        const linha = confirmacaoSchema.parse(res.body);
        expect(linha.envios.at(-1)).toMatchObject({ etapa, status: 'ENVIADO' });
      }
      expect(await prisma.mensagemWhatsapp.count({ where: { autor: 'CAMPANHA' } })).toBe(3);
      const mensagem = await prisma.mensagemWhatsapp.findFirstOrThrow({
        orderBy: { createdAt: 'asc' },
      });
      expect(mensagem.conteudo).toContain('Olá Ana Fictícia!');
      expect(mensagem.conteudo).toContain('18/11/2026');
      expect(mensagem.conteudo).toContain('14:00');
      expect(mensagem.conteudo).toContain('Dr. Fictício');
      const envio = await prisma.envioConfirmacao.findFirstOrThrow({
        where: { agendamentoId: a.id, etapa: 'MSG1' },
      });
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: 'EnvioConfirmacao',
        entityId: envio.id,
        after: { etapa: 'MSG1', status: 'ENVIADO', manual: true },
        userId: usuario.id,
      });
      const res = await http().post(`${BASE}/${a.id}/enviar`).expect(422);
      expect(res.body.code).toBe('MENSAGENS_ESGOTADAS');
    });

    it('sem canal conectado registra FALHA no histórico e permite reenviar', async () => {
      const a = await agendar();
      const res = await http().post(`${BASE}/${a.id}/enviar`).expect(200);
      expect(confirmacaoSchema.parse(res.body).envios).toEqual([
        expect.objectContaining({ etapa: 'MSG1', status: 'FALHA' }),
      ]);
      const historico = confirmacaoHistoricoPageSchema.parse(
        (await http().get(`${BASE}/historico`).expect(200)).body,
      );
      expect(historico.data[0]).toMatchObject({
        agendamentoNumero: a.numero,
        etapa: 'MSG1',
        status: 'FALHA',
        erro: 'SEM_CANAL',
      });
      await conectarCanal();
      const reenvio = confirmacaoSchema.parse(
        (await http().post(`${BASE}/${a.id}/enviar`).expect(200)).body,
      );
      expect(reenvio.envios).toEqual([expect.objectContaining({ etapa: 'MSG1', status: 'ENVIADO' })]);
    });

    it('paciente sem celular: FALHA SEM_CELULAR', async () => {
      await conectarCanal();
      const p = await paciente('Sem Celular', { celular: null });
      const a = await prisma.agendamento.create({
        data: { pacienteId: p.id, profissionalId, inicio: CONSULTA },
      });
      await http().post(`${BASE}/${a.id}/enviar`).expect(200);
      expect(
        (await prisma.envioConfirmacao.findFirstOrThrow({ where: { agendamentoId: a.id } })).erro,
      ).toBe('SEM_CELULAR');
    });

    it('usa a linha do profissional antes da linha da clínica', async () => {
      await conectarCanal({ nome: 'Clínica' });
      const doProfissional = await conectarCanal({
        nome: 'Dr.',
        numero: '5565999991111',
        profissionalId,
      });
      const a = await agendar();
      await http().post(`${BASE}/${a.id}/enviar`).expect(200);
      const conversa = await prisma.conversaWhatsapp.findFirstOrThrow();
      expect(conversa.canalId).toBe(doProfissional.id);
    });

    it('Confirmar: muda para Confirmado e audita; Cancelar: muda para Cancelado', async () => {
      const a = await agendar();
      const confirmada = confirmacaoSchema.parse(
        (await http().post(`${BASE}/${a.id}/confirmar`).expect(200)).body,
      );
      expect(confirmada.status).toBe('CONFIRMADO');
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: 'Agendamento',
        entityId: a.id,
        before: { status: 'AGENDADO' },
        after: { status: 'CONFIRMADO' },
        userId: usuario.id,
      });
      const cancelada = confirmacaoSchema.parse(
        (await http().post(`${BASE}/${a.id}/cancelar`).expect(200)).body,
      );
      expect(cancelada.status).toBe('CANCELADO');
      expect((await prisma.agendamento.findUniqueOrThrow({ where: { id: a.id } })).status).toBe(
        'CANCELADO',
      );
    });

    it('422 em status que não aceita a ação; 404 inexistente; 400 id inválido; 403', async () => {
      const atendido = await agendar('Eva Fictícia', { status: 'ATENDIDO' });
      expect((await http().post(`${BASE}/${atendido.id}/confirmar`).expect(422)).body.code).toBe(
        'STATUS_INVALIDO',
      );
      await http().post(`${BASE}/${atendido.id}/cancelar`).expect(422);
      await http().post(`${BASE}/${atendido.id}/enviar`).expect(422);
      await http().post(`${BASE}/${INEXISTENTE}/confirmar`).expect(404);
      await http().post(`${BASE}/nao-e-uuid/cancelar`).expect(400);
      const sem = await criarUsuarioTeste(app, { permissoes: ['comercial-atendimento.confirmacoes.ver'] });
      await comUsuario(app, sem).post(`${BASE}/${atendido.id}/confirmar`).expect(403);
      await expectNoAudit(prisma, { entity: 'Agendamento', action: 'UPDATE' });
    });
  });

  describe('Modelos e Config', () => {
    const configuracao = {
      ativo: false,
      antecedenciaDias: 2,
      horarioLembrete: '06:30',
      horarioMsg1: '09:00',
      horarioMsg2: '13:00',
      horarioMsg3: '18:00',
      horarioNaoConfirmou: '10:00',
      mensagemCriacao: 'Olá {nome}, agendado.',
      mensagemConfirmada: 'Obrigado, {nome}!',
      mensagemJaConfirmado: 'Já confirmado, {nome}.',
    };

    it('GET devolve os padrões; PUT salva e audita before/after', async () => {
      const padrao = confirmacaoConfigSchema.parse(
        (await http().get(`${BASE}/configuracao`).expect(200)).body,
      );
      expect(padrao).toMatchObject({ ativo: true, antecedenciaDias: 1, horarioMsg1: '08:00' });
      expect(padrao.atualizadoEm).toBeNull();

      const salva = confirmacaoConfigSchema.parse(
        (await http().put(`${BASE}/configuracao`).send(configuracao).expect(200)).body,
      );
      expect(salva).toMatchObject(configuracao);
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: 'ConfiguracaoConfirmacao',
        entityId: '1',
        before: { ativo: true, horarioMsg1: '08:00' },
        after: { ativo: false, horarioMsg1: '09:00' },
        userId: usuario.id,
      });
    });

    it('PUT 400 com as mensagens de validação; 403 sem editar', async () => {
      const res = await http()
        .put(`${BASE}/configuracao`)
        .send({ ...configuracao, horarioMsg1: '25:00', mensagemConfirmada: '' })
        .expect(400);
      expect(
        Object.fromEntries(
          res.body.details.map((d: { field: string; message: string }) => [d.field, d.message]),
        ),
      ).toEqual({
        horarioMsg1: 'MSG 1 inválido (HH:MM)',
        mensagemConfirmada: 'A resposta a quem confirma é obrigatório.',
      });
      const sem = await criarUsuarioTeste(app, { permissoes: ['comercial-atendimento.confirmacoes.ver'] });
      await comUsuario(app, sem).put(`${BASE}/configuracao`).send(configuracao).expect(403);
    });

    const modelo = (extra: Record<string, unknown> = {}) => ({
      tipoAgendamentoId: tipoId,
      msg1: 'M1 {nome}',
      msg2: 'M2 {nome}',
      msg3: 'M3 {nome}',
      lembreteConfirmado: 'LC {hora}',
      lembreteNaoConfirmado: 'LN {hora}',
      ...extra,
    });

    it('CRUD do modelo por tipo, com auditoria e exclusão lógica', async () => {
      const criado = confirmacaoModeloSchema.parse(
        (await http().post(`${BASE}/modelos`).send(modelo()).expect(201)).body,
      );
      expect(criado.tipo).toBe('Consulta');
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: 'ModeloConfirmacao',
        entityId: criado.id,
        before: null,
        after: { msg1: 'M1 {nome}' },
      });
      const dup = await http().post(`${BASE}/modelos`).send(modelo()).expect(400);
      expect(dup.body.code).toBe('MODELO_DUPLICADO');

      await http()
        .patch(`${BASE}/modelos/${criado.id}`)
        .send(modelo({ msg1: 'Editada' }))
        .expect(200);
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: 'ModeloConfirmacao',
        entityId: criado.id,
        before: { msg1: 'M1 {nome}' },
        after: { msg1: 'Editada' },
      });
      expect(
        confirmacaoModeloListaSchema.parse((await http().get(`${BASE}/modelos`).expect(200)).body),
      ).toHaveLength(1);
      expect((await http().get(`${BASE}/modelos/${criado.id}`).expect(200)).body.msg1).toBe('Editada');

      await http().delete(`${BASE}/modelos/${criado.id}`).expect(200);
      await expectAudit(prisma, {
        action: 'DELETE',
        entity: 'ModeloConfirmacao',
        entityId: criado.id,
      });
      await http().get(`${BASE}/modelos/${criado.id}`).expect(404);
      // O tipo volta a aceitar modelo novo (reaproveita o registro excluído).
      const recriado = confirmacaoModeloSchema.parse(
        (await http().post(`${BASE}/modelos`).send(modelo({ msg1: 'Nova' })).expect(201)).body,
      );
      expect(recriado.id).toBe(criado.id);
    });

    it('400 formulário vazio e tipo inexistente; 404 inexistente', async () => {
      const vazio = await http().post(`${BASE}/modelos`).send({}).expect(400);
      expect(vazio.body.details.map((d: { field: string }) => d.field)).toContain('msg1');
      await http()
        .post(`${BASE}/modelos`)
        .send(modelo({ tipoAgendamentoId: INEXISTENTE }))
        .expect(400);
      await http().patch(`${BASE}/modelos/${INEXISTENTE}`).send(modelo()).expect(404);
      await http().delete(`${BASE}/modelos/${INEXISTENTE}`).expect(404);
      await expectNoAudit(prisma, { entity: 'ModeloConfirmacao', action: 'CREATE' });
    });

    it('o envio usa o modelo do tipo', async () => {
      await conectarCanal();
      await http().post(`${BASE}/modelos`).send(modelo()).expect(201);
      const a = await agendar();
      await http().post(`${BASE}/${a.id}/enviar`).expect(200);
      expect((await prisma.mensagemWhatsapp.findFirstOrThrow()).conteudo).toBe('M1 Ana Fictícia');
    });
  });

  describe('Agendador', () => {
    it('MSG1 na janela, uma vez só, e conta no resumo', async () => {
      await conectarCanal();
      const a = await agendar();
      expect(await rodar()).toBe(1);
      expect(await rodar()).toBe(0);
      expect(await prisma.envioConfirmacao.count({ where: { agendamentoId: a.id } })).toBe(1);
      expect(await prisma.mensagemWhatsapp.count()).toBe(1);
      const resumo = resumoConfirmacoesSchema.parse(
        (await http().get(`${BASE}/resumo`).query({ dataEnvio: DIA_ENVIO }).expect(200)).body,
      );
      expect(resumo).toEqual({ pendentes: 1, msg1: 1, msg2: 0, msg3: 0 });
      const linha = (await lista()).data[0];
      expect(linha?.enviadoEm).not.toBeNull();
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: 'EnvioConfirmacao',
        entityId: (await prisma.envioConfirmacao.findFirstOrThrow()).id,
        after: { etapa: 'MSG1', manual: false },
      });
    });

    it('não envia a quem já confirmou/cancelou, com a função desativada ou fora da janela', async () => {
      await conectarCanal();
      await agendar('Bia Fictícia', { status: 'CONFIRMADO' });
      await agendar('Cris Fictícia', { status: 'CANCELADO' });
      expect(await rodar()).toBe(0);

      const pendente = await agendar('Dani Fictícia');
      await http()
        .put(`${BASE}/configuracao`)
        .send({
          ativo: false,
          antecedenciaDias: 1,
          horarioLembrete: '07:00',
          horarioMsg1: '08:00',
          horarioMsg2: '12:00',
          horarioMsg3: '17:00',
          horarioNaoConfirmou: '09:00',
          mensagemCriacao: 'a',
          mensagemConfirmada: 'b',
          mensagemJaConfirmado: 'c',
        })
        .expect(200);
      expect(await rodar()).toBe(0);
      await prisma.configuracaoConfirmacao.update({ where: { id: 1 }, data: { ativo: true } });
      // 07:00: antes da MSG1 (08:00).
      expect(
        await app.get(ConfirmacoesAgendador).rodar(agoraNaClinica(new Date('2026-11-17T10:00:00Z'))),
      ).toBe(0);
      expect(await prisma.envioConfirmacao.count({ where: { agendamentoId: pendente.id } })).toBe(0);
    });

    it('respeita a antecedência de 2 dias e a janela da MSG2', async () => {
      await conectarCanal();
      await prisma.configuracaoConfirmacao.create({
        data: {
          id: 1,
          antecedenciaDias: 2,
          horarioLembrete: '07:00',
          horarioMsg1: '08:00',
          horarioMsg2: '12:00',
          horarioMsg3: '17:00',
          horarioNaoConfirmou: '09:00',
          mensagemCriacao: 'a',
          mensagemConfirmada: 'b',
          mensagemJaConfirmado: 'c',
        },
      });
      const a = await agendar();
      // Em 17/11 a consulta (18/11) ainda não está a 2 dias.
      expect(await rodar()).toBe(0);
      // Em 16/11 às 13:00 (MSG2): só a MSG2 sai (a janela da MSG1 já passou).
      const dia16 = agoraNaClinica(new Date('2026-11-16T16:00:00Z'));
      expect(await app.get(ConfirmacoesAgendador).rodar(dia16)).toBe(1);
      const envios = await prisma.envioConfirmacao.findMany({ where: { agendamentoId: a.id } });
      expect(envios.map((e) => e.etapa)).toEqual(['MSG2']);
    });

    it('lembrete do dia: texto de confirmado ou não, só para consultas que ainda não começaram', async () => {
      await conectarCanal();
      await agendar('Ana Fictícia', { status: 'CONFIRMADO' });
      await agendar('Bia Fictícia');
      // 18/11 às 07:30; as consultas são às 14:00.
      const manha = agoraNaClinica(new Date('2026-11-18T10:30:00Z'));
      expect(await app.get(ConfirmacoesAgendador).rodar(manha)).toBe(2);
      const mensagens = await prisma.mensagemWhatsapp.findMany({ orderBy: { createdAt: 'asc' } });
      expect(mensagens.map((m) => m.conteudo.split('\n')[0]).sort()).toEqual([
        'Bom dia Ana Fictícia!',
        'Olá Bia Fictícia!',
      ]);
      // Depois das 14:00 a consulta já começou.
      const tarde = agoraNaClinica(new Date('2026-11-18T18:00:00Z'));
      await prisma.envioConfirmacao.deleteMany();
      expect(await app.get(ConfirmacoesAgendador).rodar(tarde)).toBe(0);
    });
  });
});
