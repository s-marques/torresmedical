import type { INestApplication } from '@nestjs/common';
import { contratoSalaPageSchema, contratoSalaSchema } from '@torres/shared';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit, expectNoAudit } from '../utils/expect-audit';

const BASE = '/api/gestao-profissionais/contratos-sala';
const ENTITY = 'ContratoSala';
const PERMISSOES = [
  'gestao-profissionais.salas.ver',
  'gestao-profissionais.salas.criar',
  'gestao-profissionais.salas.editar',
  'gestao-profissionais.salas.excluir',
  'gestao-profissionais.salas.exportar',
  'configuracoes-gestao.dados-pessoais.exportar',
] as const;
const INEXISTENTE = '00000000-0000-4000-8000-000000000000';

describe('Contratos de salas (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let usuario: UsuarioTeste;
  let salaId: string;
  let profissionalId: string;
  let pacienteId: string;
  let formaId: string;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    usuario = await criarUsuarioTeste(app, { permissoes: PERMISSOES });
    salaId = (await prisma.sala.create({ data: { nome: 'Sala 7', numero: '07' } })).id;
    profissionalId = (await prisma.profissional.create({ data: { nome: 'Dra. Ana Teste' } })).id;
    pacienteId = (await prisma.paciente.create({ data: { nome: 'Bruno Cliente Teste' } })).id;
    formaId = (
      await prisma.formaPagamento.create({
        data: { nome: 'PIX', finalidade: 'RECEBER', tipo: 'PIX' },
      })
    ).id;
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => comUsuario(app, usuario);

  const mensal = (extra: Record<string, unknown> = {}) => ({
    modalidade: 'MENSAL',
    salaId,
    locatarioTipo: 'PROFISSIONAL',
    locatarioId: profissionalId,
    valorUnitario: 1500,
    dataInicio: '2026-10-01',
    ...extra,
  });

  function criarNoBanco(extra: Record<string, unknown> = {}) {
    return prisma.contratoSala.create({
      data: {
        salaId,
        modalidade: 'MENSAL',
        locatarioTipo: 'PROFISSIONAL',
        profissionalId,
        valorUnitario: 1500,
        dataInicio: new Date('2026-10-01T00:00:00Z'),
        ...extra,
      },
    });
  }

  describe('GET', () => {
    it('lista com sala, locatário, dias e total, ativos primeiro, sem os excluídos', async () => {
      await criarNoBanco({ status: 'ENCERRADO' });
      const turno = await criarNoBanco({
        modalidade: 'TURNO',
        locatarioTipo: 'CLIENTE',
        profissionalId: null,
        pacienteId,
        valorUnitario: 870,
        quantidadeMensal: 2,
        formaPagamentoId: formaId,
        dias: { create: [{ diaSemana: 2, inicio: '14:00', fim: '18:00' }] },
      });
      await criarNoBanco({ deletedAt: new Date() });

      const res = contratoSalaPageSchema.parse((await http().get(BASE).expect(200)).body);

      expect(res.data.map((c) => c.status)).toEqual(['ATIVO', 'ENCERRADO']);
      expect(res.data[0]).toMatchObject({
        id: turno.id,
        salaNome: 'Sala 7',
        locatarioNome: 'Bruno Cliente Teste',
        modalidade: 'TURNO',
        valorUnitario: 870,
        quantidadeMensal: 2,
        valorTotalMensal: 1740,
        formaPagamentoNome: 'PIX',
        dias: [{ diaSemana: 2, inicio: '14:00', fim: '18:00' }],
        pdfArquivoId: null,
      });
      expect(res.data[1]).toMatchObject({
        locatarioNome: 'Dra. Ana Teste',
        valorTotalMensal: 1500,
      });
    });

    it('filtra por status e sala; 400 para sort fora da whitelist; 403 sem permissão', async () => {
      const outraSala = await prisma.sala.create({ data: { nome: 'Sala 8' } });
      await criarNoBanco();
      await criarNoBanco({ status: 'CANCELADO', salaId: outraSala.id });

      const cancelados = await http().get(BASE).query({ status: 'CANCELADO' }).expect(200);
      expect(cancelados.body.data.map((c: { salaNome: string }) => c.salaNome)).toEqual(['Sala 8']);
      const daSala = await http().get(BASE).query({ salaId }).expect(200);
      expect(daSala.body.meta.total).toBe(1);
      await http().get(BASE).query({ sort: 'salaNome:asc' }).expect(400);
      const semPermissao = await criarUsuarioTeste(app, { permissoes: [] });
      await comUsuario(app, semPermissao).get(BASE).expect(403);
    });
  });

  describe('GET /:id', () => {
    it('200, 404 (inclusive excluído) e 400', async () => {
      const contrato = await criarNoBanco({ especialidade: 'Nutrição' });
      const excluido = await criarNoBanco({ deletedAt: new Date() });

      const ok = await http().get(`${BASE}/${contrato.id}`).expect(200);
      expect(contratoSalaSchema.parse(ok.body)).toMatchObject({ especialidade: 'Nutrição' });
      const nao = await http().get(`${BASE}/${INEXISTENTE}`).expect(404);
      expect(nao.body.message).toBe('Contrato não encontrado');
      await http().get(`${BASE}/${excluido.id}`).expect(404);
      await http().get(`${BASE}/abc`).expect(400);
    });
  });

  describe('POST', () => {
    it('201 com os padrões do modal (vencimento 10, Fixo, sem reajuste) e audita CREATE', async () => {
      const res = await http()
        .post(BASE)
        .send(
          mensal({
            especialidade: '  Nutrição ',
            dias: [{ diaSemana: 2, inicio: '08:00', fim: '12:00' }],
          }),
        )
        .expect(201);

      expect(contratoSalaSchema.parse(res.body)).toMatchObject({
        status: 'ATIVO',
        modalidade: 'MENSAL',
        locatarioTipo: 'PROFISSIONAL',
        locatarioId: profissionalId,
        especialidade: 'Nutrição',
        quantidadeMensal: null,
        valorTotalMensal: 1500,
        permuta: false,
        tipoReceita: 'FIXO',
        diaVencimento: 10,
        formaPagamentoId: null,
        indiceReajuste: 'NENHUM',
        dataInicio: '2026-10-01',
        dataFim: null,
        permiteIndicacao: true,
        participaEventos: false,
        dias: [{ diaSemana: 2, inicio: '08:00', fim: '12:00' }],
      });
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: ENTITY,
        entityId: res.body.id,
        before: null,
        after: { id: res.body.id, salaId, modalidade: 'MENSAL', locatarioId: profissionalId },
        userId: usuario.id,
      });
    });

    it('cliente como locatário grava o paciente; Por Turno e Hora Avulsa calculam o total', async () => {
      const turno = await http()
        .post(BASE)
        .send(
          mensal({
            modalidade: 'TURNO',
            locatarioTipo: 'CLIENTE',
            locatarioId: pacienteId,
            valorUnitario: 870,
            quantidadeMensal: 3,
            formaPagamentoId: formaId,
            indiceReajuste: 'IGPM',
            tipoReceita: 'MISTO',
            diaVencimento: 5,
          }),
        )
        .expect(201);
      expect(turno.body).toMatchObject({
        locatarioTipo: 'CLIENTE',
        locatarioId: pacienteId,
        locatarioNome: 'Bruno Cliente Teste',
        valorTotalMensal: 2610,
        formaPagamentoNome: 'PIX',
        indiceReajuste: 'IGPM',
        tipoReceita: 'MISTO',
        diaVencimento: 5,
      });
      const linha = await prisma.contratoSala.findUniqueOrThrow({ where: { id: turno.body.id } });
      expect(linha).toMatchObject({ pacienteId, profissionalId: null });

      const hora = await http()
        .post(BASE)
        .send(mensal({ modalidade: 'HORA', valorUnitario: 87.5, quantidadeMensal: 4 }))
        .expect(201);
      expect(hora.body.valorTotalMensal).toBe(350);
    });

    it('Mensal ignora a quantidade enviada', async () => {
      const res = await http()
        .post(BASE)
        .send(mensal({ quantidadeMensal: 5 }))
        .expect(201);
      expect(res.body.quantidadeMensal).toBeNull();
    });

    it('400 com mensagens por campo, sem auditar', async () => {
      const res = await http()
        .post(BASE)
        .send({
          modalidade: 'TURNO',
          valorUnitario: -1,
          dataInicio: '',
          indiceReajuste: 'XPTO',
          extra: 1,
        })
        .expect(400);

      expect(res.body.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'salaId', message: 'Sala é obrigatória.' }),
          expect.objectContaining({ field: 'locatarioId', message: 'Locatário é obrigatório.' }),
          expect.objectContaining({
            field: 'valorUnitario',
            message: 'O valor não pode ser negativo',
          }),
          expect.objectContaining({
            field: 'dataInicio',
            message: 'Data de início é obrigatória.',
          }),
          expect.objectContaining({
            field: 'indiceReajuste',
            message: 'Índice de reajuste inválido',
          }),
          expect.objectContaining({ field: 'extra', message: 'Campo não permitido' }),
        ]),
      );
      await expectNoAudit(prisma, { entity: ENTITY });
    });

    it('400 para turnos ausentes, fim antes do início e dias inválidos', async () => {
      const res = await http()
        .post(BASE)
        .send(
          mensal({
            modalidade: 'TURNO',
            dataFim: '2026-09-01',
            dias: [
              { diaSemana: 2, inicio: '14:00', fim: '12:00' },
              { diaSemana: 2, inicio: '08:00', fim: '09:00' },
            ],
          }),
        )
        .expect(400);

      expect(res.body.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'quantidadeMensal',
            message: 'Turnos contratados é obrigatório.',
          }),
          expect.objectContaining({
            field: 'dataFim',
            message: 'A data de fim não pode ser anterior à data de início',
          }),
          expect.objectContaining({
            field: 'dias.0.fim',
            message: 'A hora final deve ser depois da hora inicial',
          }),
          expect.objectContaining({ field: 'dias.1.diaSemana', message: 'Dia da semana repetido' }),
        ]),
      );
    });

    it('400 para sala, locatário e forma de pagamento inexistentes', async () => {
      const sala = await http()
        .post(BASE)
        .send(mensal({ salaId: INEXISTENTE }))
        .expect(400);
      expect(sala.body.details).toEqual([
        expect.objectContaining({ field: 'salaId', message: 'Sala inválida' }),
      ]);
      const prof = await http()
        .post(BASE)
        .send(mensal({ locatarioId: INEXISTENTE }))
        .expect(400);
      expect(prof.body.details).toEqual([
        expect.objectContaining({ field: 'locatarioId', message: 'Locatário inválido' }),
      ]);
      const paciente = await http()
        .post(BASE)
        .send(mensal({ locatarioTipo: 'CLIENTE', locatarioId: profissionalId }))
        .expect(400);
      expect(paciente.body.details[0].field).toBe('locatarioId');
      const forma = await http()
        .post(BASE)
        .send(mensal({ formaPagamentoId: INEXISTENTE }))
        .expect(400);
      expect(forma.body.details).toEqual([
        expect.objectContaining({
          field: 'formaPagamentoId',
          message: 'Forma de pagamento inválida',
        }),
      ]);
      await expectNoAudit(prisma, { entity: ENTITY });
    });

    it('403 sem permissão de criar', async () => {
      const leitor = await criarUsuarioTeste(app, {
        permissoes: ['gestao-profissionais.salas.ver'],
      });
      await comUsuario(app, leitor).post(BASE).send(mensal()).expect(403);
      await expectNoAudit(prisma, { entity: ENTITY });
    });
  });

  describe('PATCH /:id', () => {
    it('200, troca modalidade e substitui os dias, auditando UPDATE', async () => {
      const contrato = await criarNoBanco({
        dias: { create: [{ diaSemana: 2, inicio: '08:00', fim: '12:00' }] },
      });

      const res = await http()
        .patch(`${BASE}/${contrato.id}`)
        .send(
          mensal({
            modalidade: 'HORA',
            valorUnitario: 80,
            quantidadeMensal: 10,
            dias: [{ diaSemana: 4, inicio: '14:00', fim: '18:00' }],
          }),
        )
        .expect(200);

      expect(res.body).toMatchObject({
        modalidade: 'HORA',
        valorTotalMensal: 800,
        dias: [{ diaSemana: 4, inicio: '14:00', fim: '18:00' }],
      });
      expect(await prisma.contratoSalaDia.count({ where: { contratoId: contrato.id } })).toBe(1);
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: ENTITY,
        entityId: contrato.id,
        before: { modalidade: 'MENSAL' },
        after: { modalidade: 'HORA' },
        userId: usuario.id,
      });
    });

    it('400, 404 e 403, sem auditar', async () => {
      const contrato = await criarNoBanco();
      await http().patch(`${BASE}/${contrato.id}`).send({}).expect(400);
      await http().patch(`${BASE}/${INEXISTENTE}`).send(mensal()).expect(404);
      const leitor = await criarUsuarioTeste(app, {
        permissoes: ['gestao-profissionais.salas.ver'],
      });
      await comUsuario(app, leitor).patch(`${BASE}/${contrato.id}`).send(mensal()).expect(403);
      await expectNoAudit(prisma, { entity: ENTITY });
    });
  });

  describe('PUT /:id/pdf', () => {
    function criarArquivo(uso: string) {
      return prisma.arquivo.create({
        data: {
          uso,
          nomeOriginal: 'contrato.pdf',
          contentType: 'application/pdf',
          tamanho: 10,
          chave: `${uso}/${Math.random()}`,
        },
      });
    }

    it('grava o PDF, rejeita arquivo de outro uso e remove com null', async () => {
      const contrato = await criarNoBanco();
      const pdf = await criarArquivo('contrato-sala');
      const outro = await criarArquivo('logo-receita');

      const ok = await http()
        .put(`${BASE}/${contrato.id}/pdf`)
        .send({ arquivoId: pdf.id })
        .expect(200);
      expect(ok.body).toMatchObject({ pdfArquivoId: pdf.id, pdfNome: 'contrato.pdf' });
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: ENTITY,
        entityId: contrato.id,
        before: { pdfArquivoId: null },
        after: { pdfArquivoId: pdf.id },
        userId: usuario.id,
      });

      const uso = await http()
        .put(`${BASE}/${contrato.id}/pdf`)
        .send({ arquivoId: outro.id })
        .expect(400);
      expect(uso.body.code).toBe('ARQUIVO_USO_INVALIDO');

      const removido = await http()
        .put(`${BASE}/${contrato.id}/pdf`)
        .send({ arquivoId: null })
        .expect(200);
      expect(removido.body).toMatchObject({ pdfArquivoId: null, pdfNome: null });
    });

    it('404 para contrato inexistente, 400 sem corpo e 403 sem permissão de editar', async () => {
      const contrato = await criarNoBanco();
      await http().put(`${BASE}/${INEXISTENTE}/pdf`).send({ arquivoId: null }).expect(404);
      await http().put(`${BASE}/${contrato.id}/pdf`).send({}).expect(400);
      const leitor = await criarUsuarioTeste(app, {
        permissoes: ['gestao-profissionais.salas.ver'],
      });
      await comUsuario(app, leitor)
        .put(`${BASE}/${contrato.id}/pdf`)
        .send({ arquivoId: null })
        .expect(403);
    });
  });

  describe.each([
    {
      acao: 'encerrar',
      status: 'ENCERRADO',
      campo: 'observacao',
      obrigatorio: 'Data de encerramento é obrigatória.',
    },
    {
      acao: 'cancelar',
      status: 'CANCELADO',
      campo: 'motivo',
      obrigatorio: 'Data de cancelamento é obrigatória.',
    },
  ])('POST /:id/$acao', ({ acao, status, campo, obrigatorio }) => {
    it(`passa o contrato ativo para ${status}, grava a data e o texto e audita UPDATE`, async () => {
      const contrato = await criarNoBanco();

      const res = await http()
        .post(`${BASE}/${contrato.id}/${acao}`)
        .send({ data: '2026-10-22', [campo]: '  Fim do prazo ' })
        .expect(200);

      expect(contratoSalaSchema.parse(res.body)).toMatchObject({
        status,
        encerradoEm: '2026-10-22',
        motivoEncerramento: 'Fim do prazo',
      });
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: ENTITY,
        entityId: contrato.id,
        before: { status: 'ATIVO', encerradoEm: null },
        after: { status, encerradoEm: '2026-10-22' },
        userId: usuario.id,
      });
      const lista = await http().get(BASE).expect(200);
      expect(lista.body.data[0]).toMatchObject({ status, encerradoEm: '2026-10-22' });
    });

    it('o texto é opcional', async () => {
      const contrato = await criarNoBanco();
      const res = await http()
        .post(`${BASE}/${contrato.id}/${acao}`)
        .send({ data: '2026-10-22' })
        .expect(200);
      expect(res.body.motivoEncerramento).toBeNull();
    });

    it('400 sem data ou com campo fora do formulário, sem auditar nem mudar o status', async () => {
      const contrato = await criarNoBanco();
      const res = await http()
        .post(`${BASE}/${contrato.id}/${acao}`)
        .send({ data: '', extra: 1 })
        .expect(400);
      expect(res.body.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'data', message: obrigatorio }),
          expect.objectContaining({ field: 'extra', message: 'Campo não permitido' }),
        ]),
      );
      await expectNoAudit(prisma, { entity: ENTITY });
      expect(
        (await prisma.contratoSala.findUniqueOrThrow({ where: { id: contrato.id } })).status,
      ).toBe('ATIVO');
    });

    it('409 quando o contrato já foi encerrado ou cancelado', async () => {
      const contrato = await criarNoBanco({ status: 'CANCELADO' });
      const res = await http()
        .post(`${BASE}/${contrato.id}/${acao}`)
        .send({ data: '2026-10-22' })
        .expect(409);
      expect(res.body.code).toBe('CONTRATO_NAO_ATIVO');
      await expectNoAudit(prisma, { entity: ENTITY });
    });

    it('404 para inexistente ou excluído, 400 para id inválido e 403 sem permissão de editar', async () => {
      const excluido = await criarNoBanco({ deletedAt: new Date() });
      await http().post(`${BASE}/${INEXISTENTE}/${acao}`).send({ data: '2026-10-22' }).expect(404);
      await http().post(`${BASE}/${excluido.id}/${acao}`).send({ data: '2026-10-22' }).expect(404);
      await http().post(`${BASE}/abc/${acao}`).send({ data: '2026-10-22' }).expect(400);
      const contrato = await criarNoBanco();
      const leitor = await criarUsuarioTeste(app, {
        permissoes: ['gestao-profissionais.salas.ver'],
      });
      await comUsuario(app, leitor)
        .post(`${BASE}/${contrato.id}/${acao}`)
        .send({ data: '2026-10-22' })
        .expect(403);
    });
  });

  describe('DELETE /:id', () => {
    it('exclusão lógica: 200, audita DELETE, some da listagem e libera a sala para excluir', async () => {
      const contrato = await criarNoBanco();
      await http().delete(`/api/gestao-profissionais/salas/${salaId}`).expect(409);

      await http().delete(`${BASE}/${contrato.id}`).expect(200);

      await expectAudit(prisma, {
        action: 'DELETE',
        entity: ENTITY,
        entityId: contrato.id,
        before: { modalidade: 'MENSAL', deletedAt: null },
        after: null,
        userId: usuario.id,
      });
      expect(
        (await prisma.contratoSala.findUniqueOrThrow({ where: { id: contrato.id } })).deletedAt,
      ).not.toBeNull();
      expect((await http().get(BASE).expect(200)).body.data).toEqual([]);
      await http().delete(`${BASE}/${contrato.id}`).expect(404);
      await http().delete(`/api/gestao-profissionais/salas/${salaId}`).expect(200);
    });

    it('404 para inexistente e 403 sem permissão de excluir', async () => {
      await http().delete(`${BASE}/${INEXISTENTE}`).expect(404);
      const contrato = await criarNoBanco();
      const editor = await criarUsuarioTeste(app, {
        permissoes: ['gestao-profissionais.salas.editar'],
      });
      await comUsuario(app, editor).delete(`${BASE}/${contrato.id}`).expect(403);
      await expectNoAudit(prisma, { entity: ENTITY });
    });
  });

  describe('GET /export', () => {
    it('exporta em Excel e audita EXPORT; 403 sem permissão de exportar', async () => {
      await criarNoBanco({ dias: { create: [{ diaSemana: 2, inicio: '14:00', fim: '18:00' }] } });

      const res = await http().get(`${BASE}/export`).query({ format: 'xlsx' }).expect(200);
      expect(res.headers['content-type']).toContain('spreadsheetml');
      expect(res.headers['content-disposition']).toContain('contratos-salas');
      expect(await prisma.auditLog.count({ where: { entity: ENTITY, action: 'EXPORT' } })).toBe(1);

      const leitor = await criarUsuarioTeste(app, {
        permissoes: ['gestao-profissionais.salas.ver'],
      });
      await comUsuario(app, leitor).get(`${BASE}/export`).query({ format: 'xlsx' }).expect(403);
      await http().get(`${BASE}/export`).query({ format: 'csv' }).expect(400);
    });
  });
});
