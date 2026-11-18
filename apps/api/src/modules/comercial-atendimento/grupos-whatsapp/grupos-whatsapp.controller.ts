import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  grupoWhatsappPageSchema,
  listGruposWhatsappQuerySchema,
  type GrupoWhatsapp,
  type ListGruposWhatsappQuery,
} from '@torres/shared';
import { RequirePermission } from '../../../common/auth/auth.decorators';
import type { Page } from '../../../common/pagination/paginate';
import {
  ApiErrorResponses,
  ApiZodQuery,
  ApiZodResponse,
} from '../../../common/swagger/zod-openapi';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { GruposWhatsappService } from './grupos-whatsapp.service';

/** Tela Grupos WhatsApp (`/grupos-whatsapp`). */
@ApiTags('Comercial / Atendimento: Grupos WhatsApp')
@Controller('comercial-atendimento/grupos-whatsapp')
export class GruposWhatsappController {
  constructor(private readonly grupos: GruposWhatsappService) {}

  @Get()
  @RequirePermission('comercial-atendimento.grupos-whatsapp.ver')
  @ApiOperation({ summary: 'Grupos de WhatsApp do canal escolhido, com busca e paginação' })
  @ApiZodQuery(listGruposWhatsappQuerySchema)
  @ApiZodResponse(200, grupoWhatsappPageSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  list(
    @Query(new ZodValidationPipe(listGruposWhatsappQuerySchema)) query: ListGruposWhatsappQuery,
  ): Promise<Page<GrupoWhatsapp>> {
    return this.grupos.list(query);
  }
}
