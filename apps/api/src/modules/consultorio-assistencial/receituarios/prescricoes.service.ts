import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import {
  formatarNumeroReceita,
  RECEITUARIO_TIPO_ROTULOS,
  type CreatePrescricaoInput,
  type ExportPrescricoesQuery,
  type ListPrescricoesQuery,
  type ListRegistrosQuery,
  type Prescricao,
  type PrescricaoExportColumn,
} from '@torres/shared';
import type { Prisma } from '../../../generated/prisma/client';
import { EscopoDadosService } from '../../../common/auth/escopo-dados.service';
import { BusinessException } from '../../../common/errors/api.exception';
import { ExportService, selectColumns } from '../../../common/export/export.service';
import type { ExportColumn, ExportFile } from '../../../common/export/export.types';
import type { Page } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { PacientesService } from '../../comercial-atendimento/pacientes/pacientes.service';
import { ProfissionaisService } from '../../gestao-profissionais/profissionais/profissionais.service';
import { naOrdem, paginarPorNome } from './ordenar-por-nome';
import { blocoNaoEncontrado, totalFolhas } from './receituario-blocos.service';

const NAO_EXCLUIDOS = { deletedAt: null } as const;

const INCLUDE = { bloco: { select: { tipo: true } } } as const satisfies Prisma.PrescricaoInclude;
type PrescricaoComBloco = Prisma.PrescricaoGetPayload<{ include: typeof INCLUDE }>;

export const BLOCO_SEM_MEDICO = 'Defina o médico do bloco antes de prescrever';
export const BLOCO_ESGOTADO = 'Todas as folhas deste bloco já foram usadas';

const dia = (data: Date) => data.toISOString().slice(0, 10);
const dataDoBanco = (data: string) => new Date(`${data}T00:00:00.000Z`);

const DIA_CLINICA = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Data de hoje (`AAAA-MM-DD`) no fuso da clínica. */
export function hojeNaClinica(agora: Date = new Date()): string {
  return DIA_CLINICA.format(agora);
}

interface Nomes {
  pacientes: ReadonlyMap<string, string>;
  profissionais: ReadonlyMap<string, string>;
}

export function toPrescricao(p: PrescricaoComBloco, nomes: Nomes): Prescricao {
  return {
    id: p.id,
    numero: p.numero,
    tipo: p.bloco.tipo,
    blocoId: p.blocoId,
    pacienteId: p.pacienteId,
    pacienteNome: nomes.pacientes.get(p.pacienteId) ?? null,
    profissionalId: p.profissionalId,
    profissionalNome: nomes.profissionais.get(p.profissionalId) ?? null,
    atendimentoId: p.atendimentoId,
    medicacao: p.medicacao,
    posologia: p.posologia,
    dataPrescricao: dia(p.dataPrescricao),
    createdAt: p.createdAt.toISOString(),
  };
}

/** Colunas exportáveis, iguais às do grid Prescricoes. */
export const PRESCRICAO_EXPORT_DEFINITIONS: readonly ExportColumn<
  Prescricao,
  PrescricaoExportColumn
>[] = [
  { key: 'numero', header: 'N Receita', value: (p) => formatarNumeroReceita(p.numero) },
  { key: 'tipo', header: 'Tipo', value: (p) => RECEITUARIO_TIPO_ROTULOS[p.tipo] },
  { key: 'paciente', header: 'Paciente', value: (p) => p.pacienteNome ?? '', width: 3 },
  { key: 'medico', header: 'Medico', value: (p) => p.profissionalNome ?? '', width: 3 },
  { key: 'medicacao', header: 'Medicacao', value: (p) => p.medicacao, width: 4 },
  { key: 'dataPrescricao', header: 'Data', type: 'date', value: (p) => p.dataPrescricao },
];

type FiltrosPrescricao = Pick<ListPrescricoesQuery, 'search' | 'tipo' | 'de' | 'ate' | 'sort'>;

