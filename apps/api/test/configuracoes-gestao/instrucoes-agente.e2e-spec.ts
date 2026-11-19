import type { INestApplication } from '@nestjs/common';
import {
  agenteAlertaDestinoPageSchema,
  agenteInstrucaoPageSchema,
  agenteInstrucaoSchema,
  agenteInstrucaoVersoesSchema,
  agenteRegraPageSchema,
} from '@torres/shared';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit, expectNoAudit } from '../utils/expect-audit';

const RAIZ = '/api/configuracoes-gestao';
const INSTRUCOES = `${RAIZ}/agente-instrucoes`;
const EXTRAS = `${RAIZ}/agente-instrucoes-extras`;
const DESTINOS = `${RAIZ}/agente-alertas-destinos`;
const REGRAS = `${RAIZ}/agente-regras`;
const PERMISSOES = [
  'configuracoes-gestao.instrucoes-agente.ver',
  'configuracoes-gestao.instrucoes-agente.criar',
  'configuracoes-gestao.instrucoes-agente.editar',
  'configuracoes-gestao.instrucoes-agente.excluir',
] as const;
const SOMENTE_VER = ['configuracoes-gestao.instrucoes-agente.ver'] as const;
const INEXISTENTE = '00000000-0000-4000-8000-000000000000';

const INSTRUCAO = {
  nome: 'Atendimento',
  modelo: 'gpt-4.1-mini',
  temperatura: 0.7,
  maxTokens: 1500,
  ativo: false,
  systemPrompt: 'Você é um assistente virtual.',
};
const EXTRA = { titulo: 'Voucher', descricao: 'Texto da promoção.', ativo: true };
const DESTINO = { tipo: 'NUMERO', nome: 'Recepção', numero: '(65) 99999-0000' };
const REGRA = {
  nome: 'uma_pergunta_por_vez',
  descricao: 'Limita a uma pergunta.',
  tipo: 'POS_RESPOSTA',
  gatilho: 'qualquer',
  acao: 'BLOQUEAR',
  ativo: true,
};

