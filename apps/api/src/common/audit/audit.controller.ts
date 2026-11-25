import { Controller, Get, Query, StreamableFile } from '@nestjs/common';
import { ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import {
  auditEntidadesSchema,
  auditLogPageSchema,
  auditLogQuerySchema,
  exportAuditLogQuerySchema,
  type AuditEntidades,
  type AuditLogPage,
  type AuditLogQuery,
  type ExportAuditLogQuery,
} from '@torres/shared';
import { RequirePermission } from '../auth/auth.decorators';
import { toStreamableFile } from '../export/export-response';
import { ApiErrorResponses, ApiZodQuery, ApiZodResponse } from '../swagger/zod-openapi';
import { ZodValidationPipe } from '../validation/zod-validation.pipe';
import { Audit } from './audit.decorator';
import { AuditConsultaService } from './audit-consulta.service';

/**
 * Consulta do audit_log (tela Auditoria, `/gestao/auditoria`). Não há endpoint de alteração nem
 * exclusão: a tabela só aceita inserção. Restrita às permissões `configuracoes-gestao.auditoria.*`
 * (só o Administrador, no seed). O conteúdo clínico só sai para quem vê o prontuário.
 */
@ApiTags('Auditoria')
@Controller('auditoria')
export class AuditController {
  constructor(private readonly consulta: AuditConsultaService) {}

  @Get()
  @RequirePermission('configuracoes-gestao.auditoria.ver')
  @ApiOperation({
    summary: 'Consulta paginada do audit_log, com filtros, atalhos de eventos e diff antes/depois',
  })
  @ApiZodQuery(auditLogQuerySchema)
  @ApiZodResponse(200, auditLogPageSchema)
  @ApiErrorResponses(400, 401, 403)
  list(
    @Query(new ZodValidationPipe(auditLogQuerySchema)) query: AuditLogQuery,
  ): Promise<AuditLogPage> {
    return this.consulta.findMany(query);
  }

  @Get('entidades')
  @RequirePermission('configuracoes-gestao.auditoria.ver')
  @ApiOperation({ summary: 'Entidades que já têm registro na trilha (opções do filtro)' })
  @ApiZodResponse(200, auditEntidadesSchema)
  @ApiErrorResponses(401, 403)
  entidades(): Promise<AuditEntidades> {
    return this.consulta.entidades();
  }

  @Get('export')
  @RequirePermission('configuracoes-gestao.auditoria.exportar')
  @Audit({ entity: 'AuditLog', action: 'EXPORT' })
  @ApiOperation({
    summary: 'Exporta a trilha em Excel ou PDF (só metadados), com os mesmos filtros da consulta',
  })
  @ApiZodQuery(exportAuditLogQuerySchema)
  @ApiProduces(
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/pdf',
    'text/csv',
  )
  @ApiErrorResponses(400, 401, 403, 422)
  async export(
    @Query(new ZodValidationPipe(exportAuditLogQuerySchema)) query: ExportAuditLogQuery,
  ): Promise<StreamableFile> {
    return toStreamableFile(await this.consulta.export(query));
  }
}
