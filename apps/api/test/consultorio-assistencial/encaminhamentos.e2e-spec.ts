import type { INestApplication } from '@nestjs/common';
import {
  encaminhamentoPageSchema,
  encaminhamentoProfissionaisSchema,
  encaminhamentoRelatorioPageSchema,
  encaminhamentoSchema,
} from '@torres/shared';
import { Workbook } from 'exceljs';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit, expectNoAudit } from '../utils/expect-audit';
import { respostaBinaria } from '../utils/resposta-binaria';

const BASE = '/api/consultorio-assistencial/encaminhamentos';
const ENTITY = 'Encaminhamento';
const PERMISSOES = [
  'consultorio-assistencial.encaminhamentos.ver',
  'consultorio-assistencial.encaminhamentos.criar',
  'consultorio-assistencial.encaminhamentos.editar',
  'consultorio-assistencial.encaminhamentos.excluir',
  'consultorio-assistencial.encaminhamentos.exportar',
] as const;
const INEXISTENTE = '00000000-0000-4000-8000-000000000000';

describe('Encaminhamentos (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let usuario: UsuarioTeste;
  let salaId: string;
  let origemId: string;
  let destinoId: string;
  let semContratoId: string;
  let pacienteId: string;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    usuario = await criarUsuarioTeste(app, { permissoes: PERMISSOES });
    salaId = (await prisma.sala.create({ data: { nome: 'Sala 1' } })).id;
    origemId = (await prisma.profissional.create({ data: { nome: 'Dr. Origem Teste' } })).id;
    destinoId = (await prisma.profissional.create({ data: { nome: 'Dra. Destino Teste' } })).id;
    semContratoId = (await prisma.profissional.create({ data: { nome: 'Dr. Sem Indicacao' } })).id;
    pacienteId = (await prisma.paciente.create({ data: { nome: 'Paciente Encaminhado' } })).id;
    await contrato(origemId);
    await contrato(destinoId);
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => comUsuario(app, usuario);

  function contrato(profissionalId: string, extra: Record<string, unknown> = {}) {
    return prisma.contratoSala.create({
      data: {
        salaId,
        modalidade: 'MENSAL',
        locatarioTipo: 'PROFISSIONAL',
        profissionalId,
        valorUnitario: 1000,
        dataInicio: new Date('2026-01-01T00:00:00Z'),
        permiteIndicacao: true,
        ...extra,
      },
    });
  }

  const corpo = (extra: Record<string, unknown> = {}) => ({
    pacienteId,
    origemProfissionalId: origemId,
    destinoProfissionalId: destinoId,
    data: '2026-11-10',
    motivo: 'Avaliação especializada',
    ...extra,
  });

  function noBanco(extra: Record<string, unknown> = {}) {
    return prisma.encaminhamento.create({
      data: {
        pacienteId,
        origemProfissionalId: origemId,
        destinoProfissionalId: destinoId,
        data: new Date('2026-11-10T00:00:00Z'),
        motivo: 'Avaliação',
        ...extra,
      },
    });
  }

  describe('POST', () => {
    it('201: registra, devolve ENCAMINHADO com os nomes e audita CREATE', async () => {
      const res = await http().post(BASE).send(corpo()).expect(201);

      expect(encaminhamentoSchema.parse(res.body)).toMatchObject({
        pacienteNome: 'Paciente Encaminhado',
        origemProfissionalNome: 'Dr. Origem Teste',
        destinoProfissionalNome: 'Dra. Destino Teste',
        data: '2026-11-10',
        motivo: 'Avaliação especializada',
        situacao: 'ENCAMINHADO',
      });
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: ENTITY,
        entityId: res.body.id,
        before: null,
        after: { pacienteId, origemProfissionalId: origemId, destinoProfissionalId: destinoId },
        userId: usuario.id,
      });
    });

    it('sem data grava hoje e sem motivo grava nulo', async () => {
      const res = await http()
        .post(BASE)
        .send({ ...corpo(), data: null, motivo: '' })
        .expect(201);
      expect(res.body.motivo).toBeNull();
      expect(res.body.data).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('400 com o formulário vazio e com origem igual ao destino, sem auditar', async () => {
      const vazio = await http().post(BASE).send({}).expect(400);
      expect(vazio.body.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'pacienteId', message: 'Paciente é obrigatório.' }),
          expect.objectContaining({
            field: 'origemProfissionalId',
            message: 'Profissional de origem é obrigatório.',
          }),
          expect.objectContaining({
            field: 'destinoProfissionalId',
            message: 'Profissional de destino é obrigatório.',
          }),
        ]),
      );
      const igual = await http()
        .post(BASE)
        .send(corpo({ destinoProfissionalId: origemId }))
        .expect(400);
      expect(igual.body.details).toEqual([
        expect.objectContaining({
          field: 'destinoProfissionalId',
          message: 'Origem e destino devem ser profissionais diferentes',
        }),
      ]);
      await expectNoAudit(prisma, { entity: ENTITY });
    });

    it('422: o destino sem contrato que permita indicação não é aceito', async () => {
      const semIndicacao = await prisma.profissional.create({ data: { nome: 'Dr. Contrato Sem' } });
      await contrato(semIndicacao.id, { permiteIndicacao: false });

      for (const destino of [semContratoId, semIndicacao.id]) {
        const res = await http()
          .post(BASE)
          .send(corpo({ destinoProfissionalId: destino }))
          .expect(422);
        expect(res.body.code).toBe('DESTINO_SEM_INDICACAO');
      }
      await expectNoAudit(prisma, { entity: ENTITY });
    });

    it('422: a origem sem contrato que permita indicação não é aceita; contrato encerrado não vale', async () => {
      const res = await http()
        .post(BASE)
        .send(corpo({ origemProfissionalId: semContratoId }))
        .expect(422);
      expect(res.body.code).toBe('ORIGEM_SEM_INDICACAO');

      await prisma.contratoSala.updateMany({
        where: { profissionalId: destinoId },
        data: { status: 'CANCELADO' },
      });
      const encerrado = await http().post(BASE).send(corpo()).expect(422);
      expect(encerrado.body.code).toBe('DESTINO_SEM_INDICACAO');
    });

    it('404 para paciente, profissional e especialidade inexistentes', async () => {
      await http()
        .post(BASE)
        .send(corpo({ pacienteId: INEXISTENTE }))
        .expect(404);
      await http()
        .post(BASE)
        .send(corpo({ destinoProfissionalId: INEXISTENTE }))
        .expect(404);
      await http()
        .post(BASE)
        .send(corpo({ especialidadeId: INEXISTENTE }))
        .expect(404);
    });

    it('403 sem a permissão criar', async () => {
      const so = await criarUsuarioTeste(app, {
        permissoes: ['consultorio-assistencial.encaminhamentos.ver'],
      });
      await comUsuario(app, so).post(BASE).send(corpo()).expect(403);
    });
  });

  describe('GET (listagem)', () => {
    it('lista com meta, mais recente primeiro, sem excluídos', async () => {
      await noBanco({ data: new Date('2026-11-01T00:00:00Z') });
      await noBanco({ data: new Date('2026-11-09T00:00:00Z'), motivo: 'Segundo' });
      await noBanco({ deletedAt: new Date() });

      const res = await http().get(BASE).expect(200);
      const page = encaminhamentoPageSchema.parse(res.body);
      expect(page.data.map((e) => e.data)).toEqual(['2026-11-09', '2026-11-01']);
      expect(page.meta).toEqual({ page: 1, pageSize: 10, total: 2, totalPages: 1 });
    });

    it('deriva AGENDADO e ATENDIDO e filtra pela situação', async () => {
      const outroPaciente = await prisma.paciente.create({ data: { nome: 'Paciente Dois' } });
      const terceiro = await prisma.paciente.create({ data: { nome: 'Paciente Tres' } });
      await noBanco({ pacienteId });
      await noBanco({ pacienteId: outroPaciente.id });
      await noBanco({ pacienteId: terceiro.id });
      await prisma.agendamento.create({
        data: {
          pacienteId: outroPaciente.id,
          profissionalId: destinoId,
          inicio: new Date('2026-11-15T13:00:00Z'),
        },
      });
      await prisma.atendimento.create({
        data: {
          pacienteId: terceiro.id,
          profissionalId: destinoId,
          status: 'FINALIZADO',
          finalizadoEm: new Date('2026-11-16T13:00:00Z'),
        },
      });
      // Agendamento cancelado não conta.
      await prisma.agendamento.create({
        data: {
          pacienteId,
          profissionalId: destinoId,
          inicio: new Date('2026-11-15T13:00:00Z'),
          status: 'CANCELADO',
        },
      });

      const todos = await http().get(BASE).query({ sort: 'paciente:asc' }).expect(200);
      expect(todos.body.data.map((e: { situacao: string }) => e.situacao)).toEqual([
        'AGENDADO',
        'ENCAMINHADO',
        'ATENDIDO',
      ]);
      for (const [situacao, paciente] of [
        ['AGENDADO', 'Paciente Dois'],
        ['ENCAMINHADO', 'Paciente Encaminhado'],
        ['ATENDIDO', 'Paciente Tres'],
      ] as const) {
        const res = await http().get(BASE).query({ situacao }).expect(200);
        expect(res.body.data.map((e: { pacienteNome: string }) => e.pacienteNome)).toEqual([
          paciente,
        ]);
        expect(res.body.meta.total).toBe(1);
      }
    });

    it('filtra por profissional e período, busca e pagina', async () => {
      await noBanco({ data: new Date('2026-10-01T00:00:00Z'), motivo: 'Cardiologia' });
      await noBanco({
        origemProfissionalId: destinoId,
        destinoProfissionalId: origemId,
        data: new Date('2026-11-05T00:00:00Z'),
        motivo: 'Retorno',
      });

      const enviados = await http().get(BASE).query({ origemProfissionalId: origemId });
      expect(enviados.body.meta.total).toBe(1);
      const recebidos = await http().get(BASE).query({ destinoProfissionalId: origemId });
      expect(recebidos.body.data[0].motivo).toBe('Retorno');
      const periodo = await http().get(BASE).query({ de: '2026-11-01', ate: '2026-11-30' });
      expect(periodo.body.meta.total).toBe(1);
      const porMotivo = await http().get(BASE).query({ search: 'cardio' });
      expect(porMotivo.body.data[0].motivo).toBe('Cardiologia');
      const porNome = await http().get(BASE).query({ search: 'Destino Teste' });
      expect(porNome.body.meta.total).toBe(2);
      const pagina = await http().get(BASE).query({ pageSize: 1, page: 2 });
      expect(pagina.body.meta).toEqual({ page: 2, pageSize: 1, total: 2, totalPages: 2 });
    });

    it('400 para ordenação, situação e período inválidos; 403 sem a permissão ver', async () => {
      await http().get(BASE).query({ sort: 'motivo:asc' }).expect(400);
      await http().get(BASE).query({ situacao: 'X' }).expect(400);
      await http().get(BASE).query({ de: '2026-12-01', ate: '2026-11-01' }).expect(400);
      const sem = await criarUsuarioTeste(app, { permissoes: [] });
      await comUsuario(app, sem).get(BASE).expect(403);
    });
  });

  describe('GET /:id', () => {
    it('200, 404 e 400', async () => {
      const e = await noBanco();
      const res = await http().get(`${BASE}/${e.id}`).expect(200);
      expect(encaminhamentoSchema.parse(res.body).id).toBe(e.id);
      await http().get(`${BASE}/${INEXISTENTE}`).expect(404);
      await http().get(`${BASE}/abc`).expect(400);
    });
  });

  describe('GET /profissionais', () => {
    it('só os profissionais com contrato ativo que permite indicação', async () => {
      const bloqueado = await prisma.profissional.create({ data: { nome: 'Dr. Nao Indica' } });
      await contrato(bloqueado.id, { permiteIndicacao: false });
      const futuro = await prisma.profissional.create({ data: { nome: 'Dr. Contrato Futuro' } });
      await contrato(futuro.id, { dataInicio: new Date('2099-01-01T00:00:00Z') });

      const res = await http().get(`${BASE}/profissionais`).expect(200);
      const { origens, destinos } = encaminhamentoProfissionaisSchema.parse(res.body);
      expect(destinos.map((p) => p.label)).toEqual(['Dr. Origem Teste', 'Dra. Destino Teste']);
      expect(origens).toEqual(destinos);
    });
  });

  describe('PATCH /:id', () => {
    it('200: altera o motivo e a especialidade e audita UPDATE com before/after', async () => {
      const especialidade = await prisma.especialidade.create({ data: { nome: 'Cardiologia' } });
      const e = await noBanco();

      const res = await http()
        .patch(`${BASE}/${e.id}`)
        .send(corpo({ motivo: 'Novo motivo', especialidadeId: especialidade.id }))
        .expect(200);

      expect(res.body).toMatchObject({ motivo: 'Novo motivo', especialidadeNome: 'Cardiologia' });
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: ENTITY,
        entityId: e.id,
        before: { motivo: 'Avaliação', especialidadeId: null },
        after: { motivo: 'Novo motivo', especialidadeId: especialidade.id },
        userId: usuario.id,
      });
    });

    it('um contrato encerrado depois não impede ajustar o motivo', async () => {
      const e = await noBanco();
      await prisma.contratoSala.updateMany({ data: { permiteIndicacao: false } });
      await http()
        .patch(`${BASE}/${e.id}`)
        .send(corpo({ motivo: 'Ajuste' }))
        .expect(200);
    });

    it('422 ao trocar para um destino sem indicação; 404; 400', async () => {
      const e = await noBanco();
      await http()
        .patch(`${BASE}/${e.id}`)
        .send(corpo({ destinoProfissionalId: semContratoId }))
        .expect(422);
      await http().patch(`${BASE}/${INEXISTENTE}`).send(corpo()).expect(404);
      await http().patch(`${BASE}/${e.id}`).send({}).expect(400);
      await expectNoAudit(prisma, { entity: ENTITY, action: 'UPDATE' });
    });
  });

  describe('DELETE /:id', () => {
    it('200: exclusão lógica, some da listagem e audita DELETE', async () => {
      const e = await noBanco();
      await http().delete(`${BASE}/${e.id}`).expect(200);

      expect(
        (await prisma.encaminhamento.findUnique({ where: { id: e.id } }))?.deletedAt,
      ).not.toBeNull();
      expect((await http().get(BASE).expect(200)).body.meta.total).toBe(0);
      await expectAudit(prisma, {
        action: 'DELETE',
        entity: ENTITY,
        entityId: e.id,
        before: { motivo: 'Avaliação' },
        userId: usuario.id,
      });
      await http().delete(`${BASE}/${e.id}`).expect(404);
    });
  });

  describe('GET /export', () => {
    it('gera o Excel só com as colunas pedidas e audita EXPORT', async () => {
      await noBanco();
      const res = await respostaBinaria(
        http().get(`${BASE}/export`).query({ format: 'xlsx', columns: 'paciente,situacao' }),
      ).expect(200);

      const livro = new Workbook();
      await livro.xlsx.load(res.body as unknown as ArrayBuffer);
      const linhas = livro.worksheets[0]?.getSheetValues() ?? [];
      expect(JSON.stringify(linhas)).toContain('Paciente Encaminhado');
      expect(JSON.stringify(linhas)).toContain('Encaminhado');
      expect(JSON.stringify(linhas)).not.toContain('Dr. Origem Teste');
      const audit = await prisma.auditLog.findMany({ where: { entity: ENTITY, action: 'EXPORT' } });
      expect(audit).toHaveLength(1);
    });

    it('403 sem a permissão exportar; 400 sem o formato', async () => {
      const so = await criarUsuarioTeste(app, {
        permissoes: ['consultorio-assistencial.encaminhamentos.ver'],
      });
      await comUsuario(app, so).get(`${BASE}/export`).query({ format: 'xlsx' }).expect(403);
      await http().get(`${BASE}/export`).expect(400);
    });
  });

  describe('GET /relatorio', () => {
    it('enviados, recebidos e conversão por profissional, com filtro de período', async () => {
      const outroPaciente = await prisma.paciente.create({ data: { nome: 'Paciente Dois' } });
      await noBanco();
      await noBanco({ pacienteId: outroPaciente.id });
      await noBanco({ data: new Date('2026-09-01T00:00:00Z') });
      await prisma.atendimento.create({
        data: {
          pacienteId,
          profissionalId: destinoId,
          status: 'FINALIZADO',
          finalizadoEm: new Date('2026-11-12T13:00:00Z'),
        },
      });

      const res = await http().get(`${BASE}/relatorio`).expect(200);
      const page = encaminhamentoRelatorioPageSchema.parse(res.body);
      expect(page.data).toEqual([
        expect.objectContaining({
          profissionalNome: 'Dr. Origem Teste',
          enviados: 3,
          enviadosAtendidos: 2,
          taxaEnviados: 66.7,
          recebidos: 0,
        }),
        expect.objectContaining({
          profissionalNome: 'Dra. Destino Teste',
          recebidos: 3,
          recebidosAtendidos: 2,
          taxaRecebidos: 66.7,
          enviados: 0,
        }),
      ]);

      const periodo = await http()
        .get(`${BASE}/relatorio`)
        .query({ de: '2026-11-01', ate: '2026-11-30', sort: 'recebidos:desc' })
        .expect(200);
      expect(periodo.body.data[0]).toMatchObject({
        profissionalNome: 'Dra. Destino Teste',
        recebidos: 2,
        recebidosAtendidos: 1,
        taxaRecebidos: 50,
      });
      await http().get(`${BASE}/relatorio`).query({ sort: 'x:asc' }).expect(400);
    });
  });

  describe('escopo de dados (#153)', () => {
    async function restrito(profissionalIds: string[], permissoes = PERMISSOES) {
      const u = await criarUsuarioTeste(app, {
        permissoes,
        escopoDados: 'PROFISSIONAIS_VINCULADOS',
        profissionalIds,
      });
      return comUsuario(app, u);
    }

    it('o destino vê o encaminhamento (sem conteúdo clínico); quem não participa não vê', async () => {
      const e = await noBanco();
      await prisma.atendimento.create({
        data: { pacienteId, profissionalId: origemId, diagnostico: 'Dado clínico sigiloso' },
      });

      const destino = await restrito([destinoId]);
      const lista = await destino.get(BASE).expect(200);
      expect(lista.body.data.map((x: { id: string }) => x.id)).toEqual([e.id]);
      const detalhe = await destino.get(`${BASE}/${e.id}`).expect(200);
      expect(JSON.stringify(detalhe.body)).not.toContain('sigiloso');
      expect(Object.keys(detalhe.body)).not.toEqual(
        expect.arrayContaining(['diagnostico', 'queixa', 'evolucao']),
      );

      const alheio = await restrito([semContratoId]);
      expect((await alheio.get(BASE).expect(200)).body.meta.total).toBe(0);
      await alheio.get(`${BASE}/${e.id}`).expect(403);
    });

    it('o destino não altera nem exclui; a origem sim', async () => {
      const e = await noBanco();
      const destino = await restrito([destinoId]);
      await destino.patch(`${BASE}/${e.id}`).send(corpo()).expect(403);
      await destino.delete(`${BASE}/${e.id}`).expect(403);

      const origem = await restrito([origemId]);
      await origem
        .patch(`${BASE}/${e.id}`)
        .send(corpo({ motivo: 'Pela origem' }))
        .expect(200);
    });

    it('só registra pela origem do escopo e para paciente vinculado', async () => {
      const desvinculado = await restrito([destinoId]);
      await desvinculado.post(BASE).send(corpo()).expect(403);

      const origem = await restrito([origemId]);
      await origem.post(BASE).send(corpo()).expect(403); // paciente sem atendimento com a origem
      await prisma.atendimento.create({ data: { pacienteId, profissionalId: origemId } });
      await origem.post(BASE).send(corpo()).expect(201);
    });

    it('as origens do select são só as do escopo; o relatório mostra só as linhas dele', async () => {
      await noBanco();
      const destino = await restrito([destinoId]);
      const profissionais = await destino.get(`${BASE}/profissionais`).expect(200);
      expect(profissionais.body.origens.map((p: { id: string }) => p.id)).toEqual([destinoId]);
      expect(profissionais.body.destinos).toHaveLength(2);
      const relatorio = await destino.get(`${BASE}/relatorio`).expect(200);
      expect(relatorio.body.data.map((l: { profissionalId: string }) => l.profissionalId)).toEqual([
        destinoId,
      ]);
    });

    it('perfil restrito sem profissional vinculado não vê nada', async () => {
      await noBanco();
      const sem = await restrito([]);
      expect((await sem.get(BASE).expect(200)).body.meta.total).toBe(0);
    });
  });
});
