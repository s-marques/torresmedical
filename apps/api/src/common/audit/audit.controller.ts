import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  auditLogPageSchema,
  auditLogQuerySchema,
  type AuditLogPage,
  type AuditLogQuery,
} from '@torres/shared';
import { ApiErrorResponses, ApiZodQuery, ApiZodResponse } from '../swagger/zod-openapi';
import { ZodValidationPipe } from '../validation/zod-validation.pipe';
import { AuditService } from './audit.service';

/**
 * Consulta do audit_log. Não há endpoint de alteração nem exclusão: a tabela só aceita inserção.
 * A restrição ao perfil administrador é ligada pela issue de Autenticação.
 */
@ApiTags('Auditoria')
@Controller('auditoria')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @ApiOperation({ summary: 'Consulta paginada do audit_log, mais recentes primeiro' })
  @ApiZodQuery(auditLogQuerySchema)
  @ApiZodResponse(200, auditLogPageSchema)
  @ApiErrorResponses(400)
  list(
    @Query(new ZodValidationPipe(auditLogQuerySchema)) query: AuditLogQuery,
  ): Promise<AuditLogPage> {
    return this.audit.findMany(query);
  }
}
