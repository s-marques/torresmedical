import type { INestApplication } from '@nestjs/common';
import {
  atividadeNegocioSchema,
  motivoPerdaListaSchema,
  negocioSchema,
  pipelineListaSchema,
  pipelineSchema,
  quadroSchema,
  responsavelListaSchema,
} from '@torres/shared';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit, expectNoAudit } from '../utils/expect-audit';

const BASE = '/api/comercial-atendimento/pipeline';
const PERMISSOES = [
  'comercial-atendimento.pipeline.ver',
  'comercial-atendimento.pipeline.criar',
  'comercial-atendimento.pipeline.editar',
  'comercial-atendimento.pipeline.excluir',
] as const;
const SO_VER = ['comercial-atendimento.pipeline.ver'] as const;
const INEXISTENTE = '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';

describe('Pipeline / CRM (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let usuario: UsuarioTeste;
  let pipelineId: string;
  let contatoInicial: string;
  let proposta: string;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    usuario = await criarUsuarioTeste(app, { permissoes: PERMISSOES });
    pipelineId = (await prisma.pipeline.create({ data: { nome: 'Pipeline Torres', ordem: 1 } })).id;
    contatoInicial = (
      await prisma.estagioPipeline.create({
        data: {
          pipelineId,
          nome: 'Contato inicial',
          cor: '#3b82f6',
          ordem: 1,
          marco: 'PRIMEIRO_CONTATO',
        },
      })
    ).id;
    proposta = (
      await prisma.estagioPipeline.create({
        data: { pipelineId, nome: 'Proposta', cor: '#84cc16', ordem: 2, marco: 'PROPOSTA' },
      })
    ).id;
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => comUsuario(app, usuario);
  const soVer = async () => comUsuario(app, await criarUsuarioTeste(app, { permissoes: SO_VER }));
  const corpo = (extra: Record<string, unknown> = {}) => ({
    titulo: 'Sala 10 - Clínica geral',
    estagioId: contatoInicial,
    ...extra,
  });
  const criarNegocio = async (extra: Record<string, unknown> = {}) =>
    (await http().post(`${BASE}/negocios`).send(corpo(extra)).expect(201)).body as { id: string };

  describe('GET /quadro', () => {
    it('200: colunas com os abertos, totais e resumo por status; busca por título e contato', async () => {
      const paciente = await prisma.paciente.create({
        data: { nome: 'Bruna Cliente', documento: '12345678901', celular: '65999990000' },
      });
      await criarNegocio({ valor: 1160, contatoId: paciente.id });
      await criarNegocio({ titulo: 'Loja 04', valor: 840, estagioId: proposta });
      const ganho = await criarNegocio({ titulo: 'Ganho', valor: 500 });
      await http().patch(`${BASE}/negocios/${ganho.id}/ganho`).expect(200);

      const res = await http().get(`${BASE}/quadro`).query({ pipelineId }).expect(200);
      const quadro = quadroSchema.parse(res.body);
      expect(quadro.colunas.map((c) => [c.nome, c.quantidade, c.total])).toEqual([
        ['Contato inicial', 1, '1160.00'],
        ['Proposta', 1, '840.00'],
      ]);
      expect(quadro.colunas[0]?.negocios[0]).toMatchObject({
        contato: 'Bruna Cliente',
        situacaoAcao: 'SEM_ACAO',
      });
      expect(quadro.resumo).toEqual({
        abertos: { quantidade: 2, total: '2000.00' },
        ganhos: { quantidade: 1, total: '500.00' },
        perdidos: { quantidade: 0, total: '0.00' },
      });

      for (const busca of ['bruna', '123.456', '(65) 99999']) {
        const filtrado = await http().get(`${BASE}/quadro`).query({ pipelineId, search: busca });
        const titulos = quadroSchema
          .parse(filtrado.body)
          .colunas.flatMap((c) => c.negocios.map((n) => n.titulo));
        expect(titulos).toEqual(['Sala 10 - Clínica geral']);
      }
      const porTitulo = await http().get(`${BASE}/quadro`).query({ pipelineId, search: 'loja' });
      expect(quadroSchema.parse(porTitulo.body).colunas[1]?.negocios).toHaveLength(1);
    });

    it('400 sem pipeline, 404 pipeline inexistente, 403 sem permissão', async () => {
      const semPipeline = await http().get(`${BASE}/quadro`).expect(400);
      expect(semPipeline.body.code).toBe('VALIDATION_ERROR');
      const inexistente = await http()
        .get(`${BASE}/quadro`)
        .query({ pipelineId: INEXISTENTE })
        .expect(404);
      expect(inexistente.body.message).toBe('Pipeline não encontrado');
      const sem = await criarUsuarioTeste(app, { permissoes: [] });
      const proibido = await comUsuario(app, sem)
        .get(`${BASE}/quadro`)
        .query({ pipelineId })
        .expect(403);
      expect(proibido.body.code).toBe('FORBIDDEN');
    });
  });

  describe('POST /negocios (Novo Negócio)', () => {
    it('201: cria no pipeline do estágio, grava o marco e audita CREATE', async () => {
      const res = await http()
        .post(`${BASE}/negocios`)
        .send(corpo({ valor: 1160, responsavelId: usuario.id, previsaoFechamento: '2026-12-31' }))
        .expect(201);
      const negocio = negocioSchema.parse(res.body);
      expect(negocio).toMatchObject({
        pipelineId,
        estagioId: contatoInicial,
        valor: '1160',
        status: 'ABERTO',
        previsaoFechamento: '2026-12-31',
        responsavelId: usuario.id,
      });
      expect(negocio.marcos.PRIMEIRO_CONTATO).toBeDefined();
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: 'Negocio',
        entityId: negocio.id,
        before: null,
        after: { titulo: 'Sala 10 - Clínica geral', status: 'ABERTO' },
        userId: usuario.id,
      });
    });

    it('aceita profissional como contato', async () => {
      const profissional = await prisma.profissional.create({ data: { nome: 'Dra. Teste' } });
      const res = await http()
        .post(`${BASE}/negocios`)
        .send(corpo({ contatoTipo: 'PROFISSIONAL', contatoId: profissional.id }))
        .expect(201);
      expect(res.body).toMatchObject({ contatoTipo: 'PROFISSIONAL', contato: 'Dra. Teste' });
    });

    it('400 com o título vazio, sem auditar', async () => {
      const res = await http()
        .post(`${BASE}/negocios`)
        .send({ estagioId: contatoInicial })
        .expect(400);
      expect(res.body.details).toEqual([{ field: 'titulo', message: 'Título é obrigatório.' }]);
      await expectNoAudit(prisma, { entity: 'Negocio' });
    });

    it('404 para estágio, contato, responsável ou origem inexistentes', async () => {
      await http()
        .post(`${BASE}/negocios`)
        .send(corpo({ estagioId: INEXISTENTE }))
        .expect(404);
      await http()
        .post(`${BASE}/negocios`)
        .send(corpo({ contatoId: INEXISTENTE }))
        .expect(404);
      await http()
        .post(`${BASE}/negocios`)
        .send(corpo({ responsavelId: INEXISTENTE }))
        .expect(404);
      await http()
        .post(`${BASE}/negocios`)
        .send(corpo({ origemClienteId: INEXISTENTE }))
        .expect(404);
      await expectNoAudit(prisma, { entity: 'Negocio' });
    });

    it('403 sem permissão de criar', async () => {
      const res = await (await soVer()).post(`${BASE}/negocios`).send(corpo()).expect(403);
      expect(res.body.code).toBe('FORBIDDEN');
      await expectNoAudit(prisma, { entity: 'Negocio' });
    });
  });

  describe('PATCH /negocios/:id e /mover', () => {
    it('200: edita e audita UPDATE com before/after', async () => {
      const { id } = await criarNegocio();
      await http()
        .patch(`${BASE}/negocios/${id}`)
        .send(corpo({ titulo: 'Sala 08', valor: 840 }))
        .expect(200);
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: 'Negocio',
        entityId: id,
        before: { titulo: 'Sala 10 - Clínica geral' },
        after: { titulo: 'Sala 08', valor: '840' },
      });
    });

    it('mover troca o estágio, grava o marco e audita UPDATE', async () => {
      const { id } = await criarNegocio();
      const res = await http()
        .patch(`${BASE}/negocios/${id}/mover`)
        .send({ estagioId: proposta })
        .expect(200);
      expect(res.body.estagioId).toBe(proposta);
      expect(res.body.marcos.PROPOSTA).toBeDefined();
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: 'Negocio',
        entityId: id,
        before: { estagioId: contatoInicial },
        after: { estagioId: proposta },
      });
    });

    it('422 para estágio de outro pipeline; 400, 404 e 403', async () => {
      const { id } = await criarNegocio();
      const outro = await prisma.pipeline.create({ data: { nome: 'Outro', ordem: 2 } });
      const estagioOutro = await prisma.estagioPipeline.create({
        data: { pipelineId: outro.id, nome: 'X', cor: '#000000', ordem: 1 },
      });
      const res = await http()
        .patch(`${BASE}/negocios/${id}/mover`)
        .send({ estagioId: estagioOutro.id })
        .expect(422);
      expect(res.body.code).toBe('ESTAGIO_DE_OUTRO_PIPELINE');
      await http().patch(`${BASE}/negocios/${id}/mover`).send({}).expect(400);
      await http()
        .patch(`${BASE}/negocios/${INEXISTENTE}/mover`)
        .send({ estagioId: proposta })
        .expect(404);
      await (
        await soVer()
      )
        .patch(`${BASE}/negocios/${id}/mover`)
        .send({ estagioId: proposta })
        .expect(403);
    });
  });

  describe('PATCH /negocios/:id/ganho e /perdido', () => {
    it('ganho fecha o negócio, tira do quadro e audita; 422 se já fechado', async () => {
      const { id } = await criarNegocio();
      const res = await http().patch(`${BASE}/negocios/${id}/ganho`).expect(200);
      expect(res.body).toMatchObject({ status: 'GANHO', situacaoAcao: null });
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: 'Negocio',
        entityId: id,
        before: { status: 'ABERTO' },
        after: { status: 'GANHO' },
      });
      const quadro = await http().get(`${BASE}/quadro`).query({ pipelineId });
      expect(quadro.body.colunas[0].negocios).toEqual([]);
      const de_novo = await http().patch(`${BASE}/negocios/${id}/ganho`).expect(422);
      expect(de_novo.body.code).toBe('NEGOCIO_FECHADO');
    });

    it('perdido exige o motivo e o grava', async () => {
      const { id } = await criarNegocio();
      const motivo = await prisma.motivoPerda.create({
        data: { nome: 'Preço', codigo: 'preco', ordem: 1 },
      });
      const vazio = await http().patch(`${BASE}/negocios/${id}/perdido`).send({}).expect(400);
      expect(vazio.body.details).toEqual([
        { field: 'motivoPerdaId', message: 'Motivo da perda é obrigatório.' },
      ]);
      await http()
        .patch(`${BASE}/negocios/${id}/perdido`)
        .send({ motivoPerdaId: INEXISTENTE })
        .expect(404);
      const res = await http()
        .patch(`${BASE}/negocios/${id}/perdido`)
        .send({ motivoPerdaId: motivo.id })
        .expect(200);
      expect(res.body).toMatchObject({ status: 'PERDIDO', motivoPerda: 'Preço' });
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: 'Negocio',
        entityId: id,
        after: { status: 'PERDIDO', motivoPerdaId: motivo.id },
      });
    });

    it('403 sem permissão de editar', async () => {
      const { id } = await criarNegocio();
      const res = await (await soVer()).patch(`${BASE}/negocios/${id}/ganho`).expect(403);
      expect(res.body.code).toBe('FORBIDDEN');
      expect((await prisma.negocio.findUniqueOrThrow({ where: { id } })).status).toBe('ABERTO');
    });
  });

  describe('DELETE /negocios/:id', () => {
    it('200: exclusão lógica, some do quadro e audita DELETE; 404 e 403', async () => {
      const { id } = await criarNegocio();
      await (await soVer()).delete(`${BASE}/negocios/${id}`).expect(403);
      await http().delete(`${BASE}/negocios/${id}`).expect(200);
      expect(await prisma.negocio.count({ where: { id } })).toBe(1);
      await expectAudit(prisma, {
        action: 'DELETE',
        entity: 'Negocio',
        entityId: id,
        before: { titulo: 'Sala 10 - Clínica geral' },
      });
      await http().get(`${BASE}/negocios/${id}`).expect(404);
      await http().delete(`${BASE}/negocios/${INEXISTENTE}`).expect(404);
    });
  });

  describe('Atividades (Agendar Follow-up)', () => {
    it('agenda, aparece como próxima ação e pode ser concluída; audita os dois', async () => {
      const { id } = await criarNegocio({ responsavelId: usuario.id });
      const res = await http()
        .post(`${BASE}/negocios/${id}/atividades`)
        .send({ titulo: 'Ligar', data: '2020-01-10', hora: '09:00' })
        .expect(201);
      const atividade = atividadeNegocioSchema.parse(res.body);
      expect(atividade).toMatchObject({
        tipo: 'FOLLOW_UP',
        responsavelId: usuario.id,
        dataHora: '2020-01-10T12:00:00.000Z',
      });
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: 'AtividadeNegocio',
        entityId: atividade.id,
        after: { titulo: 'Ligar', status: 'PENDENTE' },
      });

      const detalhe = await http().get(`${BASE}/negocios/${id}`).expect(200);
      expect(detalhe.body).toMatchObject({
        situacaoAcao: 'ATRASADA',
        proximaAtividade: { id: atividade.id, exigeProximaAcao: true },
      });

      // Última pendente de negócio aberto: só conclui com a próxima agendada.
      const bloqueio = await http()
        .patch(`${BASE}/atividades/${atividade.id}/concluir`)
        .expect(422);
      expect(bloqueio.body.code).toBe('PROXIMA_ACAO_OBRIGATORIA');
      await expectNoAudit(prisma, { entity: 'AtividadeNegocio', action: 'UPDATE' });
      await http()
        .post(`${BASE}/negocios/${id}/atividades`)
        .send({ titulo: 'Enviar proposta', data: '2099-01-10', hora: '09:00' })
        .expect(201);

      await http().patch(`${BASE}/atividades/${atividade.id}/concluir`).expect(200);
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: 'AtividadeNegocio',
        entityId: atividade.id,
        before: { status: 'PENDENTE' },
        after: { status: 'CONCLUIDA' },
      });
      const depois = await http().get(`${BASE}/negocios/${id}`).expect(200);
      expect(depois.body).toMatchObject({
        situacaoAcao: 'EM_DIA',
        proximaAtividade: { titulo: 'Enviar proposta', exigeProximaAcao: true },
      });
      await http().patch(`${BASE}/atividades/${atividade.id}/concluir`).expect(422);
    });

    it('400 sem título, data e hora; 404 negócio; 403 sem permissão', async () => {
      const { id } = await criarNegocio();
      const res = await http().post(`${BASE}/negocios/${id}/atividades`).send({}).expect(400);
      expect(res.body.details.map((d: { field: string }) => d.field).sort()).toEqual([
        'data',
        'hora',
        'titulo',
      ]);
      await http()
        .post(`${BASE}/negocios/${INEXISTENTE}/atividades`)
        .send({ titulo: 'X', data: '2026-11-20', hora: '09:00' })
        .expect(404);
      await http().patch(`${BASE}/atividades/${INEXISTENTE}/concluir`).expect(404);
      await (
        await soVer()
      )
        .post(`${BASE}/negocios/${id}/atividades`)
        .send({ titulo: 'X', data: '2026-11-20', hora: '09:00' })
        .expect(403);
      await expectNoAudit(prisma, { entity: 'AtividadeNegocio' });
    });
  });

  describe('GET /responsaveis', () => {
    it('lista os usuários ativos', async () => {
      await criarUsuarioTeste(app, { ativo: false });
      const res = await http().get(`${BASE}/responsaveis`).expect(200);
      const ids = responsavelListaSchema.parse(res.body).map((r) => r.id);
      expect(ids).toContain(usuario.id);
      expect(ids).toHaveLength(1);
    });
  });

  describe('Configurações do CRM', () => {
    it('pipelines: lista com estágios e contagem; cria, renomeia e exclui com auditoria', async () => {
      await criarNegocio();
      const lista = pipelineListaSchema.parse(
        (await http().get(`${BASE}/pipelines`).expect(200)).body,
      );
      expect(lista[0]?.estagios.map((e) => [e.nome, e.quantidade, e.marco])).toEqual([
        ['Contato inicial', 1, 'PRIMEIRO_CONTATO'],
        ['Proposta', 0, 'PROPOSTA'],
      ]);

      const criado = pipelineSchema.parse(
        (await http().post(`${BASE}/pipelines`).send({ nome: 'Locações' }).expect(201)).body,
      );
      expect(criado).toMatchObject({ nome: 'Locações', ordem: 2, estagios: [] });
      await expectAudit(prisma, { action: 'CREATE', entity: 'Pipeline', entityId: criado.id });
      await http().post(`${BASE}/pipelines`).send({ nome: 'locações' }).expect(409);
      await http().post(`${BASE}/pipelines`).send({ nome: '' }).expect(400);

      await http().patch(`${BASE}/pipelines/${criado.id}`).send({ nome: 'Locações 2' }).expect(200);
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: 'Pipeline',
        entityId: criado.id,
        before: { nome: 'Locações' },
        after: { nome: 'Locações 2' },
      });

      const emUso = await http().delete(`${BASE}/pipelines/${pipelineId}`).expect(409);
      expect(emUso.body.code).toBe('PIPELINE_EM_USO');
      await http().delete(`${BASE}/pipelines/${criado.id}`).expect(200);
      await expectAudit(prisma, { action: 'DELETE', entity: 'Pipeline', entityId: criado.id });
      await http().delete(`${BASE}/pipelines/${INEXISTENTE}`).expect(404);
      await (await soVer()).post(`${BASE}/pipelines`).send({ nome: 'X' }).expect(403);
    });

    it('estágios: adiciona no fim, edita e exclui só sem negócios', async () => {
      const res = await http()
        .post(`${BASE}/pipelines/${pipelineId}/estagios`)
        .send({ nome: 'Contrato', cor: '#22C55E', marco: 'CONTRATO' })
        .expect(201);
      expect(res.body).toMatchObject({ ordem: 3, cor: '#22c55e', marco: 'CONTRATO' });
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: 'EstagioPipeline',
        entityId: res.body.id,
        after: { nome: 'Contrato' },
      });
      await http()
        .post(`${BASE}/pipelines/${pipelineId}/estagios`)
        .send({ nome: '', cor: 'azul' })
        .expect(400);
      await http()
        .post(`${BASE}/pipelines/${INEXISTENTE}/estagios`)
        .send({ nome: 'X', cor: '#000000' })
        .expect(404);

      await http()
        .patch(`${BASE}/estagios/${res.body.id}`)
        .send({ nome: 'Contrato assinado', cor: '#22c55e', marco: null })
        .expect(200);
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: 'EstagioPipeline',
        entityId: res.body.id,
        before: { marco: 'CONTRATO' },
        after: { nome: 'Contrato assinado', marco: null },
      });

      await criarNegocio();
      const emUso = await http().delete(`${BASE}/estagios/${contatoInicial}`).expect(409);
      expect(emUso.body.code).toBe('ESTAGIO_EM_USO');
      await http().delete(`${BASE}/estagios/${res.body.id}`).expect(200);
      await expectAudit(prisma, {
        action: 'DELETE',
        entity: 'EstagioPipeline',
        entityId: res.body.id,
      });
      await (await soVer()).delete(`${BASE}/estagios/${proposta}`).expect(403);
    });

    it('motivos de perda: lista, adiciona com código, renomeia e exclui só sem uso', async () => {
      const criado = await http()
        .post(`${BASE}/motivos-perda`)
        .send({ nome: 'Sem retorno - não responde' })
        .expect(201);
      expect(criado.body).toMatchObject({ codigo: 'sem_retorno_nao_responde', ordem: 1 });
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: 'MotivoPerda',
        entityId: criado.body.id,
      });
      await http()
        .post(`${BASE}/motivos-perda`)
        .send({ nome: 'sem retorno - NÃO responde' })
        .expect(409);
      await http().post(`${BASE}/motivos-perda`).send({ nome: '---' }).expect(400);

      await http()
        .patch(`${BASE}/motivos-perda/${criado.body.id}`)
        .send({ nome: 'Sem retorno' })
        .expect(200);
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: 'MotivoPerda',
        entityId: criado.body.id,
        after: { nome: 'Sem retorno', codigo: 'sem_retorno_nao_responde' },
      });
      const lista = motivoPerdaListaSchema.parse(
        (await http().get(`${BASE}/motivos-perda`).expect(200)).body,
      );
      expect(lista.map((m) => m.nome)).toEqual(['Sem retorno']);

      const { id } = await criarNegocio();
      await http()
        .patch(`${BASE}/negocios/${id}/perdido`)
        .send({ motivoPerdaId: criado.body.id })
        .expect(200);
      const emUso = await http().delete(`${BASE}/motivos-perda/${criado.body.id}`).expect(409);
      expect(emUso.body.code).toBe('MOTIVO_PERDA_EM_USO');

      const livre = await prisma.motivoPerda.create({
        data: { nome: 'Prazo', codigo: 'prazo', ordem: 2 },
      });
      await http().delete(`${BASE}/motivos-perda/${livre.id}`).expect(200);
      await expectAudit(prisma, { action: 'DELETE', entity: 'MotivoPerda', entityId: livre.id });
      await http().delete(`${BASE}/motivos-perda/${INEXISTENTE}`).expect(404);
      await (await soVer()).post(`${BASE}/motivos-perda`).send({ nome: 'X' }).expect(403);
    });

    it('origem usada por negócio não pode ser excluída', async () => {
      const origem = await prisma.origemCliente.create({
        data: { nome: 'Instagram', codigo: 'instagram', ordem: 1 },
      });
      await criarNegocio({ origemClienteId: origem.id });
      const origens = await criarUsuarioTeste(app, {
        permissoes: ['comercial-atendimento.origens-cliente.excluir'],
      });
      const res = await comUsuario(app, origens)
        .delete(`/api/comercial-atendimento/origens-cliente/${origem.id}`)
        .expect(409);
      expect(res.body.message).toBe(
        'Não é possível excluir: há negócios do CRM usando esta origem.',
      );
    });
  });
});
