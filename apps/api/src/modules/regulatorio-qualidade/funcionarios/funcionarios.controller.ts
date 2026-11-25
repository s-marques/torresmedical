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
  createFuncionarioSchema,
  exportFuncionariosQuerySchema,
  funcionarioPageSchema,
  funcionarioSchema,
  listFuncionariosQuerySchema,
  updateFuncionarioSchema,
  type CreateFuncionarioInput,
  type ExportFuncionariosQuery,
  type Funcionario,
  type FuncionarioPage,
  type ListFuncionariosQuery,
  type UpdateFuncionarioInput,
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
import { FuncionariosService } from './funcionarios.service';

const ENTITY = 'Funcionario';

/** Aba "Funcionarios" da tela Funcionários (`/funcionarios`). */
@ApiTags('Regulatório / Qualidade: Funcionários')
@Controller('regulatorio-qualidade/funcionarios')
export class FuncionariosController {
  constructor(private readonly funcionarios: FuncionariosService) {}

  @Get()
  @RequirePermission('regulatorio-qualidade.funcionarios.ver')
  @ApiOperation({
    summary: 'Lista paginada, com busca, status (Todos/Ativo/Inativo) e ordenação',
  })
  @ApiZodQuery(listFuncionariosQuerySchema)
  @ApiZodResponse(200, funcionarioPageSchema)
  @ApiErrorResponses(400, 401, 403)
  list(
    @Query(new ZodValidationPipe(listFuncionariosQuerySchema)) query: ListFuncionariosQuery,
  ): Promise<FuncionarioPage> {
    return this.funcionarios.list(query);
  }

  @Get('export')
  @RequirePermission('regulatorio-qualidade.funcionarios.exportar')
  @ExportaDadosPessoais()
  @Audit({ entity: ENTITY, action: 'EXPORT' })
  @ApiOperation({
    summary: 'Exporta em Excel ou PDF com os mesmos filtros e ordenação da listagem',
  })
  @ApiZodQuery(exportFuncionariosQuerySchema)
  @ApiProduces(
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/pdf',
    'text/csv',
  )
  @ApiErrorResponses(400, 401, 403, 422)
  async export(
    @Query(new ZodValidationPipe(exportFuncionariosQuerySchema)) query: ExportFuncionariosQuery,
  ): Promise<StreamableFile> {
    return toStreamableFile(await this.funcionarios.export(query));
  }

  @Get(':id')
  @RequirePermission('regulatorio-qualidade.funcionarios.ver')
  @ApiOperation({ summary: 'Detalhe' })
  @ApiZodResponse(200, funcionarioSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  findById(@IdParam() id: string): Promise<Funcionario> {
    return this.funcionarios.findByIdDto(id);
  }

  @Post()
  @RequirePermission('regulatorio-qualidade.funcionarios.criar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Cria (Novo Funcionario)' })
  @ApiZodBody(createFuncionarioSchema)
  @ApiZodResponse(201, funcionarioSchema)
  @ApiErrorResponses(400, 401, 403)
  create(
    @Body(new ZodValidationPipe(createFuncionarioSchema)) body: CreateFuncionarioInput,
  ): Promise<Funcionario> {
    return this.funcionarios.create(body);
  }

  @Patch(':id')
  @RequirePermission('regulatorio-qualidade.funcionarios.editar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Altera (Editar Funcionario)' })
  @ApiZodBody(updateFuncionarioSchema)
  @ApiZodResponse(200, funcionarioSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  update(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(updateFuncionarioSchema)) body: UpdateFuncionarioInput,
  ): Promise<Funcionario> {
    return this.funcionarios.update(id, body);
  }

  @Delete(':id')
  @RequirePermission('regulatorio-qualidade.funcionarios.excluir')
  @HttpCode(200)
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Exclui (exclusão lógica, ação "Desativar" vira editar status)' })
  @ApiZodResponse(200, funcionarioSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  remove(@IdParam() id: string): Promise<Funcionario> {
    return this.funcionarios.remove(id);
  }
}
