import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import type {
  CreateProfissionalInput,
  ExportProfissionaisQuery,
  ListProfissionaisQuery,
  LookupItem,
  LookupQuery,
  Profissional as ProfissionalDto,
  ProfissionalArquivoCampo,
  ProfissionalCor,
  ProfissionalExportColumn,
  UpdateProfissionalInput,
} from '@torres/shared';
import type { Prisma, Profissional } from '../../../generated/prisma/client';
import { isUuid } from '../../../common/auth/tokens';
import { SegredosService } from '../../../common/crypto/segredos.service';
import { BusinessException } from '../../../common/errors/api.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { ExportService, selectColumns } from '../../../common/export/export.service';
import type { ExportColumn, ExportFile } from '../../../common/export/export.types';
import {
  EntidadeLookupService,
  juntarDescricao,
  SELECIONAVEIS,
  type FonteLookup,
} from '../../../common/lookups/lookup-query';
import { paginate, searchWhere, toOrderBy, type Page } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { ArquivosService } from '../../../common/storage/arquivos.service';

const COM_ESPECIALIDADE = { especialidade: { select: { nome: true } } } as const;
const NAO_EXCLUIDOS = { deletedAt: null } as const;

/** Profissional com o nome da especialidade. */
export type ProfissionalComEspecialidade = Prisma.ProfissionalGetPayload<{
  include: typeof COM_ESPECIALIDADE;
}>;

/** Uso do arquivo (`ARQUIVO_USOS`) e coluna de cada arquivo do cadastro. */
const ARQUIVOS: Record<
  ProfissionalArquivoCampo,
  { uso: 'foto-profissional' | 'logo-receita'; coluna: 'fotoArquivoId' | 'logoReceitaArquivoId' }
> = {
  foto: { uso: 'foto-profissional', coluna: 'fotoArquivoId' },
  'logo-receita': { uso: 'logo-receita', coluna: 'logoReceitaArquivoId' },
};

/** Colunas exportáveis, iguais às do grid. */
export const PROFISSIONAL_EXPORT_DEFINITIONS: readonly ExportColumn<
  Profissional,
  ProfissionalExportColumn
>[] = [
  { key: 'nome', header: 'Nome', value: (p) => p.nome, width: 3 },
  { key: 'registro', header: 'Registro', value: (p) => p.registro, width: 2 },
  { key: 'telefone', header: 'Telefone', value: (p) => p.telefone, width: 2 },
  { key: 'email', header: 'Email', value: (p) => p.email, width: 3 },
  {
    key: 'duracaoPadrao',
    header: 'Duração (min)',
    type: 'number',
    value: (p) => p.duracaoPadrao,
  },
  {
    key: 'valorConsulta',
    header: 'Consulta',
    type: 'currency',
    value: (p) => (p.valorConsulta === null ? null : Number(p.valorConsulta)),
  },
  { key: 'ativo', header: 'Status', value: (p) => (p.ativo ? 'Ativo' : 'Inativo') },
];

/** Profissional (médico, dentista, nutricionista…) do módulo Gestão Profissionais. */
@Injectable()
export class ProfissionaisService extends EntidadeLookupService<
  LookupQuery<'profissionais'>,
  Prisma.ProfissionalWhereInput,
  ProfissionalComEspecialidade
