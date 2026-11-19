import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import type {
  CreateUsuarioInput,
  ExportUsuariosQuery,
  ListUsuariosQuery,
  LookupItem,
  LookupQuery,
  ResetarSenhaUsuarioInput,
  Usuario as UsuarioDto,
  UsuarioExportColumn,
  UpdateUsuarioInput,
} from '@torres/shared';
import { Prisma } from '../../../generated/prisma/client';
import { hashSenha } from '../../../common/auth/senhas';
import { BusinessException } from '../../../common/errors/api.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { ExportService, selectColumns } from '../../../common/export/export.service';
import type { ExportColumn, ExportFile } from '../../../common/export/export.types';
import {
  EntidadeLookupService,
  SELECIONAVEIS,
  type FonteLookup,
} from '../../../common/lookups/lookup-query';
import { paginate, searchWhere, toOrderBy, type Page } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';

const COM_PERFIL = {
  perfil: { select: { nome: true } },
  profissionais: {
    select: { profissional: { select: { id: true, nome: true } } },
    orderBy: { profissional: { nome: 'asc' } },
  },
} as const;

/** Usuário com o nome do perfil (colunas "Role" e "Perfil" do grid). */
export type UsuarioComPerfil = Prisma.UsuarioGetPayload<{ include: typeof COM_PERFIL }>;

const NAO_EXCLUIDOS = { deletedAt: null } as const;

export const PROFISSIONAL_INVALIDO = 'Profissional não encontrado';

function vinculos(
  profissionalIds: readonly string[],
): Prisma.UsuarioProfissionalCreateWithoutUsuarioInput[] {
  return profissionalIds.map((id) => ({ profissional: { connect: { id } } }));
}

/**
 * O profissional é de outro módulo: em vez de consultar a tabela dele, a FK valida os ids e a
 * violação vira um erro no campo "Profissionais vinculados" (mesmo padrão de Canais WhatsApp).
 */
async function gravarComProfissionais<T>(gravar: () => Promise<T>): Promise<T> {
  try {
    return await gravar();
  } catch (erro) {
    if (
      erro instanceof Prisma.PrismaClientKnownRequestError &&
      (erro.code === 'P2003' || erro.code === 'P2025')
    ) {
      throw new BusinessException('PROFISSIONAL_INVALIDO', PROFISSIONAL_INVALIDO, {
        status: 400,
        details: [{ field: 'profissionalIds', message: PROFISSIONAL_INVALIDO }],
      });
    }
    throw erro;
  }
}

export const USUARIO_EXPORT_DEFINITIONS: readonly ExportColumn<
  UsuarioComPerfil,
  UsuarioExportColumn
>[] = [
  { key: 'nome', header: 'Nome', value: (u) => u.nome, width: 3 },
  { key: 'email', header: 'Email', value: (u) => u.email, width: 3 },
  { key: 'telefone', header: 'Telefone', value: (u) => u.telefone ?? '' },
  { key: 'cargo', header: 'Cargo', value: (u) => u.cargo ?? '' },
  {
    key: 'perfil',
    header: 'Perfil',
    value: (u) => u.perfil?.nome ?? 'Sem perfil (usa padrão da role)',
  },
  { key: 'status', header: 'Status', value: (u) => (u.ativo ? 'Ativo' : 'Inativo') },
  { key: 'ultimoLogin', header: 'Último Login', type: 'datetime', value: (u) => u.ultimoLoginEm },
];

/** Perfil (Perfis de Acesso, issue #33) como lookup só para o combobox desta tela. */
@Injectable()
export class PerfisLookupService extends EntidadeLookupService<
  LookupQuery<'perfis'>,
  Prisma.PerfilWhereInput,
  { id: string; nome: string }
> {
  protected readonly naoEncontrado = 'Perfil não encontrado';
  protected readonly fonte: FonteLookup<Prisma.PerfilWhereInput, { id: string; nome: string }> = {
    findMany: (args) =>
      this.txHost.tx.perfil.findMany({ ...args, select: { id: true, nome: true } }),
    count: (args) => this.txHost.tx.perfil.count(args),
    findFirst: (args) =>
      this.txHost.tx.perfil.findFirst({ ...args, select: { id: true, nome: true } }),
  };

  constructor(private readonly txHost: TransactionHost<PrismaAdapter>) {
    super();
  }

  protected filtro(query: LookupQuery<'perfis'>): Prisma.PerfilWhereInput {
    return { ...SELECIONAVEIS, ...searchWhere(query.search, ['nome']) };
  }

  protected toItem(perfil: { id: string; nome: string }): LookupItem {
    return { id: perfil.id, label: perfil.nome, descricao: null };
  }
}

/**
 * Usuário como lookup (combobox "Transferir" da tela WhatsApp). Só ativos e não excluídos;
 * `nomesPorIds` devolve o nome de quem aparece em registros de outros módulos (atendente).
 */
