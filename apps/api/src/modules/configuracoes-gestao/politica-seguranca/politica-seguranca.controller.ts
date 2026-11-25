import { TransactionHost } from '@nestjs-cls/transactional';
import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  politicaSegurancaInputSchema,
  politicaSegurancaSchema,
  type PoliticaSeguranca,
  type PoliticaSegurancaInput,
} from '@torres/shared';
import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser, RequirePermission } from '../../../common/auth/auth.decorators';
import { PoliticaSegurancaService } from '../../../common/auth/politica-seguranca.service';
import type { UsuarioAutenticado } from '../../../common/auth/usuario-autenticado';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { ApiErrorResponses, ApiZodBody, ApiZodResponse } from '../../../common/swagger/zod-openapi';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';

/**
 * Política de segurança (issue #156, R §41), aba "Segurança" da tela Minha Empresa. Não há `:id`
 * (a empresa vem do usuário logado): a auditoria é gravada aqui, na mesma transação da escrita
 * (CLAUDE.md, seção 4).
 */
@ApiTags('Configurações / Gestão: Política de segurança')
@Controller('configuracoes-gestao/politica-seguranca')
export class PoliticaSegurancaController {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly politica: PoliticaSegurancaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermission('configuracoes-gestao.minha-empresa.ver')
  @ApiOperation({ summary: 'Política de senha, bloqueio e encerramento de acesso' })
  @ApiZodResponse(200, politicaSegurancaSchema)
  @ApiErrorResponses(401, 403)
  obter(@CurrentUser() usuario: UsuarioAutenticado): Promise<PoliticaSeguranca> {
    return this.politica.obter(usuario.empresaId);
  }

  @Put()
  @RequirePermission('configuracoes-gestao.minha-empresa.editar')
  @ApiOperation({ summary: 'Salva a política de segurança' })
  @ApiZodBody(politicaSegurancaInputSchema)
  @ApiZodResponse(200, politicaSegurancaSchema)
  @ApiErrorResponses(400, 401, 403)
  atualizar(
    @Body(new ZodValidationPipe(politicaSegurancaInputSchema)) body: PoliticaSegurancaInput,
    @CurrentUser() usuario: UsuarioAutenticado,
  ): Promise<PoliticaSeguranca> {
    return this.txHost.withTransaction(async () => {
      const antes = await this.politica.obter(usuario.empresaId);
      const depois = await this.politica.atualizar(usuario.empresaId, body);
      await this.audit.record({
        action: 'UPDATE',
        entity: 'PoliticaSeguranca',
        entityId: usuario.empresaId,
        before: antes,
        after: depois,
      });
      return depois;
    });
  }
}
