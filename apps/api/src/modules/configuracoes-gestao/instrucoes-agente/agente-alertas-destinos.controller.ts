import { Body, Controller, Delete, Get, HttpCode, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  agenteAlertaDestinoPageSchema,
  agenteAlertaDestinoSchema,
  createAgenteAlertaDestinoSchema,
  listAgenteAlertaDestinoQuerySchema,
  type CreateAgenteAlertaDestinoInput,
  type ListAgenteAlertaDestinoQuery,
} from '@torres/shared';
import type { AgenteAlertaDestino } from '../../../generated/prisma/client';
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
import { AgenteAlertasDestinosService } from './agente-alertas-destinos.service';

const ENTITY = 'AgenteAlertaDestino';
const PERMISSAO = 'configuracoes-gestao.instrucoes-agente';

/** Aba "Alertas do Agente" da tela Instruções Agente: destinos de notificação. */
@ApiTags('Configurações / Gestão: Instruções Agente')
@Controller('configuracoes-gestao/agente-alertas-destinos')
export class AgenteAlertasDestinosController {
  constructor(private readonly destinos: AgenteAlertasDestinosService) {}

  @Get()
  @RequirePermission(`${PERMISSAO}.ver`)
  @ApiOperation({ summary: 'Lista paginada de destinos, com busca por nome e número' })
  @ApiZodQuery(listAgenteAlertaDestinoQuerySchema)
  @ApiZodResponse(200, agenteAlertaDestinoPageSchema)
  @ApiErrorResponses(400, 401, 403)
  list(
    @Query(new ZodValidationPipe(listAgenteAlertaDestinoQuerySchema))
    query: ListAgenteAlertaDestinoQuery,
  ): Promise<Page<AgenteAlertaDestino>> {
    return this.destinos.list(query);
  }

  @Post()
  @RequirePermission(`${PERMISSAO}.criar`)
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Adiciona um destino de notificação' })
  @ApiZodBody(createAgenteAlertaDestinoSchema)
  @ApiZodResponse(201, agenteAlertaDestinoSchema)
  @ApiErrorResponses(400, 401, 403, 409)
  create(
    @Body(new ZodValidationPipe(createAgenteAlertaDestinoSchema))
    body: CreateAgenteAlertaDestinoInput,
  ): Promise<AgenteAlertaDestino> {
    return this.destinos.create(body);
  }

  @Delete(':id')
  @RequirePermission(`${PERMISSAO}.excluir`)
  @HttpCode(200)
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Remove o destino (exclusão lógica)' })
  @ApiZodResponse(200, agenteAlertaDestinoSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  remove(@IdParam() id: string): Promise<AgenteAlertaDestino> {
    return this.destinos.remove(id);
  }
}
