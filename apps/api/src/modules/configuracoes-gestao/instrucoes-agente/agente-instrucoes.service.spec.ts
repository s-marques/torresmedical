import type { TransactionHost } from '@nestjs-cls/transactional';
import type { RequestContextService } from '../../../common/context/request-context.service';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { AgenteInstrucoesService } from './agente-instrucoes.service';

const ID = '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const USUARIO = '5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a';
const AGORA = new Date('2026-11-19T12:00:00Z');

function registro(extra: Record<string, unknown> = {}) {
  return {
    id: ID,
    nome: 'Atendimento',
    modelo: 'gpt-4.1-mini',
    temperatura: 0.7,
    maxTokens: 1500,
    ativo: false,
    systemPrompt: 'Você é um assistente.',
    status: 'RASCUNHO',
    versaoAtual: 1,
    aprovadoPor: null,
    aprovadoPorNome: null,
    aprovadoEm: null,
    createdAt: AGORA,
    updatedAt: AGORA,
    ...extra,
  };
}

const CONTEUDO = {
  nome: 'Atendimento',
  modelo: 'gpt-4.1-mini',
  temperatura: 0.7,
  maxTokens: 1500,
  systemPrompt: 'Você é um assistente.',
};

function servico(atual = registro()) {
  const instrucao = {
    findFirst: jest.fn().mockResolvedValue(atual),
    findMany: jest.fn().mockResolvedValue([atual]),
    count: jest.fn().mockResolvedValue(1),
    create: jest.fn().mockImplementation(({ data }) => Promise.resolve(registro(data))),
    update: jest
      .fn()
      .mockImplementation(({ data }) => Promise.resolve(registro({ ...atual, ...data }))),
  };
  const versao = {
    create: jest.fn().mockResolvedValue({}),
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn(),
  };
  const usuario = { findUnique: jest.fn().mockResolvedValue({ nome: 'Dra. Teste' }) };
  const txHost = {
    tx: { agenteInstrucao: instrucao, agenteInstrucaoVersao: versao, usuario },
  } as unknown as TransactionHost<PrismaAdapter>;
  const contexto = { getUserId: () => USUARIO } as unknown as RequestContextService;
  return { service: new AgenteInstrucoesService(txHost, contexto), instrucao, versao };
}

