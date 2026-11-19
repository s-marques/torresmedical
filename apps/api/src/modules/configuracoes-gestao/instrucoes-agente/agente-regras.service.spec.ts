import { txHostFalso } from '../../../../test/utils/tx-host-falso';
import { AgenteAlertasDestinosService } from './agente-alertas-destinos.service';
import { AgenteRegrasService } from './agente-regras.service';

const ID = '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const REGRA = {
  nome: 'uma_pergunta_por_vez',
  descricao: 'Limita a uma pergunta.',
  tipo: 'POS_RESPOSTA',
  gatilho: 'qualquer',
  acao: 'BLOQUEAR',
  ativo: true,
} as const;

function regras(findFirst: unknown[] = [{ id: ID, ...REGRA }]) {
  const fake = txHostFalso('agenteRegra', [{ id: ID, ...REGRA }]);
  for (const valor of findFirst) fake.delegate.findFirst.mockResolvedValueOnce(valor);
  fake.delegate.findFirst.mockResolvedValue(null);
  return { service: new AgenteRegrasService(fake.txHost), delegate: fake.delegate };
}

describe('AgenteRegrasService', () => {
  it('list: sem excluídos, com busca, status, tipo e ação', async () => {
    const { service, delegate } = regras();
    await service.list({
      page: 1,
      pageSize: 10,
      sort: { field: 'nome', direction: 'asc' },
      search: 'valor',
      status: 'ativo',
      tipo: 'PRE_TOOL',
      acao: 'ALERTAR',
    });
    const contem = { contains: 'valor', mode: 'insensitive' };
    expect(delegate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          ativo: true,
          tipo: 'PRE_TOOL',
          acao: 'ALERTAR',
          OR: [{ nome: contem }, { descricao: contem }],
        },
      }),
    );
  });

  it('create: 409 DUPLICATE quando o nome já existe', async () => {
    const { service, delegate } = regras([{ id: 'outro' }]);
    await expect(service.create(REGRA)).rejects.toMatchObject({ code: 'DUPLICATE', status: 409 });
    expect(delegate.create).not.toHaveBeenCalled();
  });

  it('update: ignora a própria regra na checagem de nome', async () => {
    const { service, delegate } = regras([{ id: ID }, null]);
    await service.update(ID, REGRA);
    expect(delegate.findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: { not: ID } }) }),
    );
    expect(delegate.update).toHaveBeenCalled();
  });

  it('alterarAtivo e remove: 404 quando não existe', async () => {
    const { service } = regras([null]);
    await expect(service.alterarAtivo(ID, false)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(service.remove(ID)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('remove: exclusão lógica', async () => {
    const { service, delegate } = regras();
    await service.remove(ID);
    expect(delegate.update).toHaveBeenCalledWith({
      where: { id: ID },
      data: { deletedAt: expect.any(Date) },
    });
  });
});

describe('AgenteAlertasDestinosService', () => {
  function destinos(findFirst: unknown) {
    const fake = txHostFalso('agenteAlertaDestino', [{ id: ID }]);
    fake.delegate.findFirst.mockResolvedValue(findFirst);
    return { service: new AgenteAlertasDestinosService(fake.txHost), delegate: fake.delegate };
  }
  const ENTRADA = { tipo: 'NUMERO', nome: 'Recepção', numero: '5565999990000' } as const;

  it('create: grava quando o número está livre', async () => {
    const { service, delegate } = destinos(null);
    await service.create(ENTRADA);
    expect(delegate.create).toHaveBeenCalledWith({ data: ENTRADA });
  });

  it('create: 409 DUPLICATE quando o número já é destino', async () => {
    const { service } = destinos({ id: 'outro' });
    await expect(service.create(ENTRADA)).rejects.toMatchObject({ code: 'DUPLICATE', status: 409 });
  });

  it('remove: 404 quando não existe', async () => {
    const { service } = destinos(null);
    await expect(service.remove(ID)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
