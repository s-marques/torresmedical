import { Body, Controller, Get, Post, Query, StreamableFile } from '@nestjs/common';
import { ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import {
  createNaoConformidadeSchema,
  exportNaoConformidadesQuerySchema,
  listNaoConformidadesQuerySchema,
  naoConformidadePageSchema,
  naoConformidadeSchema,
  type CreateNaoConformidadeInput,
  type ExportNaoConformidadesQuery,
  type ListNaoConformidadesQuery,
  type NaoConformidade,
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
import { NaoConformidadesService } from './nao-conformidades.service';

const VER = 'regulatorio-qualidade.nao-conformidades.ver';

/** Tela Não Conformidades (`/nao-conformidades`). */
@ApiTags('Regulatório / Qualidade: Não Conformidades')
@Controller('regulatorio-qualidade/nao-conformidades')
export class NaoConformidadesController {
  constructor(private readonly naoConformidades: NaoConformidadesService) {}

  @Get()
  @RequirePermission(VER)
  @ApiOperation({ summary: 'Lista paginada, com busca, status (abas) e ordenação' })
  @ApiZodQuery(listNaoConformidadesQuerySchema)
  @ApiZodResponse(200, naoConformidadePageSchema)
  @ApiErrorResponses(400, 401, 403)
  list(
    @Query(new ZodValidationPipe(listNaoConformidadesQuerySchema))
    query: ListNaoConformidadesQuery,
  ): Promise<Page<NaoConformidade>> {
    return this.naoConformidades.list(query);
  }

  @Get('export')
  @RequirePermission('regulatorio-qualidade.nao-conformidades.exportar')
  @Audit({ entity: 'NaoConformidade', action: 'EXPORT' })
  @ApiOperation({ summary: 'Exporta em Excel ou PDF com os mesmos filtros e ordenação' })
  @ApiZodQuery(exportNaoConformidadesQuerySchema)
  @ApiProduces(
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/pdf',
  )
  @ApiErrorResponses(400, 401, 403, 422)
  async export(
    @Query(new ZodValidationPipe(exportNaoConformidadesQuerySchema))
    query: ExportNaoConformidadesQuery,
  ): Promise<StreamableFile> {
    return toStreamableFile(await this.naoConformidades.export(query));
  }

  @Get(':id')
  @RequirePermission(VER)
  @ApiOperation({ summary: 'Detalhe' })
  @ApiZodResponse(200, naoConformidadeSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  findById(@IdParam() id: string): Promise<NaoConformidade> {
    return this.naoConformidades.findById(id);
  }

  @Post()
  @RequirePermission('regulatorio-qualidade.nao-conformidades.criar')
  @Audit({ entity: 'NaoConformidade' })
  @ApiOperation({ summary: 'Registra (Nova NC); nasce com status Aberta' })
  @ApiZodBody(createNaoConformidadeSchema)
  @ApiZodResponse(201, naoConformidadeSchema)
  @ApiErrorResponses(400, 401, 403)
  create(
    @Body(new ZodValidationPipe(createNaoConformidadeSchema)) body: CreateNaoConformidadeInput,
  ): Promise<NaoConformidade> {
    return this.naoConformidades.create(body);
  }
}
