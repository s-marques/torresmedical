import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import {
  consentimentoSchema,
  consentimentosResponseSchema,
  pacientePageSchema,
  pacienteResumoSchema,
} from '@torres/shared';
import request from 'supertest';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import type { Prisma } from '../../src/generated/prisma/client';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit, expectNoAudit } from '../utils/expect-audit';

/** Issue #148: relacionamento do paciente (origem, canal, indicação), consentimentos e calculados. */
const BASE = '/api/comercial-atendimento/pacientes';
const PERMISSOES = [
  'comercial-atendimento.pacientes.ver',
  'comercial-atendimento.pacientes.criar',
  'comercial-atendimento.pacientes.editar',
  'comercial-atendimento.pacientes.excluir',
  'comercial-atendimento.pacientes.exportar',
] as const;
const INEXISTENTE = '00000000-0000-4000-8000-000000000000';
const DIA_MS = 86_400_000;

describe('Pacientes: relacionamento e consentimentos (e2e)', () => {
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
  const criarNoBanco = (nome: string, extra: Partial<Prisma.PacienteUncheckedCreateInput> = {}) =>
    prisma.paciente.create({ data: { nome, ...extra } });
  const criarProfissional = (nome = 'Dr. Fictício') =>
    prisma.profissional.create({ data: { nome, corCalendario: 'verde' } });
  const aTantosDias = (dias: number) => new Date(Date.now() + dias * DIA_MS);
  const agendar = (
    pacienteId: string,
    profissionalId: string,
    dias: number,
    status: Prisma.AgendamentoUncheckedCreateInput['status'],
  ) =>
    prisma.agendamento.create({
      data: { pacienteId, profissionalId, inicio: aTantosDias(dias), status },
    });

  async function nomes(query: Record<string, unknown>) {
    const res = await http().get(BASE).query(query).expect(200);
    return (pacientePageSchema.parse(res.body).data as { nome: string }[]).map((p) => p.nome);
  }

  describe('filtros do grid', () => {
    it('sem retorno há 90 dias: atendido há mais tempo e sem nada agendado à frente', async () => {
      const prof = await criarProfissional();
      const antigo = await criarNoBanco('Antigo Teste');
      await agendar(antigo.id, prof.id, -120, 'ATENDIDO');
      const recente = await criarNoBanco('Recente Teste');
      await agendar(recente.id, prof.id, -30, 'ATENDIDO');
      const comRetorno = await criarNoBanco('Voltou Teste');
      await agendar(comRetorno.id, prof.id, -200, 'ATENDIDO');
      await agendar(comRetorno.id, prof.id, 10, 'AGENDADO');
      const retornoCancelado = await criarNoBanco('Cancelou Teste');
      await agendar(retornoCancelado.id, prof.id, -150, 'ATENDIDO');
      await agendar(retornoCancelado.id, prof.id, 10, 'CANCELADO');
      await criarNoBanco('Nunca Veio Teste');

      expect(await nomes({ semRetornoDias: 90 })).toEqual(['Antigo Teste', 'Cancelou Teste']);
      expect(await nomes({ semRetornoDias: 10 })).toEqual([
        'Antigo Teste',
        'Cancelou Teste',
        'Recente Teste',
      ]);
      expect(await nomes({ semRetornoDias: 365 })).toEqual([]);
    });

    it('novos no período: dias inteiros no fuso da clínica, inclusive nas pontas', async () => {
      await criarNoBanco('Antes Teste', { createdAt: new Date('2026-10-31T23:59:00-03:00') });
      await criarNoBanco('Primeiro Dia Teste', {
        createdAt: new Date('2026-11-01T00:00:00-03:00'),
      });
      await criarNoBanco('Último Dia Teste', { createdAt: new Date('2026-11-30T23:59:00-03:00') });
      await criarNoBanco('Depois Teste', { createdAt: new Date('2026-12-01T00:00:00-03:00') });

      expect(await nomes({ novosDe: '2026-11-01', novosAte: '2026-11-30' })).toEqual([
        'Primeiro Dia Teste',
        'Último Dia Teste',
      ]);
      expect(await nomes({ novosDe: '2026-12-01' })).toEqual(['Depois Teste']);
      expect(await nomes({ novosAte: '2026-10-31' })).toEqual(['Antes Teste']);
      await http().get(BASE).query({ novosDe: '01/11/2026' }).expect(400);
    });

    it('com faltas, origem e canal', async () => {
      const prof = await criarProfissional();
      const origem = await prisma.origemCliente.create({
        data: { nome: 'Instagram', codigo: 'instagram', ordem: 1 },
      });
      const faltou = await criarNoBanco('Faltou Teste', {
        origemClienteId: origem.id,
        canalOrigem: 'WHATSAPP',
      });
      await agendar(faltou.id, prof.id, -5, 'FALTOU');
      await criarNoBanco('Pontual Teste', { canalOrigem: 'SITE' });

      expect(await nomes({ comFaltas: 'true' })).toEqual(['Faltou Teste']);
      expect(await nomes({ comFaltas: 'false' })).toEqual(['Faltou Teste', 'Pontual Teste']);
      expect(await nomes({ origemClienteId: origem.id })).toEqual(['Faltou Teste']);
      expect(await nomes({ canalOrigem: 'SITE' })).toEqual(['Pontual Teste']);
      await http().get(BASE).query({ canalOrigem: 'FAX' }).expect(400);
      await http().get(BASE).query({ semRetornoDias: 0 }).expect(400);
    });

    it('os mesmos filtros valem na exportação', async () => {
      const prof = await criarProfissional();
      const faltou = await criarNoBanco('Faltou Teste');
      await agendar(faltou.id, prof.id, -5, 'FALTOU');
      await criarNoBanco('Pontual Teste');

      await http().get(`${BASE}/export`).query({ format: 'xlsx', comFaltas: 'true' }).expect(200);
      await http().get(`${BASE}/export`).query({ format: 'xlsx', canalOrigem: 'FAX' }).expect(400);
    });
  });

  describe('dados calculados', () => {
    it('lista e detalhe trazem primeiro e último atendimento, próximo retorno e faltas', async () => {
      const prof = await criarProfissional();
      const paciente = await criarNoBanco('Ana Teste');
      const primeiro = await agendar(paciente.id, prof.id, -100, 'ATENDIDO');
      const ultimo = await agendar(paciente.id, prof.id, -20, 'ATENDIDO');
      await agendar(paciente.id, prof.id, -50, 'FALTOU');
      await agendar(paciente.id, prof.id, -40, 'FALTOU');
      await agendar(paciente.id, prof.id, 3, 'CANCELADO');
      const proximo = await agendar(paciente.id, prof.id, 15, 'CONFIRMADO');
      await agendar(paciente.id, prof.id, 30, 'AGENDADO');
      await criarNoBanco('Sem Historico Teste');

      const lista = pacientePageSchema.parse((await http().get(BASE).expect(200)).body);
      const detalhe = pacienteResumoSchema.parse(
        (await http().get(`${BASE}/${paciente.id}`).expect(200)).body,
      );

      const esperado = {
        primeiroAtendimento: primeiro.inicio.toISOString(),
        ultimoAtendimento: ultimo.inicio.toISOString(),
        proximoRetorno: proximo.inicio.toISOString(),
        faltas: 2,
      };
      expect(lista.data[0]).toMatchObject(esperado);
      expect(detalhe).toMatchObject(esperado);
      expect(lista.data[1]).toMatchObject({
        primeiroAtendimento: null,
        ultimoAtendimento: null,
        proximoRetorno: null,
        faltas: 0,
      });
    });

    it('agendamento excluído não conta', async () => {
      const prof = await criarProfissional();
      const paciente = await criarNoBanco('Ana Teste');
      const falta = await agendar(paciente.id, prof.id, -5, 'FALTOU');
      await prisma.agendamento.update({ where: { id: falta.id }, data: { deletedAt: new Date() } });

      const detalhe = pacienteResumoSchema.parse(
        (await http().get(`${BASE}/${paciente.id}`).expect(200)).body,
      );
      expect(detalhe.faltas).toBe(0);
    });
  });

  describe('campos de relacionamento (POST e PATCH)', () => {
    it('201 com canal, WhatsApp, preferência, profissional e especialidade de vínculo', async () => {
      const prof = await criarProfissional('Dra. Fictícia');
      const especialidade = await prisma.especialidade.create({ data: { nome: 'Nutrologia' } });

      const res = await http()
        .post(BASE)
        .send({
          nome: 'Ana Teste',
          canalOrigem: 'REDES_SOCIAIS',
          whatsapp: '(65) 98888-0001',
          preferenciaComunicacao: 'WHATSAPP',
          profissionalVinculoId: prof.id,
          especialidadeVinculoId: especialidade.id,
        })
        .expect(201);

      expect(res.body).toMatchObject({
        canalOrigem: 'REDES_SOCIAIS',
        whatsapp: '65988880001',
        preferenciaComunicacao: 'WHATSAPP',
        profissionalVinculoId: prof.id,
        profissionalVinculoNome: 'Dra. Fictícia',
        especialidadeVinculoId: especialidade.id,
        especialidadeVinculoNome: 'Nutrologia',
        aceitaCampanhasWhatsapp: true,
        aceitaComunicacao: true,
      });
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: 'Paciente',
        entityId: res.body.id,
        before: null,
        after: { canalOrigem: 'REDES_SOCIAIS', whatsapp: '65988880001' },
        userId: usuario.id,
      });
    });

    it('quem indicou: paciente, profissional do Torres ou texto livre', async () => {
      const prof = await criarProfissional('Dr. Indicador');
      const indicador = await criarNoBanco('Paciente Indicador');

      const porPaciente = await http()
        .post(BASE)
        .send({
          nome: 'A Teste',
          indicacaoTipo: 'PACIENTE',
          indicacaoReferenciaId: indicador.id,
          indicacaoTexto: 'descartado',
        })
        .expect(201);
      const porProfissional = await http()
        .post(BASE)
        .send({ nome: 'B Teste', indicacaoTipo: 'PROFISSIONAL', indicacaoReferenciaId: prof.id })
        .expect(201);
      const porTexto = await http()
        .post(BASE)
        .send({
          nome: 'C Teste',
          indicacaoTipo: 'TEXTO',
          indicacaoTexto: '  Vizinho da clínica ',
          indicacaoReferenciaId: indicador.id,
        })
        .expect(201);

      expect(porPaciente.body).toMatchObject({
        indicacaoTipo: 'PACIENTE',
        indicacaoReferenciaId: indicador.id,
        indicacaoTexto: null,
        indicacaoNome: 'Paciente Indicador',
      });
      expect(porProfissional.body).toMatchObject({
        indicacaoTipo: 'PROFISSIONAL',
        indicacaoNome: 'Dr. Indicador',
      });
      expect(porTexto.body).toMatchObject({
        indicacaoTipo: 'TEXTO',
        indicacaoReferenciaId: null,
        indicacaoTexto: 'Vizinho da clínica',
        indicacaoNome: 'Vizinho da clínica',
      });
    });

    it('400 para indicação incompleta, inexistente ou do próprio paciente; vínculos inválidos', async () => {
      const excluido = await criarNoBanco('Excluído Teste', { deletedAt: new Date() });
      const proprio = await criarNoBanco('Ana Teste');
      const campos = async (corpo: object, status = 400) =>
        (
          await http()
            .post(BASE)
            .send({ nome: 'X', ...corpo })
            .expect(status)
        ).body;

      const semTexto = await campos({ indicacaoTipo: 'TEXTO' });
      expect(semTexto.details[0].field).toBe('indicacaoTexto');
      const semReferencia = await campos({ indicacaoTipo: 'PACIENTE' });
      expect(semReferencia.details[0].field).toBe('indicacaoReferenciaId');
      for (const corpo of [
        { indicacaoTipo: 'PACIENTE', indicacaoReferenciaId: INEXISTENTE },
        { indicacaoTipo: 'PACIENTE', indicacaoReferenciaId: excluido.id },
        { indicacaoTipo: 'PROFISSIONAL', indicacaoReferenciaId: INEXISTENTE },
      ]) {
        expect((await campos(corpo)).code).toBe('PACIENTE_INDICACAO_INVALIDA');
      }
      expect((await campos({ profissionalVinculoId: INEXISTENTE })).code).toBe(
        'PACIENTE_PROFISSIONAL_INVALIDO',
      );
      expect((await campos({ especialidadeVinculoId: INEXISTENTE })).code).toBe(
        'PACIENTE_ESPECIALIDADE_INVALIDA',
      );
      await campos({ canalOrigem: 'FAX' });
      await campos({ preferenciaComunicacao: 'CARTA' });
      await campos({ whatsapp: '123' });

      const propria = await http()
        .patch(`${BASE}/${proprio.id}`)
        .send({ nome: 'Ana', indicacaoTipo: 'PACIENTE', indicacaoReferenciaId: proprio.id })
        .expect(400);
      expect(propria.body.code).toBe('PACIENTE_INDICACAO_INVALIDA');
      await expectNoAudit(prisma, { entity: 'Paciente', action: 'UPDATE' });
    });

    it('PATCH troca o tipo de indicação e limpa o dado do tipo anterior', async () => {
      const indicador = await criarNoBanco('Paciente Indicador');
      const paciente = await criarNoBanco('Ana Teste', {
        indicacaoTipo: 'PACIENTE',
        indicacaoReferenciaId: indicador.id,
      });

      const res = await http()
        .patch(`${BASE}/${paciente.id}`)
        .send({ nome: 'Ana Teste', indicacaoTipo: 'TEXTO', indicacaoTexto: 'Instagram da clínica' })
        .expect(200);

      expect(res.body).toMatchObject({
        indicacaoTipo: 'TEXTO',
        indicacaoReferenciaId: null,
        indicacaoNome: 'Instagram da clínica',
      });
    });
  });

  describe('consentimentos', () => {
    it('POST no cadastro grava os registros com autor, canal e versão; audita cada um', async () => {
      const res = await http()
        .post(BASE)
        .send({
          nome: 'Ana Teste',
          consentimentos: [
            { tipo: 'TRATAMENTO_DADOS', aceito: true, canal: 'PRESENCIAL' },
            { tipo: 'COMUNICACAO', aceito: true, canal: 'PRESENCIAL' },
            { tipo: 'CAMPANHAS', aceito: false, canal: 'PRESENCIAL', observacao: 'Não quer' },
          ],
        })
        .expect(201);

      expect(res.body).toMatchObject({ aceitaCampanhasWhatsapp: false, aceitaComunicacao: true });
      const historico = consentimentosResponseSchema.parse(
        (await http().get(`${BASE}/${res.body.id}/consentimentos`).expect(200)).body,
      );
      expect(historico.data).toHaveLength(3);
      expect(historico.data.find((c) => c.tipo === 'CAMPANHAS')).toMatchObject({
        aceito: false,
        canal: 'PRESENCIAL',
        versao: '1',
        observacao: 'Não quer',
        registradoPorId: usuario.id,
      });
      const auditados = await prisma.auditLog.count({
        where: { entity: 'ConsentimentoPaciente', action: 'CREATE', userId: usuario.id },
      });
      expect(auditados).toBe(3);
    });

    it('revogar mantém o histórico: aceite, revogação e novo aceite, do mais recente ao mais antigo', async () => {
      const paciente = await criarNoBanco('Ana Teste');
      const url = `${BASE}/${paciente.id}/consentimentos`;
      const enviar = (aceito: boolean) =>
        http().post(url).send({ tipo: 'CAMPANHAS', aceito, canal: 'WHATSAPP' });
      const flag = async () =>
        (await prisma.paciente.findUniqueOrThrow({ where: { id: paciente.id } }))
          .aceitaCampanhasWhatsapp;

      const aceite = await enviar(true).expect(201);
      expect(consentimentoSchema.parse(aceite.body)).toMatchObject({
        tipo: 'CAMPANHAS',
        aceito: true,
        registradoPorId: usuario.id,
        registradoPorNome: (await prisma.usuario.findUniqueOrThrow({ where: { id: usuario.id } }))
          .nome,
      });
      expect(await flag()).toBe(true);

      const revogacao = await enviar(false).expect(201);
      expect(await flag()).toBe(false);
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: 'ConsentimentoPaciente',
        entityId: revogacao.body.id,
        before: null,
        after: { pacienteId: paciente.id, tipo: 'CAMPANHAS', aceito: false },
        userId: usuario.id,
      });

      await enviar(true).expect(201);
      expect(await flag()).toBe(true);

      const historico = consentimentosResponseSchema.parse(
        (await http().get(url).expect(200)).body,
      );
      expect(historico.data.map((c) => c.aceito)).toEqual([true, false, true]);
      expect(await prisma.consentimentoPaciente.count({ where: { pacienteId: paciente.id } })).toBe(
        3,
      );
    });

    it('revogar comunicação desliga só o espelho de comunicação', async () => {
      const paciente = await criarNoBanco('Ana Teste');

      await http()
        .post(`${BASE}/${paciente.id}/consentimentos`)
        .send({ tipo: 'COMUNICACAO', aceito: false, canal: 'TELEFONE' })
        .expect(201);

      expect(await prisma.paciente.findUniqueOrThrow({ where: { id: paciente.id } })).toMatchObject(
        {
          aceitaComunicacao: false,
          aceitaCampanhasWhatsapp: true,
        },
      );
    });

    it('PATCH com o atalho aceitaCampanhasWhatsapp grava o registro só quando muda', async () => {
      const paciente = await criarNoBanco('Ana Teste');
      const editar = (aceita: boolean) =>
        http()
          .patch(`${BASE}/${paciente.id}`)
          .send({ nome: 'Ana Teste', aceitaCampanhasWhatsapp: aceita });

      await editar(false).expect(200);
      await editar(false).expect(200);
      await http().patch(`${BASE}/${paciente.id}`).send({ nome: 'Ana Teste' }).expect(200);

      const registros = await prisma.consentimentoPaciente.findMany({
        where: { pacienteId: paciente.id },
      });
      expect(registros).toHaveLength(1);
      expect(registros[0]).toMatchObject({ tipo: 'CAMPANHAS', aceito: false, canal: 'OUTRO' });
      // Sem o campo, o PATCH não reativa o consentimento.
      expect(
        (await prisma.paciente.findUniqueOrThrow({ where: { id: paciente.id } }))
          .aceitaCampanhasWhatsapp,
      ).toBe(false);
    });

    it('revogar pela API tira o paciente dos destinatários de campanhas; aceitar de novo devolve', async () => {
      const ana = await criarNoBanco('Ana Teste', { celular: '65988887777', status: 'ATIVO' });
      await criarNoBanco('Bia Teste', { celular: '65988887777', status: 'ATIVO' });
      const completo = comUsuario(
        app,
        await criarUsuarioTeste(app, {
          permissoes: [...PERMISSOES, 'comercial-atendimento.campanhas.ver'],
        }),
      );
      const destinatarios = async () =>
        (
          (await completo.get('/api/comercial-atendimento/campanhas/destinatarios').expect(200))
            .body.data as { nome: string }[]
        ).map((d) => d.nome);
      const registrar = (tipo: string, aceito: boolean) =>
        completo
          .post(`${BASE}/${ana.id}/consentimentos`)
          .send({ tipo, aceito, canal: 'WHATSAPP' })
          .expect(201);

      expect(await destinatarios()).toEqual(['Ana Teste', 'Bia Teste']);
      await registrar('CAMPANHAS', false);
      expect(await destinatarios()).toEqual(['Bia Teste']);
      await registrar('CAMPANHAS', true);
      expect(await destinatarios()).toEqual(['Ana Teste', 'Bia Teste']);
      await registrar('COMUNICACAO', false);
      expect(await destinatarios()).toEqual(['Bia Teste']);
    });

    it('400, 404 e 403 nos endpoints de consentimento, sem auditar', async () => {
      const paciente = await criarNoBanco('Ana Teste');
      const excluido = await criarNoBanco('Excluído Teste', { deletedAt: new Date() });
      const valido = { tipo: 'CAMPANHAS', aceito: false, canal: 'WHATSAPP' };
      const url = `${BASE}/${paciente.id}/consentimentos`;

      for (const corpo of [
        {},
        { ...valido, tipo: 'OUTRO' },
        { ...valido, canal: 'POMBO' },
        { ...valido, aceito: 'não' },
        { tipo: 'CAMPANHAS', canal: 'WHATSAPP' },
        { ...valido, extra: 1 },
        { ...valido, observacao: 'x'.repeat(501) },
      ]) {
        await http().post(url).send(corpo).expect(400);
      }
      await http().post(`${BASE}/abc/consentimentos`).send(valido).expect(400);
      for (const id of [INEXISTENTE, excluido.id]) {
        await http().post(`${BASE}/${id}/consentimentos`).send(valido).expect(404);
        await http().get(`${BASE}/${id}/consentimentos`).expect(404);
      }
      await request(app.getHttpServer()).get(url).expect(401);
      await request(app.getHttpServer()).post(url).send(valido).expect(401);
      const soVer = comUsuario(
        app,
        await criarUsuarioTeste(app, { permissoes: ['comercial-atendimento.pacientes.ver'] }),
      );
      await soVer.get(url).expect(200);
      expect((await soVer.post(url).send(valido).expect(403)).body.code).toBe('FORBIDDEN');
      const semPermissao = comUsuario(app, await criarUsuarioTeste(app, { permissoes: [] }));
      await semPermissao.get(url).expect(403);
      await expectNoAudit(prisma, { entity: 'ConsentimentoPaciente' });
    });

    it('usuário restrito (#153) só vê e registra consentimento de paciente vinculado', async () => {
      const prof = await criarProfissional();
      const vinculado = await criarNoBanco('Vinculado Teste');
      await prisma.atendimento.create({
        data: { pacienteId: vinculado.id, profissionalId: prof.id },
      });
      const outro = await criarNoBanco('Outro Teste');
      const restrito = comUsuario(
        app,
        await criarUsuarioTeste(app, {
          permissoes: PERMISSOES,
          escopoDados: 'PROFISSIONAIS_VINCULADOS',
          profissionalIds: [prof.id],
        }),
      );
      const corpo = { tipo: 'CAMPANHAS', aceito: false, canal: 'TELEFONE' };

      await restrito.post(`${BASE}/${vinculado.id}/consentimentos`).send(corpo).expect(201);
      await restrito.get(`${BASE}/${vinculado.id}/consentimentos`).expect(200);
      await restrito.get(`${BASE}/${outro.id}/consentimentos`).expect(403);
      const barrado = await restrito
        .post(`${BASE}/${outro.id}/consentimentos`)
        .send(corpo)
        .expect(403);
      expect(barrado.body).toMatchObject({ code: 'FORBIDDEN', message: 'Sem permissão' });
      expect(await prisma.consentimentoPaciente.count({ where: { pacienteId: outro.id } })).toBe(0);
    });

    it('usuário restrito só vincula o paciente a um profissional do próprio escopo', async () => {
      const meu = await criarProfissional('Dr. Meu');
      const alheio = await criarProfissional('Dr. Alheio');
      const restrito = comUsuario(
        app,
        await criarUsuarioTeste(app, {
          permissoes: PERMISSOES,
          escopoDados: 'PROFISSIONAIS_VINCULADOS',
          profissionalIds: [meu.id],
        }),
      );

      await restrito
        .post(BASE)
        .send({ nome: 'A Teste', profissionalVinculoId: meu.id })
        .expect(201);
      await restrito
        .post(BASE)
        .send({ nome: 'B Teste', profissionalVinculoId: alheio.id })
        .expect(403);
    });

    it('migração: quem tinha recusado campanhas ganha o registro de revogação', async () => {
      const recusou = await criarNoBanco('Recusou Teste', { aceitaCampanhasWhatsapp: false });
      await criarNoBanco('Aceita Teste');
      const arquivo = await readFile(
        join(
          __dirname,
          '../../prisma/migrations/20261124141555_pacientes_relacionamento_consentimentos/migration.sql',
        ),
        'utf8',
      );
      await prisma.$executeRawUnsafe(arquivo.slice(arquivo.indexOf('INSERT INTO')));

      const registros = await prisma.consentimentoPaciente.findMany();
      expect(registros).toHaveLength(1);
      expect(registros[0]).toMatchObject({
        pacienteId: recusou.id,
        tipo: 'CAMPANHAS',
        aceito: false,
        registradoPorId: null,
      });
    });
  });
});
