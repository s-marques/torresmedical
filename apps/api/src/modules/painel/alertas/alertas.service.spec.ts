import type { UsuarioAutenticado } from '../../../common/auth/usuario-autenticado';
import { escopoFalso } from '../../../../test/utils/escopo-falso';
import { AlertasService } from './alertas.service';

jest.mock('@nestjs-cls/transactional', () => ({
  ...jest.requireActual('@nestjs-cls/transactional'),
  Transactional: () => () => undefined,
}));

const AGORA = new Date('2026-11-25T15:00:00Z');
const DIA = new Date('2026-11-25T00:00:00.000Z');
const USUARIO_ID = '00000000-0000-4000-8000-0000000000a1';
const ALERTA_ID = '00000000-0000-4000-8000-0000000000b1';
const ESTADO_ID = '00000000-0000-4000-8000-0000000000c1';

function usuario(permissoes: string[]): UsuarioAutenticado {
  return { id: USUARIO_ID, permissoes: new Set(permissoes) } as unknown as UsuarioAutenticado;
}

const FINANCEIRO = usuario(['painel.painel.ver', 'financeiro.contas-pagar.ver']);

type Linha = Record<string, unknown>;

function alerta(extra: Linha = {}): Linha {
  return {
    id: ALERTA_ID,
    tipo: 'CONTAS_PAGAR_VENCIDAS',
    data: DIA,
    quantidade: 4,
    usuarios: [],
    ...extra,
  };
}

function criar(linhas: Linha[] = [alerta()], escopo = escopoFalso()) {
  const tx = {
    alerta: {
      findMany: jest.fn(async () => linhas),
      findFirst: jest.fn(async () => linhas[0] ?? null),
      upsert: jest.fn(async () => undefined),
      count: jest.fn(async () => linhas.length),
    },
    alertaUsuario: {
      create: jest.fn(async ({ data }: { data: Linha }) => ({ id: ESTADO_ID, ...data })),
      update: jest.fn(async ({ data }: { data: Linha }) => ({
        id: ESTADO_ID,
        alertaId: ALERTA_ID,
        usuarioId: USUARIO_ID,
        lidoEm: null,
        resolvidoEm: null,
        ...data,
      })),
    },
  };
  const audit = { record: jest.fn(async () => undefined) };
  const regras = [
    { tipo: 'CONTAS_PAGAR_VENCENDO', contar: jest.fn(async () => 2) },
    { tipo: 'CONTAS_PAGAR_VENCIDAS', contar: jest.fn(async () => 0) },
  ];
  const service = new AlertasService({ tx } as never, regras as never, escopo, audit as never);
  return { service, tx, audit, regras };
}

describe('AlertasService.recalcular', () => {
  it('grava um contador por regra, no dia da clínica, inclusive zero', async () => {
    const { service, tx, regras } = criar();
    const tipos = await service.recalcular(AGORA);

    expect(tipos).toEqual(['CONTAS_PAGAR_VENCENDO', 'CONTAS_PAGAR_VENCIDAS']);
    expect(regras[0]?.contar).toHaveBeenCalledWith('2026-11-25');
    expect(tx.alerta.upsert).toHaveBeenCalledWith({
      where: { tipo_data: { tipo: 'CONTAS_PAGAR_VENCIDAS', data: DIA } },
      create: { tipo: 'CONTAS_PAGAR_VENCIDAS', data: DIA, quantidade: 0 },
      update: { quantidade: 0 },
    });
  });

  it('uma regra que falha interrompe a rodada e propaga o erro ao agendador', async () => {
    const { service, regras } = criar();
    regras[0]?.contar.mockRejectedValueOnce(new Error('falha'));
    await expect(service.recalcular(AGORA)).rejects.toThrow('falha');
  });
});

