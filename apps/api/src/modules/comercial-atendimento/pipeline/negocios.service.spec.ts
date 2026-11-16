import { Prisma } from '../../../generated/prisma/client';
import { CrmConfigService } from './crm-config.service';
import { instanteDaAtividade, NegociosService, toNegocio } from './negocios.service';

type Entrada = Parameters<typeof toNegocio>[0];

const PIPELINE = '00000000-0000-4000-8000-0000000000a1';
const OUTRO_PIPELINE = '00000000-0000-4000-8000-0000000000a2';
const ESTAGIO = '00000000-0000-4000-8000-0000000000b1';
const ESTAGIO_PROPOSTA = '00000000-0000-4000-8000-0000000000b2';
const ID = '00000000-0000-4000-8000-0000000000c1';
const USUARIO = '00000000-0000-4000-8000-0000000000d1';
const PACIENTE = '00000000-0000-4000-8000-0000000000e1';

const SEM_NOMES = { pacientes: new Map(), profissionais: new Map(), usuarios: new Map() };

function negocio(extra: Partial<Entrada> = {}): Entrada {
  return {
    id: ID,
    pipelineId: PIPELINE,
    estagioId: ESTAGIO,
    titulo: 'Sala 10 - Clínica geral',
    valor: new Prisma.Decimal('1160'),
    contatoTipo: null,
    contatoId: null,
    responsavelId: null,
    previsaoFechamento: null,
    origemClienteId: null,
    status: 'ABERTO',
    motivoPerdaId: null,
    fechadoEm: null,
    marcoPrimeiroContatoEm: null,
    marcoVisitaEm: null,
    marcoPropostaEm: null,
    marcoContratoEm: null,
    createdAt: new Date('2026-11-01T12:00:00Z'),
    updatedAt: new Date('2026-11-01T12:00:00Z'),
    deletedAt: null,
    origemCliente: null,
    motivoPerda: null,
    atividades: [],
    ...extra,
  } as Entrada;
}

function atividade(dataHora: string) {
  return {
    id: '00000000-0000-4000-8000-0000000000f1',
    negocioId: ID,
    tipo: 'FOLLOW_UP' as const,
    titulo: 'Retornar',
    dataHora: new Date(dataHora),
    responsavelId: USUARIO,
    status: 'PENDENTE' as const,
    concluidaEm: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };
}

describe('toNegocio', () => {
  const agora = new Date('2026-11-14T12:00:00Z');

  it('mapeia valor, contato, responsável, origem e marcos', () => {
    const dto = toNegocio(
      negocio({
        contatoTipo: 'PACIENTE',
        contatoId: PACIENTE,
        responsavelId: USUARIO,
        previsaoFechamento: new Date('2026-12-01T00:00:00Z'),
        origemCliente: { nome: 'Instagram' },
        marcoPropostaEm: new Date('2026-11-10T10:00:00Z'),
      }),
      {
        pacientes: new Map([[PACIENTE, 'Ana Teste']]),
        profissionais: new Map(),
        usuarios: new Map([[USUARIO, 'Usuário Teste']]),
      },
      agora,
    );
    expect(dto).toMatchObject({
      valor: '1160',
      contato: 'Ana Teste',
      responsavel: 'Usuário Teste',
      previsaoFechamento: '2026-12-01',
      origem: 'Instagram',
      marcos: { PROPOSTA: '2026-11-10T10:00:00.000Z' },
    });
  });

  it('negócio aberto sem atividade pendente fica SEM_ACAO', () => {
    expect(toNegocio(negocio(), SEM_NOMES, agora)).toMatchObject({
      proximaAtividade: null,
      situacaoAcao: 'SEM_ACAO',
    });
  });

  it('próxima atividade no passado fica ATRASADA; no futuro, EM_DIA', () => {
    const atrasado = negocio({ atividades: [atividade('2026-11-13T12:00:00Z')] });
    const emDia = negocio({ atividades: [atividade('2026-11-15T12:00:00Z')] });
    expect(toNegocio(atrasado, SEM_NOMES, agora).situacaoAcao).toBe('ATRASADA');
    expect(toNegocio(emDia, SEM_NOMES, agora).situacaoAcao).toBe('EM_DIA');
  });

  it('ganho e perdido não têm situação de próxima ação', () => {
    expect(toNegocio(negocio({ status: 'GANHO' }), SEM_NOMES, agora).situacaoAcao).toBeNull();
  });

  it('usa o nome do profissional quando o contato é profissional', () => {
    const dto = toNegocio(
      negocio({ contatoTipo: 'PROFISSIONAL', contatoId: PACIENTE }),
      { ...SEM_NOMES, profissionais: new Map([[PACIENTE, 'Dra. Teste']]) },
      agora,
    );
    expect(dto.contato).toBe('Dra. Teste');
  });
});

