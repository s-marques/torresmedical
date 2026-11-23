import { Body, Controller, Get, Post, Query, StreamableFile } from '@nestjs/common';
import { ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import {
  createTipoTreinamentoSchema,
  createTreinamentoSchema,
  exportTreinamentosQuerySchema,
  listTreinamentosQuerySchema,
  tipoTreinamentoListSchema,
  tipoTreinamentoSchema,
  treinamentoPageSchema,
  treinamentoSchema,
  type CreateTipoTreinamentoInput,
  type CreateTreinamentoInput,
  type ExportTreinamentosQuery,
  type ListTreinamentosQuery,
  type TipoTreinamento,
  type Treinamento,
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
import { TreinamentosService } from './treinamentos.service';

const VER = 'regulatorio-qualidade.treinamentos.ver';
const CRIAR = 'regulatorio-qualidade.treinamentos.criar';

/** Tela Treinamentos (`/treinamentos`). */
@ApiTags('Regulatório / Qualidade: Treinamentos')
@Controller('regulatorio-qualidade')
export class TreinamentosController {
  constructor(private readonly treinamentos: TreinamentosService) {}

  @Get('tipos-treinamento')
  @RequirePermission(VER)
  @ApiOperation({ summary: 'Tipos de treinamento (combo "Tipo")' })
  @ApiZodResponse(200, tipoTreinamentoListSchema)
  @ApiErrorResponses(401, 403)
  listTipos(): Promise<TipoTreinamento[]> {
    return this.treinamentos.listTipos();
  }

  @Post('tipos-treinamento')
  @RequirePermission(CRIAR)
  @Audit({ entity: 'TipoTreinamento' })
  @ApiOperation({ summary: 'Cria um tipo de treinamento' })
  @ApiZodBody(createTipoTreinamentoSchema)
  @ApiZodResponse(201, tipoTreinamentoSchema)
  @ApiErrorResponses(400, 401, 403)
  createTipo(
    @Body(new ZodValidationPipe(createTipoTreinamentoSchema)) body: CreateTipoTreinamentoInput,
  ): Promise<TipoTreinamento> {
    return this.treinamentos.createTipo(body);
  }

  @Get('treinamentos')
  @RequirePermission(VER)
  @ApiOperation({ summary: 'Lista paginada, com busca, status (abas) e ordenação' })
  @ApiZodQuery(listTreinamentosQuerySchema)
  @ApiZodResponse(200, treinamentoPageSchema)
  @ApiErrorResponses(400, 401, 403)
  list(
    @Query(new ZodValidationPipe(listTreinamentosQuerySchema)) query: ListTreinamentosQuery,
  ): Promise<Page<Treinamento>> {
    return this.treinamentos.list(query);
  }

  @Get('treinamentos/export')
  @RequirePermission('regulatorio-qualidade.treinamentos.exportar')
  @Audit({ entity: 'Treinamento', action: 'EXPORT' })
  @ApiOperation({ summary: 'Exporta em Excel ou PDF com os mesmos filtros e ordenação' })
  @ApiZodQuery(exportTreinamentosQuerySchema)
  @ApiProduces(
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/pdf',
  )
  @ApiErrorResponses(400, 401, 403, 422)
  async export(
    @Query(new ZodValidationPipe(exportTreinamentosQuerySchema)) query: ExportTreinamentosQuery,
  ): Promise<StreamableFile> {
    return toStreamableFile(await this.treinamentos.export(query));
  }

  @Get('treinamentos/:id')
  @RequirePermission(VER)
  @ApiOperation({ summary: 'Detalhe' })
  @ApiZodResponse(200, treinamentoSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  findById(@IdParam() id: string): Promise<Treinamento> {
    return this.treinamentos.findById(id);
  }

  @Post('treinamentos')
  @RequirePermission(CRIAR)
  @Audit({ entity: 'Treinamento' })
  @ApiOperation({ summary: 'Cadastra um treinamento (Novo Treinamento)' })
  @ApiZodBody(createTreinamentoSchema)
  @ApiZodResponse(201, treinamentoSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  create(
    @Body(new ZodValidationPipe(createTreinamentoSchema)) body: CreateTreinamentoInput,
  ): Promise<Treinamento> {
    return this.treinamentos.create(body);
  }
}
