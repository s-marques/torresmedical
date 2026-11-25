import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import {
  AUDIT_ENTIDADES_CLINICAS,
  AUDIT_GRUPOS_DEFINICAO,
  diffAuditoria,
  type AuditAction,
  type AuditEntidades,
  type AuditLogItem,
  type AuditLogPage,
  type AuditLogQuery,
  type ExportAuditLogQuery,
} from '@torres/shared';
import { Prisma, type AuditLog } from '../../generated/prisma/client';
import { isUuid } from '../auth/tokens';
import { RequestContextService } from '../context/request-context.service';
import { ExportService } from '../export/export.service';
import type { ExportColumn, ExportFile } from '../export/export.types';
import { paginate, toOrderBy } from '../pagination/paginate';
import type { PrismaAdapter } from '../prisma/prisma-transaction';

const ROTULO_ACAO: Readonly<Record<AuditAction, string>> = {
  CREATE: 'Criação',
  UPDATE: 'Alteração',
  DELETE: 'Exclusão',
  EXPORT: 'Exportação',
};

const ENTIDADES_CLINICAS: ReadonlySet<string> = new Set(AUDIT_ENTIDADES_CLINICAS);

/** Colunas exportáveis: só metadados, nunca o conteúdo de antes e depois. */
export const AUDIT_EXPORT_DEFINITIONS: readonly ExportColumn<
  AuditLogItem,
  'data' | 'usuario' | 'acao' | 'entidade' | 'registro' | 'campos'
>[] = [
  {
    key: 'data',
    header: 'Data/hora',
    type: 'datetime',
    value: (item) => new Date(item.occurredAt),
    width: 18,
  },
  { key: 'usuario', header: 'Usuário', value: (item) => item.userNome ?? item.userId, width: 24 },
  { key: 'acao', header: 'Ação', value: (item) => ROTULO_ACAO[item.action], width: 12 },
  { key: 'entidade', header: 'Entidade', value: (item) => item.entity, width: 22 },
  { key: 'registro', header: 'Registro', value: (item) => item.entityId, width: 36 },
  { key: 'campos', header: 'Campos', value: (item) => item.campos.join(', '), width: 40 },
];

/**
 * Consulta da trilha (`audit_log`) para a tela Auditoria (issue #155): filtros, atalhos de
 * eventos, nome do usuário, campos alterados e exportação. O conteúdo clínico de
 * `before`/`after` (prontuário, atendimento, anamnese, receita) só sai para quem tem a
 * permissão de ver o prontuário; sem ela, ficam o quem, o quando e os nomes dos campos.
 */
@Injectable()
export class AuditConsultaService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly context: RequestContextService,
    private readonly exportService: ExportService,
  ) {}

  async findMany(query: AuditLogQuery): Promise<AuditLogPage> {
    const where = this.where(query);
    const page = await paginate(query, {
      findMany: (args) =>
        this.txHost.tx.auditLog.findMany({
          where,
          orderBy: toOrderBy(query.sort),
          ...args,
        }),
      count: () => this.txHost.tx.auditLog.count({ where }),
    });
    return { ...page, data: await this.toItems(page.data) };
  }

  async entidades(): Promise<AuditEntidades> {
    const grupos = await this.txHost.tx.auditLog.groupBy({
      by: ['entity'],
      orderBy: { entity: 'asc' },
    });
    return { data: grupos.map((grupo) => grupo.entity) };
  }

  async export(query: ExportAuditLogQuery): Promise<ExportFile> {
    const where = this.where(query);
    this.exportService.ensureWithinLimit(await this.txHost.tx.auditLog.count({ where }));
    const registros = await this.txHost.tx.auditLog.findMany({
      where,
      orderBy: toOrderBy(query.sort),
    });
    const columns = query.columns
      .map((key) => AUDIT_EXPORT_DEFINITIONS.find((coluna) => coluna.key === key))
      .filter((coluna) => coluna !== undefined);
    return this.exportService.export({
      format: query.format,
      title: 'Auditoria',
      filename: 'auditoria',
      columns,
      rows: await this.toItems(registros),
    });
  }

  private where(query: Omit<AuditLogQuery, 'page' | 'pageSize'>): Prisma.AuditLogWhereInput {
    const grupo = query.grupo ? AUDIT_GRUPOS_DEFINICAO[query.grupo] : undefined;
    const e: Prisma.AuditLogWhereInput[] = [];
    if (query.entity) e.push({ entity: query.entity });
    if (query.entityId) e.push({ entityId: query.entityId });
    if (query.userId) e.push({ userId: query.userId });
    if (query.action) e.push({ action: query.action });
    if (query.de || query.ate) e.push({ occurredAt: { gte: query.de, lte: query.ate } });
    if (query.search) {
      e.push({
        OR: [
          { entity: { contains: query.search, mode: 'insensitive' } },
          { entityId: { contains: query.search, mode: 'insensitive' } },
        ],
      });
    }
    if (grupo?.action) e.push({ action: grupo.action });
    if (grupo?.entities) e.push({ entity: { in: [...grupo.entities] } });
    if (grupo?.statusFinal) {
      e.push({
        OR: grupo.statusFinal.map((status) => ({ after: { path: ['status'], equals: status } })),
      });
    }
    return e.length > 0 ? { AND: e } : {};
  }

  private async toItems(registros: AuditLog[]): Promise<AuditLogItem[]> {
    const nomes = await this.nomesDosUsuarios(registros);
    const podeVerProntuario = this.context.getVerProntuario();
    return registros.map((registro) => {
      const campos = diffAuditoria(registro.before, registro.after).map((d) => d.campo);
      const restrito = ENTIDADES_CLINICAS.has(registro.entity) && !podeVerProntuario;
      return {
        id: registro.id,
        userId: registro.userId,
        userNome: nomes.get(registro.userId) ?? null,
        occurredAt: registro.occurredAt.toISOString(),
        action: registro.action,
        entity: registro.entity,
        entityId: registro.entityId,
        before: restrito ? null : registro.before,
        after: restrito ? null : registro.after,
        campos,
        restrito,
        requestId: registro.requestId,
        ip: registro.ip,
      };
    });
  }

  /** `system`, `anonymous` e ids que não são de usuário ficam sem nome. */
  private async nomesDosUsuarios(registros: AuditLog[]): Promise<Map<string, string>> {
    const ids = [...new Set(registros.map((registro) => registro.userId))].filter(isUuid);
    if (ids.length === 0) return new Map();
    const usuarios = await this.txHost.tx.usuario.findMany({
      where: { id: { in: ids } },
      select: { id: true, nome: true },
    });
    return new Map(usuarios.map((usuario) => [usuario.id, usuario.nome]));
  }
}
