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
  fornecedorPageSchema,
  fornecedorSchema,
  createFornecedorSchema,
  exportFornecedoresQuerySchema,
  listFornecedoresQuerySchema,
  updateFornecedorSchema,
  type CreateFornecedorInput,
  type ExportFornecedoresQuery,
  type ListFornecedoresQuery,
  type UpdateFornecedorInput,
} from '@torres/shared';
import type { Fornecedor } from '../../../generated/prisma/client';
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
import { FornecedoresService } from './fornecedores.service';

const ENTITY = 'Fornecedor';

/** Tela Fornecedores (`/fornecedores`). */
@ApiTags('Compras / Estoque: Fornecedores')
@Controller('compras-estoque/fornecedores')
export class FornecedoresController {
  constructor(private readonly fornecedores: FornecedoresService) {}

  @Get()
  @RequirePermission('compras-estoque.fornecedores.ver')
  @ApiOperation({
    summary: 'Lista paginada, com busca, status (Todos/Ativo/Inativo) e ordenação',
  })
  @ApiZodQuery(listFornecedoresQuerySchema)
  @ApiZodResponse(200, fornecedorPageSchema)
  @ApiErrorResponses(400, 401, 403)
  list(
    @Query(new ZodValidationPipe(listFornecedoresQuerySchema)) query: ListFornecedoresQuery,
  ): Promise<Page<Fornecedor>> {
    return this.fornecedores.list(query);
  }

  // Antes de ":id" para "export" não ser tratado como id.
  @Get('export')
  @RequirePermission('compras-estoque.fornecedores.exportar')
  @Audit({ entity: ENTITY, action: 'EXPORT' })
  @ApiOperation({
    summary: 'Exporta em Excel ou PDF com os mesmos filtros e ordenação da listagem',
  })
  @ApiZodQuery(exportFornecedoresQuerySchema)
  @ApiProduces(
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/pdf',
  )
  @ApiErrorResponses(400, 401, 403, 422)
  async export(
    @Query(new ZodValidationPipe(exportFornecedoresQuerySchema)) query: ExportFornecedoresQuery,
  ): Promise<StreamableFile> {
    return toStreamableFile(await this.fornecedores.export(query));
  }

  @Get(':id')
  @RequirePermission('compras-estoque.fornecedores.ver')
  @ApiOperation({ summary: 'Detalhe' })
  @ApiZodResponse(200, fornecedorSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  findById(@IdParam() id: string): Promise<Fornecedor> {
    return this.fornecedores.findById(id);
  }

  @Post()
  @RequirePermission('compras-estoque.fornecedores.criar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Cria (Novo Fornecedor)' })
  @ApiZodBody(createFornecedorSchema)
  @ApiZodResponse(201, fornecedorSchema)
  @ApiErrorResponses(400, 401, 403)
  create(
    @Body(new ZodValidationPipe(createFornecedorSchema)) body: CreateFornecedorInput,
  ): Promise<Fornecedor> {
    return this.fornecedores.create(body);
  }

  @Patch(':id')
  @RequirePermission('compras-estoque.fornecedores.editar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Altera (Editar Fornecedor)' })
  @ApiZodBody(updateFornecedorSchema)
  @ApiZodResponse(200, fornecedorSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  update(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(updateFornecedorSchema)) body: UpdateFornecedorInput,
  ): Promise<Fornecedor> {
    return this.fornecedores.update(id, body);
  }

  @Delete(':id')
  @RequirePermission('compras-estoque.fornecedores.excluir')
  @HttpCode(200)
  @Audit({ entity: ENTITY })
  @ApiOperation({
    summary: 'Exclui (exclusão lógica)',
  })
  @ApiZodResponse(200, fornecedorSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  remove(@IdParam() id: string): Promise<Fornecedor> {
    return this.fornecedores.remove(id);
  }
}
