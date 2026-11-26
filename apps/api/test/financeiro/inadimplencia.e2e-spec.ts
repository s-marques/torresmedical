import type { INestApplication } from '@nestjs/common';
import {
  cobrancaEnviadaPageSchema,
  painelInadimplenciaSchema,
  reguaCobrancaSchema,
  tituloInadimplentePageSchema,
} from '@torres/shared';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { InadimplenciaAgendador } from '../../src/modules/financeiro/inadimplencia/inadimplencia.agendador';
import { ReguaCobrancaService } from '../../src/modules/financeiro/inadimplencia/regua-cobranca.service';
import { hojeNaClinica } from '../../src/modules/financeiro/inadimplencia/inadimplencia.service';
import { somarDias } from '../../src/modules/financeiro/inadimplencia/inadimplencia.regras';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit } from '../utils/expect-audit';

const BASE = '/api/financeiro/inadimplencia';
const INEXISTENTE = '00000000-0000-4000-8000-000000000000';
const HOJE = hojeNaClinica();
const dia = (n: number) => new Date(`${somarDias(HOJE, n)}T00:00:00.000Z`);

describe('Inadimplência: painel e régua de cobrança (e2e, #166)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let agendador: InadimplenciaAgendador;
  let usuario: UsuarioTeste;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    agendador = app.get(InadimplenciaAgendador);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    usuario = await criarUsuarioTeste(app, {
      permissoes: ['financeiro.inadimplencia.ver', 'financeiro.inadimplencia.editar'],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => comUsuario(app, usuario);

  async function profissional(nome: string, telefone: string | null = '11999990000') {
    return prisma.profissional.create({ data: { nome, telefone } });
  }

  async function canalConectado(profissionalId: string | null = null) {
    return prisma.canalWhatsapp.create({
      data: { nome: 'Canal', numero: '5511999990000', status: 'CONECTADO', profissionalId },
    });
  }

  function titulo(vencimento: number, valor: string, extra: Record<string, unknown> = {}) {
    return prisma.contaReceber.create({
      data: { descricao: 'Aluguel', valor, dataVencimento: dia(vencimento), ...extra },
    });
  }

  describe('GET /painel e /titulos', () => {
    it('200: o painel confere com a lista de títulos vencidos (dados conhecidos)', async () => {
      const ana = await profissional('Dra. Ana Teste');
      const bruno = await profissional('Dr. Bruno Teste');
      const sala = await prisma.sala.create({ data: { nome: 'Sala 1' } });
      const contrato = await prisma.contratoSala.create({
        data: {
          salaId: sala.id,
          locatarioTipo: 'PROFISSIONAL',
          profissionalId: ana.id,
          modalidade: 'MENSAL',
          valorUnitario: 1000,
          dataInicio: new Date('2026-01-01T00:00:00Z'),
        },
      });
      await titulo(0, '300.00'); // a receber hoje
      await titulo(5, '999.00'); // a vencer: fora
      const parcial = await titulo(-1, '1000.00', {
        profissionalSacadoId: ana.id,
        contratoSalaId: contrato.id,
        status: 'PARCIAL',
      });
      await prisma.contaReceberBaixa.create({
        data: {
          contaReceberId: parcial.id,
          dataRecebimento: dia(0),
          valorRecebido: '400.00',
        },
      });
      await titulo(-40, '200.00', { profissionalSacadoId: ana.id, contratoSalaId: contrato.id });
      await titulo(-90, '150.50', { profissionalSacadoId: bruno.id });
      // Fora do painel: pago, cancelado, renegociado, excluído e receita de profissional.
      await titulo(-10, '70.00', { status: 'RECEBIDO' });
      await titulo(-10, '71.00', { status: 'CANCELADO' });
      await titulo(-10, '72.00', { status: 'RENEGOCIADO' });
      await titulo(-10, '73.00', { deletedAt: new Date() });
      await titulo(-10, '74.00', { profissionalId: bruno.id });

      const resposta = await http().get(`${BASE}/painel`).expect(200);
      const painel = painelInadimplenciaSchema.parse(resposta.body);
      expect(painel.data).toBe(HOJE);
      expect(painel.aReceberHoje).toEqual({ valor: '300.00', quantidade: 1 });
      // 600 (saldo do parcial) + 200 + 150,50
      expect(painel.vencidos).toEqual({ valor: '950.50', quantidade: 3 });
      expect(
        Object.fromEntries(painel.aging.map((a) => [a.faixa, [a.valor, a.quantidade]])),
      ).toEqual({
        ATE_30: ['600.00', 1],
        DE_31_A_60: ['200.00', 1],
        ACIMA_60: ['150.50', 1],
      });
      expect(painel.contratosInadimplentes).toBe(1);
      expect(painel.profissionaisInadimplentes).toBe(2);
      expect(painel.porProfissional.map((p) => [p.nome, p.valor])).toEqual([
        ['Dra. Ana Teste', '800.00'],
        ['Dr. Bruno Teste', '150.50'],
      ]);

      // A lista mostra exatamente o que o painel soma.
      const lista = await http().get(`${BASE}/titulos`).expect(200);
      const { data, meta } = tituloInadimplentePageSchema.parse(lista.body);
      expect(meta.total).toBe(painel.vencidos.quantidade);
      expect(data.reduce((t, x) => t + Number(x.saldo), 0).toFixed(2)).toBe(painel.vencidos.valor);
    });

    it('filtra a lista por faixa e por profissional', async () => {
      const ana = await profissional('Dra. Ana Teste');
      await titulo(-40, '200.00', { profissionalSacadoId: ana.id });
      await titulo(-2, '50.00');

      const faixa = await http().get(`${BASE}/titulos`).query({ faixa: 'DE_31_A_60' }).expect(200);
      expect(faixa.body.data).toHaveLength(1);
      const doProfissional = await http()
        .get(`${BASE}/titulos`)
        .query({ profissionalId: ana.id })
        .expect(200);
      expect(doProfissional.body.data).toHaveLength(1);
    });

    it('400: faixa inválida', async () => {
      await http().get(`${BASE}/titulos`).query({ faixa: 'XYZ' }).expect(400);
    });

    it('403: sem a permissão da tela', async () => {
      const sem = await criarUsuarioTeste(app, { permissoes: ['financeiro.contas-receber.ver'] });
      await comUsuario(app, sem).get(`${BASE}/painel`).expect(403);
      await comUsuario(app, sem).get(`${BASE}/titulos`).expect(403);
      await comUsuario(app, sem).get(`${BASE}/cobrancas`).expect(403);
      await comUsuario(app, sem).get(`${BASE}/regua`).expect(403);
    });

    it('403: perfil restrito a profissionais não vê a visão geral (#153)', async () => {
      const ana = await profissional('Dra. Ana Teste');
      const restrito = await criarUsuarioTeste(app, {
        permissoes: ['financeiro.inadimplencia.ver'],
        escopoDados: 'PROFISSIONAIS_VINCULADOS',
        profissionalIds: [ana.id],
      });
      await comUsuario(app, restrito).get(`${BASE}/painel`).expect(403);
      await comUsuario(app, restrito).get(`${BASE}/titulos`).expect(403);
      await comUsuario(app, restrito).get(`${BASE}/regua`).expect(403);
    });
  });

  describe('GET /regua e PATCH /regua/:id', () => {
    it('200: devolve os 4 marcos na ordem, com o texto padrão', async () => {
      const resposta = await http().get(`${BASE}/regua`).expect(200);
      const regua = reguaCobrancaSchema.parse(resposta.body);
      expect(regua.map((m) => [m.marco, m.dias])).toEqual([
        ['ANTES_3_DIAS', -3],
        ['NO_VENCIMENTO', 0],
        ['DEPOIS_3_DIAS', 3],
        ['DEPOIS_7_DIAS', 7],
      ]);
      expect(regua.every((m) => m.ativo && m.enviarWhatsapp && m.mensagem.includes('{nome}'))).toBe(
        true,
      );
    });

    it('200: altera o marco e audita UPDATE com before/after', async () => {
      const [primeiro] = reguaCobrancaSchema.parse((await http().get(`${BASE}/regua`)).body);
      const resposta = await http()
        .patch(`${BASE}/regua/${primeiro!.id}`)
        .send({ ativo: false, mensagem: 'Oi {nome}, o título {titulo} vence em {vencimento}.' })
        .expect(200);
      expect(resposta.body).toMatchObject({ id: primeiro!.id, ativo: false });

      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: 'ReguaCobranca',
        entityId: primeiro!.id,
        userId: usuario.id,
        before: { ativo: true },
        after: { ativo: false, mensagem: 'Oi {nome}, o título {titulo} vence em {vencimento}.' },
      });
    });

    it('400: mensagem vazia, corpo vazio ou campo desconhecido', async () => {
      const [primeiro] = reguaCobrancaSchema.parse((await http().get(`${BASE}/regua`)).body);
      const url = `${BASE}/regua/${primeiro!.id}`;
      const vazia = await http().patch(url).send({ mensagem: '  ' }).expect(400);
      expect(vazia.body.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'mensagem', message: 'Mensagem é obrigatória.' }),
        ]),
      );
      await http().patch(url).send({}).expect(400);
      await http().patch(url).send({ marco: 'NO_VENCIMENTO' }).expect(400);
      expect(await prisma.auditLog.count({ where: { entity: 'ReguaCobranca' } })).toBe(0);
    });

    it('404: marco inexistente', async () => {
      await http().patch(`${BASE}/regua/${INEXISTENTE}`).send({ ativo: false }).expect(404);
    });

    it('403: sem a permissão de editar', async () => {
      const [primeiro] = reguaCobrancaSchema.parse((await http().get(`${BASE}/regua`)).body);
      const leitor = await criarUsuarioTeste(app, { permissoes: ['financeiro.inadimplencia.ver'] });
      await comUsuario(app, leitor)
        .patch(`${BASE}/regua/${primeiro!.id}`)
        .send({ ativo: false })
        .expect(403);
      expect(await prisma.auditLog.count({ where: { entity: 'ReguaCobranca' } })).toBe(0);
    });
  });

  describe('rodada da régua e histórico (GET /cobrancas)', () => {
    it('título que vence em 3 dias gera o aviso uma única vez', async () => {
      const ana = await profissional('Dra. Ana Teste');
      await canalConectado();
      const conta = await titulo(3, '500.00', { profissionalSacadoId: ana.id });

      await expect(agendador.rodar(HOJE)).resolves.toBe(1);
      // Outras rodadas no mesmo dia (a cada hora, reinício da API) não repetem.
      await expect(agendador.rodar(HOJE)).resolves.toBe(0);
      await expect(agendador.rodar(HOJE)).resolves.toBe(0);

      const envios = await prisma.cobrancaEnvio.findMany({ where: { contaReceberId: conta.id } });
      expect(envios).toHaveLength(1);
      expect(envios[0]).toMatchObject({ marco: 'ANTES_3_DIAS', status: 'ENVIADO', erro: null });
      expect(envios[0]!.mensagemWhatsappId).not.toBeNull();

      const mensagem = await prisma.mensagemWhatsapp.findUniqueOrThrow({
        where: { id: envios[0]!.mensagemWhatsappId! },
      });
      expect(mensagem).toMatchObject({ direcao: 'ENVIADA', status: 'PENDENTE' });
      expect(mensagem.conteudo).toContain('Dra. Ana Teste');
      expect(mensagem.conteudo).toContain(`#${conta.numero}`);

      // O envio vira um comando na fila (outbox), com só o id da mensagem.
      const outbox = await prisma.outboxEvent.findMany({
        where: { type: 'comercial.whatsapp.enviar-mensagem' },
      });
      expect(outbox).toHaveLength(1);

      await expectAudit(prisma, {
        action: 'CREATE',
        entity: 'CobrancaEnvio',
        entityId: envios[0]!.id,
        userId: 'system',
        after: { contaReceberId: conta.id, marco: 'ANTES_3_DIAS', status: 'ENVIADO' },
      });

      // Histórico por título.
      const historico = await http()
        .get(`${BASE}/cobrancas`)
        .query({ contaReceberId: conta.id })
        .expect(200);
      const { data } = cobrancaEnviadaPageSchema.parse(historico.body);
      expect(data).toHaveLength(1);
      expect(data[0]).toMatchObject({
        contaReceberNumero: conta.numero,
        profissionalNome: 'Dra. Ana Teste',
        marco: 'ANTES_3_DIAS',
        status: 'ENVIADO',
        canal: 'WHATSAPP',
        vencimento: somarDias(HOJE, 3),
      });
    });

    it('cada marco tem a sua data e só cobra uma vez por título', async () => {
      const ana = await profissional('Dra. Ana Teste');
      await canalConectado();
      const doMarco = {
        ANTES_3_DIAS: await titulo(3, '10.00', { profissionalSacadoId: ana.id }),
        NO_VENCIMENTO: await titulo(0, '20.00', { profissionalSacadoId: ana.id }),
        DEPOIS_3_DIAS: await titulo(-3, '30.00', { profissionalSacadoId: ana.id }),
        DEPOIS_7_DIAS: await titulo(-7, '40.00', { profissionalSacadoId: ana.id }),
      };
      await titulo(2, '50.00', { profissionalSacadoId: ana.id }); // fora de qualquer marco
      await titulo(-5, '60.00', { profissionalSacadoId: ana.id });

      await expect(agendador.rodar(HOJE)).resolves.toBe(4);
      const envios = await prisma.cobrancaEnvio.findMany();
      expect(Object.fromEntries(envios.map((e) => [e.marco, e.contaReceberId]))).toEqual(
        Object.fromEntries(Object.entries(doMarco).map(([marco, c]) => [marco, c.id])),
      );

      // Dia seguinte: nenhum título cai num marco novo e os de ontem não são cobrados de novo.
      await expect(agendador.rodar(somarDias(HOJE, 1))).resolves.toBe(0);
      expect(await prisma.cobrancaEnvio.count()).toBe(4);
    });

    it('sem telefone ou sem canal: registra a falha, visível no histórico, sem repetir', async () => {
      const semFone = await profissional('Dr. Sem Fone', null);
      const semCanal = await profissional('Dr. Sem Canal');
      const a = await titulo(0, '10.00', { profissionalSacadoId: semFone.id });
      const b = await titulo(0, '20.00', { profissionalSacadoId: semCanal.id });
      await canalConectado(semCanal.id).then((c) =>
        prisma.canalWhatsapp.update({ where: { id: c.id }, data: { status: 'DESCONECTADO' } }),
      );

      await expect(agendador.rodar(HOJE)).resolves.toBe(2);
      await expect(agendador.rodar(HOJE)).resolves.toBe(0);

      const envios = await prisma.cobrancaEnvio.findMany({ orderBy: { createdAt: 'asc' } });
      expect(envios.map((e) => [e.contaReceberId, e.status, e.erro])).toEqual(
        expect.arrayContaining([
          [a.id, 'FALHA', 'SEM_TELEFONE'],
          [b.id, 'FALHA', 'SEM_CANAL'],
        ]),
      );
      expect(await prisma.mensagemWhatsapp.count()).toBe(0);

      const falhas = await http().get(`${BASE}/cobrancas`).query({ status: 'FALHA' }).expect(200);
      expect(falhas.body.meta.total).toBe(2);
    });

    it('não cobra título pago, cancelado, renegociado, de paciente ou sem saldo; marco desligado não envia', async () => {
      const ana = await profissional('Dra. Ana Teste');
      const paciente = await prisma.paciente.create({ data: { nome: 'Paciente Teste' } });
      await canalConectado();
      await titulo(0, '10.00', { profissionalSacadoId: ana.id, status: 'RECEBIDO' });
      await titulo(0, '11.00', { profissionalSacadoId: ana.id, status: 'CANCELADO' });
      await titulo(0, '12.00', { profissionalSacadoId: ana.id, status: 'RENEGOCIADO' });
      await titulo(0, '13.00', { pacienteId: paciente.id }); // régua só de profissionais
      const quitado = await titulo(0, '14.00', {
        profissionalSacadoId: ana.id,
        status: 'PARCIAL',
      });
      await prisma.contaReceberBaixa.create({
        data: { contaReceberId: quitado.id, dataRecebimento: dia(0), valorRecebido: '14.00' },
      });
      await expect(agendador.rodar(HOJE)).resolves.toBe(0);

      // Marco desligado: nem o título válido é cobrado.
      await titulo(0, '99.00', { profissionalSacadoId: ana.id });
      const regua = reguaCobrancaSchema.parse((await http().get(`${BASE}/regua`)).body);
      const noVencimento = regua.find((m) => m.marco === 'NO_VENCIMENTO')!;
      await http().patch(`${BASE}/regua/${noVencimento.id}`).send({ ativo: false }).expect(200);
      await expect(agendador.rodar(HOJE)).resolves.toBe(0);
      expect(await prisma.cobrancaEnvio.count()).toBe(0);
    });

    it('usa o canal do profissional e o saldo em aberto no texto', async () => {
      const ana = await profissional('Dra. Ana Teste');
      const canal = await canalConectado(ana.id);
      await canalConectado(); // canal da clínica: o do profissional vem primeiro
      const conta = await titulo(0, '1000.00', { profissionalSacadoId: ana.id, status: 'PARCIAL' });
      await prisma.contaReceberBaixa.create({
        data: { contaReceberId: conta.id, dataRecebimento: dia(0), valorRecebido: '250.00' },
      });

      await agendador.rodar(HOJE);
      const [envio] = await prisma.cobrancaEnvio.findMany();
      const mensagem = await prisma.mensagemWhatsapp.findUniqueOrThrow({
        where: { id: envio!.mensagemWhatsappId! },
        include: { conversa: true },
      });
      expect(mensagem.conversa.canalId).toBe(canal.id);
      expect(mensagem.conteudo.replaceAll(' ', ' ')).toContain('R$ 750,00');
    });
  });

  describe('alerta interno (central de notificações)', () => {
    it('conta os títulos nos marcos ativos e some com o alerta desligado', async () => {
      const ana = await profissional('Dra. Ana Teste');
      await titulo(3, '10.00', { profissionalSacadoId: ana.id });
      await titulo(-7, '10.00', { profissionalSacadoId: ana.id });
      await titulo(1, '10.00', { profissionalSacadoId: ana.id });

      const regua = app.get(ReguaCobrancaService);
      await expect(regua.contarParaAlerta(HOJE)).resolves.toBe(2);

      const marcos = reguaCobrancaSchema.parse((await http().get(`${BASE}/regua`)).body);
      const antes = marcos.find((m) => m.marco === 'ANTES_3_DIAS')!;
      await http().patch(`${BASE}/regua/${antes.id}`).send({ alertaInterno: false }).expect(200);
      await expect(regua.contarParaAlerta(HOJE)).resolves.toBe(1);
    });
  });
});
