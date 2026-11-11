import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  contadoresConversasWhatsappQuerySchema,
  contadoresConversasWhatsappSchema,
  conversaWhatsappPageSchema,
  conversaWhatsappSchema,
  listConversasWhatsappQuerySchema,
  novaConversaWhatsappSchema,
  type ContadoresConversasWhatsapp,
  type ContadoresConversasWhatsappQuery,
  type ListConversasWhatsappQuery,
  type NovaConversaWhatsappInput,
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
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { ConversasWhatsappService, type ConversaWhatsappDto } from './conversas-whatsapp.service';

/** Tela WhatsApp (`/atendimento`): conversas do atendimento. */
@ApiTags('Comercial / Atendimento: WhatsApp')
@Controller('comercial-atendimento/conversas-whatsapp')
export class ConversasWhatsappController {
  constructor(private readonly conversas: ConversasWhatsappService) {}

  @Get()
  @RequirePermission('comercial-atendimento.whatsapp.ver')
  @ApiOperation({
    summary:
      'Lista de conversas (mais recentes primeiro), por canal e status. A busca cobre nome, ' +
      'telefone, tag e palavra nas mensagens, a partir de 2 caracteres',
  })
  @ApiZodQuery(listConversasWhatsappQuerySchema)
  @ApiZodResponse(200, conversaWhatsappPageSchema)
  @ApiErrorResponses(400, 401, 403)
  list(
    @Query(new ZodValidationPipe(listConversasWhatsappQuerySchema))
    query: ListConversasWhatsappQuery,
  ): Promise<Page<ConversaWhatsappDto>> {
    return this.conversas.list(query);
  }

  @Get('contadores')
  @RequirePermission('comercial-atendimento.whatsapp.ver')
  @ApiOperation({ summary: 'Quantidade de conversas em cada status (chips), por canal' })
  @ApiZodQuery(contadoresConversasWhatsappQuerySchema)
  @ApiZodResponse(200, contadoresConversasWhatsappSchema)
  @ApiErrorResponses(400, 401, 403)
  contadores(
    @Query(new ZodValidationPipe(contadoresConversasWhatsappQuerySchema))
    query: ContadoresConversasWhatsappQuery,
  ): Promise<ContadoresConversasWhatsapp> {
    return this.conversas.contadores(query);
  }

  @Post()
  @RequirePermission('comercial-atendimento.whatsapp.criar')
  @Audit({ entity: 'ConversaWhatsapp' })
  @ApiOperation({
    summary:
      'Nova conversa com um paciente num canal, já em atendimento. 409 se houver outra ' +
      'não finalizada no mesmo canal; 422 se o paciente não tiver telefone',
  })
  @ApiZodBody(novaConversaWhatsappSchema)
  @ApiZodResponse(201, conversaWhatsappSchema)
  @ApiErrorResponses(400, 401, 403, 404, 409, 422)
  criar(
    @Body(new ZodValidationPipe(novaConversaWhatsappSchema)) body: NovaConversaWhatsappInput,
  ): Promise<ConversaWhatsappDto> {
    return this.conversas.criar(body);
  }
}
