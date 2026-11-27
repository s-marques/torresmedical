import type { Permissao } from '@torres/shared';
import { ApiException, ValidationException } from '../errors/api.exception';
import { EXPORT_MAX_ROWS, ExportService } from '../export/export.service';
import { definirRelatorio, type ConsultaRelatorio, type ReportDefinition } from './relatorio.types';
import { RelatoriosService } from './relatorios.service';

interface Linha {
  nome: string;
  valor: number;
}

const LINHAS: Linha[] = [
  { nome: 'A', valor: 1 },
  { nome: 'B', valor: 2 },
];
const PERIODO = { de: '2026-10-01', ate: '2026-10-31' };

function relatorio(extra: Partial<ReportDefinition<Linha>> = {}) {
  const buscar = jest.fn((_consulta: ConsultaRelatorio, pagina?: { skip: number; take: number }) =>
    Promise.resolve(pagina ? LINHAS.slice(pagina.skip, pagina.skip + pagina.take) : LINHAS),
  );
  const contar = jest.fn(() => Promise.resolve(LINHAS.length));
  const definicao = definirRelatorio<Linha>({
    id: 'TS-01',
    nome: 'Teste',
    colunas: [
      { key: 'nome', header: 'Nome', value: (l) => l.nome },
      { key: 'valor', header: 'Valor', type: 'currency', value: (l) => l.valor },
    ],
    buscar,
    contar,
    ...extra,
  });
  return { definicao, buscar, contar };
}

describe('RelatoriosService', () => {
  const exportService = new ExportService();
  const service = new RelatoriosService(exportService);
  const comPermissao = new Set<Permissao>(['financeiro.contas-receber.ver']);
  const semPermissao = new Set<Permissao>();

  it('catálogo: sem `permissao` aparece para todos; com ela, só para quem a tem', () => {
    const livre = relatorio().definicao;
    const restrito = relatorio({
      id: 'TS-02',
      permissao: 'financeiro.contas-receber.ver',
    }).definicao;

    expect(service.catalogo([livre, restrito], semPermissao).data.map((r) => r.id)).toEqual([
      'TS-01',
    ]);
    expect(service.catalogo([livre, restrito], comPermissao).data).toEqual([
      {
        id: 'TS-01',
        nome: 'Teste',
        colunas: [
          { id: 'nome', titulo: 'Nome', tipo: 'text', ordenavel: false },
          { id: 'valor', titulo: 'Valor', tipo: 'currency', ordenavel: false },
        ],
        filtros: [],
      },
      expect.objectContaining({ id: 'TS-02' }),
    ]);
  });

  it('resolver: 404 para id desconhecido e 403 sem a permissão do relatório', () => {
    const restrito = relatorio({ permissao: 'financeiro.contas-receber.ver' }).definicao;

    expect(service.resolver([restrito], 'TS-01', comPermissao)).toBe(restrito);
    expect(() => service.resolver([restrito], 'XX-01', comPermissao)).toThrow(
      expect.objectContaining({ status: 404, code: 'RELATORIO_NAO_ENCONTRADO' }),
    );
    expect(() => service.resolver([restrito], 'TS-01', semPermissao)).toThrow(ApiException);
  });

  it('consultar: sem colunas ordenáveis não há `sort`; monta as linhas pelas colunas', async () => {
    const { definicao, buscar } = relatorio();

    const pagina = await service.consultar(definicao, { ...PERIODO, pageSize: '1', sort: 'x' });

    expect(pagina).toEqual({
      data: [{ nome: 'A', valor: 1 }],
      meta: { page: 1, pageSize: 1, total: 2, totalPages: 2 },
    });
    expect(buscar).toHaveBeenCalledWith(
      {
        periodo: PERIODO,
        intervalo: {
          gte: new Date('2026-10-01T03:00:00.000Z'),
          lt: new Date('2026-11-01T03:00:00.000Z'),
        },
        sort: undefined,
        filtros: {},
      },
      { skip: 0, take: 1 },
    );
  });

  it('consultar: query inválida → 400 sem consultar', async () => {
    const { definicao, buscar } = relatorio();

    await expect(service.consultar(definicao, { de: '2026-10-02' })).rejects.toBeInstanceOf(
      ValidationException,
    );
    expect(buscar).not.toHaveBeenCalled();
  });

  it('exportar: acima do limite → 422 sem buscar as linhas', async () => {
    const { definicao, buscar, contar } = relatorio();
    contar.mockResolvedValueOnce(EXPORT_MAX_ROWS + 1);

    await expect(service.exportar(definicao, { ...PERIODO, format: 'pdf' })).rejects.toMatchObject({
      status: 422,
      code: 'EXPORT_LIMIT_EXCEEDED',
    });
    expect(buscar).not.toHaveBeenCalled();
  });

  it('exportar: título com o período e nome do arquivo pelo id', async () => {
    const { definicao } = relatorio();
    const exportar = jest.spyOn(exportService, 'export');

    const arquivo = await service.exportar(definicao, { ...PERIODO, format: 'xlsx' });

    expect(arquivo.filename).toMatch(/^relatorio-ts-01-\d{4}-\d{2}-\d{2}\.xlsx$/);
    expect(exportar).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'TS-01 — Teste (01/10/2026 a 31/10/2026)', rows: LINHAS }),
    );
  });

  it('consultar: `totais` do relatório inteiro vai na resposta, só com as colunas informadas', async () => {
    const totais = jest.fn(() => Promise.resolve({ valor: 3 }));
    const { definicao } = relatorio({ totais });

    const pagina = await service.consultar(definicao, { ...PERIODO, pageSize: '1' });

    expect(pagina.data).toHaveLength(1);
    expect(pagina.totais).toEqual({ nome: undefined, valor: 3 });
    expect(totais).toHaveBeenCalledWith(expect.objectContaining({ periodo: PERIODO }));
  });

  it('consultar: sem `totais` a resposta não tem a chave', async () => {
    const pagina = await service.consultar(relatorio().definicao, PERIODO);

    expect(pagina).not.toHaveProperty('totais');
  });

  it('exportar: com `totais`, a última linha é o total, com "Total" na primeira coluna', async () => {
    const { definicao } = relatorio({ totais: () => Promise.resolve({ valor: 3 }) });
    const exportar = jest.spyOn(exportService, 'export');

    await service.exportar(definicao, { ...PERIODO, format: 'xlsx' });

    expect(exportar).toHaveBeenLastCalledWith(
      expect.objectContaining({ rows: [...LINHAS, { nome: 'Total', valor: 3 }] }),
    );
  });

  it('relatório sem colunas é erro de programação', async () => {
    const { definicao } = relatorio({ colunas: [] });

    await expect(service.consultar(definicao, PERIODO)).rejects.toThrow('TS-01 sem colunas');
  });
});
