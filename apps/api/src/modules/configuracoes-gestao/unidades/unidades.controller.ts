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
  createUnidadeSchema,
  exportUnidadesQuerySchema,
  listUnidadesQuerySchema,
  unidadePageSchema,
  unidadeSchema,
  updateUnidadeSchema,
  type CreateUnidadeInput,
  type ExportUnidadesQuery,
  type ListUnidadesQuery,
  type UpdateUnidadeInput,
} from '@torres/shared';
import type { Unidade } from '../../../generated/prisma/client';
import { Audit } from '../../../common/audit/audit.decorator';
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
import { UnidadesService } from './unidades.service';

const ENTITY = 'Unidade';

/** Recurso de referência do padrão de API. A permissão por ação entra com a Autenticação. */
@ApiTags('Configurações / Gestão: Unidades')
@Controller('configuracoes-gestao/unidades')
export class UnidadesController {
  constructor(private readonly unidades: UnidadesService) {}

  @Get()
  @ApiOperation({ summary: 'Lista paginada, com busca, filtros e ordenação' })
  @ApiZodQuery(listUnidadesQuerySchema)
  @ApiZodResponse(200, unidadePageSchema)
  @ApiErrorResponses(400)
  list(
    @Query(new ZodValidationPipe(listUnidadesQuerySchema)) query: ListUnidadesQuery,
  ): Promise<Page<Unidade>> {
    return this.unidades.list(query);
  }

  // Antes de ":id" para "export" não ser tratado como id.
  @Get('export')
  @Audit({ entity: ENTITY, action: 'EXPORT' })
  @ApiOperation({
    summary: 'Exporta em Excel ou PDF com os mesmos filtros e ordenação da listagem',
  })
  @ApiZodQuery(exportUnidadesQuerySchema)
  @ApiProduces(
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/pdf',
  )
  @ApiErrorResponses(400, 422)
  async export(
    @Query(new ZodValidationPipe(exportUnidadesQuerySchema)) query: ExportUnidadesQuery,
  ): Promise<StreamableFile> {
    return toStreamableFile(await this.unidades.export(query));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe' })
  @ApiZodResponse(200, unidadeSchema)
  @ApiErrorResponses(400, 404)
  findById(@IdParam() id: string): Promise<Unidade> {
    return this.unidades.findById(id);
  }

  @Post()
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Cria' })
  @ApiZodBody(createUnidadeSchema)
  @ApiZodResponse(201, unidadeSchema)
  @ApiErrorResponses(400, 409, 422)
  create(
    @Body(new ZodValidationPipe(createUnidadeSchema)) body: CreateUnidadeInput,
  ): Promise<Unidade> {
    return this.unidades.create(body);
  }

  @Patch(':id')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Altera' })
  @ApiZodBody(updateUnidadeSchema)
  @ApiZodResponse(200, unidadeSchema)
  @ApiErrorResponses(400, 404, 409)
  update(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(updateUnidadeSchema)) body: UpdateUnidadeInput,
  ): Promise<Unidade> {
    return this.unidades.update(id, body);
  }

  @Delete(':id')
  @HttpCode(200)
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Exclui (exclusão lógica)' })
  @ApiZodResponse(200, unidadeSchema)
  @ApiErrorResponses(400, 404)
  remove(@IdParam() id: string): Promise<Unidade> {
    return this.unidades.remove(id);
  }
}