/**
 * Aba Prescricoes da tela Receituários (`/receituarios`, issue #42). A prescrição usa a próxima
 * folha livre do bloco e herda o médico dele; o bloco vira Finalizado na última folha
 * (decisões do dev na issue #42). Paciente e médico são de outros módulos, lidos pelos services
 * exportados. O usuário restrito só vê e prescreve com blocos dos profissionais vinculados.
 */
@Injectable()
export class PrescricoesService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly exportService: ExportService,
    private readonly pacientes: PacientesService,
    private readonly profissionais: ProfissionaisService,
    private readonly escopo: EscopoDadosService,
  ) {}

  async list(query: ListPrescricoesQuery): Promise<Page<Prescricao>> {
    const { registros, total } = await this.buscar(query, query);
    return {
      data: await this.comNomes(registros),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  }

  async create(input: CreatePrescricaoInput, agora = new Date()): Promise<Prescricao> {
    const bloco = await this.txHost.tx.receituarioBloco.findFirst({
      where: { id: input.blocoId, ...NAO_EXCLUIDOS },
    });
    if (!bloco) throw blocoNaoEncontrado();
    this.escopo.garantirProfissional(bloco.profissionalId);
    if (!bloco.profissionalId) throw new BusinessException('BLOCO_SEM_MEDICO', BLOCO_SEM_MEDICO);
    if (bloco.status !== 'ATIVO') {
      throw new BusinessException(
        'BLOCO_INDISPONIVEL',
        `Bloco ${bloco.status === 'FINALIZADO' ? 'finalizado' : 'cancelado'} não aceita novas prescrições`,
      );
    }
    await this.pacientes.detalhe(input.pacienteId);

    // O incremento trava a linha do bloco: prescrições simultâneas recebem folhas diferentes.
    const usado = await this.txHost.tx.receituarioBloco.update({
      where: { id: bloco.id },
      data: { usados: { increment: 1 } },
    });
    const total = totalFolhas(usado);
    if (usado.usados > total) throw new BusinessException('BLOCO_ESGOTADO', BLOCO_ESGOTADO);
    if (usado.usados === total) {
      await this.txHost.tx.receituarioBloco.update({
        where: { id: bloco.id },
        data: { status: 'FINALIZADO' },
      });
    }

    const criada = await this.txHost.tx.prescricao.create({
      data: {
        blocoId: bloco.id,
        numero: usado.numeroInicio + usado.usados - 1,
        pacienteId: input.pacienteId,
        profissionalId: bloco.profissionalId,
        medicacao: input.medicacao,
        posologia: input.posologia,
        dataPrescricao: dataDoBanco(input.dataPrescricao ?? hojeNaClinica(agora)),
      },
      include: INCLUDE,
    });
    const [prescricao] = await this.comNomes([criada]);
    return prescricao as Prescricao;
  }

  /**
   * Aba Receitas do Prontuário: prescrições do paciente, da mais recente para a mais antiga.
   * Quem chama já garantiu o paciente no escopo; aqui filtra os profissionais do usuário.
   */
  async doPaciente(pacienteId: string, query: ListRegistrosQuery): Promise<Page<Prescricao>> {
    const where: Prisma.PrescricaoWhereInput = {
      ...NAO_EXCLUIDOS,
      pacienteId,
      profissionalId: this.escopo.filtroProfissional(),
    };
    const [registros, total] = await Promise.all([
      this.txHost.tx.prescricao.findMany({
        where,
        include: INCLUDE,
        orderBy: [{ dataPrescricao: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.txHost.tx.prescricao.count({ where }),
    ]);
    return {
      data: await this.comNomes(registros),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  }

  /** Histórico Clínico do Prontuário: todas as prescrições do paciente no escopo. */
  async todasDoPaciente(pacienteId: string): Promise<Prescricao[]> {
    const registros = await this.txHost.tx.prescricao.findMany({
      where: { ...NAO_EXCLUIDOS, pacienteId, profissionalId: this.escopo.filtroProfissional() },
      include: INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return this.comNomes(registros);
  }

  async export(query: ExportPrescricoesQuery): Promise<ExportFile> {
    const where = await this.where(query);
    this.exportService.ensureWithinLimit(await this.txHost.tx.prescricao.count({ where }));
    const { registros } = await this.buscar(query, null);
    return this.exportService.export({
      format: query.format,
      title: 'Receituarios ANVISA - Prescricoes',
      filename: 'receituarios-prescricoes',
      columns: selectColumns(PRESCRICAO_EXPORT_DEFINITIONS, query.columns),
      rows: await this.comNomes(registros),
    });
  }

  private async comNomes(registros: readonly PrescricaoComBloco[]): Promise<Prescricao[]> {
    const [pacientes, profissionais] = await Promise.all([
      this.pacientes.nomesPorIds(registros.map((p) => p.pacienteId)),
      this.profissionais.nomesPorIds(registros.map((p) => p.profissionalId)),
    ]);
    return registros.map((p) => toPrescricao(p, { pacientes, profissionais }));
  }

  /** Página (ou tudo, na exportação) na ordem pedida. */
  private async buscar(
    query: FiltrosPrescricao,
    pagina: { page: number; pageSize: number } | null,
  ): Promise<{ registros: PrescricaoComBloco[]; total: number }> {
    const where = await this.where(query);
    const { field, direction } = query.sort;
    if (field === 'paciente' || field === 'medico') {
      const chaves = await this.txHost.tx.prescricao.findMany({
        where,
        select: { id: true, pacienteId: true, profissionalId: true },
      });
      const porPaciente = field === 'paciente';
      const refIds = chaves.map((c) => (porPaciente ? c.pacienteId : c.profissionalId));
      const nomes = porPaciente
        ? await this.pacientes.nomesPorIds(refIds)
        : await this.profissionais.nomesPorIds(refIds);
      const { ids, total } = paginarPorNome(
        chaves.map((c, i) => ({ id: c.id, refId: refIds[i] ?? null })),
        nomes,
        { page: pagina?.page ?? 1, pageSize: pagina?.pageSize ?? chaves.length, direction },
      );
      const registros = await this.txHost.tx.prescricao.findMany({
        where: { id: { in: ids } },
        include: INCLUDE,
      });
      return { registros: naOrdem(ids, registros), total };
    }
    const principal: Prisma.PrescricaoOrderByWithRelationInput =
      field === 'tipo' ? { bloco: { tipo: direction } } : { [field]: direction };
    const orderBy: Prisma.PrescricaoOrderByWithRelationInput[] = [
      principal,
      { createdAt: direction },
      { id: direction },
    ];
    const [registros, total] = await Promise.all([
      this.txHost.tx.prescricao.findMany({
        where,
        orderBy,
        include: INCLUDE,
        ...(pagina && { skip: (pagina.page - 1) * pagina.pageSize, take: pagina.pageSize }),
      }),
      this.txHost.tx.prescricao.count({ where }),
    ]);
    return { registros, total };
  }

  /** "Buscar prescricoes...": medicação, nome do paciente ou do médico, ou número da receita. */
  private async where(query: FiltrosPrescricao): Promise<Prisma.PrescricaoWhereInput> {
    const where: Prisma.PrescricaoWhereInput = {
      ...NAO_EXCLUIDOS,
      profissionalId: this.escopo.filtroProfissional(),
      ...(query.tipo && { bloco: { tipo: query.tipo } }),
      ...((query.de || query.ate) && {
        dataPrescricao: {
          ...(query.de && { gte: dataDoBanco(query.de) }),
          ...(query.ate && { lte: dataDoBanco(query.ate) }),
        },
      }),
    };
    if (!query.search) return where;
    const numero = /^\d{1,6}$/.test(query.search) ? Number(query.search) : null;
    const [pacienteIds, profissionalIds] = await Promise.all([
      this.pacientes.idsPorBusca(query.search),
      this.profissionais.idsPorBusca(query.search),
    ]);
    return {
      ...where,
      OR: [
        { medicacao: { contains: query.search, mode: 'insensitive' } },
        ...(pacienteIds.length > 0 ? [{ pacienteId: { in: pacienteIds } }] : []),
        ...(profissionalIds.length > 0 ? [{ profissionalId: { in: profissionalIds } }] : []),
        ...(numero === null ? [] : [{ numero }]),
      ],
    };
  }
}