@Injectable()
export class UsuariosLookupService extends EntidadeLookupService<
  LookupQuery<'usuarios'>,
  Prisma.UsuarioWhereInput,
  { id: string; nome: string; cargo: string | null }
> {
  protected readonly naoEncontrado = 'Usuário não encontrado';
  protected readonly fonte: FonteLookup<
    Prisma.UsuarioWhereInput,
    { id: string; nome: string; cargo: string | null }
  > = {
    findMany: (args) =>
      this.txHost.tx.usuario.findMany({
        ...args,
        select: { id: true, nome: true, cargo: true },
      }),
    count: (args) => this.txHost.tx.usuario.count(args),
    findFirst: (args) =>
      this.txHost.tx.usuario.findFirst({ ...args, select: { id: true, nome: true, cargo: true } }),
  };

  constructor(private readonly txHost: TransactionHost<PrismaAdapter>) {
    super();
  }

  protected filtro(query: LookupQuery<'usuarios'>): Prisma.UsuarioWhereInput {
    return { ...SELECIONAVEIS, ...searchWhere(query.search, ['nome', 'cargo']) };
  }

  protected toItem(usuario: { id: string; nome: string; cargo: string | null }): LookupItem {
    return { id: usuario.id, label: usuario.nome, descricao: usuario.cargo };
  }

  /** Usuário ativo e não excluído, para ser destino de uma ação (ex.: transferir conversa). */
  async selecionarPorId(id: string): Promise<{ id: string; nome: string }> {
    const usuario = await this.fonte.findFirst({ where: { id, ...SELECIONAVEIS } });
    if (!usuario) {
      throw new BusinessException(ErrorCode.NOT_FOUND, this.naoEncontrado, { status: 404 });
    }
    return usuario;
  }

  /** `id → nome`, inclusive de usuários inativos ou excluídos (histórico). */
  async nomesPorIds(ids: readonly string[]): Promise<Map<string, string>> {
    const unicos = [...new Set(ids)];
    if (unicos.length === 0) return new Map();
    const usuarios = await this.txHost.tx.usuario.findMany({
      where: { id: { in: unicos } },
      select: { id: true, nome: true },
    });
    return new Map(usuarios.map((u) => [u.id, u.nome]));
  }
}

