import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { auditLogQuerySchema, type AuditLogPage } from '@torres/shared';
import { AuditService } from './audit.service';

/**
 * Consulta do audit_log. Não há endpoint de alteração nem exclusão: a tabela só aceita inserção.
 * A restrição ao perfil administrador é ligada pela issue de Autenticação.
 */
@Controller('auditoria')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  list(@Query() query: unknown): Promise<AuditLogPage> {
    const parsed = auditLogQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'Dados inválidos',
        details: parsed.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }
    return this.audit.findMany(parsed.data);
  }
}
