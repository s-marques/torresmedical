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
  createEncaminhamentoSchema,
  encaminhamentoPageSchema,
  encaminhamentoProfissionaisSchema,
  encaminhamentoRelatorioPageSchema,
  encaminhamentoSchema,
  exportEncaminhamentosQuerySchema,
  listEncaminhamentosQuerySchema,
  relatorioEncaminhamentosQuerySchema,
  updateEncaminhamentoSchema,
  type CreateEncaminhamentoInput,
  type Encaminhamento,
  type EncaminhamentoPage,
  type EncaminhamentoProfissionais,
  type EncaminhamentoRelatorioPage,
  type ExportEncaminhamentosQuery,
  type ListEncaminhamentosQuery,
  type RelatorioEncaminhamentosQuery,
  type UpdateEncaminhamentoInput,
} from '@torres/shared';
import { Audit } from '../../../common/audit/audit.decorator';
import { ExportaDadosPessoais, RequirePermission } from '../../../common/auth/auth.decorators';
import { toStreamableFile } from '../../../common/export/export-response';
import {
  ApiErrorResponses,
  ApiZodBody,
  ApiZodQuery,
  ApiZodResponse,
} from '../../../common/swagger/zod-openapi';
import { IdParam } from '../../../common/validation/id-param.decorator';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { EncaminhamentosService } from './encaminhamentos.service';

const ENTITY = 'Encaminhamento';

/** Tela Encaminhamentos (`/encaminhamentos`, issue #146). */
@ApiTags('Consultório / Assistencial: Encaminhamentos')
@Controller('consultorio-assistencial/encaminhamentos')
export class EncaminhamentosController {
  constructor(private readonly encaminhamentos: EncaminhamentosService) {}

  @Get()
  @RequirePermission('consultorio-assistencial.encaminhamentos.ver')
  @ApiOperation({
    summary: 'Lista paginada, com busca, situação, profissionais, período e ordenação',
  })
  @ApiZodQuery(listEncaminhamentosQuerySchema)
  @ApiZodResponse(200, encaminhamentoPageSchema)
  @ApiErrorResponses(400, 401, 403)
  list(
    @Query(new ZodValidationPipe(listEncaminhamentosQuerySchema)) query: ListEncaminhamentosQuery,
  ): Promise<EncaminhamentoPage> {
    return this.encaminhamentos.list(query);
  }

  // As rotas fixas vêm antes de ":id" para não serem tratadas como id.
  @Get('export')
  @RequirePermission('consultorio-assistencial.encaminhamentos.exportar')
  @ExportaDadosPessoais()
  @Audit({ entity: ENTITY, action: 'EXPORT' })
  @ApiOperation({ summary: 'Exporta em Excel ou PDF com os mesmos filtros da listagem' })
  @ApiZodQuery(exportEncaminhamentosQuerySchema)
  @ApiProduces(
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/pdf',
    'text/csv',
  )
  @ApiErrorResponses(400, 401, 403, 422)
  async export(
    @Query(new ZodValidationPipe(exportEncaminhamentosQuerySchema))
    query: ExportEncaminhamentosQuery,
  ): Promise<StreamableFile> {
    return toStreamableFile(await this.encaminhamentos.export(query));
  }

  @Get('profissionais')
  @RequirePermission('consultorio-assistencial.encaminhamentos.ver')
  @ApiOperation({
    summary: 'Profissionais com contrato que permite indicação (selects de origem e destino)',
  })
  @ApiZodResponse(200, encaminhamentoProfissionaisSchema)
  @ApiErrorResponses(401, 403)
  profissionais(): Promise<EncaminhamentoProfissionais> {
    return this.encaminhamentos.profissionaisSelecionaveis();
  }

  @Get('relatorio')
  @RequirePermission('consultorio-assistencial.encaminhamentos.ver')
  @ApiOperation({
    summary: 'Relatório por profissional: enviados, recebidos e conversão em atendimento',
  })
  @ApiZodQuery(relatorioEncaminhamentosQuerySchema)
  @ApiZodResponse(200, encaminhamentoRelatorioPageSchema)
  @ApiErrorResponses(400, 401, 403)
  relatorio(
    @Query(new ZodValidationPipe(relatorioEncaminhamentosQuerySchema))
    query: RelatorioEncaminhamentosQuery,
  ): Promise<EncaminhamentoRelatorioPage> {
    return this.encaminhamentos.relatorio(query);
  }

  @Get(':id')
  @RequirePermission('consultorio-assistencial.encaminhamentos.ver')
  @ApiOperation({ summary: 'Detalhe' })
  @ApiZodResponse(200, encaminhamentoSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  findById(@IdParam() id: string): Promise<Encaminhamento> {
    return this.encaminhamentos.findById(id);
  }

  @Post()
  @RequirePermission('consultorio-assistencial.encaminhamentos.criar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Registra um encaminhamento (origem ou recepção)' })
  @ApiZodBody(createEncaminhamentoSchema)
  @ApiZodResponse(201, encaminhamentoSchema)
  @ApiErrorResponses(400, 401, 403, 404, 422)
  create(
    @Body(new ZodValidationPipe(createEncaminhamentoSchema)) body: CreateEncaminhamentoInput,
  ): Promise<Encaminhamento> {
    return this.encaminhamentos.create(body);
  }

  @Patch(':id')
  @RequirePermission('consultorio-assistencial.encaminhamentos.editar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Altera um encaminhamento' })
  @ApiZodBody(updateEncaminhamentoSchema)
  @ApiZodResponse(200, encaminhamentoSchema)
  @ApiErrorResponses(400, 401, 403, 404, 422)
  update(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(updateEncaminhamentoSchema)) body: UpdateEncaminhamentoInput,
  ): Promise<Encaminhamento> {
    return this.encaminhamentos.update(id, body);
  }

  @Delete(':id')
  @RequirePermission('consultorio-assistencial.encaminhamentos.excluir')
  @HttpCode(200)
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Exclui (exclusão lógica)' })
  @ApiZodResponse(200, encaminhamentoSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  remove(@IdParam() id: string): Promise<Encaminhamento> {
    return this.encaminhamentos.remove(id);
  }
}