describe('Instruções Agente (e2e)', () => {
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

  const http = () => comUsuario(app, usuario);
  const leitor = async () =>
    comUsuario(app, await criarUsuarioTeste(app, { permissoes: SOMENTE_VER }));

  async function criarInstrucao(corpo: Record<string, unknown> = {}) {
    const res = await http()
      .post(INSTRUCOES)
      .send({ ...INSTRUCAO, ...corpo })
      .expect(201);
    return agenteInstrucaoSchema.parse(res.body);
  }

  function mudarStatus(id: string, status: string) {
    return http().patch(`${INSTRUCOES}/${id}/status`).send({ status });
  }

  /** Último registro do audit_log (quando a mesma entidade é alterada mais de uma vez no teste). */
  async function ultimaAuditoria(entity: string, entityId: string, action: 'UPDATE') {
    const registro = await prisma.auditLog.findFirst({
      where: { entity, entityId, action },
      orderBy: { occurredAt: 'desc' },
    });
    expect(registro).not.toBeNull();
    return registro;
  }

  async function publicar(id: string) {
    for (const status of ['EM_TESTE', 'APROVADO', 'PUBLICADO']) {
      await mudarStatus(id, status).expect(200);
    }
  }

  describe('Instruções', () => {
    it('POST 201: nasce rascunho, versão 1, audita CREATE', async () => {
      const criada = await criarInstrucao();
      expect(criada).toMatchObject({
        nome: 'Atendimento',
        temperatura: 0.7,
        status: 'RASCUNHO',
        ativo: false,
        versaoAtual: 1,
      });
      const versoes = await http().get(`${INSTRUCOES}/${criada.id}/versoes`).expect(200);
      expect(agenteInstrucaoVersoesSchema.parse(versoes.body)).toHaveLength(1);
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: 'AgenteInstrucao',
        entityId: criada.id,
        before: null,
        after: { id: criada.id, nome: 'Atendimento', status: 'RASCUNHO' },
        userId: usuario.id,
      });
    });

    it('POST 400 com as mensagens de obrigatório; 422 ao criar ativa; 403 sem permissão', async () => {
      const res = await http()
        .post(INSTRUCOES)
        .send({ ...INSTRUCAO, nome: '', systemPrompt: '' })
        .expect(400);
      expect(res.body.details).toEqual(
        expect.arrayContaining([
          { field: 'nome', message: 'Nome é obrigatório.' },
          { field: 'systemPrompt', message: 'System Prompt é obrigatório.' },
        ]),
      );
      await http()
        .post(INSTRUCOES)
        .send({ ...INSTRUCAO, ativo: true })
        .expect(422);
      await (await leitor()).post(INSTRUCOES).send(INSTRUCAO).expect(403);
      await expectNoAudit(prisma, { entity: 'AgenteInstrucao' });
    });

    it('GET lista sem excluídas, busca por nome, filtra ativo e pagina; 400 e 403', async () => {
      const a = await criarInstrucao({ nome: 'Alfa' });
      await criarInstrucao({ nome: 'Beta' });
      await http().delete(`${INSTRUCOES}/${a.id}`).expect(200);
      await criarInstrucao({ nome: 'Gama' });

      const todas = agenteInstrucaoPageSchema.parse(
        (await http().get(INSTRUCOES).expect(200)).body,
      );
      expect(todas.data.map((d) => d.nome)).toEqual(['Beta', 'Gama']);
      const busca = await http().get(INSTRUCOES).query({ search: 'gam' }).expect(200);
      expect(busca.body.data.map((d: { nome: string }) => d.nome)).toEqual(['Gama']);
      const inativas = await http().get(INSTRUCOES).query({ status: 'ativo' }).expect(200);
      expect(inativas.body.meta.total).toBe(0);
      const pagina = await http().get(INSTRUCOES).query({ page: 2, pageSize: 1 }).expect(200);
      expect(pagina.body.meta).toMatchObject({ page: 2, total: 2, totalPages: 2 });
      await http().get(INSTRUCOES).query({ sort: 'ativo:asc' }).expect(400);
      const semPermissao = await criarUsuarioTeste(app, { permissoes: [] });
      await comUsuario(app, semPermissao).get(INSTRUCOES).expect(403);
    });

    it('GET /:id: 200, 404 e 400', async () => {
      const criada = await criarInstrucao();
      await http().get(`${INSTRUCOES}/${criada.id}`).expect(200);
      await http().get(`${INSTRUCOES}/${INEXISTENTE}`).expect(404);
      await http().get(`${INSTRUCOES}/abc`).expect(400);
    });

    it('PATCH: mudar o conteúdo gera versão 2, mantém rascunho e audita UPDATE', async () => {
      const criada = await criarInstrucao();
      const res = await http()
        .patch(`${INSTRUCOES}/${criada.id}`)
        .send({ ...INSTRUCAO, systemPrompt: 'Prompt novo' })
        .expect(200);
      expect(res.body).toMatchObject({ systemPrompt: 'Prompt novo', versaoAtual: 2 });
      const versoes = agenteInstrucaoVersoesSchema.parse(
        (await http().get(`${INSTRUCOES}/${criada.id}/versoes`).expect(200)).body,
      );
      expect(versoes.map((v) => v.numero)).toEqual([2, 1]);
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: 'AgenteInstrucao',
        entityId: criada.id,
        before: { versaoAtual: 1 },
        after: { versaoAtual: 2, systemPrompt: 'Prompt novo' },
        userId: usuario.id,
      });
    });

    it('ciclo de aprovação: só avança um passo, registra quem aprovou e só publicada fica ativa', async () => {
      const criada = await criarInstrucao();
      await mudarStatus(criada.id, 'PUBLICADO').expect(422);
      await http()
        .patch(`${INSTRUCOES}/${criada.id}`)
        .send({ ...INSTRUCAO, ativo: true })
        .expect(422);
      await mudarStatus(criada.id, 'EM_TESTE').expect(200);
      const aprovada = await mudarStatus(criada.id, 'APROVADO').expect(200);
      expect(aprovada.body).toMatchObject({ status: 'APROVADO', aprovadoPor: usuario.id });
      expect(aprovada.body.aprovadoEm).not.toBeNull();
      await mudarStatus(criada.id, 'PUBLICADO').expect(200);

      const ativa = await http()
        .patch(`${INSTRUCOES}/${criada.id}`)
        .send({ ...INSTRUCAO, ativo: true })
        .expect(200);
      expect(ativa.body).toMatchObject({ status: 'PUBLICADO', ativo: true });
      const auditoria = await ultimaAuditoria('AgenteInstrucao', criada.id, 'UPDATE');
      expect(auditoria?.before).toMatchObject({ status: 'PUBLICADO', ativo: false });
      expect(auditoria?.after).toMatchObject({ status: 'PUBLICADO', ativo: true });
      expect(auditoria?.userId).toBe(usuario.id);

      const volta = await mudarStatus(criada.id, 'RASCUNHO').expect(200);
      expect(volta.body).toMatchObject({ ativo: false, aprovadoPor: null, aprovadoEm: null });
      await http().patch(`${INSTRUCOES}/${criada.id}/status`).send({ status: 'X' }).expect(400);
      await (
        await leitor()
      )
        .patch(`${INSTRUCOES}/${criada.id}/status`)
        .send({ status: 'EM_TESTE' })
        .expect(403);
    });

    it('editar uma instrução publicada e ativa volta para rascunho e desativa', async () => {
      const criada = await criarInstrucao();
      await publicar(criada.id);
      await http()
        .patch(`${INSTRUCOES}/${criada.id}`)
        .send({ ...INSTRUCAO, ativo: true })
        .expect(200);
      const res = await http()
        .patch(`${INSTRUCOES}/${criada.id}`)
        .send({ ...INSTRUCAO, nome: 'Outro nome', ativo: false })
        .expect(200);
      expect(res.body).toMatchObject({ status: 'RASCUNHO', ativo: false, aprovadoPor: null });
    });

    it('restaura uma versão anterior como versão nova, audita e responde 404 para versão inexistente', async () => {
      const criada = await criarInstrucao();
      await http()
        .patch(`${INSTRUCOES}/${criada.id}`)
        .send({ ...INSTRUCAO, systemPrompt: 'Segundo' })
        .expect(200);

      const res = await http().post(`${INSTRUCOES}/${criada.id}/versoes/1/restaurar`).expect(200);
      expect(res.body).toMatchObject({
        systemPrompt: INSTRUCAO.systemPrompt,
        versaoAtual: 3,
        status: 'RASCUNHO',
      });
      const auditoria = await ultimaAuditoria('AgenteInstrucao', criada.id, 'UPDATE');
      expect(auditoria?.before).toMatchObject({ versaoAtual: 2, systemPrompt: 'Segundo' });
      expect(auditoria?.after).toMatchObject({
        versaoAtual: 3,
        systemPrompt: INSTRUCAO.systemPrompt,
      });
      await http().post(`${INSTRUCOES}/${criada.id}/versoes/9/restaurar`).expect(404);
      await http().get(`${INSTRUCOES}/${INEXISTENTE}/versoes`).expect(404);
      await (await leitor()).post(`${INSTRUCOES}/${criada.id}/versoes/1/restaurar`).expect(403);
    });

    it('DELETE: exclusão lógica auditada, 404 depois e 403 sem permissão', async () => {
      const criada = await criarInstrucao();
      await (await leitor()).delete(`${INSTRUCOES}/${criada.id}`).expect(403);
      await http().delete(`${INSTRUCOES}/${criada.id}`).expect(200);
      await http().delete(`${INSTRUCOES}/${criada.id}`).expect(404);
      expect(await prisma.agenteInstrucao.count({ where: { deletedAt: { not: null } } })).toBe(1);
      await expectAudit(prisma, {
        action: 'DELETE',
        entity: 'AgenteInstrucao',
        entityId: criada.id,
        userId: usuario.id,
      });
    });
  });

  describe('Instruções extras', () => {
    it('CRUD completo com auditoria, switch de ativo, busca e permissões', async () => {
      const criada = await http().post(EXTRAS).send(EXTRA).expect(201);
      expect(criada.body).toMatchObject({ titulo: 'Voucher', ativo: true });
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: 'AgenteInstrucaoExtra',
        entityId: criada.body.id,
        before: null,
        after: { titulo: 'Voucher' },
        userId: usuario.id,
      });

      const id = criada.body.id as string;
      await http()
        .patch(`${EXTRAS}/${id}`)
        .send({ ...EXTRA, titulo: 'Voucher 2' })
        .expect(200);
      const desligada = await http()
        .patch(`${EXTRAS}/${id}/ativo`)
        .send({ ativo: false })
        .expect(200);
      expect(desligada.body.ativo).toBe(false);
      const auditoria = await ultimaAuditoria('AgenteInstrucaoExtra', id, 'UPDATE');
      expect(auditoria?.before).toMatchObject({ ativo: true });
      expect(auditoria?.after).toMatchObject({ ativo: false });
      expect(auditoria?.userId).toBe(usuario.id);

      const lista = await http()
        .get(EXTRAS)
        .query({ search: 'voucher 2', status: 'inativo' })
        .expect(200);
      expect(lista.body.data).toHaveLength(1);
      await http().get(`${EXTRAS}/${id}`).expect(200);
      await http().delete(`${EXTRAS}/${id}`).expect(200);
      await http().get(`${EXTRAS}/${id}`).expect(404);
      await expectAudit(prisma, { action: 'DELETE', entity: 'AgenteInstrucaoExtra', entityId: id });
    });

    it('400 com as mensagens de obrigatório, 404 e 403', async () => {
      const res = await http()
        .post(EXTRAS)
        .send({ titulo: '', descricao: '', ativo: true })
        .expect(400);
      expect(res.body.details).toEqual(
        expect.arrayContaining([
          { field: 'titulo', message: 'Título é obrigatório.' },
          { field: 'descricao', message: 'Descrição é obrigatória.' },
        ]),
      );
      await http().patch(`${EXTRAS}/${INEXISTENTE}`).send(EXTRA).expect(404);
      await http().patch(`${EXTRAS}/${INEXISTENTE}/ativo`).send({ ativo: true }).expect(404);
      await http().delete(`${EXTRAS}/${INEXISTENTE}`).expect(404);
      await (await leitor()).post(EXTRAS).send(EXTRA).expect(403);
      await expectNoAudit(prisma, { entity: 'AgenteInstrucaoExtra' });
    });
  });

  describe('Destinos de alerta', () => {
    it('POST normaliza o número, lista, remove (lógico) e audita', async () => {
      const criado = await http().post(DESTINOS).send(DESTINO).expect(201);
      expect(criado.body).toMatchObject({ tipo: 'NUMERO', numero: '5565999990000' });
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: 'AgenteAlertaDestino',
        entityId: criado.body.id,
        before: null,
        after: { nome: 'Recepção', numero: '5565999990000' },
        userId: usuario.id,
      });

      const lista = agenteAlertaDestinoPageSchema.parse(
        (await http().get(DESTINOS).query({ search: '9999' }).expect(200)).body,
      );
      expect(lista.data).toHaveLength(1);

      await http().delete(`${DESTINOS}/${criado.body.id}`).expect(200);
      await http().delete(`${DESTINOS}/${criado.body.id}`).expect(404);
      expect((await http().get(DESTINOS).expect(200)).body.meta.total).toBe(0);
      await expectAudit(prisma, {
        action: 'DELETE',
        entity: 'AgenteAlertaDestino',
        entityId: criado.body.id,
      });
      await http().post(DESTINOS).send(DESTINO).expect(201);
    });

    it('409 para número repetido; 400 para número curto e nome vazio; 403', async () => {
      await http().post(DESTINOS).send(DESTINO).expect(201);
      const dup = await http()
        .post(DESTINOS)
        .send({ ...DESTINO, numero: '65999990000' })
        .expect(409);
      expect(dup.body.details).toEqual([
        { field: 'numero', message: 'Este destino já está cadastrado' },
      ]);
      const res = await http()
        .post(DESTINOS)
        .send({ tipo: 'NUMERO', nome: '', numero: '12' })
        .expect(400);
      expect(res.body.details).toEqual(
        expect.arrayContaining([{ field: 'nome', message: 'Nome é obrigatório.' }]),
      );
      await (await leitor()).post(DESTINOS).send(DESTINO).expect(403);
      await (await leitor()).delete(`${DESTINOS}/${INEXISTENTE}`).expect(403);
    });
  });

  describe('Regras', () => {
    it('CRUD completo, com filtros, ordenação, switch e auditoria', async () => {
      const criada = await http().post(REGRAS).send(REGRA).expect(201);
      await http()
        .post(REGRAS)
        .send({
          ...REGRA,
          nome: 'nao_inventar',
          descricao: 'Outra descrição.',
          tipo: 'PRE_TOOL',
          acao: 'ALERTAR',
          gatilho: 'venda',
        })
        .expect(201);
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: 'AgenteRegra',
        entityId: criada.body.id,
        before: null,
        after: { nome: 'uma_pergunta_por_vez', tipo: 'POS_RESPOSTA' },
        userId: usuario.id,
      });

      const buscar = async (query: Record<string, string>) =>
        agenteRegraPageSchema
          .parse((await http().get(REGRAS).query(query).expect(200)).body)
          .data.map((d) => d.nome);
      expect(await buscar({ sort: 'nome:asc' })).toEqual(['nao_inventar', 'uma_pergunta_por_vez']);
      expect(await buscar({ tipo: 'PRE_TOOL' })).toEqual(['nao_inventar']);
      expect(await buscar({ acao: 'BLOQUEAR' })).toEqual(['uma_pergunta_por_vez']);
      expect(await buscar({ search: 'limita' })).toEqual(['uma_pergunta_por_vez']);

      const id = criada.body.id as string;
      await http()
        .patch(`${REGRAS}/${id}`)
        .send({ ...REGRA, descricao: 'Nova' })
        .expect(200);
      const desligada = await http()
        .patch(`${REGRAS}/${id}/ativo`)
        .send({ ativo: false })
        .expect(200);
      expect(desligada.body.ativo).toBe(false);
      expect(await buscar({ status: 'inativo' })).toEqual(['uma_pergunta_por_vez']);
      const auditoria = await ultimaAuditoria('AgenteRegra', id, 'UPDATE');
      expect(auditoria?.before).toMatchObject({ ativo: true });
      expect(auditoria?.after).toMatchObject({ ativo: false });
      expect(auditoria?.userId).toBe(usuario.id);
      await http().delete(`${REGRAS}/${id}`).expect(200);
      await http().get(`${REGRAS}/${id}`).expect(404);
      await expectAudit(prisma, { action: 'DELETE', entity: 'AgenteRegra', entityId: id });
    });

    it('409 para nome repetido (libera o de excluída), 400, 404 e 403', async () => {
      const primeira = await http().post(REGRAS).send(REGRA).expect(201);
      const dup = await http().post(REGRAS).send(REGRA).expect(409);
      expect(dup.body.details).toEqual([
        { field: 'nome', message: 'Já existe uma regra com este nome' },
      ]);
      await http().delete(`${REGRAS}/${primeira.body.id}`).expect(200);
      await http().post(REGRAS).send(REGRA).expect(201);

      const res = await http()
        .post(REGRAS)
        .send({ ...REGRA, nome: 'Nome Inválido', descricao: '' })
        .expect(400);
      expect(res.body.details).toEqual(
        expect.arrayContaining([{ field: 'descricao', message: 'Descrição é obrigatória.' }]),
      );
      await http().get(REGRAS).query({ tipo: 'X' }).expect(400);
      await http().patch(`${REGRAS}/${INEXISTENTE}`).send(REGRA).expect(404);
      await (
        await leitor()
      )
        .post(REGRAS)
        .send({ ...REGRA, nome: 'outra' })
        .expect(403);
    });
  });
});
