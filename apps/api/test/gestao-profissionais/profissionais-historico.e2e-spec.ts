import type { INestApplication } from '@nestjs/common';
import {
  negocioVinculavelPageSchema,
  negocioVinculoSchema,
  profissionalHistoricoSchema,
} from '@torres/shared';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit, expectNoAudit } from '../utils/expect-audit';

const API = '/api/gestao-profissionais/profissionais';
const PIPELINE = '/api/comercial-atendimento/pipeline';
const PERMISSOES = [
  'gestao-profissionais.profissionais.ver',
  'comercial-atendimento.pipeline.ver',
  'comercial-atendimento.pipeline.editar',
] as const;
const INEXISTENTE = '00000000-0000-4000-8000-000000000000';

const ISO = (dia: string) => `${dia}T12:00:00.000Z`;
const eventos = (corpo: { data: { evento: string }[] }) => corpo.data.map((e) => e.evento);

describe('Linha do tempo do profissional (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let usuario: UsuarioTeste;
  let profissionalId: string;
  let pipelineId: string;
  let estagioId: string;
  let salaId: string;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    usuario = await criarUsuarioTeste(app, { permissoes: PERMISSOES });
    await prisma.usuario.update({ where: { id: usuario.id }, data: { nome: 'Maria Atendente' } });
    profissionalId = (
      await prisma.profissional.create({ data: { nome: 'Dra. Ana Teste', ativo: true } })
    ).id;
    pipelineId = (await prisma.pipeline.create({ data: { nome: 'Pipeline Torres', ordem: 1 } })).id;
    estagioId = (
      await prisma.estagioPipeline.create({
        data: { pipelineId, nome: 'Proposta', cor: '#84cc16', ordem: 1 },
      })
    ).id;
    salaId = (await prisma.sala.create({ data: { nome: 'Sala 7', numero: '07' } })).id;
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => comUsuario(app, usuario);
  const historico = (query = '') => http().get(`${API}/${profissionalId}/historico${query}`);
  const outroProfissional = () =>
    prisma.profissional.create({ data: { nome: 'Dr. Outro Teste', ativo: true } });
  const restritoA = (id: string) =>
    criarUsuarioTeste(app, {
      permissoes: PERMISSOES,
      escopoDados: 'PROFISSIONAIS_VINCULADOS',
      profissionalIds: [id],
    });

  const criarNegocio = (extra: Record<string, unknown> = {}) =>
    prisma.negocio.create({
      data: { titulo: 'Lead Dra. Ana', pipelineId, estagioId, ...extra },
    });

  /** Negócio ligado ao profissional, com os marcos do exemplo da R §24 e uma atividade feita. */
  async function negocioCompleto() {
    const negocio = await criarNegocio({
      profissionalId,
      createdAt: new Date(ISO('2026-10-12')),
      marcoPrimeiroContatoEm: new Date(ISO('2026-10-15')),
      marcoVisitaEm: new Date(ISO('2026-10-20')),
      marcoPropostaEm: new Date(ISO('2026-10-21')),
      marcoContratoEm: new Date(ISO('2026-11-01')),
    });
    await prisma.atividadeNegocio.create({
      data: {
        negocioId: negocio.id,
        tipo: 'LIGACAO',
        titulo: 'Ligar para apresentar a clínica',
        dataHora: new Date(ISO('2026-10-14')),
        status: 'CONCLUIDA',
        concluidaEm: new Date(ISO('2026-10-14')),
        responsavelId: usuario.id,
      },
    });
    // Pendente não entra na linha do tempo.
    await prisma.atividadeNegocio.create({
      data: {
        negocioId: negocio.id,
        tipo: 'FOLLOW_UP',
        titulo: 'Pendente',
        dataHora: new Date(ISO('2026-12-01')),
      },
    });
    return negocio;
  }

  const contratoAssinado = () =>
    prisma.contratoSala.create({
      data: {
        salaId,
        modalidade: 'MENSAL',
        locatarioTipo: 'PROFISSIONAL',
        profissionalId,
        valorUnitario: 1500,
        dataInicio: new Date('2026-11-01T00:00:00Z'),
        assinadoEm: new Date('2026-11-05T00:00:00Z'),
        status: 'ATIVO',
      },
    });

  describe('GET /profissionais/:id/historico', () => {
    it('lista, em ordem cronológica, o CRM, o contrato, o onboarding e o primeiro atendimento', async () => {
      await negocioCompleto();
      const contrato = await contratoAssinado();
      await prisma.profissionalOnboarding.create({
        data: {
          profissionalId,
          contratoSalaId: contrato.id,
          iniciadoEm: new Date('2026-11-05T00:00:00Z'),
          recepcaoOrientadaEm: new Date(ISO('2026-11-06')),
          recepcaoOrientadaPorId: usuario.id,
        },
      });
      const paciente = await prisma.paciente.create({ data: { nome: 'Paciente Teste' } });
      for (const dia of ['2026-11-20', '2026-11-10']) {
        await prisma.atendimento.create({
          data: {
            pacienteId: paciente.id,
            profissionalId,
            status: 'FINALIZADO',
            finalizadoEm: new Date(ISO(dia)),
          },
        });
      }

      const resposta = await historico().expect(200);
      const { data } = profissionalHistoricoSchema.parse(resposta.body);

      expect(data.map((e) => e.evento)).toEqual([
        'LEAD_CRIADO',
        'ATIVIDADE_CONCLUIDA',
        'PRIMEIRO_CONTATO',
        'VISITA_REALIZADA',
        'PROPOSTA_ENVIADA',
        'CONTRATO_FECHADO',
        'CONTRATO_ASSINADO',
        'ONBOARDING_INICIADO',
        'RECEPCAO_ORIENTADA',
        'PRIMEIRO_ATENDIMENTO',
      ]);
      const datas = data.map((e) => e.ocorridoEm);
      expect(datas).toEqual([...datas].sort());
      expect(data.find((e) => e.evento === 'ATIVIDADE_CONCLUIDA')).toMatchObject({
        tipo: 'CRM',
        detalhe: 'Ligar para apresentar a clínica',
        autor: 'Maria Atendente',
        link: '/atividades',
      });
      expect(data.find((e) => e.evento === 'LEAD_CRIADO')).toMatchObject({
        autor: null,
        link: '/negocios',
        detalhe: 'Lead Dra. Ana',
      });
      expect(data.find((e) => e.evento === 'CONTRATO_ASSINADO')).toMatchObject({
        tipo: 'CONTRATO',
        detalhe: 'Sala 7',
        link: '/salas',
        somenteData: true,
      });
      expect(data.find((e) => e.evento === 'LEAD_CRIADO')?.somenteData).toBe(false);
      expect(data.find((e) => e.evento === 'RECEPCAO_ORIENTADA')?.autor).toBe('Maria Atendente');
      expect(data.find((e) => e.evento === 'PRIMEIRO_ATENDIMENTO')?.ocorridoEm).toBe(
        ISO('2026-11-10'),
      );
    });

    it('mantém o histórico do CRM quando o lead vira contrato (negócio ligado ao profissional)', async () => {
      const negocio = await criarNegocio({
        createdAt: new Date(ISO('2026-10-12')),
        marcoVisitaEm: new Date(ISO('2026-10-20')),
      });
      expect((await historico().expect(200)).body.data).toEqual([]);

      await http()
        .patch(`${PIPELINE}/negocios/${negocio.id}/profissional`)
        .send({ profissionalId })
        .expect(200);
      await contratoAssinado();

      expect(eventos((await historico().expect(200)).body)).toEqual([
        'LEAD_CRIADO',
        'VISITA_REALIZADA',
        'CONTRATO_ASSINADO',
      ]);
    });

    it('inclui o negócio que já tem o profissional como contato', async () => {
      await criarNegocio({ contatoTipo: 'PROFISSIONAL', contatoId: profissionalId });

      expect(eventos((await historico().expect(200)).body)).toEqual(['LEAD_CRIADO']);
    });

    it('filtra por tipo e inverte a ordem', async () => {
      await negocioCompleto();
      await contratoAssinado();

      const crm = (await historico('?tipo=CRM').expect(200)).body;
      const contrato = (await historico('?tipo=CONTRATO').expect(200)).body;
      const onboarding = (await historico('?tipo=ONBOARDING').expect(200)).body;
      const decrescente = (await historico('?ordem=desc').expect(200)).body;

      expect(crm.data.every((e: { tipo: string }) => e.tipo === 'CRM')).toBe(true);
      expect(crm.data).toHaveLength(6);
      expect(eventos(contrato)).toEqual(['CONTRATO_ASSINADO']);
      expect(onboarding.data).toEqual([]);
      expect(decrescente.data[0].evento).toBe('CONTRATO_ASSINADO');
    });

    it('mostra o encerramento e a rescisão do contrato', async () => {
      const encerrado = await contratoAssinado();
      await prisma.contratoSala.update({
        where: { id: encerrado.id },
        data: { status: 'ENCERRADO', encerradoEm: new Date('2026-12-31T00:00:00Z') },
      });
      const cancelado = await contratoAssinado();
      await prisma.contratoSala.update({
        where: { id: cancelado.id },
        data: {
          status: 'CANCELADO',
          encerradoEm: new Date('2026-12-15T00:00:00Z'),
          motivoEncerramento: 'Mudou de cidade',
        },
      });

      const corpo = (await historico('?tipo=CONTRATO').expect(200)).body;

      expect(eventos(corpo).sort()).toEqual(
        [
          'CONTRATO_ASSINADO',
          'CONTRATO_ASSINADO',
          'CONTRATO_ENCERRADO',
          'CONTRATO_CANCELADO',
        ].sort(),
      );
      expect(
        corpo.data.find((e: { evento: string }) => e.evento === 'CONTRATO_CANCELADO').detalhe,
      ).toBe('Mudou de cidade');
    });

    it('ignora negócio excluído e o de outro profissional', async () => {
      await criarNegocio({ profissionalId, deletedAt: new Date() });
      await criarNegocio({ profissionalId: (await outroProfissional()).id });

      expect((await historico().expect(200)).body.data).toEqual([]);
    });

    it('400 para tipo inválido, 404, 403 sem permissão e fora do escopo', async () => {
      await historico('?tipo=XYZ').expect(400);
      await http().get(`${API}/${INEXISTENTE}/historico`).expect(404);

      const semPermissao = comUsuario(app, await criarUsuarioTeste(app, { permissoes: [] }));
      await semPermissao.get(`${API}/${profissionalId}/historico`).expect(403);

      const outro = await outroProfissional();
      const restrito = comUsuario(app, await restritoA(outro.id));
      await restrito.get(`${API}/${profissionalId}/historico`).expect(403);
      await restrito.get(`${API}/${outro.id}/historico`).expect(200);
    });
  });

  describe('GET /pipeline/negocios/vinculaveis', () => {
    it('lista abertos e ganhos sem profissional, com busca e paginação', async () => {
      await criarNegocio({ titulo: 'Lead Ana' });
      await criarNegocio({ titulo: 'Lead Bruno', status: 'GANHO' });
      await criarNegocio({ titulo: 'Perdido', status: 'PERDIDO' });
      await criarNegocio({ titulo: 'Já ligado', profissionalId });
      await criarNegocio({
        titulo: 'Com contato profissional',
        contatoTipo: 'PROFISSIONAL',
        contatoId: profissionalId,
      });
      await criarNegocio({ titulo: 'Excluído', deletedAt: new Date() });

      const todos = negocioVinculavelPageSchema.parse(
        (await http().get(`${PIPELINE}/negocios/vinculaveis`).expect(200)).body,
      );
      const busca = negocioVinculavelPageSchema.parse(
        (await http().get(`${PIPELINE}/negocios/vinculaveis?search=bruno`).expect(200)).body,
      );
      const pagina = (
        await http().get(`${PIPELINE}/negocios/vinculaveis?page=1&pageSize=1`).expect(200)
      ).body;

      expect(todos.data.map((n) => n.titulo).sort()).toEqual(['Lead Ana', 'Lead Bruno']);
      expect(todos.data.find((n) => n.titulo === 'Lead Bruno')).toMatchObject({
        status: 'GANHO',
        estagio: 'Proposta',
      });
      expect(busca.data.map((n) => n.titulo)).toEqual(['Lead Bruno']);
      expect(pagina.meta).toMatchObject({ page: 1, pageSize: 1, total: 2, totalPages: 2 });
    });

    it('403 sem permissão', async () => {
      const semPermissao = comUsuario(app, await criarUsuarioTeste(app, { permissoes: [] }));
      await semPermissao.get(`${PIPELINE}/negocios/vinculaveis`).expect(403);
    });
  });

  describe('PATCH /pipeline/negocios/:id/profissional', () => {
    it('liga o negócio ao profissional e grava o audit_log', async () => {
      const negocio = await criarNegocio();

      const resposta = await http()
        .patch(`${PIPELINE}/negocios/${negocio.id}/profissional`)
        .send({ profissionalId })
        .expect(200);

      expect(negocioVinculoSchema.parse(resposta.body)).toMatchObject({
        id: negocio.id,
        profissionalId,
      });
      expect(
        (await prisma.negocio.findUniqueOrThrow({ where: { id: negocio.id } })).profissionalId,
      ).toBe(profissionalId);
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: 'Negocio',
        entityId: negocio.id,
        before: { profissionalId: null },
        after: { profissionalId },
        userId: usuario.id,
      });
    });

    it('desfaz o vínculo com null', async () => {
      const negocio = await criarNegocio({ profissionalId });

      await http()
        .patch(`${PIPELINE}/negocios/${negocio.id}/profissional`)
        .send({ profissionalId: null })
        .expect(200);

      expect(
        (await prisma.negocio.findUniqueOrThrow({ where: { id: negocio.id } })).profissionalId,
      ).toBeNull();
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: 'Negocio',
        entityId: negocio.id,
        before: { profissionalId },
        after: { profissionalId: null },
      });
    });

    it('400 sem corpo válido, 404 para negócio ou profissional inexistente, sem audit', async () => {
      const negocio = await criarNegocio();
      const url = `${PIPELINE}/negocios/${negocio.id}/profissional`;

      await http().patch(url).send({ profissionalId: 'x' }).expect(400);
      await http().patch(url).send({}).expect(400);
      await http()
        .patch(`${PIPELINE}/negocios/${INEXISTENTE}/profissional`)
        .send({ profissionalId })
        .expect(404);
      await http().patch(url).send({ profissionalId: INEXISTENTE }).expect(404);

      await expectNoAudit(prisma, { entity: 'Negocio', entityId: negocio.id, action: 'UPDATE' });
    });

    it('403 sem permissão e para profissional fora do escopo do usuário', async () => {
      const negocio = await criarNegocio();
      const url = `${PIPELINE}/negocios/${negocio.id}/profissional`;
      const semPermissao = comUsuario(app, await criarUsuarioTeste(app, { permissoes: [] }));
      await semPermissao.patch(url).send({ profissionalId }).expect(403);

      const restrito = comUsuario(app, await restritoA((await outroProfissional()).id));
      await restrito.patch(url).send({ profissionalId }).expect(403);
      await expectNoAudit(prisma, { entity: 'Negocio', entityId: negocio.id, action: 'UPDATE' });
    });
  });
});