/** Tela Usuários (`/usuarios`): usuários do sistema e o perfil de acesso de cada um. */
@Injectable()
export class UsuariosService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly exportService: ExportService,
  ) {}

  list(query: ListUsuariosQuery): Promise<Page<UsuarioDto>> {
    const where = this.where(query);
    const orderBy = toOrderBy(query.sort, { status: 'ativo' });
    return this.paginar(where, orderBy, query);
  }

  async findByIdDto(id: string): Promise<UsuarioDto> {
    return this.toDto(await this.buscar(id));
  }

  /** `criadorId`: usuário autenticado, só para herdar a empresa (sem seletor no modal). */
  async create(input: CreateUsuarioInput, criadorId: string): Promise<UsuarioDto> {
    const criador = await this.txHost.tx.usuario.findUniqueOrThrow({
      where: { id: criadorId },
      select: { empresaId: true },
    });
    await this.ensureEmailDisponivel(input.email);
    if (input.perfilId) await this.ensurePerfilExists(input.perfilId);

    const { senha, profissionalIds, ...resto } = input;
    const senhaHash = await hashSenha(senha);
    const criado = await gravarComProfissionais(() =>
      this.txHost.tx.usuario.create({
        data: {
          ...resto,
          empresaId: criador.empresaId,
          senhaHash,
          profissionais: { create: vinculos(profissionalIds) },
        },
        include: COM_PERFIL,
      }),
    );
    return this.toDto(criado);
  }

  async update(id: string, input: UpdateUsuarioInput): Promise<UsuarioDto> {
    await this.buscar(id);
    await this.ensureEmailDisponivel(input.email, id);
    if (input.perfilId) await this.ensurePerfilExists(input.perfilId);

    const { status, profissionalIds, ...resto } = input;
    const atualizado = await gravarComProfissionais(() =>
      this.txHost.tx.usuario.update({
        where: { id },
        data: {
          ...resto,
          ativo: status === 'ativo',
          profissionais: { deleteMany: {}, create: vinculos(profissionalIds) },
        },
        include: COM_PERFIL,
      }),
    );
    return this.toDto(atualizado);
  }

  async resetarSenha(id: string, input: ResetarSenhaUsuarioInput): Promise<UsuarioDto> {
    await this.buscar(id);
    const atualizado = await this.txHost.tx.usuario.update({
      where: { id },
      data: { senhaHash: await hashSenha(input.senha) },
      include: COM_PERFIL,
    });
    return this.toDto(atualizado);
  }

  async export(query: ExportUsuariosQuery): Promise<ExportFile> {
    const where = this.where(query);
    this.exportService.ensureWithinLimit(await this.txHost.tx.usuario.count({ where }));
    const rows = await this.txHost.tx.usuario.findMany({
      where,
      orderBy: toOrderBy(query.sort, { status: 'ativo' }),
      include: COM_PERFIL,
    });
    return this.exportService.export({
      format: query.format,
      title: 'Usuários',
      filename: 'usuarios',
      columns: selectColumns(USUARIO_EXPORT_DEFINITIONS, query.columns),
      rows,
    });
  }

  private async paginar(
    where: Prisma.UsuarioWhereInput,
    orderBy: ReturnType<typeof toOrderBy>,
    query: ListUsuariosQuery,
  ): Promise<Page<UsuarioDto>> {
    const pagina = await paginate(query, {
      findMany: (page) =>
        this.txHost.tx.usuario.findMany({ where, orderBy, include: COM_PERFIL, ...page }),
      count: () => this.txHost.tx.usuario.count({ where }),
    });
    return { ...pagina, data: pagina.data.map((u) => this.toDto(u)) };
  }

  /** Usuários ativos para combobox de responsável (CRM), por nome. */
  responsaveis(): Promise<{ id: string; nome: string }[]> {
    return this.txHost.tx.usuario.findMany({
      where: SELECIONAVEIS,
      select: { id: true, nome: true },
      orderBy: [{ nome: 'asc' }, { id: 'asc' }],
    });
  }

  /** Nome dos usuários não excluídos entre os ids. */
  async nomesPorIds(ids: readonly string[]): Promise<ReadonlyMap<string, string>> {
    if (ids.length === 0) return new Map();
    const usuarios = await this.txHost.tx.usuario.findMany({
      where: { id: { in: [...new Set(ids)] }, ...NAO_EXCLUIDOS },
      select: { id: true, nome: true },
    });
    return new Map(usuarios.map((u) => [u.id, u.nome]));
  }

  /** Usuário ativo e não excluído; senão 404 com o rótulo do campo. */
  async garantirAtivo(id: string, rotulo = 'Usuário'): Promise<void> {
    const usuario = await this.txHost.tx.usuario.findFirst({
      where: { id, ...SELECIONAVEIS },
      select: { id: true },
    });
    if (!usuario) {
      throw new BusinessException(ErrorCode.NOT_FOUND, `${rotulo} não encontrado`, {
        status: 404,
      });
    }
  }

  private async buscar(id: string): Promise<UsuarioComPerfil> {
    const usuario = await this.txHost.tx.usuario.findFirst({
      where: { id, deletedAt: null },
      include: COM_PERFIL,
    });
    if (!usuario) {
      throw new BusinessException(ErrorCode.NOT_FOUND, 'Usuário não encontrado', { status: 404 });
    }
    return usuario;
  }

  private where(query: Pick<ListUsuariosQuery, 'search' | 'status'>): Prisma.UsuarioWhereInput {
    return {
      ...NAO_EXCLUIDOS,
      ativo: query.status ? query.status === 'ativo' : undefined,
      ...searchWhere(query.search, ['nome', 'email', 'telefone', 'cargo']),
    };
  }

  /** E-mail livre para o usuário (também usado por "Meu Perfil", tela Configurações). */
  async ensureEmailDisponivel(email: string, ignorarId?: string): Promise<void> {
    const existente = await this.txHost.tx.usuario.findFirst({
      where: { email, id: ignorarId ? { not: ignorarId } : undefined },
      select: { id: true },
    });
    if (existente) {
      throw new BusinessException(ErrorCode.DUPLICATE, 'Já existe um usuário com este email', {
        status: 409,
        details: [{ field: 'email', message: 'Já existe um usuário com este email' }],
      });
    }
  }

  private async ensurePerfilExists(perfilId: string): Promise<void> {
    const perfil = await this.txHost.tx.perfil.findFirst({
      where: { id: perfilId, deletedAt: null },
      select: { id: true },
    });
    if (!perfil) {
      throw new BusinessException('PERFIL_NAO_ENCONTRADO', 'Perfil não encontrado', {
        details: [{ field: 'perfilId', message: 'Perfil não encontrado' }],
      });
    }
  }

  private toDto(usuario: UsuarioComPerfil): UsuarioDto {
    return {
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      telefone: usuario.telefone,
      cargo: usuario.cargo,
      perfilId: usuario.perfilId,
      perfilNome: usuario.perfil?.nome ?? null,
      verDadosSensiveis: usuario.verDadosSensiveis,
      profissionais: usuario.profissionais.map((v) => v.profissional),
      ativo: usuario.ativo,
      ultimoLoginEm: usuario.ultimoLoginEm ? usuario.ultimoLoginEm.toISOString() : null,
      createdAt: usuario.createdAt.toISOString(),
      updatedAt: usuario.updatedAt.toISOString(),
    };
  }
}