describe('instanteDaAtividade', () => {
  it('converte dia e hora do fuso da clínica (UTC-3) para o instante', () => {
    expect(instanteDaAtividade('2026-11-20', '09:30').toISOString()).toBe(
      '2026-11-20T12:30:00.000Z',
    );
  });
});

describe('NegociosService (regras)', () => {
  function criar(atual: Entrada, estagios: Record<string, unknown> = {}) {
    const update = jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      ...atual,
      ...data,
    }));
    const tx = {
      negocio: { findFirst: jest.fn(async () => atual), update },
      atividadeNegocio: {
        create: jest.fn(async ({ data }) => ({ ...atividade('2026-11-20T12:00:00Z'), ...data })),
      },
    };
    const config = {
      buscarEstagio: jest.fn(async (id: string) => {
        const estagio = estagios[id];
        if (!estagio) throw new Error('404');
        return estagio;
      }),
      buscarMotivoPerda: jest.fn(async () => ({ id: 'm' })),
    } as unknown as CrmConfigService;
    const usuarios = {
      nomesPorIds: jest.fn(async () => new Map()),
      garantirAtivo: jest.fn(async () => undefined),
    };
    const vazio = { nomesPorIds: jest.fn(async () => new Map()) };
    const service = new NegociosService(
      { tx } as never,
      config,
      vazio as never,
      vazio as never,
      usuarios as never,
      {} as never,
    );
    return { service, update, tx, usuarios };
  }

  const estagio = (id: string, pipelineId = PIPELINE, marco: string | null = null) => ({
    id,
    pipelineId,
    marco,
  });

  it('mover grava a data do marco só na primeira entrada no estágio', async () => {
    const { service, update } = criar(negocio(), {
      [ESTAGIO_PROPOSTA]: estagio(ESTAGIO_PROPOSTA, PIPELINE, 'PROPOSTA'),
    });
    await service.mover(ID, { estagioId: ESTAGIO_PROPOSTA });
    expect(update.mock.calls[0]?.[0].data).toMatchObject({
      estagioId: ESTAGIO_PROPOSTA,
      marcoPropostaEm: expect.any(Date),
    });

    const jaPassou = criar(negocio({ marcoPropostaEm: new Date('2026-01-01') }), {
      [ESTAGIO_PROPOSTA]: estagio(ESTAGIO_PROPOSTA, PIPELINE, 'PROPOSTA'),
    });
    await jaPassou.service.mover(ID, { estagioId: ESTAGIO_PROPOSTA });
    expect(jaPassou.update.mock.calls[0]?.[0].data).not.toHaveProperty('marcoPropostaEm');
  });

  it('não move para estágio de outro pipeline nem negócio fechado', async () => {
    const outro = criar(negocio(), { [ESTAGIO]: estagio(ESTAGIO, OUTRO_PIPELINE) });
    await expect(outro.service.mover(ID, { estagioId: ESTAGIO })).rejects.toMatchObject({
      response: { code: 'ESTAGIO_DE_OUTRO_PIPELINE' },
    });

    const ganho = criar(negocio({ status: 'GANHO' }), { [ESTAGIO]: estagio(ESTAGIO) });
    await expect(ganho.service.mover(ID, { estagioId: ESTAGIO })).rejects.toMatchObject({
      response: { code: 'NEGOCIO_FECHADO', message: 'O negócio já foi marcado como ganho.' },
    });
  });

  it('ganho fecha o negócio e perdido grava o motivo', async () => {
    const { service, update } = criar(negocio());
    await service.ganhar(ID);
    expect(update.mock.calls[0]?.[0].data).toMatchObject({
      status: 'GANHO',
      fechadoEm: expect.any(Date),
      motivoPerdaId: null,
    });

    const perdido = criar(negocio());
    await perdido.service.perder(ID, { motivoPerdaId: 'm' });
    expect(perdido.update.mock.calls[0]?.[0].data).toMatchObject({
      status: 'PERDIDO',
      motivoPerdaId: 'm',
    });

    const jaPerdido = criar(negocio({ status: 'PERDIDO' }));
    await expect(jaPerdido.service.ganhar(ID)).rejects.toMatchObject({
      response: { code: 'NEGOCIO_FECHADO', message: 'O negócio já foi marcado como perdido.' },
    });
  });

  it('follow-up sem responsável herda o responsável do negócio', async () => {
    const { service, tx } = criar(negocio({ responsavelId: USUARIO }));
    await service.agendarAtividade(ID, {
      tipo: 'FOLLOW_UP',
      titulo: 'Ligar',
      data: '2026-11-20',
      hora: '09:00',
      responsavelId: null,
    });
    expect(tx.atividadeNegocio.create.mock.calls[0]?.[0].data).toMatchObject({
      negocioId: ID,
      responsavelId: USUARIO,
      dataHora: new Date('2026-11-20T12:00:00Z'),
    });
  });
});
