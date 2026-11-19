import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import {
  statusDaLicenca,
  LICENCA_ALERTA_30_DIAS,
  LICENCA_ALERTA_60_DIAS,
  type CreateLicencaInput,
  type CreateTipoLicencaInput,
  type ExportLicencasQuery,
  type Licenca as LicencaDto,
  type LicencaExportColumn,
  type LicencaResumo,
  type LicencaResumoQuery,
  type LicencaStatus,
  type ListLicencasQuery,
  type TipoLicenca as TipoLicencaDto,
  type UpdateLicencaInput,
} from '@torres/shared';
import type { Licenca, Prisma, TipoLicenca } from '../../../generated/prisma/client';
import { BusinessException } from '../../../common/errors/api.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { ExportService, selectColumns } from '../../../common/export/export.service';
import type { ExportColumn, ExportFile } from '../../../common/export/export.types';
import { paginate, searchWhere, type Page } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { UnidadesService } from '../../configuracoes-gestao/unidades/unidades.service';

const NAO_EXCLUIDOS = { deletedAt: null } as const;
const DIA_MS = 86_400_000;
const FUSO_CLINICA = 'America/Sao_Paulo';

const INCLUIR = {
  unidade: { select: { nome: true } },
  tipoLicenca: { select: { nome: true } },
} satisfies Prisma.LicencaInclude;

type LicencaComRelacoes = Prisma.LicencaGetPayload<{ include: typeof INCLUIR }>;

const STATUS_TEXTO: Record<LicencaStatus, string> = {
  ok: 'OK',
  'alerta-60': 'Alerta 60 dias',
  'alerta-30': 'Alerta 30 dias',
  vencido: 'Vencido',
  na: 'N/A',
};

/** Hoje na data da clínica, como `Date` à meia-noite UTC (mesma base das colunas `@db.Date`). */
export function hojeDaClinica(agora: Date = new Date()): Date {
  const data = new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO_CLINICA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(agora);
  return new Date(`${data}T00:00:00.000Z`);
}

const somarDias = (data: Date, dias: number): Date => new Date(data.getTime() + dias * DIA_MS);
const paraIsoData = (data: Date | null): string | null =>
  data ? data.toISOString().slice(0, 10) : null;
const paraDate = (iso: string | null): Date | null =>
  iso ? new Date(`${iso}T00:00:00.000Z`) : null;

export function diasRestantes(vencimento: Date | null, hoje: Date): number | null {
  return vencimento ? Math.round((vencimento.getTime() - hoje.getTime()) / DIA_MS) : null;
}

export const LICENCA_EXPORT_DEFINITIONS: readonly ExportColumn<LicencaDto, LicencaExportColumn>[] =
  [
    { key: 'tipoLicenca', header: 'Tipo Licença', value: (l) => l.tipoLicencaNome, width: 3 },
    { key: 'unidade', header: 'Unidade', value: (l) => l.unidadeNome, width: 3 },
    {
      key: 'numeroDocumento',
      header: 'Nº Documento',
      value: (l) => l.numeroDocumento ?? '',
      width: 2,
    },
    { key: 'orgaoEmissor', header: 'Órgão Emissor', value: (l) => l.orgaoEmissor ?? '', width: 2 },
    {
      key: 'dataVencimento',
      header: 'Vencimento',
      type: 'date',
      value: (l) => paraDate(l.dataVencimento),
    },
    { key: 'dias', header: 'Dias', type: 'number', value: (l) => l.diasRestantes },
    { key: 'status', header: 'Status', value: (l) => STATUS_TEXTO[l.status] },
    { key: 'responsavel', header: 'Responsável', value: (l) => l.responsavel ?? '', width: 2 },
  ];

