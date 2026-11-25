import type { INestApplication } from '@nestjs/common';
import {
  apiErrorSchema,
  atendimentoSchema,
  modeloProntuarioPageSchema,
  modeloProntuarioSchema,
  type Permissao,
} from '@torres/shared';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit, expectNoAudit } from '../utils/expect-audit';

const BASE = '/api/consultorio-assistencial/modelos-prontuario';
const PRONTUARIOS = '/api/consultorio-assistencial/prontuarios';
const CLINICAS: readonly Permissao[] = [
  'consultorio-assistencial.prontuarios.ver',
  'consultorio-assistencial.prontuarios.criar',
  'consultorio-assistencial.prontuarios.editar',
  'consultorio-assistencial.prontuarios.excluir',
];
const PADRAO: Permissao = 'consultorio-assistencial.modelos-prontuario.gerir';
const INEXISTENTE = '00000000-0000-4000-8000-000000000000';

const campo = (extra: Record<string, unknown> = {}) => ({
  chave: 'queixa',
  rotulo: 'Queixa principal',
  tipo: 'TEXTO',
  obrigatorio: true,
  ...extra,
});

const secoes = (...campos: Record<string, unknown>[]) => [{ titulo: 'Avaliação', campos }];

/** Issue #152: modelos de prontuário por profissão e especialidade, versionados. */
describe('Modelos de prontuário (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let medicoA: UsuarioTeste;
  let medicoB: UsuarioTeste;
  let gerencia: UsuarioTeste;
  let semPermissao: UsuarioTeste;
  let profA: { id: string };
  let profB: { id: string };
  let paciente: { id: string };

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    profA = await prisma.profissional.create({ data: { nome: 'Psicóloga Fictícia A' } });
    profB = await prisma.profissional.create({ data: { nome: 'Dr. Fictício B' } });
    paciente = await prisma.paciente.create({ data: { nome: 'Paciente Fictício' } });
    medicoA = await criarUsuarioTeste(app, {
      permissoes: CLINICAS,
      escopoDados: 'PROFISSIONAIS_VINCULADOS',
      profissionalIds: [profA.id],
    });
    medicoB = await criarUsuarioTeste(app, {
      permissoes: CLINICAS,
      escopoDados: 'PROFISSIONAIS_VINCULADOS',
      profissionalIds: [profB.id],
    });
    gerencia = await criarUsuarioTeste(app, { permissoes: [...CLINICAS, PADRAO] });
    semPermissao = await criarUsuarioTeste(app, { permissoes: [] });
  });

  afterAll(async () => {
    await app.close();
  });

  const proprio = (extra: Record<string, unknown> = {}) => ({
    nome: 'Anamnese psicológica',
    profissao: 'PSICOLOGO',
    especialidade: 'Psicologia infantil',
    profissionalId: profA.id,
    secoes: secoes(campo(), campo({ chave: 'humor', rotulo: 'Humor', tipo: 'ESCALA' })),
    ...extra,
  });

  async function criarProprio(usuario = medicoA, extra: Record<string, unknown> = {}) {
    const res = await comUsuario(app, usuario).post(BASE).send(proprio(extra)).expect(201);
    return modeloProntuarioSchema.parse(res.body);
  }

  async function criarPadrao(extra: Record<string, unknown> = {}) {
    const corpo: Record<string, unknown> = proprio(extra);
    delete corpo.profissionalId;
    const res = await comUsuario(app, gerencia).post(`${BASE}/padrao`).send(corpo).expect(201);
    return modeloProntuarioSchema.parse(res.body);
  }

  function erro(body: unknown) {
    return apiErrorSchema.parse(body);
  }

  describe('POST (modelo do próprio profissional)', () => {
    it('cria a versão 1 e audita', async () => {
      const modelo = await criarProprio();
      expect(modelo).toMatchObject({
        nome: 'Anamnese psicológica',
        profissao: 'PSICOLOGO',
        padrao: false,
        profissionalNome: 'Psicóloga Fictícia A',
        versao: 1,
        ativo: true,
      });
      expect(modelo.secoes[0]?.campos[1]).toMatchObject({ min: 0, max: 10 });
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: 'ModeloProntuario',
        entityId: modelo.id,
        before: null,
        after: { nome: 'Anamnese psicológica', profissionalId: profA.id },
        userId: medicoA.id,
      });
    });

    it('400 com campos inválidos (lista sem opções, chave repetida, sem seções)', async () => {
      const lista = await comUsuario(app, medicoA)
        .post(BASE)
        .send(proprio({ secoes: secoes(campo({ chave: 'tipo', tipo: 'LISTA', opcoes: ['A'] })) }))
        .expect(400);
      expect(erro(lista.body).code).toBe('VALIDATION_ERROR');
      await comUsuario(app, medicoA)
        .post(BASE)
        .send(proprio({ secoes: secoes(campo(), campo()) }))
        .expect(400);
      await comUsuario(app, medicoA)
        .post(BASE)
        .send(proprio({ secoes: [] }))
        .expect(400);
      await comUsuario(app, medicoA)
        .post(BASE)
        .send(proprio({ nome: '' }))
        .expect(400);
      await expectNoAudit(prisma, { entity: 'ModeloProntuario' });
    });

    it('403 sem permissão ou para profissional fora do escopo', async () => {
      await comUsuario(app, semPermissao).post(BASE).send(proprio()).expect(403);
      await comUsuario(app, medicoB).post(BASE).send(proprio()).expect(403);
      await expectNoAudit(prisma, { entity: 'ModeloProntuario' });
    });

    it('404 para profissional inexistente (administração sem restrição)', async () => {
      await comUsuario(app, gerencia)
        .post(BASE)
        .send(proprio({ profissionalId: INEXISTENTE }))
        .expect(404);
    });
  });

  describe('modelo padrão da clínica', () => {
    it('só quem tem a permissão cria, altera e exclui', async () => {
      const corpo: Record<string, unknown> = proprio();
      delete corpo.profissionalId;
      await comUsuario(app, medicoA).post(`${BASE}/padrao`).send(corpo).expect(403);

      const padrao = await criarPadrao();
      expect(padrao).toMatchObject({ padrao: true, profissionalId: null, versao: 1 });
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: 'ModeloProntuario',
        entityId: padrao.id,
        after: { nome: 'Anamnese psicológica', profissionalId: null },
        userId: gerencia.id,
      });

      await comUsuario(app, medicoA)
        .patch(`${BASE}/padrao/${padrao.id}`)
        .send({ nome: 'Outro' })
        .expect(403);
      await comUsuario(app, medicoA).delete(`${BASE}/padrao/${padrao.id}`).expect(403);

      await comUsuario(app, gerencia)
        .patch(`${BASE}/padrao/${padrao.id}`)
        .send({ ativo: false })
        .expect(200);
      await comUsuario(app, gerencia).delete(`${BASE}/padrao/${padrao.id}`).expect(200);
      await expectAudit(prisma, {
        action: 'DELETE',
        entity: 'ModeloProntuario',
        entityId: padrao.id,
        userId: gerencia.id,
      });
    });

    it('o profissional usa o padrão, mas não o altera pela rota própria (404)', async () => {
      const padrao = await criarPadrao();
      await comUsuario(app, medicoA).patch(`${BASE}/${padrao.id}`).send({ nome: 'x' }).expect(404);
      await comUsuario(app, medicoA).delete(`${BASE}/${padrao.id}`).expect(404);
      await comUsuario(app, gerencia)
        .patch(`${BASE}/padrao/${(await criarProprio()).id}`)
        .send({ nome: 'x' })
        .expect(404);
    });
  });

  describe('GET', () => {
    it('lista o padrão e só os modelos dos profissionais do escopo, com filtros', async () => {
      const padrao = await criarPadrao({ nome: 'Padrão médico', profissao: 'MEDICO' });
      const deA = await criarProprio(medicoA);
      const deB = await criarProprio(medicoB, { profissionalId: profB.id, nome: 'Do Dr. B' });

      const res = await comUsuario(app, medicoA).get(BASE).expect(200);
      const ids = modeloProntuarioPageSchema.parse(res.body).data.map((m) => m.id);
      expect(ids.sort()).toEqual([padrao.id, deA.id].sort());

      const tudo = await comUsuario(app, gerencia).get(BASE).expect(200);
      expect(modeloProntuarioPageSchema.parse(tudo.body).meta.total).toBe(3);

      const filtros = await comUsuario(app, gerencia)
        .get(BASE)
        .query({ profissao: 'MEDICO', tipo: 'PADRAO', search: 'médico' })
        .expect(200);
      expect(modeloProntuarioPageSchema.parse(filtros.body).data.map((m) => m.id)).toEqual([
        padrao.id,
      ]);

      const doProfissional = await comUsuario(app, gerencia)
        .get(BASE)
        .query({ profissionalId: profB.id })
        .expect(200);
      expect(
        modeloProntuarioPageSchema
          .parse(doProfissional.body)
          .data.map((m) => m.id)
          .sort(),
      ).toEqual([padrao.id, deB.id].sort());

      await comUsuario(app, medicoA).get(BASE).query({ profissionalId: profB.id }).expect(403);
      await comUsuario(app, medicoA).get(BASE).query({ sort: 'invalido:asc' }).expect(400);
      await comUsuario(app, semPermissao).get(BASE).expect(403);
    });

    it('detalhe: 200 no escopo, 403 fora dele, 404 inexistente', async () => {
      const deB = await criarProprio(medicoB, { profissionalId: profB.id });
      await comUsuario(app, medicoB).get(`${BASE}/${deB.id}`).expect(200);
      await comUsuario(app, medicoA).get(`${BASE}/${deB.id}`).expect(403);
      await comUsuario(app, medicoA).get(`${BASE}/${INEXISTENTE}`).expect(404);
      await comUsuario(app, medicoA).get(`${BASE}/nao-e-uuid`).expect(400);
    });
  });

  describe('PATCH e DELETE (modelo próprio)', () => {
    it('mudar as seções cria a versão 2; só ativar/desativar não cria', async () => {
      const modelo = await criarProprio();
      const res = await comUsuario(app, medicoA)
        .patch(`${BASE}/${modelo.id}`)
        .send({ secoes: secoes(campo({ chave: 'motivo', rotulo: 'Motivo' })) })
        .expect(200);
      expect(modeloProntuarioSchema.parse(res.body)).toMatchObject({ versao: 2 });
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: 'ModeloProntuario',
        entityId: modelo.id,
        before: { versaoAtual: 1 },
        after: { versao: 2 },
        userId: medicoA.id,
      });

      // Reenviar as mesmas seções (gravadas em jsonb) não cria versão.
      const igual = await comUsuario(app, medicoA)
        .patch(`${BASE}/${modelo.id}`)
        .send({ secoes: modeloProntuarioSchema.parse(res.body).secoes })
        .expect(200);
      expect(modeloProntuarioSchema.parse(igual.body).versao).toBe(2);

      const inativo = await comUsuario(app, medicoA)
        .patch(`${BASE}/${modelo.id}`)
        .send({ ativo: false })
        .expect(200);
      expect(modeloProntuarioSchema.parse(inativo.body)).toMatchObject({
        versao: 2,
        ativo: false,
      });
      expect(await prisma.modeloProntuarioVersao.count({ where: { modeloId: modelo.id } })).toBe(2);
    });

    it('400 inválido; 403 fora do escopo; 404 inexistente', async () => {
      const modelo = await criarProprio();
      await comUsuario(app, medicoA)
        .patch(`${BASE}/${modelo.id}`)
        .send({ secoes: [{ titulo: 'Vazia', campos: [] }] })
        .expect(400);
      await comUsuario(app, medicoB).patch(`${BASE}/${modelo.id}`).send({ nome: 'x' }).expect(403);
      await comUsuario(app, medicoB).delete(`${BASE}/${modelo.id}`).expect(403);
      await comUsuario(app, medicoA)
        .patch(`${BASE}/${INEXISTENTE}`)
        .send({ nome: 'x' })
        .expect(404);
      await comUsuario(app, medicoA).delete(`${BASE}/${INEXISTENTE}`).expect(404);
    });

    it('exclui logicamente, audita e some da lista', async () => {
      const modelo = await criarProprio();
      await comUsuario(app, medicoA).delete(`${BASE}/${modelo.id}`).expect(200);
      await expectAudit(prisma, {
        action: 'DELETE',
        entity: 'ModeloProntuario',
        entityId: modelo.id,
        before: { nome: 'Anamnese psicológica' },
        userId: medicoA.id,
      });
      const lista = await comUsuario(app, medicoA).get(BASE).expect(200);
      expect(modeloProntuarioPageSchema.parse(lista.body).data).toHaveLength(0);
      await comUsuario(app, medicoA).get(`${BASE}/${modelo.id}`).expect(404);
    });
  });

  describe('uso no atendimento', () => {
    const atendimentos = () => `${PRONTUARIOS}/${paciente.id}/atendimentos`;

    it('alterar o modelo não altera os atendimentos já registrados', async () => {
      const modelo = await criarProprio();
      const criado = await comUsuario(app, medicoA)
        .post(atendimentos())
        .send({
          profissionalId: profA.id,
          modeloId: modelo.id,
          respostas: { queixa: 'Ansiedade', humor: '7' },
        })
        .expect(201);
      const antigo = atendimentoSchema.parse(criado.body);
      expect(antigo.modelo).toMatchObject({ nome: 'Anamnese psicológica', versao: 1 });
      expect(antigo.respostas).toEqual({ queixa: 'Ansiedade', humor: 7 });

      // O profissional troca o nome e as seções do modelo.
      await comUsuario(app, medicoA)
        .patch(`${BASE}/${modelo.id}`)
        .send({
          nome: 'Anamnese revisada',
          secoes: secoes(campo({ chave: 'motivo', rotulo: 'Motivo' })),
        })
        .expect(200);

      const lista = await comUsuario(app, medicoA).get(atendimentos()).expect(200);
      const registrado = atendimentoSchema.parse(lista.body.data[0]);
      expect(registrado.id).toBe(antigo.id);
      expect(registrado.modelo).toEqual(antigo.modelo);
      expect(registrado.respostas).toEqual({ queixa: 'Ansiedade', humor: 7 });

      // Um atendimento novo já usa a versão 2.
      const novo = await comUsuario(app, medicoA)
        .post(atendimentos())
        .send({ profissionalId: profA.id, modeloId: modelo.id, respostas: { motivo: 'Retorno' } })
        .expect(201);
      expect(atendimentoSchema.parse(novo.body).modelo).toMatchObject({
        nome: 'Anamnese revisada',
        versao: 2,
      });

      // E o modelo excluído continua visível nos atendimentos que o usaram.
      await comUsuario(app, medicoA).delete(`${BASE}/${modelo.id}`).expect(200);
      const depois = await comUsuario(app, medicoA).get(atendimentos()).expect(200);
      expect(
        depois.body.data.map((a: { modelo: { versao: number } }) => a.modelo.versao).sort(),
      ).toEqual([1, 2]);
    });

    it('400 com resposta inválida, modelo de outro profissional ou inativo', async () => {
      const modelo = await criarProprio();
      const invalida = await comUsuario(app, medicoA)
        .post(atendimentos())
        .send({
          profissionalId: profA.id,
          modeloId: modelo.id,
          status: 'FINALIZADO',
          respostas: { humor: '11' },
        })
        .expect(400);
      const campos = erro(invalida.body).details?.map((d) => d.field);
      expect(campos).toEqual(expect.arrayContaining(['respostas.humor', 'respostas.queixa']));

      await comUsuario(app, medicoA)
        .post(atendimentos())
        .send({ profissionalId: profA.id, respostas: { queixa: 'x' } })
        .expect(400);

      const deB = await criarProprio(medicoB, { profissionalId: profB.id });
      await comUsuario(app, medicoA)
        .post(atendimentos())
        .send({ profissionalId: profA.id, modeloId: deB.id })
        .expect(400);

      await comUsuario(app, medicoA).patch(`${BASE}/${modelo.id}`).send({ ativo: false });
      await comUsuario(app, medicoA)
        .post(atendimentos())
        .send({ profissionalId: profA.id, modeloId: modelo.id })
        .expect(400);
      expect(await prisma.atendimento.count()).toBe(0);
    });

    it('edita as respostas enquanto não assinado e audita antes/depois', async () => {
      const modelo = await criarProprio();
      const criado = await comUsuario(app, medicoA)
        .post(atendimentos())
        .send({ profissionalId: profA.id, modeloId: modelo.id, respostas: { queixa: 'Antes' } })
        .expect(201);
      const id = (criado.body as { id: string }).id;
      const res = await comUsuario(app, medicoA)
        .patch(`${atendimentos()}/${id}`)
        .send({ respostas: { queixa: 'Depois', humor: 5 } })
        .expect(200);
      expect(atendimentoSchema.parse(res.body).respostas).toEqual({ queixa: 'Depois', humor: 5 });
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: 'Atendimento',
        entityId: id,
        before: { respostas: { queixa: 'Antes' } },
        after: { respostas: { queixa: 'Depois', humor: 5 } },
        userId: medicoA.id,
      });
    });
  });
});
