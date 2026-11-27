import type { INestApplication } from '@nestjs/common';
import {
  motivoCancelamentoPageSchema,
  motivoCancelamentoSchema,
  type Permissao,
} from '@torres/shared';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit, expectNoAudit } from '../utils/expect-audit';
import { criarMotivo, criarMotivoOutro } from '../utils/motivos-cancelamento';

const BASE = '/api/configuracoes-gestao/motivos-cancelamento';
const ENTITY = 'MotivoCancelamento';
const PERMISSOES = [
  'configuracoes-gestao.motivos-cancelamento.ver',
  'configuracoes-gestao.motivos-cancelamento.criar',
  'configuracoes-gestao.motivos-cancelamento.editar',
  'configuracoes-gestao.motivos-cancelamento.excluir',
] as const;
const INEXISTENTE = '00000000-0000-4000-8000-000000000000';

describe('Motivos de Cancelamento (e2e)', () => {
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

  async function semPermissao(permissoes: readonly Permissao[] = []) {
    return comUsuario(app, await criarUsuarioTeste(app, { permissoes }));
  }

  describe('GET', () => {
    it('lista paginada por tipo e ordem, sem excluídos; filtros de tipo, situação e busca', async () => {
      await criarMotivo(prisma, 'CONSULTA', { nome: 'Paciente desistiu', ordem: 2 });
      await criarMotivo(prisma, 'CONSULTA', { nome: 'Erro de agendamento', ordem: 1 });
      await criarMotivo(prisma, 'CONTRATO', { nome: 'Valor', ordem: 1 });
      await criarMotivo(prisma, 'CONTRATO', { nome: 'Inativo', ordem: 2, ativo: false });
      await criarMotivo(prisma, 'CONTRATO', { nome: 'Excluído', deletedAt: new Date() });

      const todos = motivoCancelamentoPageSchema.parse((await http().get(BASE).expect(200)).body);
      expect(todos.data.map((m) => m.nome)).toEqual([
        'Erro de agendamento',
        'Paciente desistiu',
        'Valor',
        'Inativo',
      ]);
      expect(todos.meta.total).toBe(4);

      const consulta = await http().get(BASE).query({ tipo: 'CONSULTA' }).expect(200);
      expect(consulta.body.meta.total).toBe(2);
      const inativos = await http().get(BASE).query({ status: 'inativo' }).expect(200);
      expect(inativos.body.data.map((m: { nome: string }) => m.nome)).toEqual(['Inativo']);
      const busca = await http().get(BASE).query({ search: 'desist' }).expect(200);
      expect(busca.body.data.map((m: { nome: string }) => m.nome)).toEqual(['Paciente desistiu']);
    });

    it('400 para tipo inválido e para sort fora da whitelist', async () => {
      await http().get(BASE).query({ tipo: 'OUTRO' }).expect(400);
      const res = await http().get(BASE).query({ sort: 'deletedAt:asc' }).expect(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('403 sem permissão', async () => {
      await (await semPermissao()).get(BASE).expect(403);
    });
  });

  describe('GET /:id', () => {
    it('200, 404 e 400', async () => {
      const motivo = await criarMotivo(prisma, 'PROPOSTA', { nome: 'Valor' });

      const ok = await http().get(`${BASE}/${motivo.id}`).expect(200);
      expect(motivoCancelamentoSchema.parse(ok.body)).toMatchObject({
        nome: 'Valor',
        tipo: 'PROPOSTA',
      });
      const nao = await http().get(`${BASE}/${INEXISTENTE}`).expect(404);
      expect(nao.body.message).toBe('Motivo de cancelamento não encontrado');
      await http().get(`${BASE}/abc`).expect(400);
    });
  });

  describe('POST', () => {
    it('201 no fim da lista do tipo, com código gerado, e audita CREATE', async () => {
      await criarMotivo(prisma, 'PROPOSTA', { nome: 'Valor', ordem: 1 });
      await criarMotivoOutro(prisma, 'PROPOSTA');

      const res = await http()
        .post(BASE)
        .send({ tipo: 'PROPOSTA', nome: '  Preço alto  ' })
        .expect(201);

      const motivo = motivoCancelamentoSchema.parse(res.body);
      expect(motivo).toMatchObject({
        tipo: 'PROPOSTA',
        nome: 'Preço alto',
        codigo: 'preco_alto',
        exigeTexto: false,
        sistema: false,
        ordem: 2,
        ativo: true,
      });
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: ENTITY,
        entityId: motivo.id,
        before: null,
        after: { nome: 'Preço alto', tipo: 'PROPOSTA' },
        userId: usuario.id,
      });
    });

    it('400 sem nome ou tipo e com campo fora do formulário, sem auditar', async () => {
      const res = await http().post(BASE).send({ nome: '', extra: 1 }).expect(400);
      expect(res.body.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'nome', message: 'Nome é obrigatório.' }),
          expect.objectContaining({ field: 'tipo' }),
          expect.objectContaining({ field: 'extra', message: 'Campo não permitido' }),
        ]),
      );
      await expectNoAudit(prisma, { entity: ENTITY });
    });

    it('409 para nome repetido no mesmo tipo, mas aceita em outro tipo', async () => {
      await criarMotivo(prisma, 'CONTRATO', { nome: 'Valor', codigo: 'valor' });

      const repetido = await http()
        .post(BASE)
        .send({ tipo: 'CONTRATO', nome: 'VALOR' })
        .expect(409);
      expect(repetido.body.code).toBe('DUPLICATE');
      await http().post(BASE).send({ tipo: 'PROPOSTA', nome: 'Valor' }).expect(201);
      expect(await prisma.motivoCancelamento.count()).toBe(2);
    });

    it('403 sem permissão de criar', async () => {
      const leitor = await semPermissao(['configuracoes-gestao.motivos-cancelamento.ver']);
      await leitor.post(BASE).send({ tipo: 'CONTRATO', nome: 'Valor' }).expect(403);
    });
  });

  describe('PATCH /:id', () => {
    it('renomeia, exige texto e desativa, auditando UPDATE com before e after', async () => {
      const motivo = await criarMotivo(prisma, 'CONSULTA', { nome: 'Paciente desistiu' });

      const res = await http()
        .patch(`${BASE}/${motivo.id}`)
        .send({ nome: 'Desistência', exigeTexto: true, ativo: false })
        .expect(200);

      expect(motivoCancelamentoSchema.parse(res.body)).toMatchObject({
        nome: 'Desistência',
        codigo: 'desistencia',
        exigeTexto: true,
        ativo: false,
      });
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: ENTITY,
        entityId: motivo.id,
        before: { nome: 'Paciente desistiu', ativo: true },
        after: { nome: 'Desistência', ativo: false },
        userId: usuario.id,
      });
    });

    it('motivo de sistema não muda de nome, texto nem situação (422), sem auditar', async () => {
      const outro = await criarMotivoOutro(prisma, 'CONSULTA');

      for (const corpo of [{ nome: 'Diversos' }, { ativo: false }, { exigeTexto: false }]) {
        const res = await http().patch(`${BASE}/${outro.id}`).send(corpo).expect(422);
        expect(res.body.code).toBe('MOTIVO_CANCELAMENTO_SISTEMA');
      }
      await expectNoAudit(prisma, { entity: ENTITY });
    });

    it('409 para nome já usado no tipo; 400 sem campos; 404; 403', async () => {
      await criarMotivo(prisma, 'CONSULTA', {
        nome: 'Erro de agendamento',
        codigo: 'erro_de_agendamento',
      });
      const motivo = await criarMotivo(prisma, 'CONSULTA', { nome: 'Outro motivo' });

      await http().patch(`${BASE}/${motivo.id}`).send({ nome: 'erro de agendamento' }).expect(409);
      await http().patch(`${BASE}/${motivo.id}`).send({}).expect(400);
      await http().patch(`${BASE}/${INEXISTENTE}`).send({ ativo: false }).expect(404);
      const leitor = await semPermissao(['configuracoes-gestao.motivos-cancelamento.ver']);
      await leitor.patch(`${BASE}/${motivo.id}`).send({ ativo: false }).expect(403);
    });
  });

  describe('DELETE /:id', () => {
    it('exclusão lógica: some da lista, mantém o registro e audita DELETE', async () => {
      const motivo = await criarMotivo(prisma, 'CONSULTA', { nome: 'Paciente desistiu' });

      await http().delete(`${BASE}/${motivo.id}`).expect(200);

      expect(
        (await prisma.motivoCancelamento.findUniqueOrThrow({ where: { id: motivo.id } })).deletedAt,
      ).not.toBeNull();
      expect((await http().get(BASE).expect(200)).body.data).toEqual([]);
      await expectAudit(prisma, {
        action: 'DELETE',
        entity: ENTITY,
        entityId: motivo.id,
        before: { nome: 'Paciente desistiu', deletedAt: null },
        after: null,
        userId: usuario.id,
      });
      await http().delete(`${BASE}/${motivo.id}`).expect(404);
    });

    it('motivo de sistema não é excluído (422); 403 sem permissão', async () => {
      const outro = await criarMotivoOutro(prisma, 'CONTRATO');
      const res = await http().delete(`${BASE}/${outro.id}`).expect(422);
      expect(res.body.code).toBe('MOTIVO_CANCELAMENTO_SISTEMA');
      const leitor = await semPermissao(['configuracoes-gestao.motivos-cancelamento.ver']);
      await leitor.delete(`${BASE}/${outro.id}`).expect(403);
    });
  });

  describe('GET /api/cancelamentos/motivos (modal de cancelamento)', () => {
    const URL = '/api/cancelamentos/motivos';

    it('devolve só os ativos do tipo, na ordem, com a marca de texto obrigatório', async () => {
      await criarMotivo(prisma, 'COBRANCA', { nome: 'Lançamento duplicado', ordem: 1 });
      await criarMotivoOutro(prisma, 'COBRANCA');
      await criarMotivo(prisma, 'COBRANCA', { nome: 'Inativo', ativo: false });
      await criarMotivo(prisma, 'COBRANCA', { nome: 'Excluído', deletedAt: new Date() });
      await criarMotivo(prisma, 'CONSULTA', { nome: 'Outro tipo' });

      const res = await http().get(URL).query({ tipo: 'COBRANCA' }).expect(200);

      expect(res.body).toEqual([
        { id: expect.any(String), nome: 'Lançamento duplicado', exigeTexto: false },
        { id: expect.any(String), nome: 'Outro', exigeTexto: true },
      ]);
    });

    it('quem pode cancelar numa tela lê a lista; 400 sem tipo; 403 sem nenhuma dessas permissões', async () => {
      const recepcao = await semPermissao(['comercial-atendimento.agenda.ver']);
      await recepcao.get(URL).query({ tipo: 'CONSULTA' }).expect(200);
      await recepcao.get(URL).expect(400);
      await (
        await semPermissao(['comercial-atendimento.pacientes.ver'])
      )
        .get(URL)
        .query({ tipo: 'CONSULTA' })
        .expect(403);
    });
  });
});
