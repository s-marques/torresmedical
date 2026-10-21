import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  bandeiraPageSchema,
  bandeiraSchema,
  createBandeiraSchema,
  listBandeirasQuerySchema,
  type CreateBandeiraInput,
  type ListBandeirasQuery,
} from '@torres/shared';
import type { Bandeira } from '../../../generated/prisma/client';
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
import { BandeirasService } from './bandeiras.service';

/** Aba Bandeiras da tela Formas de Pagamento (`/formas-pgto`). Usa as permissões da tela. */
@ApiTags('Financeiro: Bandeiras')
@Controller('financeiro/bandeiras')
export class BandeirasController {
  constructor(private readonly bandeiras: BandeirasService) {}

  @Get()
  @RequirePermission('financeiro.formas-pagamento.ver')
  @ApiOperation({ summary: 'Lista paginada, com busca e ordenação' })
  @ApiZodQuery(listBandeirasQuerySchema)
  @ApiZodResponse(200, bandeiraPageSchema)
  @ApiErrorResponses(400, 401, 403)
  list(
    @Query(new ZodValidationPipe(listBandeirasQuerySchema)) query: ListBandeirasQuery,
  ): Promise<Page<Bandeira>> {
    return this.bandeiras.list(query);
  }

  @Post()
  @RequirePermission('financeiro.formas-pagamento.criar')
  @Audit({ entity: 'Bandeira' })
  @ApiOperation({ summary: 'Cria (Nova Bandeira)' })
  @ApiZodBody(createBandeiraSchema)
  @ApiZodResponse(201, bandeiraSchema)
  @ApiErrorResponses(400, 401, 403)
  create(
    @Body(new ZodValidationPipe(createBandeiraSchema)) body: CreateBandeiraInput,
  ): Promise<Bandeira> {
    return this.bandeiras.create(body);
  }
}
