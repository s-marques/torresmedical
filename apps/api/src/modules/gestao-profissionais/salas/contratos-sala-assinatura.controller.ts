import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  assinarContratoSalaSchema,
  contratoSalaSchema,
  type AssinarContratoSalaInput,
  type ContratoSala,
} from '@torres/shared';
import { Audit } from '../../../common/audit/audit.decorator';
import { RequirePermission } from '../../../common/auth/auth.decorators';
import { ApiErrorResponses, ApiZodBody, ApiZodResponse } from '../../../common/swagger/zod-openapi';
import { IdParam } from '../../../common/validation/id-param.decorator';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { ContratosSalaAssinaturaService } from './contratos-sala-assinatura.service';

/** Assinatura do contrato de sala (issue #142). Usa as permissões da tela Salas. */
@ApiTags('Gestão Profissionais: Contratos de Salas')
@Controller('gestao-profissionais/contratos-sala')
export class ContratosSalaAssinaturaController {
  constructor(private readonly assinatura: ContratosSalaAssinaturaService) {}

  @Post(':id/assinar')
  @RequirePermission('gestao-profissionais.salas.editar')
  @HttpCode(200)
  @Audit({ entity: 'ContratoSala', action: 'UPDATE' })
  @ApiOperation({
    summary:
      'Registra a assinatura (data e PDF assinado): ativa o contrato, cria o onboarding do profissional e gera a cobrança do primeiro mês',
  })
  @ApiZodBody(assinarContratoSalaSchema)
  @ApiZodResponse(200, contratoSalaSchema)
  @ApiErrorResponses(400, 401, 403, 404, 409)
  assinar(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(assinarContratoSalaSchema)) body: AssinarContratoSalaInput,
  ): Promise<ContratoSala> {
    return this.assinatura.assinar(id, body);
  }
}
