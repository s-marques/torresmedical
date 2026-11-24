import type { INestApplication } from '@nestjs/common';
import { recepcaoFilaSchema, recepcaoItemSchema, recepcaoPageSchema } from '@torres/shared';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit, expectNoAudit } from '../utils/expect-audit';

const BASE = '/api/comercial-atendimento/recepcao';
const MEDICO = '/api/consultorio-assistencial/atendimento-medico';
const PERMISSOES = [
  'comercial-atendimento.recepcao.ver',
  'comercial-atendimento.recepcao.editar',
  'consultorio-assistencial.atendimento-medico.ver',
  'consultorio-assistencial.atendimento-medico.criar',
  'consultorio-assistencial.atendimento-medico.editar',
] as const;
const INEXISTENTE = '00000000-0000-4000-8000-000000000000';

describe('Recepção (e2e)', () => {
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
  const semPermissao = async () =>
    comUsuario(app, await criarUsuarioTeste(app, { permissoes: [] }));
  const mudar = (id: string, status: string) =>
    http().patch(`${BASE}/${id}/status`).send({ status });

  async function cenario() {
    const paciente = await prisma.paciente.create({
      data: { nome: 'Paciente Fictício', documento: '00000000191' },
    });
    const profissional = await prisma.profissional.create({ data: { nome: 'Dra. Fictícia' } });
    const outroProfissional = await prisma.profissional.create({ data: { nome: 'Dr. Outro' } });
    const sala = await prisma.sala.create({ data: { nome: 'Sala 1' } });
    const outraSala = await prisma.sala.create({ data: { nome: 'Sala 2' } });
    const agora = Date.now();
    const criar = (minutos: number, extra: Record<string, unknown> = {}) =>
      prisma.agendamento.create({
        data: {
          pacienteId: paciente.id,
          profissionalId: profissional.id,
          salaId: sala.id,
          inicio: new Date(agora + minutos * 60_000),
          observacoes: 'Anotação interna',
          ...extra,
        },
      });
    const primeiro = await criar(0, { status: 'CONFIRMADO' });
    const segundo = await criar(1, {
      profissionalId: outroProfissional.id,
      salaId: outraSala.id,
    });
    await criar(-24 * 60); // ontem
    await criar(2, { deletedAt: new Date() }); // excluído
    return { profissional, outroProfissional, outraSala, primeiro, segundo };
  }

  describe('GET / (atendimentos de hoje)', () => {
    it('lista só hoje, sem excluídos, e não expõe conteúdo clínico nem anotações', async () => {
      const { primeiro, segundo } = await cenario();

      const res = await http().get(BASE).expect(200);
      const pagina = recepcaoPageSchema.parse(res.body);

      expect(pagina.meta.total).toBe(2);
      expect(pagina.data.map((a) => a.id)).toEqual([primeiro.id, segundo.id]);
      expect(pagina.data[0]).toMatchObject({
        pacienteNome: 'Paciente Fictício',
        profissionalNome: 'Dra. Fictícia',
        salaNome: 'Sala 1',
        status: 'CONFIRMADO',
        chegadaEm: null,
      });
      expect(JSON.stringify(res.body)).not.toContain('Anotação interna');
      expect(Object.keys(pagina.data[0] as object).sort()).toEqual(
        Object.keys(recepcaoItemSchema.shape).sort(),
      );
    });

    it('filtra por profissional, sala e status', async () => {
      const { profissional, outraSala, segundo, primeiro } = await cenario();
      const ids = async (query: Record<string, string>) =>
        recepcaoPageSchema
          .parse((await http().get(BASE).query(query).expect(200)).body)
          .data.map((a) => a.id);

      expect(await ids({ profissionalId: profissional.id })).toEqual([primeiro.id]);
      expect(await ids({ salaId: outraSala.id })).toEqual([segundo.id]);
      expect(await ids({ status: 'CONFIRMADO' })).toEqual([primeiro.id]);
    });

    it('400 para filtro ou ordenação inválidos', async () => {
      await http().get(BASE).query({ salaId: 'x' }).expect(400);
      await http().get(BASE).query({ sort: 'cpf:asc' }).expect(400);
    });

    it('403 sem permissão', async () => {
      await (await semPermissao()).get(BASE).expect(403);
    });

    it('perfil restrito vê só os profissionais vinculados; sem vínculo, nada', async () => {
      const { profissional, outroProfissional, primeiro } = await cenario();
      const restrito = comUsuario(
        app,
        await criarUsuarioTeste(app, {
          permissoes: PERMISSOES,
          escopoDados: 'PROFISSIONAIS_VINCULADOS',
          profissionalIds: [profissional.id],
        }),
      );

      const res = await restrito.get(BASE).expect(200);
      expect(recepcaoPageSchema.parse(res.body).data.map((a) => a.id)).toEqual([primeiro.id]);
      await restrito.get(BASE).query({ profissionalId: outroProfissional.id }).expect(403);

      const semVinculo = comUsuario(
        app,
        await criarUsuarioTeste(app, {
          permissoes: PERMISSOES,
          escopoDados: 'PROFISSIONAIS_VINCULADOS',
        }),
      );
      const vazio = await semVinculo.get(BASE).expect(200);
      expect(recepcaoPageSchema.parse(vazio.body).meta.total).toBe(0);
    });
  });

  describe('PATCH /:id/status', () => {
    it('Chegou grava a chegada e audita before/after com o usuário', async () => {
      const { primeiro } = await cenario();

      const res = await mudar(primeiro.id, 'CHECK_IN').expect(200);
      const item = recepcaoItemSchema.parse(res.body);

      expect(item.status).toBe('CHECK_IN');
      expect(item.chegadaEm).not.toBeNull();
      const banco = await prisma.agendamento.findUniqueOrThrow({ where: { id: primeiro.id } });
      expect(banco.chegadaEm).not.toBeNull();
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: 'Agendamento',
        entityId: primeiro.id,
        before: { status: 'CONFIRMADO', chegadaEm: null },
        after: { status: 'CHECK_IN' },
        userId: usuario.id,
      });
    });

    it('Aguardando mantém a chegada e a fila sai por ordem de chegada', async () => {
      const { primeiro, segundo } = await cenario();
      await mudar(segundo.id, 'CHECK_IN').expect(200);
      await mudar(primeiro.id, 'AGUARDANDO').expect(200);
      const chegada = (await prisma.agendamento.findUniqueOrThrow({ where: { id: segundo.id } }))
        .chegadaEm;

      await mudar(segundo.id, 'AGUARDANDO').expect(200);

      const banco = await prisma.agendamento.findUniqueOrThrow({ where: { id: segundo.id } });
      expect(banco.chegadaEm).toEqual(chegada);
      const fila = recepcaoFilaSchema.parse((await http().get(`${BASE}/fila`).expect(200)).body);
      expect(fila.data.map((a) => a.id)).toEqual([segundo.id, primeiro.id]);
    });

    it('Faltou apaga a chegada e tira da fila', async () => {
      const { primeiro } = await cenario();
      await mudar(primeiro.id, 'CHECK_IN').expect(200);

      await mudar(primeiro.id, 'FALTOU').expect(200);

      const banco = await prisma.agendamento.findUniqueOrThrow({ where: { id: primeiro.id } });
      expect(banco).toMatchObject({ status: 'FALTOU', chegadaEm: null });
      const fila = recepcaoFilaSchema.parse((await http().get(`${BASE}/fila`).expect(200)).body);
      expect(fila.data).toHaveLength(0);
    });

    it('Atender (médico) grava a entrada e Finalizar grava o fim; a recepção não mexe mais', async () => {
      const { primeiro } = await cenario();
      await mudar(primeiro.id, 'CHECK_IN').expect(200);
      await http().post(`${MEDICO}/${primeiro.id}/iniciar`).expect(201);

      let banco = await prisma.agendamento.findUniqueOrThrow({ where: { id: primeiro.id } });
      expect(banco.status).toBe('EM_ATENDIMENTO');
      expect(banco.entradaEm).not.toBeNull();
      expect(banco.chegadaEm).not.toBeNull();
      await mudar(primeiro.id, 'AGUARDANDO').expect(422);

      await http().post(`${MEDICO}/${primeiro.id}/finalizar`).expect(201);

      banco = await prisma.agendamento.findUniqueOrThrow({ where: { id: primeiro.id } });
      expect(banco.status).toBe('ATENDIDO');
      expect(banco.finalizadoEm).not.toBeNull();
    });

    it('422 RECEPCAO_STATUS_TRAVADO não audita', async () => {
      const { primeiro } = await cenario();
      await prisma.agendamento.update({ where: { id: primeiro.id }, data: { status: 'ATENDIDO' } });

      const res = await mudar(primeiro.id, 'CHECK_IN').expect(422);

      expect(res.body.code).toBe('RECEPCAO_STATUS_TRAVADO');
      await expectNoAudit(prisma, { entity: 'Agendamento', entityId: primeiro.id });
    });

    it('400 para status que a recepção não aplica, corpo vazio ou id inválido', async () => {
      const { primeiro } = await cenario();
      await mudar(primeiro.id, 'EM_ATENDIMENTO').expect(400);
      await http().patch(`${BASE}/${primeiro.id}/status`).send({}).expect(400);
      await mudar('abc', 'CHECK_IN').expect(400);
    });

    it('404 para agendamento inexistente', async () => {
      await mudar(INEXISTENTE, 'CHECK_IN').expect(404);
    });

    it('403 sem permissão de editar ou fora do escopo, sem auditar', async () => {
      const { primeiro, outroProfissional } = await cenario();
      const alvo = `${BASE}/${primeiro.id}/status`;
      await (await semPermissao()).patch(alvo).send({ status: 'CHECK_IN' }).expect(403);
      const somenteVer = comUsuario(
        app,
        await criarUsuarioTeste(app, { permissoes: ['comercial-atendimento.recepcao.ver'] }),
      );
      await somenteVer.patch(alvo).send({ status: 'CHECK_IN' }).expect(403);
      const restrito = comUsuario(
        app,
        await criarUsuarioTeste(app, {
          permissoes: PERMISSOES,
          escopoDados: 'PROFISSIONAIS_VINCULADOS',
          profissionalIds: [outroProfissional.id],
        }),
      );
      await restrito.patch(alvo).send({ status: 'CHECK_IN' }).expect(403);

      await expectNoAudit(prisma, { entity: 'Agendamento', entityId: primeiro.id });
    });
  });

  describe('GET /fila', () => {
    it('403 sem permissão', async () => {
      await (await semPermissao()).get(`${BASE}/fila`).expect(403);
    });
  });
});