/** Tipos de licença e licenças por unidade (tela Alvarás e Licenças). */
@Injectable()
export class AlvarasLicencasService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly exportService: ExportService,
    private readonly unidades: UnidadesService,
  ) {}

  // ───────────────────────────────────── Tipos de licença ──────────────────────────────────────

  async listTipos(): Promise<TipoLicencaDto[]> {
    const tipos = await this.txHost.tx.tipoLicenca.findMany({
      where: NAO_EXCLUIDOS,
      orderBy: [{ nome: 'asc' }, { id: 'asc' }],
    });
    return tipos.map((tipo) => this.tipoParaDto(tipo));
  }

  /**
   * Cria o tipo e, pela regra de paridade (texto do modal "Novo Tipo de Licenca"), uma licença
   * "Não se aplica" para cada unidade existente.
   */
  async createTipo(input: CreateTipoLicencaInput): Promise<TipoLicencaDto> {
    const tipo = await this.txHost.tx.tipoLicenca.create({ data: input });
    const unidadeIds = await this.unidades.idsAtivas();
    if (unidadeIds.length > 0) {
      await this.txHost.tx.licenca.createMany({
        data: unidadeIds.map((unidadeId) => ({
          unidadeId,
          tipoLicencaId: tipo.id,
          naoSeAplica: true,
        })),
      });
    }
    return this.tipoParaDto(tipo);
  }

  // ─────────────────────────────────────────── Licenças ────────────────────────────────────────

  async list(query: ListLicencasQuery): Promise<Page<LicencaDto>> {
    const hoje = hojeDaClinica();
    const where = this.where(query, hoje);
    const orderBy = this.orderBy(query.sort);
    const pagina = await paginate(query, {
      findMany: (page) =>
        this.txHost.tx.licenca.findMany({ where, orderBy, include: INCLUIR, ...page }),
      count: () => this.txHost.tx.licenca.count({ where }),
    });
    return { ...pagina, data: pagina.data.map((licenca) => this.paraDto(licenca, hoje)) };
  }

  async findById(id: string): Promise<LicencaDto> {
    return this.paraDto(await this.buscar(id), hojeDaClinica());
  }

  async create(input: CreateLicencaInput): Promise<LicencaDto> {
    await this.garantirReferencias(input);
    const licenca = await this.txHost.tx.licenca.create({
      data: this.dados(input),
      include: INCLUIR,
    });
    return this.paraDto(licenca, hojeDaClinica());
  }

  async update(id: string, input: UpdateLicencaInput): Promise<LicencaDto> {
    await this.buscar(id);
    await this.garantirReferencias(input);
    const licenca = await this.txHost.tx.licenca.update({
      where: { id },
      data: this.dados(input),
      include: INCLUIR,
    });
    return this.paraDto(licenca, hojeDaClinica());
  }

  /** Cartões de totais do topo da tela. */
  async resumo({ unidadeId }: LicencaResumoQuery): Promise<LicencaResumo> {
    const hoje = hojeDaClinica();
    const contar = (status?: LicencaStatus) =>
      this.txHost.tx.licenca.count({ where: this.where({ unidadeId, status }, hoje) });
    const [total, ok, alerta60, alerta30, vencido, naoSeAplica] = await Promise.all([
      contar(),
      contar('ok'),
      contar('alerta-60'),
      contar('alerta-30'),
      contar('vencido'),
      contar('na'),
    ]);
    return { total, ok, alerta60, alerta30, vencido, naoSeAplica };
  }

  /** Aba Alertas: vencidas e a vencer em até 60 dias, da mais urgente para a menos. */
  async alertas({ unidadeId }: LicencaResumoQuery): Promise<LicencaDto[]> {
    const hoje = hojeDaClinica();
    return this.listaPorVencimento(
      {
        unidadeId,
        naoSeAplica: false,
        dataVencimento: { lte: somarDias(hoje, LICENCA_ALERTA_60_DIAS) },
      },
      hoje,
    );
  }

  /** Aba Ordem Renovação: todas as licenças com vencimento, do vencimento mais próximo ao mais distante. */
  async ordemRenovacao({ unidadeId }: LicencaResumoQuery): Promise<LicencaDto[]> {
    const hoje = hojeDaClinica();
    return this.listaPorVencimento(
      { unidadeId, naoSeAplica: false, dataVencimento: { not: null } },
      hoje,
    );
  }

  async export(query: ExportLicencasQuery): Promise<ExportFile> {
    const hoje = hojeDaClinica();
    const where = this.where(query, hoje);
    this.exportService.ensureWithinLimit(await this.txHost.tx.licenca.count({ where }));
    const rows = await this.txHost.tx.licenca.findMany({
      where,
      orderBy: this.orderBy(query.sort),
      include: INCLUIR,
    });
    return this.exportService.export({
      format: query.format,
      title: 'Alvarás e Licenças',
      filename: 'alvaras-licencas',
      columns: selectColumns(LICENCA_EXPORT_DEFINITIONS, query.columns),
      rows: rows.map((licenca) => this.paraDto(licenca, hoje)),
    });
  }

  // ───────────────────────────────────────── Internos ──────────────────────────────────────────

  private async listaPorVencimento(
    filtro: Prisma.LicencaWhereInput,
    hoje: Date,
  ): Promise<LicencaDto[]> {
    const licencas = await this.txHost.tx.licenca.findMany({
      where: { ...NAO_EXCLUIDOS, ...filtro },
      orderBy: [{ dataVencimento: 'asc' }, { id: 'asc' }],
      include: INCLUIR,
    });
    return licencas.map((licenca) => this.paraDto(licenca, hoje));
  }

  private async buscar(id: string): Promise<LicencaComRelacoes> {
    const licenca = await this.txHost.tx.licenca.findFirst({
      where: { id, ...NAO_EXCLUIDOS },
      include: INCLUIR,
    });
    if (!licenca) {
      throw new BusinessException(ErrorCode.NOT_FOUND, 'Licença não encontrada', { status: 404 });
    }
    return licenca;
  }

  private async garantirReferencias(
    input: Pick<CreateLicencaInput, 'unidadeId' | 'tipoLicencaId'>,
  ): Promise<void> {
    await this.unidades.findById(input.unidadeId);
    const tipo = await this.txHost.tx.tipoLicenca.findFirst({
      where: { id: input.tipoLicencaId, ...NAO_EXCLUIDOS },
      select: { id: true },
    });
    if (!tipo) {
      throw new BusinessException(ErrorCode.NOT_FOUND, 'Tipo de licença não encontrado', {
        status: 404,
      });
    }
  }

  private where(
    query: Pick<ListLicencasQuery, 'unidadeId' | 'status'> & { search?: string },
    hoje: Date,
  ): Prisma.LicencaWhereInput {
    const em30 = somarDias(hoje, LICENCA_ALERTA_30_DIAS);
    const em60 = somarDias(hoje, LICENCA_ALERTA_60_DIAS);
    const porStatus: Record<LicencaStatus, Prisma.LicencaWhereInput> = {
      na: { naoSeAplica: true },
      vencido: { naoSeAplica: false, dataVencimento: { lt: hoje } },
      'alerta-30': { naoSeAplica: false, dataVencimento: { gte: hoje, lte: em30 } },
      'alerta-60': { naoSeAplica: false, dataVencimento: { gt: em30, lte: em60 } },
      ok: {
        naoSeAplica: false,
        OR: [{ dataVencimento: null }, { dataVencimento: { gt: em60 } }],
      },
    };
    return {
      ...NAO_EXCLUIDOS,
      unidadeId: query.unidadeId,
      ...(query.status ? porStatus[query.status] : {}),
      ...(query.search
        ? {
            AND: [
              {
                OR: [
                  ...(searchWhere(query.search, ['numeroDocumento', 'orgaoEmissor', 'responsavel'])
                    ?.OR ?? []),
                  { tipoLicenca: { nome: { contains: query.search, mode: 'insensitive' } } },
                  { unidade: { nome: { contains: query.search, mode: 'insensitive' } } },
                ],
              },
            ],
          }
        : {}),
    };
  }

  private orderBy(sort: ListLicencasQuery['sort']): Prisma.LicencaOrderByWithRelationInput[] {
    const { field, direction } = sort;
    let primeiro: Prisma.LicencaOrderByWithRelationInput;
    if (field === 'tipoLicenca') primeiro = { tipoLicenca: { nome: direction } };
    else if (field === 'unidade') primeiro = { unidade: { nome: direction } };
    else if (field === 'dias' || field === 'status') primeiro = { dataVencimento: direction };
    else primeiro = { [field]: direction };
    return [primeiro, { id: direction }];
  }

  private dados(input: CreateLicencaInput): Prisma.LicencaUncheckedCreateInput {
    return {
      ...input,
      dataEmissao: paraDate(input.dataEmissao),
      dataVencimento: paraDate(input.dataVencimento),
    };
  }

  private tipoParaDto(tipo: TipoLicenca): TipoLicencaDto {
    return {
      id: tipo.id,
      nome: tipo.nome,
      descricao: tipo.descricao,
      createdAt: tipo.createdAt.toISOString(),
    };
  }

  private paraDto(
    licenca: Licenca & Pick<LicencaComRelacoes, 'unidade' | 'tipoLicenca'>,
    hoje: Date,
  ): LicencaDto {
    const dias = licenca.naoSeAplica ? null : diasRestantes(licenca.dataVencimento, hoje);
    return {
      id: licenca.id,
      unidadeId: licenca.unidadeId,
      unidadeNome: licenca.unidade.nome,
      tipoLicencaId: licenca.tipoLicencaId,
      tipoLicencaNome: licenca.tipoLicenca.nome,
      naoSeAplica: licenca.naoSeAplica,
      numeroDocumento: licenca.numeroDocumento,
      orgaoEmissor: licenca.orgaoEmissor,
      titular: licenca.titular,
      dataEmissao: paraIsoData(licenca.dataEmissao),
      dataVencimento: paraIsoData(licenca.dataVencimento),
      telefone: licenca.telefone,
      email: licenca.email,
      departamento: licenca.departamento,
      plataformaOnline: licenca.plataformaOnline,
      comoRenovar: licenca.comoRenovar,
      documentosObrigatorios: licenca.documentosObrigatorios,
      enderecoPresencial: licenca.enderecoPresencial,
      horarioAtendimento: licenca.horarioAtendimento,
      prazoAnalise: licenca.prazoAnalise,
      responsavel: licenca.responsavel,
      observacoes: licenca.observacoes,
      diasRestantes: dias,
      status: statusDaLicenca(licenca.naoSeAplica, dias),
      createdAt: licenca.createdAt.toISOString(),
      updatedAt: licenca.updatedAt.toISOString(),
    };
  }
}