describe('AlertasService.listar', () => {
  it('consulta só os tipos que o usuário pode ver e só quantidade positiva', async () => {
    const { service, tx } = criar();
    await service.listar(FINANCEIRO, { incluirResolvidos: false }, AGORA);
    expect(tx.alerta.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          data: DIA,
          tipo: { in: ['CONTAS_PAGAR_VENCENDO', 'CONTAS_PAGAR_VENCIDAS'] },
          quantidade: { gt: 0 },
        },
      }),
    );
  });

  it('sem permissão de origem nenhum tipo é consultado', async () => {
    const { service, tx } = criar([]);
    const resumo = await service.listar(
      usuario(['painel.painel.ver']),
      { incluirResolvidos: false },
      AGORA,
    );
    expect(tx.alerta.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tipo: { in: [] } }) }),
    );
    expect(resumo).toEqual({ data: [], naoLidos: 0 });
  });

  it('devolve a rota da lista filtrada e conta os não lidos', async () => {
    const lido = alerta({
      id: 'x',
      tipo: 'CONTAS_PAGAR_VENCENDO',
      usuarios: [{ lidoEm: AGORA, resolvidoEm: null }],
    });
    const { service } = criar([lido, alerta()]);
    const resumo = await service.listar(FINANCEIRO, { incluirResolvidos: false }, AGORA);

    expect(resumo.data.map((a) => [a.tipo, a.rota, a.lido])).toEqual([
      [
        'CONTAS_PAGAR_VENCENDO',
        '/pagar?status=PENDENTE&vencimentoDe=2026-11-25&vencimentoAte=2026-11-25',
        true,
      ],
      ['CONTAS_PAGAR_VENCIDAS', '/pagar?status=VENCIDO', false],
    ]);
    expect(resumo.naoLidos).toBe(1);
  });

  it('esconde os resolvidos, a menos que peça', async () => {
    const resolvido = alerta({ usuarios: [{ lidoEm: AGORA, resolvidoEm: AGORA }] });
    const { service } = criar([resolvido]);
    expect((await service.listar(FINANCEIRO, { incluirResolvidos: false }, AGORA)).data).toEqual(
      [],
    );
    const todos = await service.listar(FINANCEIRO, { incluirResolvidos: true }, AGORA);
    expect(todos.data).toHaveLength(1);
    expect(todos.naoLidos).toBe(0);
  });
});

describe('AlertasService.marcarLido e resolver', () => {
  it('primeira leitura cria o estado do usuário e audita o CREATE', async () => {
    const { service, tx, audit } = criar();
    const dto = await service.marcarLido(FINANCEIRO, ALERTA_ID, AGORA);

    expect(tx.alertaUsuario.create).toHaveBeenCalledWith({
      data: { alertaId: ALERTA_ID, usuarioId: USUARIO_ID, lidoEm: AGORA },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CREATE',
        entity: 'AlertaUsuario',
        entityId: ESTADO_ID,
        before: null,
      }),
    );
    expect(dto).toMatchObject({ lido: true, resolvido: false });
  });

  it('resolver atualiza o estado existente, mantém o lido e audita o UPDATE', async () => {
    const lidoAntes = new Date('2026-11-25T10:00:00Z');
    const existente = {
      id: ESTADO_ID,
      alertaId: ALERTA_ID,
      usuarioId: USUARIO_ID,
      lidoEm: lidoAntes,
      resolvidoEm: null,
    };
    const { service, tx, audit } = criar([alerta({ usuarios: [existente] })]);
    const dto = await service.resolver(FINANCEIRO, ALERTA_ID, AGORA);

    expect(tx.alertaUsuario.update).toHaveBeenCalledWith({
      where: { id: ESTADO_ID },
      data: { lidoEm: lidoAntes, resolvidoEm: AGORA },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'UPDATE',
        before: expect.objectContaining({ resolvidoEm: null }),
        after: expect.objectContaining({ resolvidoEm: AGORA }),
      }),
    );
    expect(dto.resolvido).toBe(true);
  });

  it('alerta inexistente: 404', async () => {
    const { service } = criar([]);
    await expect(service.marcarLido(FINANCEIRO, ALERTA_ID)).rejects.toMatchObject({
      status: 404,
    });
  });

  it('alerta de um tipo que o usuário não vê: 403 e nada é gravado', async () => {
    const { service, tx, audit } = criar([alerta({ tipo: 'RECEBIVEIS_VENCIDOS' })]);
    await expect(service.marcarLido(FINANCEIRO, ALERTA_ID)).rejects.toMatchObject({
      status: 403,
    });
    expect(tx.alertaUsuario.create).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });
});
