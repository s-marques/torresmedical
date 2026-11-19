import type { ReceitaProfissional } from '@torres/shared';
import { escopoFalso } from '../../../../test/utils/escopo-falso';
import type { ContasReceberService } from '../../financeiro/contas-receber/contas-receber.service';
import { ReceitaProfissionaisService } from './receita-profissionais.service';

const ANA = '3e9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const BETO = '4f9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const ID = '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const QUERY = {
  page: 1,
  pageSize: 10,
  search: undefined,
  sort: { field: 'dataVencimento' as const, direction: 'desc' as const },
};
const ENTRADA = {
  descricao: 'Consulta',
  pacienteId: null,
  valor: 100,
  dataVencimento: '2026-10-10',
  formaPagamentoId: null,
  planoContaId: null,
  documento: null,
  totalParcelas: 1,
  observacoes: null,
  status: 'PENDENTE' as const,
  contaBancariaId: null,
  dataRecebimento: null,
};

function setup(profissionalIds?: readonly string[]) {
  const receita = { id: ID, profissionalId: ANA } as ReceitaProfissional;
  const contas = {
    listarReceitas: jest.fn().mockResolvedValue({ data: [], meta: {} }),
    resumirReceitas: jest.fn().mockResolvedValue({}),
    exportarReceitas: jest.fn().mockResolvedValue({}),
    buscarReceita: jest.fn().mockResolvedValue(receita),
    atualizarReceita: jest.fn().mockResolvedValue(receita),
    estornarBaixaReceita: jest.fn().mockResolvedValue(receita),
    removerReceita: jest.fn().mockResolvedValue(receita),
  };
  const service = new ReceitaProfissionaisService(
    contas as unknown as ContasReceberService,
    escopoFalso(profissionalIds),
  );
  return { service, contas };
}

describe('ReceitaProfissionaisService', () => {
  it('sem restrição, repassa o filtro pedido (ou nenhum)', async () => {
    const { service, contas } = setup();
    await service.list(QUERY);
    await service.list({ ...QUERY, profissionalId: BETO });
    expect(contas.listarReceitas.mock.calls[0][1]).toBeUndefined();
    expect(contas.listarReceitas.mock.calls[1][1]).toBe(BETO);
  });

  it('restrito, lista só os vinculados e recusa profissional fora do escopo', async () => {
    const { service, contas } = setup([ANA]);
    await service.list(QUERY);
    expect(contas.listarReceitas.mock.calls[0][1]).toEqual({ in: [ANA] });
    expect(() => service.list({ ...QUERY, profissionalId: BETO })).toThrow('Sem permissão');
  });

  it('resumo e exportação usam o mesmo escopo', async () => {
    const { service, contas } = setup([ANA]);
    await service.resumo({ search: undefined });
    await service.export({ ...QUERY, format: 'xlsx', columns: ['valor'] });
    expect(contas.resumirReceitas.mock.calls[0][1]).toEqual({ in: [ANA] });
    expect(contas.exportarReceitas.mock.calls[0][1]).toEqual({ in: [ANA] });
  });

  it('detalhe, edição, estorno e exclusão de receita fora do escopo dão 403', async () => {
    const { service, contas } = setup([BETO]);
    await expect(service.findById(ID)).rejects.toMatchObject({ status: 403 });
    await expect(service.update(ID, { ...ENTRADA, profissionalId: BETO })).rejects.toMatchObject({
      status: 403,
    });
    await expect(service.estornarBaixa(ID)).rejects.toMatchObject({ status: 403 });
    await expect(service.remove(ID)).rejects.toMatchObject({ status: 403 });
    expect(contas.atualizarReceita).not.toHaveBeenCalled();
    expect(contas.estornarBaixaReceita).not.toHaveBeenCalled();
    expect(contas.removerReceita).not.toHaveBeenCalled();
  });

  it('não deixa mover a receita para um profissional fora do escopo', async () => {
    const { service, contas } = setup([ANA]);
    await expect(service.update(ID, { ...ENTRADA, profissionalId: BETO })).rejects.toMatchObject({
      status: 403,
    });
    expect(contas.atualizarReceita).not.toHaveBeenCalled();
  });

  it('no escopo, delega ao Financeiro', async () => {
    const { service, contas } = setup([ANA]);
    await service.update(ID, { ...ENTRADA, profissionalId: ANA });
    await service.estornarBaixa(ID);
    await service.remove(ID);
    expect(contas.atualizarReceita).toHaveBeenCalledWith(ID, { ...ENTRADA, profissionalId: ANA });
    expect(contas.estornarBaixaReceita).toHaveBeenCalledWith(ID);
    expect(contas.removerReceita).toHaveBeenCalledWith(ID);
  });
});