describe('AgenteInstrucoesService', () => {
  it('list: sem excluídos, busca no nome e converte a temperatura em número', async () => {
    const { service, instrucao } = servico(registro({ temperatura: '0.70' }));
    const pagina = await service.list({
      page: 1,
      pageSize: 10,
      sort: { field: 'createdAt', direction: 'asc' },
      search: 'ana',
      status: 'ativo',
    });
    expect(instrucao.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          ativo: true,
          OR: [{ nome: { contains: 'ana', mode: 'insensitive' } }],
        },
      }),
    );
    expect(pagina.data[0]?.temperatura).toBe(0.7);
  });

  it('create: grava como rascunho inativo e cria a versão 1', async () => {
    const { service, instrucao, versao } = servico();
    await service.create({ ...CONTEUDO, ativo: false });
    expect(instrucao.create).toHaveBeenCalledWith({ data: { ...CONTEUDO, ativo: false } });
    expect(versao.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ numero: 1, criadoPor: USUARIO, criadoPorNome: 'Dra. Teste' }),
    });
  });

  it('create: 422 ao tentar criar já ativa (só publicada pode ficar ativa)', async () => {
    const { service } = servico();
    await expect(service.create({ ...CONTEUDO, ativo: true })).rejects.toMatchObject({
      code: 'BUSINESS_RULE',
    });
  });

  it('update: mudança de conteúdo gera versão nova, volta a rascunho e limpa a aprovação', async () => {
    const { service, instrucao, versao } = servico(
      registro({ status: 'PUBLICADO', ativo: true, aprovadoPor: USUARIO }),
    );
    await service.update(ID, { ...CONTEUDO, systemPrompt: 'Novo prompt', ativo: false });
    expect(instrucao.update).toHaveBeenCalledWith({
      where: { id: ID },
      data: expect.objectContaining({
        systemPrompt: 'Novo prompt',
        status: 'RASCUNHO',
        ativo: false,
        versaoAtual: 2,
        aprovadoPor: null,
        aprovadoEm: null,
      }),
    });
    expect(versao.create).toHaveBeenCalledWith({ data: expect.objectContaining({ numero: 2 }) });
  });

  it('update: 422 ao ativar com conteúdo alterado', async () => {
    const { service } = servico(registro({ status: 'PUBLICADO' }));
    await expect(
      service.update(ID, { ...CONTEUDO, systemPrompt: 'Novo prompt', ativo: true }),
    ).rejects.toMatchObject({ code: 'BUSINESS_RULE' });
  });

  it('update: sem mudar o conteúdo, só liga e desliga; ativar exige estar publicada', async () => {
    const publicada = servico(registro({ status: 'PUBLICADO' }));
    await publicada.service.update(ID, { ...CONTEUDO, ativo: true });
    expect(publicada.instrucao.update).toHaveBeenCalledWith({
      where: { id: ID },
      data: { ativo: true },
    });
    expect(publicada.versao.create).not.toHaveBeenCalled();

    const aprovada = servico(registro({ status: 'APROVADO' }));
    await expect(aprovada.service.update(ID, { ...CONTEUDO, ativo: true })).rejects.toMatchObject({
      code: 'BUSINESS_RULE',
    });
  });

  it('alterarStatus: aprovar registra quem aprovou e quando', async () => {
    const { service, instrucao } = servico(registro({ status: 'EM_TESTE' }));
    await service.alterarStatus(ID, 'APROVADO');
    expect(instrucao.update).toHaveBeenCalledWith({
      where: { id: ID },
      data: expect.objectContaining({
        status: 'APROVADO',
        aprovadoPor: USUARIO,
        aprovadoPorNome: 'Dra. Teste',
        aprovadoEm: expect.any(Date),
      }),
    });
  });

  it('alterarStatus: voltar a rascunho desativa e limpa a aprovação', async () => {
    const { service, instrucao } = servico(registro({ status: 'PUBLICADO', ativo: true }));
    await service.alterarStatus(ID, 'RASCUNHO');
    expect(instrucao.update).toHaveBeenCalledWith({
      where: { id: ID },
      data: expect.objectContaining({ status: 'RASCUNHO', ativo: false, aprovadoPor: null }),
    });
  });

  it('alterarStatus: 422 ao pular etapa (rascunho direto para publicado)', async () => {
    const { service, instrucao } = servico();
    await expect(service.alterarStatus(ID, 'PUBLICADO')).rejects.toMatchObject({
      code: 'BUSINESS_RULE',
    });
    expect(instrucao.update).not.toHaveBeenCalled();
  });

  it('restaurarVersao: aplica o conteúdo da versão como versão nova em rascunho', async () => {
    const { service, instrucao, versao } = servico(
      registro({ versaoAtual: 3, status: 'PUBLICADO', systemPrompt: 'Atual' }),
    );
    versao.findUnique.mockResolvedValue({
      ...CONTEUDO,
      systemPrompt: 'Antigo',
      temperatura: '0.50',
    });
    await service.restaurarVersao(ID, 1);
    expect(instrucao.update).toHaveBeenCalledWith({
      where: { id: ID },
      data: expect.objectContaining({
        systemPrompt: 'Antigo',
        temperatura: 0.5,
        versaoAtual: 4,
        status: 'RASCUNHO',
        ativo: false,
      }),
    });
    expect(versao.create).toHaveBeenCalledWith({ data: expect.objectContaining({ numero: 4 }) });
  });

  it('restaurarVersao: 404 quando a versão não existe', async () => {
    const { service, versao } = servico();
    versao.findUnique.mockResolvedValue(null);
    await expect(service.restaurarVersao(ID, 9)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('findById: 404 quando não existe ou foi excluída', async () => {
    const { service, instrucao } = servico();
    instrucao.findFirst.mockResolvedValue(null);
    await expect(service.findById(ID)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('remove: exclusão lógica e desativa', async () => {
    const { service, instrucao } = servico();
    await service.remove(ID);
    expect(instrucao.update).toHaveBeenCalledWith({
      where: { id: ID },
      data: { deletedAt: expect.any(Date), ativo: false },
    });
  });
});
