import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Patch,
  Post,
  Query,
  StreamableFile,
} from '@nestjs/common';
import { ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import {
  coletaResiduoPageSchema,
  coletaResiduoSchema,
  createColetaResiduoSchema,
  exportColetasResiduoQuerySchema,
  listColetasResiduoQuerySchema,
  updateColetaResiduoSchema,
  type ColetaResiduo,
  type CreateColetaResiduoInput,
  type ExportColetasResiduoQuery,
  type ListColetasResiduoQuery,
  type UpdateColetaResiduoInput,
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
import { IdParam } from '../../../common/validation/id-param.decorator';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { ColetasResiduoService } from './coletas-residuo.service';

const ENTITY = 'ColetaResiduo';

/** Tela Coleta Resíduos (`/coletas-residuo`). */
@ApiTags('Regulatório / Qualidade: Coleta Resíduos')
@Controller('regulatorio-qualidade/coletas-residuo')
export class ColetasResiduoController {
  constructor(private readonly coletas: ColetasResiduoService) {}

  @Get()
  @RequirePermission('regulatorio-qualidade.coleta-residuos.ver')
  @ApiOperation({ summary: 'Lista paginada, com busca e ordenação' })
  @ApiZodQuery(listColetasResiduoQuerySchema)
  @ApiZodResponse(200, coletaResiduoPageSchema)
  @ApiErrorResponses(400, 401, 403)
  list(
    @Query(new ZodValidationPipe(listColetasResiduoQuerySchema)) query: ListColetasResiduoQuery,
  ): Promise<Page<ColetaResiduo>> {
    return this.coletas.list(query);
  }

  // Antes de ":id" para "export" não ser tratado como id.
  @Get('export')
  @RequirePermission('regulatorio-qualidade.coleta-residuos.exportar')
  @Audit({ entity: ENTITY, action: 'EXPORT' })
  @ApiOperation({
    summary: 'Exporta em Excel ou PDF com a mesma busca e ordenação da listagem',
  })
  @ApiZodQuery(exportColetasResiduoQuerySchema)
  @ApiProduces(
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/pdf',
  )
  @ApiErrorResponses(400, 401, 403, 422)
  async export(
    @Query(new ZodValidationPipe(exportColetasResiduoQuerySchema))
    query: ExportColetasResiduoQuery,
  ): Promise<StreamableFile> {
    return toStreamableFile(await this.coletas.export(query));
  }

  @Get(':id')
  @RequirePermission('regulatorio-qualidade.coleta-residuos.ver')
  @ApiOperation({ summary: 'Detalhe' })
  @ApiZodResponse(200, coletaResiduoSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  findById(@IdParam() id: string): Promise<ColetaResiduo> {
    return this.coletas.findById(id);
  }

  @Post()
  @RequirePermission('regulatorio-qualidade.coleta-residuos.criar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Cria (Nova Coleta)' })
  @ApiZodBody(createColetaResiduoSchema)
  @ApiZodResponse(201, coletaResiduoSchema)
  @ApiErrorResponses(400, 401, 403)
  create(
    @Body(new ZodValidationPipe(createColetaResiduoSchema)) body: CreateColetaResiduoInput,
  ): Promise<ColetaResiduo> {
    return this.coletas.create(body);
  }

  @Patch(':id')
  @RequirePermission('regulatorio-qualidade.coleta-residuos.editar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Altera (Editar Coleta)' })
  @ApiZodBody(updateColetaResiduoSchema)
  @ApiZodResponse(200, coletaResiduoSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  update(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(updateColetaResiduoSchema)) body: UpdateColetaResiduoInput,
  ): Promise<ColetaResiduo> {
    return this.coletas.update(id, body);
  }

  @Delete(':id')
  @RequirePermission('regulatorio-qualidade.coleta-residuos.excluir')
  @HttpCode(200)
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Exclui (exclusão lógica)' })
  @ApiZodResponse(200, coletaResiduoSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  remove(@IdParam() id: string): Promise<ColetaResiduo> {
    return this.coletas.remove(id);
  }
}
