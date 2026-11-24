import type { INestApplication } from '@nestjs/common';
import {
  contratoSalaSchema,
  onboardingPageSchema,
  onboardingResponseSchema,
  onboardingSchema,
} from '@torres/shared';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit, expectNoAudit } from '../utils/expect-audit';

const API = '/api/gestao-profissionais';
const CONTRATOS = `${API}/contratos-sala`;
const PERMISSOES = [
  'gestao-profissionais.salas.ver',
  'gestao-profissionais.salas.criar',
  'gestao-profissionais.salas.editar',
  'gestao-profissionais.profissionais.ver',
  'gestao-profissionais.profissionais.editar',
  'gestao-profissionais.onboarding.ver',
  'gestao-profissionais.onboarding.editar',
] as const;
const INEXISTENTE = '00000000-0000-4000-8000-000000000000';

/** Ontem em UTC: nunca é futuro no fuso da clínica. */
const ontem = () => new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
const mesAtual = () => new Date().toISOString().slice(0, 7);

describe('Onboarding do profissional (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let usuario: UsuarioTeste;
  let salaId: string;
  let profissionalId: string;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    usuario = await criarUsuarioTeste(app, { permissoes: PERMISSOES });
    salaId = (await prisma.sala.create({ data: { nome: 'Sala 7', numero: '07' } })).id;
    profissionalId = (
      await prisma.profissional.create({ data: { nome: 'Dra. Ana Teste', ativo: false } })
    ).id;
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => comUsuario(app, usuario);
  const semPermissao = async () =>
    comUsuario(app, await criarUsuarioTeste(app, { permissoes: [] }));

  async function contratoAguardando(extra: Record<string, unknown> = {}) {
    return prisma.contratoSala.create({
      data: {
        salaId,
        modalidade: 'MENSAL',
        locatarioTipo: 'PROFISSIONAL',
        profissionalId,
        valorUnitario: 1500,
        diaVencimento: 10,
        dataInicio: new Date(`${mesAtual()}-01T00:00:00Z`),
        status: 'AGUARDANDO_ASSINATURA',
        dias: { create: [{ diaSemana: 2, inicio: '08:00', fim: '12:00' }] },
        ...extra,
      },
    });
  }

  async function assinado() {
    const contrato = await contratoAguardando();
    await http()
      .post(`${CONTRATOS}/${contrato.id}/assinar`)
      .send({ assinadoEm: ontem() })
      .expect(200);
    return contrato;
  }

  describe('POST /contratos-sala (nasce aguardando assinatura)', () => {
    const corpo = (extra: Record<string, unknown> = {}) => ({
      modalidade: 'MENSAL',
      salaId,
      locatarioTipo: 'PROFISSIONAL',
      locatarioId: profissionalId,
      valorUnitario: 1500,
      dataInicio: `${mesAtual()}-01`,
      ...extra,
    });

    it('cria com status "aguardando assinatura" e audita', async () => {
      const resposta = await http()
        .post(CONTRATOS)
        .send(corpo({ aguardandoAssinatura: true }))
        .expect(201);

      const contrato = contratoSalaSchema.parse(resposta.body);
      expect(contrato.status).toBe('AGUARDANDO_ASSINATURA');
      expect(contrato.assinadoEm).toBeNull();
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: 'ContratoSala',
        entityId: contrato.id,
      });
    });

    it('sem a opção, continua nascendo ativo', async () => {
      const resposta = await http().post(CONTRATOS).send(corpo()).expect(201);

      expect(resposta.body.status).toBe('ATIVO');
    });

    it('400 quando o locatário não é profissional', async () => {
      const paciente = await prisma.paciente.create({ data: { nome: 'Bruno Cliente Teste' } });

      await http()
        .post(CONTRATOS)
        .send(
          corpo({ locatarioTipo: 'CLIENTE', locatarioId: paciente.id, aguardandoAssinatura: true }),
        )
        .expect(400);
    });

    it('contrato aguardando não ocupa a sala nem aparece como ativo no cadastro', async () => {
      await contratoAguardando();

      expect(await prisma.contratoSala.count({ where: { status: 'ATIVO' } })).toBe(0);
    });
  });

  describe('POST /contratos-sala/:id/assinar', () => {
    it('assina: ativa o contrato, cria o checklist e gera a cobrança do mês', async () => {
      const contrato = await contratoAguardando();

      const resposta = await http()
        .post(`${CONTRATOS}/${contrato.id}/assinar`)
        .send({ assinadoEm: ontem() })
        .expect(200);

      const dto = contratoSalaSchema.parse(resposta.body);
      expect(dto.status).toBe('ATIVO');
      expect(dto.assinadoEm).toBe(ontem());
      const onboarding = await prisma.profissionalOnboarding.findUnique({
        where: { profissionalId },
      });
      expect(onboarding).toMatchObject({ contratoSalaId: contrato.id });
      expect(onboarding?.iniciadoEm.toISOString().slice(0, 10)).toBe(ontem());
      const cobranca = await prisma.contratoSalaCobranca.findFirst({
        where: { contratoSalaId: contrato.id },
      });
      expect(cobranca).toMatchObject({ competencia: mesAtual() });
      expect(cobranca?.contaReceberId).not.toBeNull();
      expect(await prisma.contaReceber.count({ where: { valor: 1500 } })).toBe(1);

      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: 'ContratoSala',
        entityId: contrato.id,
        before: { status: 'AGUARDANDO_ASSINATURA' },
        after: { status: 'ATIVO', assinadoEm: ontem() },
        userId: usuario.id,
      });
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: 'ProfissionalOnboarding',
        entityId: onboarding?.id ?? '',
        before: null,
        after: { profissionalId },
      });
    });

    it('contrato Por Turno é ativado e ganha o checklist, mas sem cobrança automática', async () => {
      const contrato = await contratoAguardando({ modalidade: 'TURNO', quantidadeMensal: 4 });

      await http()
        .post(`${CONTRATOS}/${contrato.id}/assinar`)
        .send({ assinadoEm: ontem() })
        .expect(200);

      expect(await prisma.profissionalOnboarding.count()).toBe(1);
      expect(await prisma.contaReceber.count()).toBe(0);
    });

    it('um segundo contrato do mesmo profissional não cria outro checklist', async () => {
      await assinado();
      const outro = await contratoAguardando();

      await http()
        .post(`${CONTRATOS}/${outro.id}/assinar`)
        .send({ assinadoEm: ontem() })
        .expect(200);

      expect(await prisma.profissionalOnboarding.count()).toBe(1);
    });

    it('409 quando o contrato já está ativo, sem auditar', async () => {
      const contrato = await contratoAguardando({ status: 'ATIVO' });

      await http()
        .post(`${CONTRATOS}/${contrato.id}/assinar`)
        .send({ assinadoEm: ontem() })
        .expect(409);

      await expectNoAudit(prisma, { entity: 'ContratoSala', entityId: contrato.id });
      expect(await prisma.profissionalOnboarding.count()).toBe(0);
    });

    it('400: data futura e corpo inválido', async () => {
      const contrato = await contratoAguardando();
      const amanha = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);

      await http()
        .post(`${CONTRATOS}/${contrato.id}/assinar`)
        .send({ assinadoEm: amanha })
        .expect(400);
      await http().post(`${CONTRATOS}/${contrato.id}/assinar`).send({}).expect(400);
      await http()
        .post(`${CONTRATOS}/${contrato.id}/assinar`)
        .send({ assinadoEm: 'x' })
        .expect(400);
      expect(await prisma.profissionalOnboarding.count()).toBe(0);
    });

    it('404 para contrato inexistente e 403 sem permissão', async () => {
      const contrato = await contratoAguardando();

      await http()
        .post(`${CONTRATOS}/${INEXISTENTE}/assinar`)
        .send({ assinadoEm: ontem() })
        .expect(404);
      await (
        await semPermissao()
      )
        .post(`${CONTRATOS}/${contrato.id}/assinar`)
        .send({ assinadoEm: ontem() })
        .expect(403);
    });
  });

  describe('GET /profissionais/:id/onboarding', () => {
    it('responde null para quem não passou por contrato assinado', async () => {
      const resposta = await http()
        .get(`${API}/profissionais/${profissionalId}/onboarding`)
        .expect(200);

      expect(onboardingResponseSchema.parse(resposta.body)).toEqual({ onboarding: null });
    });

    it('devolve o checklist com as etapas calculadas e as sugestões', async () => {
      await assinado();

      const resposta = await http()
        .get(`${API}/profissionais/${profissionalId}/onboarding`)
        .expect(200);

      const { onboarding } = onboardingResponseSchema.parse(resposta.body);
      expect(onboarding?.total).toBe(9);
      const situacao = Object.fromEntries(
        onboarding?.etapas.map((e) => [e.etapa, e.concluida]) ?? [],
      );
      expect(situacao).toMatchObject({
        CONTRATO_ASSINADO: true,
        SALA_DEFINIDA: true,
        CADASTRO_COMPLETO: false,
        DOCUMENTACAO_VALIDADA: false,
        AGENDA_CONFIGURADA: false,
        ACESSO_CRIADO: false,
        RECEPCAO_ORIENTADA: false,
        PRIMEIRO_ATENDIMENTO: false,
        PROFISSIONAL_ATIVO: false,
      });
      expect(onboarding?.sugestoes).toEqual({
        horarios: [{ diaSemana: 2, inicio: '08:00', fim: '12:00' }],
        criarUsuario: true,
      });
    });

    it('as etapas automáticas mudam sozinhas quando o dado passa a existir', async () => {
      await assinado();
      const etapas = async () =>
        Object.fromEntries(
          (
            await http().get(`${API}/profissionais/${profissionalId}/onboarding`).expect(200)
          ).body.onboarding.etapas.map((e: { etapa: string; concluida: boolean }) => [
            e.etapa,
            e.concluida,
          ]),
        );
      expect(await etapas()).toMatchObject({
        AGENDA_CONFIGURADA: false,
        ACESSO_CRIADO: false,
        PRIMEIRO_ATENDIMENTO: false,
      });

      await prisma.horarioAtendimento.create({
        data: { profissionalId, tipo: 'SEMANAL', diaSemana: 2, inicio: '08:00', fim: '12:00' },
      });
      const vinculado = await criarUsuarioTeste(app, { profissionalIds: [profissionalId] });
      const paciente = await prisma.paciente.create({ data: { nome: 'Paciente Teste' } });
      await prisma.atendimento.create({
        data: { pacienteId: paciente.id, profissionalId, status: 'FINALIZADO' },
      });
      await prisma.profissional.update({ where: { id: profissionalId }, data: { ativo: true } });

      expect(vinculado.id).toBeDefined();
      expect(await etapas()).toMatchObject({
        AGENDA_CONFIGURADA: true,
        ACESSO_CRIADO: true,
        PRIMEIRO_ATENDIMENTO: true,
        PROFISSIONAL_ATIVO: true,
      });
    });

    it('404 para profissional inexistente, 403 sem permissão e fora do escopo', async () => {
      await http().get(`${API}/profissionais/${INEXISTENTE}/onboarding`).expect(404);
      await (
        await semPermissao()
      )
        .get(`${API}/profissionais/${profissionalId}/onboarding`)
        .expect(403);
      const outro = (await prisma.profissional.create({ data: { nome: 'Dr. Outro Teste' } })).id;
      const restrito = await criarUsuarioTeste(app, {
        permissoes: PERMISSOES,
        escopoDados: 'PROFISSIONAIS_VINCULADOS',
        profissionalIds: [outro],
      });
      await comUsuario(app, restrito)
        .get(`${API}/profissionais/${profissionalId}/onboarding`)
        .expect(403);
    });
  });

  describe('GET /onboarding (em andamento)', () => {
    it('lista só os checklists não concluídos', async () => {
      await assinado();

      const resposta = await http().get(`${API}/onboarding`).expect(200);

      const pagina = onboardingPageSchema.parse(resposta.body);
      expect(pagina.meta.total).toBe(1);
      expect(pagina.data[0]).toMatchObject({
        profissionalId,
        profissionalNome: 'Dra. Ana Teste',
        salaNome: 'Sala 7',
        atrasada: false,
      });
    });

    it('filtra os atrasados (mais de 7 dias da assinatura)', async () => {
      const contrato = await contratoAguardando();
      await prisma.profissionalOnboarding.create({
        data: {
          profissionalId,
          contratoSalaId: contrato.id,
          iniciadoEm: new Date(Date.now() - 10 * 86_400_000),
        },
      });

      const atrasados = await http().get(`${API}/onboarding?situacao=ATRASADO`).expect(200);
      const emDia = await http().get(`${API}/onboarding?situacao=EM_ANDAMENTO`).expect(200);

      expect(atrasados.body.data).toHaveLength(1);
      expect(atrasados.body.data[0].atrasada).toBe(true);
      expect(emDia.body.data).toHaveLength(1);
    });

    it('400 para filtro inválido, 403 sem permissão', async () => {
      await http().get(`${API}/onboarding?situacao=XX`).expect(400);
      await (await semPermissao()).get(`${API}/onboarding`).expect(403);
    });

    it('usuário restrito vê só os profissionais vinculados (e nada sem vínculo)', async () => {
      await assinado();
      const vinculado = await criarUsuarioTeste(app, {
        permissoes: PERMISSOES,
        escopoDados: 'PROFISSIONAIS_VINCULADOS',
        profissionalIds: [profissionalId],
      });
      const semVinculo = await criarUsuarioTeste(app, {
        permissoes: PERMISSOES,
        escopoDados: 'PROFISSIONAIS_VINCULADOS',
      });

      expect(
        (await comUsuario(app, vinculado).get(`${API}/onboarding`).expect(200)).body.data,
      ).toHaveLength(1);
      expect(
        (await comUsuario(app, semVinculo).get(`${API}/onboarding`).expect(200)).body.data,
      ).toHaveLength(0);
    });
  });

  describe('PUT /onboarding/:id/recepcao', () => {
    it('marca a recepção orientada com quem e quando, e audita', async () => {
      await assinado();
      const onboarding = await prisma.profissionalOnboarding.findUniqueOrThrow({
        where: { profissionalId },
      });

      const resposta = await http()
        .put(`${API}/onboarding/${onboarding.id}/recepcao`)
        .send({ orientada: true })
        .expect(200);

      const dto = onboardingSchema.parse(resposta.body);
      const etapa = dto.etapas.find((e) => e.etapa === 'RECEPCAO_ORIENTADA');
      expect(etapa).toMatchObject({ concluida: true, concluidaPorId: usuario.id });
      expect(etapa?.concluidaEm).not.toBeNull();
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: 'ProfissionalOnboarding',
        entityId: onboarding.id,
        before: { recepcaoOrientadaEm: null },
        userId: usuario.id,
      });
    });

    it('desmarca', async () => {
      await assinado();
      const onboarding = await prisma.profissionalOnboarding.findUniqueOrThrow({
        where: { profissionalId },
      });
      await http()
        .put(`${API}/onboarding/${onboarding.id}/recepcao`)
        .send({ orientada: true })
        .expect(200);

      const resposta = await http()
        .put(`${API}/onboarding/${onboarding.id}/recepcao`)
        .send({ orientada: false })
        .expect(200);

      expect(
        resposta.body.etapas.find((e: { etapa: string }) => e.etapa === 'RECEPCAO_ORIENTADA'),
      ).toMatchObject({ concluida: false, concluidaEm: null, concluidaPorId: null });
    });

    it('400, 404, 403 e escopo', async () => {
      await assinado();
      const onboarding = await prisma.profissionalOnboarding.findUniqueOrThrow({
        where: { profissionalId },
      });
      const outro = (await prisma.profissional.create({ data: { nome: 'Dr. Outro Teste' } })).id;
      const restrito = await criarUsuarioTeste(app, {
        permissoes: PERMISSOES,
        escopoDados: 'PROFISSIONAIS_VINCULADOS',
        profissionalIds: [outro],
      });

      await http().put(`${API}/onboarding/${onboarding.id}/recepcao`).send({}).expect(400);
      await http()
        .put(`${API}/onboarding/${INEXISTENTE}/recepcao`)
        .send({ orientada: true })
        .expect(404);
      await (
        await semPermissao()
      )
        .put(`${API}/onboarding/${onboarding.id}/recepcao`)
        .send({ orientada: true })
        .expect(403);
      await comUsuario(app, restrito)
        .put(`${API}/onboarding/${onboarding.id}/recepcao`)
        .send({ orientada: true })
        .expect(403);
    });
  });

  describe('PATCH /profissionais/:id/status (regra de ativação)', () => {
    const ativar = () =>
      http().patch(`${API}/profissionais/${profissionalId}/status`).send({ ativo: true });

    it('409 enquanto houver etapa obrigatória pendente, e o profissional segue inativo', async () => {
      await assinado();

      const resposta = await ativar().expect(409);

      expect(resposta.body.code).toBe('ONBOARDING_INCOMPLETO');
      expect(
        (await prisma.profissional.findUniqueOrThrow({ where: { id: profissionalId } })).ativo,
      ).toBe(false);
      await expectNoAudit(prisma, { entity: 'Profissional', entityId: profissionalId });
    });

    it('ativa com todas as etapas obrigatórias concluídas', async () => {
      await assinado();
      await prisma.profissional.update({
        where: { id: profissionalId },
        data: {
          profissao: 'MEDICO',
          registro: 'CRM 1',
          especialidadeId: (await prisma.especialidade.create({ data: { nome: 'Pediatria' } })).id,
          cpf: '00000000000',
          rg: '1',
          dataNascimento: new Date('1990-01-01T00:00:00Z'),
          endereco: 'Rua Fictícia, 1',
          telefone: '11999999999',
          cnpj: '00000000000000',
          contatosAdministrativos: {
            create: { nome: 'Secretária Teste', funcao: 'Secretária', telefone: '11999999999' },
          },
        },
      });
      const arquivo = await prisma.arquivo.create({
        data: {
          uso: 'documento-profissional',
          nomeOriginal: 'doc.pdf',
          chave: `teste/${profissionalId}`,
          contentType: 'application/pdf',
          tamanho: 1,
        },
      });
      for (const tipo of [
        'CONTRATO',
        'DOCUMENTO_PESSOAL',
        'REGISTRO_CONSELHO',
        'LICENCA',
      ] as const) {
        await prisma.profissionalDocumento.create({
          data: { profissionalId, tipo, arquivoId: arquivo.id, situacao: 'VALIDADO' },
        });
      }
      await prisma.horarioAtendimento.create({
        data: { profissionalId, tipo: 'SEMANAL', diaSemana: 2, inicio: '08:00', fim: '12:00' },
      });
      await criarUsuarioTeste(app, { profissionalIds: [profissionalId] });
      const paciente = await prisma.paciente.create({ data: { nome: 'Paciente Teste' } });
      await prisma.atendimento.create({
        data: { pacienteId: paciente.id, profissionalId, status: 'FINALIZADO' },
      });
      const onboarding = await prisma.profissionalOnboarding.findUniqueOrThrow({
        where: { profissionalId },
      });
      await http()
        .put(`${API}/onboarding/${onboarding.id}/recepcao`)
        .send({ orientada: true })
        .expect(200);

      const resposta = await ativar().expect(200);

      expect(resposta.body.ativo).toBe(true);
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: 'Profissional',
        entityId: profissionalId,
        before: { ativo: false },
        after: { ativo: true },
      });
      const final = await http()
        .get(`${API}/profissionais/${profissionalId}/onboarding`)
        .expect(200);
      expect(final.body.onboarding.completo).toBe(true);
      expect((await http().get(`${API}/onboarding`).expect(200)).body.data).toHaveLength(0);
    });

    it('sem onboarding (cadastro anterior à #142) ativa normalmente', async () => {
      await ativar().expect(200);

      expect(
        (await prisma.profissional.findUniqueOrThrow({ where: { id: profissionalId } })).ativo,
      ).toBe(true);
    });

    it('desativar nunca é bloqueado', async () => {
      await assinado();
      await prisma.profissional.update({ where: { id: profissionalId }, data: { ativo: true } });

      await http()
        .patch(`${API}/profissionais/${profissionalId}/status`)
        .send({ ativo: false })
        .expect(200);
    });
  });
});
