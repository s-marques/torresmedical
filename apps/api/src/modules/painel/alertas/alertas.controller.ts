import { Controller, Get, Patch, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  alertaSchema,
  alertasResumoSchema,
  listAlertasQuerySchema,
  type Alerta,
  type AlertasResumo,
  type ListAlertasQuery,
} from '@torres/shared';
import { CurrentUser, RequirePermission } from '../../../common/auth/auth.decorators';
import type { UsuarioAutenticado } from '../../../common/auth/usuario-autenticado';
import {
  ApiErrorResponses,
  ApiZodQuery,
  ApiZodResponse,
} from '../../../common/swagger/zod-openapi';
import { IdParam } from '../../../common/validation/id-param.decorator';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { AlertasService } from './alertas.service';

/**
 * Central de notificações (sino do cabeçalho e tela de alertas). Todo usuário com acesso ao Painel
 * abre a central; cada tipo de alerta só aparece a quem vê a tela de origem do dado. Marcar como
 * lido ou resolvido grava o `audit_log` no service (a chave do estado não é o `:id` da rota).
 */
@ApiTags('Painel: Alertas')
@Controller('painel/alertas')
export class AlertasController {
  constructor(private readonly alertas: AlertasService) {}

  @Get()
  @RequirePermission('painel.painel.ver')
  @ApiOperation({ summary: 'Alertas do dia do usuário, com o total ainda não lido' })
  @ApiZodQuery(listAlertasQuerySchema)
  @ApiZodResponse(200, alertasResumoSchema)
  @ApiErrorResponses(400, 401, 403)
  listar(
    @Query(new ZodValidationPipe(listAlertasQuerySchema)) query: ListAlertasQuery,
    @CurrentUser() usuario: UsuarioAutenticado,
  ): Promise<AlertasResumo> {
    return this.alertas.listar(usuario, query);
  }

  @Patch(':id/lido')
  @RequirePermission('painel.painel.ver')
  @ApiOperation({ summary: 'Marca o alerta como lido para o usuário' })
  @ApiZodResponse(200, alertaSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  lido(@IdParam() id: string, @CurrentUser() usuario: UsuarioAutenticado): Promise<Alerta> {
    return this.alertas.marcarLido(usuario, id);
  }

  @Patch(':id/resolvido')
  @RequirePermission('painel.painel.ver')
  @ApiOperation({ summary: 'Marca o alerta como resolvido para o usuário' })
  @ApiZodResponse(200, alertaSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  resolvido(@IdParam() id: string, @CurrentUser() usuario: UsuarioAutenticado): Promise<Alerta> {
    return this.alertas.resolver(usuario, id);
  }
}
