import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  auditLogPageSchema,
  auditLogQuerySchema,
  type AuditLogPage,
  type AuditLogQuery,
} from '@torres/shared';
import { RequirePermission } from '../auth/auth.decorators';
import { ApiErrorResponses, ApiZodQuery, ApiZodResponse } from '../swagger/zod-openapi';
import { ZodValidationPipe } from '../validation/zod-validation.pipe';
import { AuditService } from './audit.service';

/**
 * Consulta do audit_log. Não há endpoint de alteração nem exclusão: a tabela só aceita inserção.
 * Restrita à permissão `configuracoes-gestao.auditoria.ver` (só o Administrador, no seed).
 */
@ApiTags('Auditoria')
@Controller('auditoria')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequirePermission('configuracoes-gestao.auditoria.ver')
  @ApiOperation({ summary: 'Consulta paginada do audit_log, mais recentes primeiro' })
  @ApiZodQuery(auditLogQuerySchema)
  @ApiZodResponse(200, auditLogPageSchema)
  @ApiErrorResponses(400, 401, 403)
  list(
    @Query(new ZodValidationPipe(auditLogQuerySchema)) query: AuditLogQuery,
  ): Promise<AuditLogPage> {
    return this.audit.findMany(query);
  }
}
