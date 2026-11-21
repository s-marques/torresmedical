import type { TransactionHost } from '@nestjs-cls/transactional';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import type { ConsultaRelatorio } from '../../../common/relatorios/relatorio.types';
import type { PacientesVinculadosService } from '../../consultorio-assistencial/pacientes-vinculados/pacientes-vinculados.service';
import { ordenarEPaginar, RelatoriosComercial } from './relatorios-comercial';

const consulta = (filtros: ConsultaRelatorio['filtros'] = {}): ConsultaRelatorio => ({
  periodo: { de: '2026-01-01', ate: '2026-12-31' },
  intervalo: { gte: new Date('2026-01-01T03:00:00Z'), lt: new Date('2027-01-01T03:00:00Z') },
  filtros,
});

function criar(ultimos: { pacienteId: string; ultimoEm: Date }[] = []) {
  const ultimosAtendimentos = jest.fn().mockResolvedValue(ultimos);
  const findMany = jest.fn().mockResolvedValue([]);
  const txHost = { tx: { paciente: { findMany } } } as unknown as TransactionHost<PrismaAdapter>;
  const vinculados = { ultimosAtendimentos } as unknown as PacientesVinculadosService;
  return { service: new RelatoriosComercial(txHost, vinculados), ultimosAtendimentos, findMany };
}

describe('ordenarEPaginar', () => {
  const linhas = [
    { nome: 'b', n: 2 },
    { nome: 'a', n: 3 },
    { nome: 'c', n: null as number | null },
  ];

  it('ordena texto e número nos dois sentidos, com nulos por último', () => {
    expect(ordenarEPaginar(linhas, { field: 'nome', direction: 'asc' }).map((l) => l.nome)).toEqual(
      ['a', 'b', 'c'],
    );
    expect(ordenarEPaginar(linhas, { field: 'n', direction: 'desc' }).map((l) => l.nome)).toEqual([
      'c',
      'a',
      'b',
    ]);
  });

  it('pagina; sem página devolve tudo e sem sort mantém a ordem', () => {
    expect(ordenarEPaginar(linhas, undefined, { skip: 1, take: 1 })).toEqual([linhas[1]]);
    expect(ordenarEPaginar(linhas, undefined)).toEqual(linhas);
  });
});

describe('RelatoriosComercial', () => {
  it('registra COM-01 a COM-04, cada um com a permissão da tela dona dos dados', () => {
    const { service } = criar();

    expect(service.relatorios.map((r) => [r.id, r.permissao])).toEqual([
      ['COM-01', 'comercial-atendimento.negocios.ver'],
      ['COM-02', 'comercial-atendimento.pacientes.ver'],
      ['COM-03', 'comercial-atendimento.pacotes.ver'],
      ['COM-04', 'comercial-atendimento.negocios.ver'],
    ]);
  });

  it('COM-02: o corte é o menor entre "Até" e hoje menos N dias (padrão 90)', async () => {
    const { service, ultimosAtendimentos } = criar();
    const agora = new Date('2026-06-01T12:00:00Z');

    await service.linhasSemRetorno(consulta(), agora);

    expect(ultimosAtendimentos).toHaveBeenCalledWith({
      gte: new Date('2026-01-01T03:00:00Z'),
      lt: new Date(agora.getTime() - 90 * 86_400_000),
    });
  });

  it('COM-02: sem janela válida (corte antes do "De"), nem consulta', async () => {
    const { service, ultimosAtendimentos } = criar();

    const linhas = await service.linhasSemRetorno(
      consulta({ dias: '180' }),
      new Date('2026-02-01T00:00:00Z'),
    );

    expect(linhas).toEqual([]);
    expect(ultimosAtendimentos).not.toHaveBeenCalled();
  });

  it('COM-02: ignora paciente inativo ou excluído (não vem do banco)', async () => {
    const { service } = criar([{ pacienteId: 'p1', ultimoEm: new Date('2026-01-10T00:00:00Z') }]);

    expect(await service.linhasSemRetorno(consulta(), new Date('2026-06-01T00:00:00Z'))).toEqual(
      [],
    );
  });
});
