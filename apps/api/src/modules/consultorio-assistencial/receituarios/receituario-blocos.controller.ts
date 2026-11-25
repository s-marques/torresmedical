import { Body, Controller, Get, Post, Query, StreamableFile } from '@nestjs/common';
import { ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import {
  createReceituarioBlocoSchema,
  exportReceituarioBlocosQuerySchema,
  listReceituarioBlocosQuerySchema,
  receituarioBlocoPageSchema,
  receituarioBlocoSchema,
  receituarioBlocosDisponiveisSchema,
  type CreateReceituarioBlocoInput,
  type ExportReceituarioBlocosQuery,
  type ListReceituarioBlocosQuery,
  type ReceituarioBloco,
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
import { ReceituarioBlocosService } from './receituario-blocos.service';

const ENTITY = 'ReceituarioBloco';

/** Tela Receituários (`/receituarios`), aba Blocos. */
@ApiTags('Consultório / Assistencial: Receituários')
@Controller('consultorio-assistencial/receituarios/blocos')
export class ReceituarioBlocosController {
  constructor(private readonly blocos: ReceituarioBlocosService) {}

  @Get()
  @RequirePermission('consultorio-assistencial.receituarios.ver')
  @ApiOperation({ summary: 'Lista paginada de blocos, com busca, tipo, status e ordenação' })
  @ApiZodQuery(listReceituarioBlocosQuerySchema)
  @ApiZodResponse(200, receituarioBlocoPageSchema)
  @ApiErrorResponses(400, 401, 403)
  list(
    @Query(new ZodValidationPipe(listReceituarioBlocosQuerySchema))
    query: ListReceituarioBlocosQuery,
  ): Promise<Page<ReceituarioBloco>> {
    return this.blocos.list(query);
  }

  @Get('disponiveis')
  @RequirePermission('consultorio-assistencial.receituarios.criar')
  @ApiOperation({
    summary: 'Select "Bloco" da Nova Prescricao: blocos Ativos, com médico e no escopo',
  })
  @ApiZodResponse(200, receituarioBlocosDisponiveisSchema)
  @ApiErrorResponses(401, 403)
  disponiveis(): Promise<ReceituarioBloco[]> {
    return this.blocos.disponiveis();
  }

  @Get('export')
  @RequirePermission('consultorio-assistencial.receituarios.exportar')
  @Audit({ entity: ENTITY, action: 'EXPORT' })
  @ApiOperation({
    summary: 'Exporta em Excel ou PDF com os mesmos filtros e ordenação da listagem',
  })
  @ApiZodQuery(exportReceituarioBlocosQuerySchema)
  @ApiProduces(
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/pdf',
    'text/csv',
  )
  @ApiErrorResponses(400, 401, 403, 422)
  async export(
    @Query(new ZodValidationPipe(exportReceituarioBlocosQuerySchema))
    query: ExportReceituarioBlocosQuery,
  ): Promise<StreamableFile> {
    return toStreamableFile(await this.blocos.export(query));
  }

  @Post()
  @RequirePermission('consultorio-assistencial.receituarios.criar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Cadastra o bloco (Novo Bloco), com status Ativo' })
  @ApiZodBody(createReceituarioBlocoSchema)
  @ApiZodResponse(201, receituarioBlocoSchema)
  @ApiErrorResponses(400, 401, 403, 404, 409)
  create(
    @Body(new ZodValidationPipe(createReceituarioBlocoSchema)) body: CreateReceituarioBlocoInput,
  ): Promise<ReceituarioBloco> {
    return this.blocos.create(body);
  }
}
