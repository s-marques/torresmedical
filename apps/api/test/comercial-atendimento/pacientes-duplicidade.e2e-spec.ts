import type { INestApplication } from '@nestjs/common';
import { verificacaoDuplicidadePacienteSchema } from '@torres/shared';
import request from 'supertest';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import type { Prisma } from '../../src/generated/prisma/client';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit, expectNoAudit } from '../utils/expect-audit';

const BASE = '/api/comercial-atendimento/pacientes';
const VERIFICAR = `${BASE}/duplicidade`;
const ENTIDADE_DUPLICIDADE = 'PacienteDuplicidade';
const PERMISSOES = [
  'comercial-atendimento.pacientes.ver',
  'comercial-atendimento.pacientes.criar',
  'comercial-atendimento.pacientes.editar',
] as const;
// Documento fictício com dígitos verificadores válidos (exemplo público).
const CPF = '52998224725';

describe('Pacientes: possível duplicado (e2e, issue #149)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let usuario: UsuarioTeste;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    usuario = await criarUsuarioTeste(app, { permissoes: PERMISSOES, verDadosSensiveis: true });
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => comUsuario(app, usuario);

  function criarNoBanco(nome: string, extra: Partial<Prisma.PacienteUncheckedCreateInput> = {}) {
    return prisma.paciente.create({ data: { nome, ...extra } });
  }

  async function verificar(corpo: Record<string, unknown>, cliente = http()) {
    const res = await cliente.post(VERIFICAR).send(corpo).expect(200);
    return verificacaoDuplicidadePacienteSchema.parse(res.body).candidatos;
  }

  describe('POST /duplicidade', () => {
    it('encontra pelo mesmo telefone ou celular, com ou sem máscara', async () => {
      const ana = await criarNoBanco('Ana Teste', { celular: '65999990001' });
      const bruno = await criarNoBanco('Bruno Teste', { telefone: '6533330002' });
      await criarNoBanco('Carla Teste', { celular: '65988880003' });

      const porCelular = await verificar({ telefone: '(65) 99999-0001' });
      const porTelefone = await verificar({ celular: '(65) 3333-0002' });

      expect(porCelular.map((c) => [c.id, c.motivos])).toEqual([[ana.id, ['TELEFONE']]]);
      expect(porTelefone.map((c) => [c.id, c.motivos])).toEqual([[bruno.id, ['TELEFONE']]]);
    });

    it('encontra pelo mesmo e-mail, sem diferenciar maiúsculas', async () => {
      const ana = await criarNoBanco('Ana Teste', { email: 'ana@exemplo.test' });

      const candidatos = await verificar({ email: 'ANA@Exemplo.test' });

      expect(candidatos.map((c) => [c.id, c.motivos])).toEqual([[ana.id, ['EMAIL']]]);
    });

    it('encontra pelo mesmo nome + data de nascimento, ignorando acento e caixa', async () => {
      const maria = await criarNoBanco('María da Silva', {
        dataNascimento: new Date('1990-05-17T00:00:00.000Z'),
      });
      await criarNoBanco('Maria da Silva', {
        dataNascimento: new Date('1991-01-01T00:00:00.000Z'),
      });
      await criarNoBanco('Joana Souza', { dataNascimento: new Date('1990-05-17T00:00:00.000Z') });

      const candidatos = await verificar({ nome: 'MARIA DA SILVA', dataNascimento: '1990-05-17' });

      expect(candidatos.map((c) => [c.id, c.motivos, c.dataNascimento])).toEqual([
        [maria.id, ['NOME_NASCIMENTO'], '1990-05-17'],
      ]);
    });

    it('só o nome, sem nascimento, não aponta ninguém; excluídos não contam', async () => {
      await criarNoBanco('Ana Teste', { celular: '65999990001' });
      await criarNoBanco('Excluída', { celular: '65977770009', deletedAt: new Date() });

      expect(await verificar({ nome: 'Ana Teste' })).toEqual([]);
      expect(await verificar({ celular: '65977770009' })).toEqual([]);
    });

    it('mostra o CPF mascarado a quem tem verDadosSensiveis e nada a quem não tem', async () => {
      await criarNoBanco('Ana Teste', { documento: CPF, celular: '65999990001' });
      const sem = await criarUsuarioTeste(app, { permissoes: PERMISSOES });

      const [com] = await verificar({ celular: '65999990001' });
      const res = await comUsuario(app, sem)
        .post(VERIFICAR)
        .send({ celular: '65999990001' })
        .expect(200);

      expect(com?.cpfMascarado).toBe('***.982.247-**');
      expect(res.body.candidatos[0]).toMatchObject({ nome: 'Ana Teste', cpfMascarado: null });
      expect(JSON.stringify(res.body)).not.toContain('982');
      expect(JSON.stringify(res.body)).not.toContain(CPF);
    });

    it('na edição ignora o próprio paciente e o que não mudou', async () => {
      const ana = await criarNoBanco('Ana Teste', { celular: '65999990001' });
      await criarNoBanco('Outra Ana', { celular: '65999990001' });

      const semMudanca = await verificar({ pacienteId: ana.id, celular: '65999990001' });
      const mudou = await verificar({ pacienteId: ana.id, email: 'nova@exemplo.test' });

      expect(semMudanca).toEqual([]);
      expect(mudou).toEqual([]);
    });

    it('não grava nada nem audita (só consulta)', async () => {
      await criarNoBanco('Ana Teste', { celular: '65999990001' });

      await verificar({ celular: '65999990001' });

      expect(await prisma.auditLog.count()).toBe(0);
      expect(await prisma.paciente.count()).toBe(1);
    });

    it('400 para data inválida, pacienteId inválido e campo desconhecido', async () => {
      for (const corpo of [{ dataNascimento: '17/05/1990' }, { pacienteId: 'x' }, { cpf: CPF }]) {
        const res = await http().post(VERIFICAR).send(corpo).expect(400);
        expect(res.body.code).toBe('VALIDATION_ERROR');
      }
    });

    it('401 sem token; 403 sem permissão de criar ou editar', async () => {
      await request(app.getHttpServer()).post(VERIFICAR).send({}).expect(401);
      const semPermissao = await criarUsuarioTeste(app, {
        permissoes: ['comercial-atendimento.pacientes.ver'],
      });
      const res = await comUsuario(app, semPermissao).post(VERIFICAR).send({}).expect(403);
      expect(res.body).toMatchObject({ code: 'FORBIDDEN', message: 'Sem permissão' });
    });

    it('quem só pode editar também consulta', async () => {
      const editor = await criarUsuarioTeste(app, {
        permissoes: ['comercial-atendimento.pacientes.editar'],
      });
      await comUsuario(app, editor).post(VERIFICAR).send({}).expect(200);
    });
  });

  describe('POST (criar) com possível duplicado', () => {
    it('409 PACIENTE_POSSIVEL_DUPLICADO sem confirmação: não grava nem audita', async () => {
      await criarNoBanco('Ana Teste', { celular: '65999990001' });

      const res = await http()
        .post(BASE)
        .send({ nome: 'Ana Duplicada', celular: '65999990001' })
        .expect(409);

      expect(res.body).toMatchObject({
        code: 'PACIENTE_POSSIVEL_DUPLICADO',
        message: 'Paciente possivelmente já cadastrado. Deseja abrir o registro existente?',
      });
      expect(JSON.stringify(res.body)).not.toContain('Ana Teste');
      expect(await prisma.paciente.count()).toBe(1);
      await expectNoAudit(prisma, { entity: 'Paciente' });
    });

    it('201 com duplicidadeConfirmada: grava, audita o CREATE e quem confirmou', async () => {
      const existente = await criarNoBanco('Ana Teste', { email: 'ana@exemplo.test' });

      const res = await http()
        .post(BASE)
        .send({ nome: 'Ana Outra', email: 'ANA@exemplo.test', duplicidadeConfirmada: true })
        .expect(201);

      expect(res.body).not.toHaveProperty('duplicidadeConfirmada');
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: 'Paciente',
        entityId: res.body.id,
        before: null,
        after: { nome: 'Ana Outra' },
        userId: usuario.id,
      });
      const confirmacao = await expectAudit(prisma, {
        action: 'CREATE',
        entity: ENTIDADE_DUPLICIDADE,
        entityId: res.body.id,
        after: {
          duplicidadeConfirmada: true,
          possiveisDuplicados: [{ id: existente.id, motivos: ['EMAIL'] }],
        },
        userId: usuario.id,
      });
      expect(JSON.stringify(confirmacao.after)).not.toContain('Ana Teste');
    });

    it('201 sem duplicado: não registra confirmação, mesmo com o flag', async () => {
      const res = await http()
        .post(BASE)
        .send({ nome: 'Pessoa Única', celular: '65911110000', duplicidadeConfirmada: true })
        .expect(201);

      await expectNoAudit(prisma, { entity: ENTIDADE_DUPLICIDADE, entityId: res.body.id });
    });

    it('CPF igual continua bloqueando (409 PACIENTE_DOCUMENTO_DUPLICADO), mesmo confirmado', async () => {
      await criarNoBanco('Ana Teste', { documento: CPF });

      const res = await http()
        .post(BASE)
        .send({ nome: 'Outra', documento: CPF, duplicidadeConfirmada: true })
        .expect(409);

      expect(res.body.code).toBe('PACIENTE_DOCUMENTO_DUPLICADO');
    });
  });

  describe('PATCH (editar) com possível duplicado', () => {
    it('só pede confirmação quando o critério mudou, e audita ao confirmar', async () => {
      const ana = await criarNoBanco('Ana Teste', { celular: '65999990001' });
      const bia = await criarNoBanco('Bia Teste', { celular: '65988880002' });
      await criarNoBanco('Carla Teste', { email: 'carla@exemplo.test' });

      // Mantém o celular e muda só o nome: não é duplicidade.
      await http()
        .patch(`${BASE}/${ana.id}`)
        .send({ nome: 'Ana Editada', celular: '65999990001' })
        .expect(200);

      // Troca o e-mail para o de outra pessoa: precisa confirmar.
      const corpo = { nome: 'Bia Teste', celular: '65988880002', email: 'carla@exemplo.test' };
      const res = await http().patch(`${BASE}/${bia.id}`).send(corpo).expect(409);
      expect(res.body.code).toBe('PACIENTE_POSSIVEL_DUPLICADO');
      expect((await prisma.paciente.findUniqueOrThrow({ where: { id: bia.id } })).email).toBeNull();

      await http()
        .patch(`${BASE}/${bia.id}`)
        .send({ ...corpo, duplicidadeConfirmada: true })
        .expect(200);
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: ENTIDADE_DUPLICIDADE,
        entityId: bia.id,
        after: { duplicidadeConfirmada: true },
        userId: usuario.id,
      });
    });

    it('um cadastro que já tem parecido não pede confirmação a cada edição', async () => {
      const ana = await criarNoBanco('Ana Teste', { celular: '65999990001' });
      await criarNoBanco('Ana Gêmea', { celular: '65999990001' });

      await http()
        .patch(`${BASE}/${ana.id}`)
        .send({ nome: 'Ana Teste', celular: '65999990001', observacoes: 'Nota nova' })
        .expect(200);
    });
  });

  describe('escopo de dados (issue #153)', () => {
    it('perfil restrito só vê possíveis duplicados entre os pacientes vinculados', async () => {
      const medico = await prisma.profissional.create({ data: { nome: 'Dra. Escopo' } });
      const outro = await prisma.profissional.create({ data: { nome: 'Dr. Fora' } });
      const vinculado = await criarNoBanco('Vinculada', { celular: '65999990001' });
      const fora = await criarNoBanco('Fora do Escopo', { celular: '65999990001' });
      await prisma.atendimento.createMany({
        data: [
          { pacienteId: vinculado.id, profissionalId: medico.id, queixa: 'Queixa A' },
          { pacienteId: fora.id, profissionalId: outro.id, queixa: 'Queixa B' },
        ],
      });
      const restrito = await criarUsuarioTeste(app, {
        permissoes: PERMISSOES,
        escopoDados: 'PROFISSIONAIS_VINCULADOS',
        profissionalIds: [medico.id],
      });
      const semVinculo = await criarUsuarioTeste(app, {
        permissoes: PERMISSOES,
        escopoDados: 'PROFISSIONAIS_VINCULADOS',
      });

      const doRestrito = await verificar({ celular: '65999990001' }, comUsuario(app, restrito));
      const doSemVinculo = await verificar({ celular: '65999990001' }, comUsuario(app, semVinculo));
      const doAdmin = await verificar({ celular: '65999990001' });

      expect(doRestrito.map((c) => c.id)).toEqual([vinculado.id]);
      expect(doSemVinculo).toEqual([]);
      expect(doAdmin.map((c) => c.id).sort()).toEqual([vinculado.id, fora.id].sort());
    });
  });
});
