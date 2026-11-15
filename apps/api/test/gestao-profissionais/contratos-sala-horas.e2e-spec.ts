import type { INestApplication } from '@nestjs/common';
import { contratoHoraSchema, contratoHorasResponseSchema } from '@torres/shared';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit, expectNoAudit } from '../utils/expect-audit';

const BASE = '/api/gestao-profissionais/contratos-sala';
const ENTITY = 'ContratoSalaHora';
const PERMISSOES = ['gestao-profissionais.salas.ver', 'gestao-profissionais.salas.editar'] as const;
const INEXISTENTE = '00000000-0000-4000-8000-000000000000';

describe('Horas utilizadas dos contratos de salas (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let usuario: UsuarioTeste;
  let contratoId: string;
  let mensalId: string;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    usuario = await criarUsuarioTeste(app, { permissoes: PERMISSOES });
    const sala = await prisma.sala.create({ data: { nome: 'Sala 11' } });
    const profissional = await prisma.profissional.create({ data: { nome: 'Dra. Ana Teste' } });
    const base = {
      salaId: sala.id,
      locatarioTipo: 'PROFISSIONAL' as const,
      profissionalId: profissional.id,
      dataInicio: new Date('2026-10-01T00:00:00Z'),
    };
    contratoId = (
      await prisma.contratoSala.create({
        data: { ...base, modalidade: 'HORA', valorUnitario: 87.5, quantidadeMensal: 4 },
      })
    ).id;
    mensalId = (
      await prisma.contratoSala.create({
        data: { ...base, modalidade: 'MENSAL', valorUnitario: 1500 },
      })
    ).id;
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => comUsuario(app, usuario);
  const url = (id = contratoId) => `${BASE}/${id}/horas`;

  function lancar(data: string, entrada: string, saida: string, observacao?: string) {
    return prisma.contratoSalaHora.create({
      data: {
        contratoId,
        data: new Date(`${data}T00:00:00Z`),
        entrada,
        saida,
        observacao,
      },
    });
  }

  describe('GET', () => {
    it('lista só o mês pedido, em ordem, com o resumo e o valor das horas', async () => {
      await lancar('2026-10-22', '14:00', '15:30', 'Retorno');
      await lancar('2026-10-21', '08:00', '09:00');
      await lancar('2026-09-30', '08:00', '12:00');
      await lancar('2026-11-01', '08:00', '12:00');

      const res = contratoHorasResponseSchema.parse(
        (await http().get(url()).query({ mes: '2026-10' }).expect(200)).body,
      );

      expect(res.data.map((h) => [h.data, h.entrada, h.saida, h.duracaoMinutos])).toEqual([
        ['2026-10-21', '08:00', '09:00', 60],
        ['2026-10-22', '14:00', '15:30', 90],
      ]);
      expect(res.data[1]?.observacao).toBe('Retorno');
      expect(res.resumo).toEqual({
        valorHora: 87.5,
        horasContratadas: 4,
        minutosUtilizados: 150,
        valorTotal: 218.75,
      });
    });

    it('mês sem lançamentos devolve lista vazia e total zero', async () => {
      const res = await http().get(url()).query({ mes: '2026-12' }).expect(200);
      expect(res.body.data).toEqual([]);
      expect(res.body.resumo).toMatchObject({ minutosUtilizados: 0, valorTotal: 0 });
    });

    it('400 para mês inválido ou ausente, 404, 409 em contrato Mensal e 403 sem permissão', async () => {
      await http().get(url()).expect(400);
      await http().get(url()).query({ mes: '2026-13' }).expect(400);
      await http().get(url(INEXISTENTE)).query({ mes: '2026-10' }).expect(404);
      await http().get(url('abc')).query({ mes: '2026-10' }).expect(400);
      const mensal = await http().get(url(mensalId)).query({ mes: '2026-10' }).expect(409);
      expect(mensal.body.code).toBe('CONTRATO_NAO_HORA_AVULSA');
      const semPermissao = await criarUsuarioTeste(app, { permissoes: [] });
      await comUsuario(app, semPermissao).get(url()).query({ mes: '2026-10' }).expect(403);
    });

    it('contrato excluído não tem horas (404)', async () => {
      await prisma.contratoSala.update({
        where: { id: contratoId },
        data: { deletedAt: new Date() },
      });
      await http().get(url()).query({ mes: '2026-10' }).expect(404);
    });
  });

  describe('POST', () => {
    it('201 grava o lançamento e audita CREATE', async () => {
      const res = await http()
        .post(url())
        .send({ data: '2026-10-21', entrada: '08:00', saida: '09:00', observacao: ' Retorno ' })
        .expect(201);

      expect(contratoHoraSchema.parse(res.body)).toMatchObject({
        contratoId,
        data: '2026-10-21',
        entrada: '08:00',
        saida: '09:00',
        duracaoMinutos: 60,
        observacao: 'Retorno',
      });
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: ENTITY,
        entityId: res.body.id,
        before: null,
        after: { id: res.body.id, contratoId, entrada: '08:00', saida: '09:00' },
        userId: usuario.id,
      });
      const lista = await http().get(url()).query({ mes: '2026-10' }).expect(200);
      expect(lista.body.resumo.valorTotal).toBe(87.5);
    });

    it('400 com mensagens por campo, sem auditar', async () => {
      const res = await http()
        .post(url())
        .send({ data: '', entrada: '8h', saida: '', extra: 1 })
        .expect(400);
      expect(res.body.details).toEqual(
        expect.arrayContaining([
          { field: 'data', message: 'Data é obrigatória.' },
          { field: 'entrada', message: 'Hora de entrada inválida' },
          { field: 'saida', message: 'Hora de saída é obrigatória.' },
          { field: 'extra', message: 'Campo não permitido' },
        ]),
      );
      const ordem = await http()
        .post(url())
        .send({ data: '2026-10-21', entrada: '10:00', saida: '09:00' })
        .expect(400);
      expect(ordem.body.details).toEqual([
        { field: 'saida', message: 'A saída deve ser depois da entrada' },
      ]);
      await expectNoAudit(prisma, { entity: ENTITY });
    });

    it('404, 409 em contrato Mensal e 403 sem permissão de editar', async () => {
      const corpo = { data: '2026-10-21', entrada: '08:00', saida: '09:00' };
      await http().post(url(INEXISTENTE)).send(corpo).expect(404);
      await http().post(url(mensalId)).send(corpo).expect(409);
      const leitor = await criarUsuarioTeste(app, {
        permissoes: ['gestao-profissionais.salas.ver'],
      });
      await comUsuario(app, leitor).post(url()).send(corpo).expect(403);
      await expectNoAudit(prisma, { entity: ENTITY });
    });
  });

  describe('DELETE /:horaId', () => {
    it('remove o lançamento e audita DELETE', async () => {
      const hora = await lancar('2026-10-21', '08:00', '09:00');

      await http().delete(`${url()}/${hora.id}`).expect(200);

      await expectAudit(prisma, {
        action: 'DELETE',
        entity: ENTITY,
        entityId: hora.id,
        before: { contratoId, entrada: '08:00' },
        after: null,
        userId: usuario.id,
      });
      expect(await prisma.contratoSalaHora.count()).toBe(0);
    });

    it('404 para inexistente ou de outro contrato, 400 para id inválido e 403 sem permissão', async () => {
      const hora = await lancar('2026-10-21', '08:00', '09:00');
      await http().delete(`${url()}/${INEXISTENTE}`).expect(404);
      await http().delete(`${url()}/abc`).expect(400);
      await http()
        .delete(`${url(INEXISTENTE)}/${hora.id}`)
        .expect(404);
      const leitor = await criarUsuarioTeste(app, {
        permissoes: ['gestao-profissionais.salas.ver'],
      });
      await comUsuario(app, leitor).delete(`${url()}/${hora.id}`).expect(403);
      expect(await prisma.contratoSalaHora.count()).toBe(1);
    });
  });

  describe('POST gerar-cobranca', () => {
    it('gera a cobrança das horas do mês e audita, sem duplicar', async () => {
      await lancar('2026-10-21', '08:00', '09:00');
      await lancar('2026-10-22', '14:00', '15:30');

      const res = await http()
        .post(`${url()}/gerar-cobranca`)
        .send({ mes: '2026-10' })
        .expect(200);
      expect(res.body.valor).toBe('218.75');

      await expectAudit(prisma, {
        action: 'CREATE',
        entity: 'ContaReceber',
        entityId: res.body.id,
        before: null,
        after: { valor: '218.75' },
      });

      await http().post(`${url()}/gerar-cobranca`).send({ mes: '2026-10' }).expect(409);
    });

    it('409 sem horas lançadas no mês, 404, 409 em contrato Mensal e 403 sem permissão', async () => {
      await http().post(`${url()}/gerar-cobranca`).send({ mes: '2026-12' }).expect(409);
      await http().post(`${url(INEXISTENTE)}/gerar-cobranca`).send({ mes: '2026-10' }).expect(404);
      await http().post(`${url(mensalId)}/gerar-cobranca`).send({ mes: '2026-10' }).expect(409);
      const leitor = await criarUsuarioTeste(app, {
        permissoes: ['gestao-profissionais.salas.ver'],
      });
      await comUsuario(app, leitor)
        .post(`${url()}/gerar-cobranca`)
        .send({ mes: '2026-10' })
        .expect(403);
    });
  });

  it('excluir o contrato apaga as horas dele (cascata no banco)', async () => {
    await lancar('2026-10-21', '08:00', '09:00');
    await prisma.contratoSala.delete({ where: { id: contratoId } });
    expect(await prisma.contratoSalaHora.count()).toBe(0);
  });
});
