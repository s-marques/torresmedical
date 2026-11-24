import { Body, Controller, Get, Patch, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  listRecepcaoQuerySchema,
  recepcaoFilaSchema,
  recepcaoItemSchema,
  recepcaoPageSchema,
  updateRecepcaoStatusSchema,
  type ListRecepcaoQuery,
  type RecepcaoFila,
  type RecepcaoItem,
  type UpdateRecepcaoStatusInput,
} from '@torres/shared';
import { Audit } from '../../../common/audit/audit.decorator';
import { RequirePermission } from '../../../common/auth/auth.decorators';
import type { Page } from '../../../common/pagination/paginate';
import {
  ApiErrorResponses,
  ApiZodBody,
  ApiZodQuery,
  ApiZodResponse,
} from '../../../common/swagger/zod-openapi';
import { IdParam } from '../../../common/validation/id-param.decorator';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { RecepcaoService } from './recepcao.service';

const PERMISSAO = 'comercial-atendimento.recepcao';

/** Tela Recepção (`/recepcao`): atendimentos de hoje, fila de espera e status rápidos. */
@ApiTags('Comercial / Atendimento: Recepção')
@Controller('comercial-atendimento/recepcao')
export class RecepcaoController {
  constructor(private readonly service: RecepcaoService) {}

  @Get()
  @RequirePermission(`${PERMISSAO}.ver`)
  @ApiOperation({ summary: 'Atendimentos de hoje, com filtro por profissional, sala e status' })
  @ApiZodQuery(listRecepcaoQuerySchema)
  @ApiZodResponse(200, recepcaoPageSchema)
  @ApiErrorResponses(400, 401, 403)
  listar(
    @Query(new ZodValidationPipe(listRecepcaoQuerySchema)) query: ListRecepcaoQuery,
  ): Promise<Page<RecepcaoItem>> {
    return this.service.listar(query);
  }

  // Rota fixa antes de `:id`.
  @Get('fila')
  @RequirePermission(`${PERMISSAO}.ver`)
  @ApiOperation({ summary: 'Fila de espera: quem chegou e ainda não entrou, por ordem de chegada' })
  @ApiZodResponse(200, recepcaoFilaSchema)
  @ApiErrorResponses(401, 403)
  async fila(): Promise<RecepcaoFila> {
    return { data: await this.service.fila() };
  }

  @Patch(':id/status')
  @RequirePermission(`${PERMISSAO}.editar`)
  @Audit({ entity: 'Agendamento' })
  @ApiOperation({
    summary: 'Status rápido (Chegou, Aguardando, Faltou...): grava o horário da transição',
  })
  @ApiZodBody(updateRecepcaoStatusSchema)
  @ApiZodResponse(200, recepcaoItemSchema)
  @ApiErrorResponses(400, 401, 403, 404, 422)
  alterarStatus(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(updateRecepcaoStatusSchema)) body: UpdateRecepcaoStatusInput,
  ): Promise<RecepcaoItem> {
    return this.service.alterarStatus(id, body);
  }
}