> {
  protected readonly naoEncontrado = 'Profissional não encontrado';
  protected readonly fonte: FonteLookup<
    Prisma.ProfissionalWhereInput,
    ProfissionalComEspecialidade
  > = {
    findMany: (args) =>
      this.txHost.tx.profissional.findMany({ ...args, include: COM_ESPECIALIDADE }),
    count: (args) => this.txHost.tx.profissional.count(args),
    findFirst: (args) =>
      this.txHost.tx.profissional.findFirst({ ...args, include: COM_ESPECIALIDADE }),
  };

  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly exportService: ExportService,
    private readonly segredos: SegredosService,
    private readonly arquivos: ArquivosService,
  ) {
    super();
  }

  protected filtro(query: LookupQuery<'profissionais'>): Prisma.ProfissionalWhereInput {
    return {
      ...SELECIONAVEIS,
      especialidadeId: query.especialidadeId,
      ...searchWhere(query.search, ['nome', 'registro']),
    };
  }

  /** Total de profissionais ativos (alimenta o painel). */
  contarAtivos(): Promise<number> {
    return this.fonte.count({ where: SELECIONAVEIS });
  }

  protected toItem(profissional: ProfissionalComEspecialidade): LookupItem {
    return {
      id: profissional.id,
      label: profissional.nome,
      descricao: juntarDescricao(profissional.especialidade?.nome, profissional.registro),
    };
  }

  // -------------------------------------------------------------------------------------------
  // Tela Profissionais

  /** Resposta da API: valores decimais viram número e a Secret Key da Memed nunca sai. */
  toDto({
    deletedAt: _deletedAt,
    especialidade,
    memedApiToken,
    memedSecretKey,
    valorConsulta,
    comissao,
    dataNascimento,
    ...resto
  }: ProfissionalComEspecialidade): ProfissionalDto {
    return {
      ...resto,
      especialidadeNome: especialidade?.nome ?? null,
      corCalendario: resto.corCalendario as ProfissionalCor,
      valorConsulta: valorConsulta === null ? null : Number(valorConsulta),
      comissao: comissao === null ? null : Number(comissao),
      dataNascimento: dataNascimento?.toISOString().slice(0, 10) ?? null,
      memedApiToken: memedApiToken ? this.segredos.decifrar(memedApiToken) : null,
      memedSecretKeyDefinida: memedSecretKey !== null,
      createdAt: resto.createdAt.toISOString(),
      updatedAt: resto.updatedAt.toISOString(),
    };
  }

  list(query: ListProfissionaisQuery): Promise<Page<ProfissionalDto>> {
    const where = this.where(query);
    const orderBy = toOrderBy(query.sort);
    return paginate(query, {
      findMany: async (page) =>
        (
          await this.txHost.tx.profissional.findMany({
            where,
            orderBy,
            include: COM_ESPECIALIDADE,
            ...page,
          })
        ).map((p) => this.toDto(p)),
      count: () => this.txHost.tx.profissional.count({ where }),
    });
  }

  async detalhe(id: string): Promise<ProfissionalDto> {
    return this.toDto(await this.buscar(id));
  }

  async create(input: CreateProfissionalInput): Promise<ProfissionalDto> {
    await this.validar(input);
    const criado = await this.txHost.tx.profissional.create({
      data: this.dados(input, null),
      include: COM_ESPECIALIDADE,
    });
    return this.toDto(criado);
  }

  async update(id: string, input: UpdateProfissionalInput): Promise<ProfissionalDto> {
    const atual = await this.buscar(id);
    await this.validar(input);
    const alterado = await this.txHost.tx.profissional.update({
      where: { id },
      data: this.dados(input, atual),
      include: COM_ESPECIALIDADE,
    });
    return this.toDto(alterado);
  }

  /** Ativar / Desativar (menu da linha). */
  async alterarStatus(id: string, ativo: boolean): Promise<ProfissionalDto> {
    await this.buscar(id);
    const alterado = await this.txHost.tx.profissional.update({
      where: { id },
      data: { ativo },
      include: COM_ESPECIALIDADE,
    });
    return this.toDto(alterado);
  }

  /** Grava (ou remove, com `null`) a foto ou a logo da receita, já enviadas em `/api/arquivos`. */
  async definirArquivo(
    id: string,
    campo: ProfissionalArquivoCampo,
    arquivoId: string | null,
  ): Promise<ProfissionalDto> {
    await this.buscar(id);
    const { uso, coluna } = ARQUIVOS[campo];
    if (arquivoId) {
      const arquivo = await this.arquivos.findById(arquivoId);
      if (arquivo.uso !== uso) {
        throw new BusinessException('ARQUIVO_USO_INVALIDO', 'Arquivo inválido para este campo', {
          status: 400,
          details: [{ field: 'arquivoId', message: 'O arquivo enviado não é do tipo esperado' }],
        });
      }
    }
    const alterado = await this.txHost.tx.profissional.update({
      where: { id },
      data: { [coluna]: arquivoId },
      include: COM_ESPECIALIDADE,
    });
    return this.toDto(alterado);
  }

  /** Exclusão lógica: agendamentos e receitas antigas continuam apontando para o profissional. */
  async remove(id: string): Promise<ProfissionalDto> {
    await this.buscar(id);
    const excluido = await this.txHost.tx.profissional.update({
      where: { id },
      data: { deletedAt: new Date() },
      include: COM_ESPECIALIDADE,
    });
    return this.toDto(excluido);
  }

  async export(query: ExportProfissionaisQuery): Promise<ExportFile> {
    const where = this.where(query);
    this.exportService.ensureWithinLimit(await this.txHost.tx.profissional.count({ where }));
    const rows = await this.txHost.tx.profissional.findMany({
      where,
      orderBy: toOrderBy(query.sort),
    });
    return this.exportService.export({
      format: query.format,
      title: 'Profissionais',
      filename: 'profissionais',
      columns: selectColumns(PROFISSIONAL_EXPORT_DEFINITIONS, query.columns),
      rows,
    });
  }

  /** Profissional não excluído (ativo ou inativo), para as telas de agenda do cadastro. */
  async garantirExiste(id: string): Promise<void> {
    await this.buscar(id);
  }

  private where(
    query: Pick<ListProfissionaisQuery, 'search' | 'status'>,
  ): Prisma.ProfissionalWhereInput {
    return {
      ...NAO_EXCLUIDOS,
      ativo: query.status ? query.status === 'ativo' : undefined,
      ...searchWhere(query.search, ['nome', 'registro', 'email', 'telefone']),
    };
  }

  private async buscar(id: string): Promise<ProfissionalComEspecialidade> {
    const profissional = isUuid(id)
      ? await this.txHost.tx.profissional.findFirst({
          where: { id, ...NAO_EXCLUIDOS },
          include: COM_ESPECIALIDADE,
        })
      : null;
    if (!profissional) {
      throw new BusinessException(ErrorCode.NOT_FOUND, this.naoEncontrado, { status: 404 });
    }
    return profissional;
  }

  private dados(
    input: CreateProfissionalInput,
    atual: Profissional | null,
  ): Prisma.ProfissionalUncheckedCreateInput {
    const { memedSecretKey, memedApiToken, ...resto } = input;
    return {
      ...resto,
      dataNascimento: input.dataNascimento
        ? new Date(`${input.dataNascimento}T00:00:00.000Z`)
        : null,
      memedApiToken: memedApiToken ? this.segredos.cifrar(memedApiToken) : null,
      // Secret Key em branco mantém a gravada; sem API Token não há credencial a guardar.
      memedSecretKey: !memedApiToken
        ? null
        : memedSecretKey
          ? this.segredos.cifrar(memedSecretKey)
          : (atual?.memedSecretKey ?? null),
    };
  }

  /** Regras que dependem do banco: a especialidade precisa existir e estar ativa. */
  private async validar(input: CreateProfissionalInput): Promise<void> {
    if (!input.especialidadeId) return;
    const especialidade = await this.txHost.tx.especialidade.findFirst({
      where: { id: input.especialidadeId, ...NAO_EXCLUIDOS },
      select: { ativo: true },
    });
    if (!especialidade?.ativo) {
      throw new BusinessException('ESPECIALIDADE_INVALIDA', 'Especialidade inválida', {
        status: 400,
        details: [{ field: 'especialidadeId', message: 'Especialidade inexistente ou inativa' }],
      });
    }
  }
}
