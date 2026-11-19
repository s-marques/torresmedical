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
  cancelarSalaBloqueioSchema,
  createSalaBloqueioSchema,
  exportSalaBloqueiosQuerySchema,
  listSalaBloqueiosQuerySchema,
  salaBloqueioPageSchema,
  salaBloqueioSchema,
  updateSalaBloqueioSchema,
  type CancelarSalaBloqueioInput,
  type CreateSalaBloqueioInput,
  type ExportSalaBloqueiosQuery,
  type ListSalaBloqueiosQuery,
  type SalaBloqueio,
  type UpdateSalaBloqueioInput,
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
import { SalasBloqueiosService } from './salas-bloqueios.service';

const ENTITY = 'SalaBloqueio';

/**
 * Tela Gestão de Salas (`/salas`), aba Bloqueios (issue #138). Usa as permissões da tela Salas
 * (decisão do dev). Não há exclusão: o cancelamento guarda quem, quando e o motivo.
 */
@ApiTags('Gestão Profissionais: Bloqueios de Salas')
@Controller('gestao-profissionais/salas-bloqueios')
export class SalasBloqueiosController {
  constructor(private readonly bloqueios: SalasBloqueiosService) {}

  @Get()
  @RequirePermission('gestao-profissionais.salas.ver')
  @ApiOperation({ summary: 'Lista paginada, com filtros de sala, tipo, status e período' })
  @ApiZodQuery(listSalaBloqueiosQuerySchema)
  @ApiZodResponse(200, salaBloqueioPageSchema)
  @ApiErrorResponses(400, 401, 403)
  list(
    @Query(new ZodValidationPipe(listSalaBloqueiosQuerySchema)) query: ListSalaBloqueiosQuery,
  ): Promise<Page<SalaBloqueio>> {
    return this.bloqueios.list(query);
  }

  // Antes de ":id" para "export" não ser tratado como id.
  @Get('export')
  @RequirePermission('gestao-profissionais.salas.exportar')
  @Audit({ entity: ENTITY, action: 'EXPORT' })
  @ApiOperation({
    summary: 'Exporta em Excel ou PDF com os mesmos filtros e ordenação da listagem',
  })
  @ApiZodQuery(exportSalaBloqueiosQuerySchema)
  @ApiProduces(
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/pdf',
  )
  @ApiErrorResponses(400, 401, 403, 422)
  async export(
    @Query(new ZodValidationPipe(exportSalaBloqueiosQuerySchema)) query: ExportSalaBloqueiosQuery,
  ): Promise<StreamableFile> {
    return toStreamableFile(await this.bloqueios.export(query));
  }

  @Get(':id')
  @RequirePermission('gestao-profissionais.salas.ver')
  @ApiOperation({ summary: 'Detalhe' })
  @ApiZodResponse(200, salaBloqueioSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  findById(@IdParam() id: string): Promise<SalaBloqueio> {
    return this.bloqueios.findById(id);
  }

  @Post()
  @RequirePermission('gestao-profissionais.salas.criar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Cria (Novo Bloqueio). 409 se sobrepõe outro bloqueio da sala' })
  @ApiZodBody(createSalaBloqueioSchema)
  @ApiZodResponse(201, salaBloqueioSchema)
  @ApiErrorResponses(400, 401, 403, 409)
  create(
    @Body(new ZodValidationPipe(createSalaBloqueioSchema)) body: CreateSalaBloqueioInput,
  ): Promise<SalaBloqueio> {
    return this.bloqueios.create(body);
  }

  @Patch(':id')
  @RequirePermission('gestao-profissionais.salas.editar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Altera o bloqueio ativo (substitui os campos do formulário)' })
  @ApiZodBody(updateSalaBloqueioSchema)
  @ApiZodResponse(200, salaBloqueioSchema)
  @ApiErrorResponses(400, 401, 403, 404, 409)
  update(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(updateSalaBloqueioSchema)) body: UpdateSalaBloqueioInput,
  ): Promise<SalaBloqueio> {
    return this.bloqueios.update(id, body);
  }

  @Post(':id/cancelar')
  @RequirePermission('gestao-profissionais.salas.editar')
  @HttpCode(200)
  @Audit({ entity: ENTITY, action: 'UPDATE' })
  @ApiOperation({ summary: 'Cancela o bloqueio ativo, gravando quem, quando e o motivo' })
  @ApiZodBody(cancelarSalaBloqueioSchema)
  @ApiZodResponse(200, salaBloqueioSchema)
  @ApiErrorResponses(400, 401, 403, 404, 409)
  cancelar(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(cancelarSalaBloqueioSchema)) body: CancelarSalaBloqueioInput,
  ): Promise<SalaBloqueio> {
    return this.bloqueios.cancelar(id, body);
  }
}
