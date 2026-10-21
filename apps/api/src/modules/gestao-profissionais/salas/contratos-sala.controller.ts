import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Patch,
  Post,
  Put,
  Query,
  StreamableFile,
} from '@nestjs/common';
import { ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import {
  contratoSalaPageSchema,
  contratoSalaPdfInputSchema,
  contratoSalaSchema,
  createContratoSalaSchema,
  exportContratosSalaQuerySchema,
  listContratosSalaQuerySchema,
  updateContratoSalaSchema,
  type ContratoSala,
  type ContratoSalaPdfInput,
  type CreateContratoSalaInput,
  type ExportContratosSalaQuery,
  type ListContratosSalaQuery,
  type UpdateContratoSalaInput,
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
import { ContratosSalaService } from './contratos-sala.service';

const ENTITY = 'ContratoSala';

/** Tela Gestão de Salas (`/salas`), aba Contratos. Usa as permissões da tela Salas. */
@ApiTags('Gestão Profissionais: Contratos de Salas')
@Controller('gestao-profissionais/contratos-sala')
export class ContratosSalaController {
  constructor(private readonly contratos: ContratosSalaService) {}

  @Get()
  @RequirePermission('gestao-profissionais.salas.ver')
  @ApiOperation({ summary: 'Lista paginada, com filtros de status e sala' })
  @ApiZodQuery(listContratosSalaQuerySchema)
  @ApiZodResponse(200, contratoSalaPageSchema)
  @ApiErrorResponses(400, 401, 403)
  list(
    @Query(new ZodValidationPipe(listContratosSalaQuerySchema)) query: ListContratosSalaQuery,
  ): Promise<Page<ContratoSala>> {
    return this.contratos.list(query);
  }

  // Antes de ":id" para "export" não ser tratado como id.
  @Get('export')
  @RequirePermission('gestao-profissionais.salas.exportar')
  @Audit({ entity: ENTITY, action: 'EXPORT' })
  @ApiOperation({
    summary: 'Exporta em Excel ou PDF com os mesmos filtros e ordenação da listagem',
  })
  @ApiZodQuery(exportContratosSalaQuerySchema)
  @ApiProduces(
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/pdf',
  )
  @ApiErrorResponses(400, 401, 403, 422)
  async export(
    @Query(new ZodValidationPipe(exportContratosSalaQuerySchema)) query: ExportContratosSalaQuery,
  ): Promise<StreamableFile> {
    return toStreamableFile(await this.contratos.export(query));
  }

  @Get(':id')
  @RequirePermission('gestao-profissionais.salas.ver')
  @ApiOperation({ summary: 'Detalhe (lupa: Detalhes do Contrato)' })
  @ApiZodResponse(200, contratoSalaSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  findById(@IdParam() id: string): Promise<ContratoSala> {
    return this.contratos.findById(id);
  }

  @Post()
  @RequirePermission('gestao-profissionais.salas.criar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Cria (Novo Contrato)' })
  @ApiZodBody(createContratoSalaSchema)
  @ApiZodResponse(201, contratoSalaSchema)
  @ApiErrorResponses(400, 401, 403)
  create(
    @Body(new ZodValidationPipe(createContratoSalaSchema)) body: CreateContratoSalaInput,
  ): Promise<ContratoSala> {
    return this.contratos.create(body);
  }

  @Patch(':id')
  @RequirePermission('gestao-profissionais.salas.editar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Altera (Editar Contrato): substitui os campos do formulário' })
  @ApiZodBody(updateContratoSalaSchema)
  @ApiZodResponse(200, contratoSalaSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  update(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(updateContratoSalaSchema)) body: UpdateContratoSalaInput,
  ): Promise<ContratoSala> {
    return this.contratos.update(id, body);
  }

  @Put(':id/pdf')
  @RequirePermission('gestao-profissionais.salas.editar')
  @Audit({ entity: ENTITY })
  @ApiOperation({
    summary: 'Define o PDF do contrato (arquivo já enviado em /api/arquivos). `null` remove',
  })
  @ApiZodBody(contratoSalaPdfInputSchema)
  @ApiZodResponse(200, contratoSalaSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  definirPdf(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(contratoSalaPdfInputSchema)) body: ContratoSalaPdfInput,
  ): Promise<ContratoSala> {
    return this.contratos.definirPdf(id, body.arquivoId);
  }

  @Delete(':id')
  @RequirePermission('gestao-profissionais.salas.excluir')
  @HttpCode(200)
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Exclui (lógica)' })
  @ApiZodResponse(200, contratoSalaSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  remove(@IdParam() id: string): Promise<ContratoSala> {
    return this.contratos.remove(id);
  }
}
