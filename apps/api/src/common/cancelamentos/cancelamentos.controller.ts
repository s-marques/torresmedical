import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  motivosDoTipoQuerySchema,
  motivosDoTipoSchema,
  type MotivoOpcao,
  type MotivosDoTipoQuery,
} from '@torres/shared';
import { RequirePermission } from '../auth/auth.decorators';
import { ApiErrorResponses, ApiZodQuery, ApiZodResponse } from '../swagger/zod-openapi';
import { ZodValidationPipe } from '../validation/zod-validation.pipe';
import { CancelamentosService } from './cancelamentos.service';

/**
 * Motivos ativos de um tipo de cancelamento, para o modal padrão. Quem pode cancelar em alguma
 * tela (ou gerir o cadastro) pode ler a lista: ela não tem dado pessoal.
 */
@ApiTags('Cancelamentos')
@Controller('cancelamentos')
export class CancelamentosController {
  constructor(private readonly cancelamentos: CancelamentosService) {}

  @Get('motivos')
  @RequirePermission(
    'comercial-atendimento.agenda.ver',
    'comercial-atendimento.confirmacoes.ver',
    'comercial-atendimento.orcamentos.ver',
    'comercial-atendimento.pipeline.ver',
    'financeiro.contas-receber.ver',
    'financeiro.contas-pagar.ver',
    'gestao-profissionais.salas.ver',
    'configuracoes-gestao.motivos-cancelamento.ver',
  )
  @ApiOperation({ summary: 'Motivos ativos do tipo de cancelamento, na ordem da lista' })
  @ApiZodQuery(motivosDoTipoQuerySchema)
  @ApiZodResponse(200, motivosDoTipoSchema)
  @ApiErrorResponses(400, 401, 403)
  motivos(
    @Query(new ZodValidationPipe(motivosDoTipoQuerySchema)) query: MotivosDoTipoQuery,
  ): Promise<MotivoOpcao[]> {
    return this.cancelamentos.motivosDoTipo(query.tipo);
  }
}
