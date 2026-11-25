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
  exportReceitaProfissionaisQuerySchema,
  listReceitaProfissionaisQuerySchema,
  receitaProfissionalPageSchema,
  receitaProfissionalSchema,
  resumoReceitaProfissionaisQuerySchema,
  resumoReceitaProfissionaisSchema,
  updateReceitaProfissionalSchema,
  type ExportReceitaProfissionaisQuery,
  type ListReceitaProfissionaisQuery,
  type ReceitaProfissional,
  type ResumoReceitaProfissionais,
  type ResumoReceitaProfissionaisQuery,
  type UpdateReceitaProfissionalInput,
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
import { ReceitaProfissionaisService } from './receita-profissionais.service';

const ENTITY = 'ContaReceber';

/** Tela Receita Profissionais (`/receita-profissionais`). */
@ApiTags('Gestão Profissionais: Receita Profissionais')
@Controller('gestao-profissionais/receita-profissionais')
export class ReceitaProfissionaisController {
  constructor(private readonly receitas: ReceitaProfissionaisService) {}

  @Get()
  @RequirePermission('gestao-profissionais.receita-profissionais.ver')
  @ApiOperation({
    summary:
      'Lista paginada, com busca, status, profissional, forma de pagamento, período e ordenação',
  })
  @ApiZodQuery(listReceitaProfissionaisQuerySchema)
  @ApiZodResponse(200, receitaProfissionalPageSchema)
  @ApiErrorResponses(400, 401, 403)
  list(
    @Query(new ZodValidationPipe(listReceitaProfissionaisQuerySchema))
    query: ListReceitaProfissionaisQuery,
  ): Promise<Page<ReceitaProfissional>> {
    return this.receitas.list(query);
  }

  // Antes de ":id" para "resumo" e "export" não serem tratados como id.
  @Get('resumo')
  @RequirePermission('gestao-profissionais.receita-profissionais.ver')
  @ApiOperation({
    summary: 'Totais (recebido, pendente, registros) e resumo por profissional, com os filtros',
  })
  @ApiZodQuery(resumoReceitaProfissionaisQuerySchema)
  @ApiZodResponse(200, resumoReceitaProfissionaisSchema)
  @ApiErrorResponses(400, 401, 403)
  resumo(
    @Query(new ZodValidationPipe(resumoReceitaProfissionaisQuerySchema))
    query: ResumoReceitaProfissionaisQuery,
  ): Promise<ResumoReceitaProfissionais> {
    return this.receitas.resumo(query);
  }

  @Get('export')
  @RequirePermission('gestao-profissionais.receita-profissionais.exportar')
  @Audit({ entity: ENTITY, action: 'EXPORT' })
  @ApiOperation({
    summary: 'Exporta em Excel ou PDF com os mesmos filtros e ordenação da listagem',
  })
  @ApiZodQuery(exportReceitaProfissionaisQuerySchema)
  @ApiProduces(
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/pdf',
    'text/csv',
  )
  @ApiErrorResponses(400, 401, 403, 422)
  async export(
    @Query(new ZodValidationPipe(exportReceitaProfissionaisQuerySchema))
    query: ExportReceitaProfissionaisQuery,
  ): Promise<StreamableFile> {
    return toStreamableFile(await this.receitas.export(query));
  }

  @Get(':id')
  @RequirePermission('gestao-profissionais.receita-profissionais.ver')
  @ApiOperation({ summary: 'Detalhe (Detalhar)' })
  @ApiZodResponse(200, receitaProfissionalSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  findById(@IdParam() id: string): Promise<ReceitaProfissional> {
    return this.receitas.findById(id);
  }

  @Patch(':id')
  @RequirePermission('gestao-profissionais.receita-profissionais.editar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Altera (Editar)' })
  @ApiZodBody(updateReceitaProfissionalSchema)
  @ApiZodResponse(200, receitaProfissionalSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  update(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(updateReceitaProfissionalSchema))
    body: UpdateReceitaProfissionalInput,
  ): Promise<ReceitaProfissional> {
    return this.receitas.update(id, body);
  }

  @Post(':id/estornar-baixa')
  @HttpCode(200)
  @RequirePermission('gestao-profissionais.receita-profissionais.editar')
  @Audit({ entity: ENTITY, action: 'UPDATE' })
  @ApiOperation({ summary: 'Estornar Baixa: volta a receita recebida para Pendente' })
  @ApiZodResponse(200, receitaProfissionalSchema)
  @ApiErrorResponses(400, 401, 403, 404, 422)
  estornarBaixa(@IdParam() id: string): Promise<ReceitaProfissional> {
    return this.receitas.estornarBaixa(id);
  }

  @Delete(':id')
  @RequirePermission('gestao-profissionais.receita-profissionais.excluir')
  @HttpCode(200)
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Exclui (exclusão lógica)' })
  @ApiZodResponse(200, receitaProfissionalSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  remove(@IdParam() id: string): Promise<ReceitaProfissional> {
    return this.receitas.remove(id);
  }
}
