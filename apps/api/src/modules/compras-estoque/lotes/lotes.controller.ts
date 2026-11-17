import { Body, Controller, Get, Post, Query, StreamableFile } from '@nestjs/common';
import { ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import {
  exportLotesQuerySchema,
  listLotesQuerySchema,
  loteInputSchema,
  lotePageSchema,
  loteSchema,
  resumoLotesSchema,
  type ExportLotesQuery,
  type ListLotesQuery,
  type Lote,
  type LoteInput,
  type ResumoLotes,
} from '@torres/shared';
import { Audit } from '../../../common/audit/audit.decorator';
import { RequirePermission } from '../../../common/auth/auth.decorators';
import { toStreamableFile } from '../../../common/export/export-response';
import type { Page } from '../../../common/pagination/paginate';
import {
  ApiErrorResponses,
  ApiZodBody,
  ApiZodQuery,
  ApiZodResponse,
} from '../../../common/swagger/zod-openapi';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { LotesService } from './lotes.service';

const ENTITY = 'Lote';

/** Tela Lotes / Validade (`/lotes`). */
@ApiTags('Compras / Estoque: Lotes / Validade')
@Controller('compras-estoque/lotes')
export class LotesController {
  constructor(private readonly lotes: LotesService) {}

  @Get()
  @RequirePermission('compras-estoque.lotes-validade.ver')
  @ApiOperation({ summary: 'Lista lotes com produto, "Apenas com saldo", busca e ordenação' })
  @ApiZodQuery(listLotesQuerySchema)
  @ApiZodResponse(200, lotePageSchema)
  @ApiErrorResponses(400, 401, 403)
  list(
    @Query(new ZodValidationPipe(listLotesQuerySchema)) query: ListLotesQuery,
  ): Promise<Page<Lote>> {
    return this.lotes.list(query);
  }

  @Get('resumo')
  @RequirePermission('compras-estoque.lotes-validade.ver')
  @ApiOperation({
    summary: 'Cards do topo: lotes vencidos, vencendo em 60 dias e estoque abaixo do mínimo',
  })
  @ApiZodResponse(200, resumoLotesSchema)
  @ApiErrorResponses(401, 403)
  resumo(): Promise<ResumoLotes> {
    return this.lotes.resumo();
  }

  @Get('export')
  @RequirePermission('compras-estoque.lotes-validade.exportar')
  @Audit({ entity: ENTITY, action: 'EXPORT' })
  @ApiOperation({ summary: 'Exporta os lotes (Excel ou PDF) com os mesmos filtros e ordenação' })
  @ApiZodQuery(exportLotesQuerySchema)
  @ApiProduces(
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/pdf',
  )
  @ApiErrorResponses(400, 401, 403, 422)
  async export(
    @Query(new ZodValidationPipe(exportLotesQuerySchema)) query: ExportLotesQuery,
  ): Promise<StreamableFile> {
    return toStreamableFile(await this.lotes.export(query));
  }

  @Post()
  @RequirePermission('compras-estoque.lotes-validade.criar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Novo Lote: cadastra o lote (não altera o saldo do produto)' })
  @ApiZodBody(loteInputSchema)
  @ApiZodResponse(201, loteSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  create(@Body(new ZodValidationPipe(loteInputSchema)) body: LoteInput): Promise<Lote> {
    return this.lotes.create(body);
  }
}
