import {
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  Post,
  Query,
  StreamableFile,
} from '@nestjs/common';
import { ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import {
  exportMensalidadesQuerySchema,
  gerarTitulosMensalidadesResumoSchema,
  gerarTitulosMensalidadesSchema,
  listMensalidadesQuerySchema,
  mensalidadeInputSchema,
  mensalidadePageSchema,
  mensalidadeSchema,
  mudarStatusMensalidadeSchema,
  type ExportMensalidadesQuery,
  type GerarTitulosMensalidadesInput,
  type GerarTitulosMensalidadesResumo,
  type ListMensalidadesQuery,
  type Mensalidade,
  type MensalidadeInput,
  type MudarStatusMensalidadeInput,
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
import { MensalidadesTitulosService } from './mensalidades-titulos.service';
import { MensalidadesService } from './mensalidades.service';

const ENTITY = 'Mensalidade';

/** Tela Mensalidades (`/mensalidades`). */
@ApiTags('Comercial/Atendimento: Mensalidades')
@Controller('comercial-atendimento/mensalidades')
export class MensalidadesController {
  constructor(
    private readonly mensalidades: MensalidadesService,
    private readonly titulos: MensalidadesTitulosService,
  ) {}

  @Get()
  @RequirePermission('comercial-atendimento.mensalidades.ver')
  @ApiOperation({
    summary:
      'Lista paginada, com busca por cliente ou descrição, status (Todos/Ativo/Pausado/Cancelado) e ordenação',
  })
  @ApiZodQuery(listMensalidadesQuerySchema)
  @ApiZodResponse(200, mensalidadePageSchema)
  @ApiErrorResponses(400, 401, 403)
  list(
    @Query(new ZodValidationPipe(listMensalidadesQuerySchema)) query: ListMensalidadesQuery,
  ): Promise<Page<Mensalidade>> {
    return this.mensalidades.list(query);
  }

  // Antes de ":id" para "export" não virar id.
  @Get('export')
  @RequirePermission('comercial-atendimento.mensalidades.exportar')
  @Audit({ entity: ENTITY, action: 'EXPORT' })
  @ApiOperation({
    summary: 'Exporta em Excel ou PDF com os mesmos filtros e ordenação da listagem',
  })
  @ApiZodQuery(exportMensalidadesQuerySchema)
  @ApiProduces(
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/pdf',
    'text/csv',
  )
  @ApiErrorResponses(400, 401, 403, 422)
  async export(
    @Query(new ZodValidationPipe(exportMensalidadesQuerySchema)) query: ExportMensalidadesQuery,
  ): Promise<StreamableFile> {
    return toStreamableFile(await this.mensalidades.export(query));
  }

  @Post('gerar-titulos')
  @RequirePermission('comercial-atendimento.mensalidades.criar')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Gera os títulos a receber do mês escolhido para as mensalidades ativas, sem duplicar (Gerar Titulos do Mes)',
  })
  @ApiZodBody(gerarTitulosMensalidadesSchema)
  @ApiZodResponse(200, gerarTitulosMensalidadesResumoSchema)
  @ApiErrorResponses(400, 401, 403)
  gerarTitulos(
    @Body(new ZodValidationPipe(gerarTitulosMensalidadesSchema))
    body: GerarTitulosMensalidadesInput,
  ): Promise<GerarTitulosMensalidadesResumo> {
    return this.titulos.gerar(body.competencia);
  }

  @Get(':id')
  @RequirePermission('comercial-atendimento.mensalidades.ver')
  @ApiOperation({ summary: 'Detalhe (usado pelo modal Editar)' })
  @ApiZodResponse(200, mensalidadeSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  findById(@IdParam() id: string): Promise<Mensalidade> {
    return this.mensalidades.findById(id);
  }

  @Post()
  @RequirePermission('comercial-atendimento.mensalidades.criar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Cria (Nova Mensalidade)' })
  @ApiZodBody(mensalidadeInputSchema)
  @ApiZodResponse(201, mensalidadeSchema)
  @ApiErrorResponses(400, 401, 403)
  create(
    @Body(new ZodValidationPipe(mensalidadeInputSchema)) body: MensalidadeInput,
  ): Promise<Mensalidade> {
    return this.mensalidades.create(body);
  }

  @Patch(':id')
  @RequirePermission('comercial-atendimento.mensalidades.editar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Altera (Editar Mensalidade); não vale para cancelada' })
  @ApiZodBody(mensalidadeInputSchema)
  @ApiZodResponse(200, mensalidadeSchema)
  @ApiErrorResponses(400, 401, 403, 404, 422)
  update(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(mensalidadeInputSchema)) body: MensalidadeInput,
  ): Promise<Mensalidade> {
    return this.mensalidades.update(id, body);
  }

  @Patch(':id/status')
  @RequirePermission('comercial-atendimento.mensalidades.editar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Pausar, Reativar ou Cancelar (cancelada não volta)' })
  @ApiZodBody(mudarStatusMensalidadeSchema)
  @ApiZodResponse(200, mensalidadeSchema)
  @ApiErrorResponses(400, 401, 403, 404, 422)
  mudarStatus(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(mudarStatusMensalidadeSchema)) body: MudarStatusMensalidadeInput,
  ): Promise<Mensalidade> {
    return this.mensalidades.mudarStatus(id, body.status);
  }
}
