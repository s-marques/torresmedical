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
  categoriaPageSchema,
  categoriaSchema,
  createCategoriaSchema,
  exportCategoriasQuerySchema,
  listCategoriasQuerySchema,
  updateCategoriaSchema,
  type CreateCategoriaInput,
  type ExportCategoriasQuery,
  type ListCategoriasQuery,
  type UpdateCategoriaInput,
} from '@torres/shared';
import type { Categoria } from '../../../generated/prisma/client';
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
import { CategoriasService } from './categorias.service';

const ENTITY = 'Categoria';

/** Tela Categorias (`/categorias`). */
@ApiTags('Compras / Estoque: Categorias')
@Controller('compras-estoque/categorias')
export class CategoriasController {
  constructor(private readonly categorias: CategoriasService) {}

  @Get()
  @RequirePermission('compras-estoque.categorias.ver')
  @ApiOperation({
    summary: 'Lista paginada, com busca, tipo (Todas/Produtos/Serviços) e ordenação',
  })
  @ApiZodQuery(listCategoriasQuerySchema)
  @ApiZodResponse(200, categoriaPageSchema)
  @ApiErrorResponses(400, 401, 403)
  list(
    @Query(new ZodValidationPipe(listCategoriasQuerySchema)) query: ListCategoriasQuery,
  ): Promise<Page<Categoria>> {
    return this.categorias.list(query);
  }

  // Antes de ":id" para "export" não ser tratado como id.
  @Get('export')
  @RequirePermission('compras-estoque.categorias.exportar')
  @Audit({ entity: ENTITY, action: 'EXPORT' })
  @ApiOperation({
    summary: 'Exporta em Excel ou PDF com os mesmos filtros e ordenação da listagem',
  })
  @ApiZodQuery(exportCategoriasQuerySchema)
  @ApiProduces(
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/pdf',
    'text/csv',
  )
  @ApiErrorResponses(400, 401, 403, 422)
  async export(
    @Query(new ZodValidationPipe(exportCategoriasQuerySchema)) query: ExportCategoriasQuery,
  ): Promise<StreamableFile> {
    return toStreamableFile(await this.categorias.export(query));
  }

  @Get(':id')
  @RequirePermission('compras-estoque.categorias.ver')
  @ApiOperation({ summary: 'Detalhe' })
  @ApiZodResponse(200, categoriaSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  findById(@IdParam() id: string): Promise<Categoria> {
    return this.categorias.findById(id);
  }

  @Post()
  @RequirePermission('compras-estoque.categorias.criar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Cria (Nova Categoria)' })
  @ApiZodBody(createCategoriaSchema)
  @ApiZodResponse(201, categoriaSchema)
  @ApiErrorResponses(400, 401, 403)
  create(
    @Body(new ZodValidationPipe(createCategoriaSchema)) body: CreateCategoriaInput,
  ): Promise<Categoria> {
    return this.categorias.create(body);
  }

  @Patch(':id')
  @RequirePermission('compras-estoque.categorias.editar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Altera (Editar Categoria)' })
  @ApiZodBody(updateCategoriaSchema)
  @ApiZodResponse(200, categoriaSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  update(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(updateCategoriaSchema)) body: UpdateCategoriaInput,
  ): Promise<Categoria> {
    return this.categorias.update(id, body);
  }

  @Delete(':id')
  @RequirePermission('compras-estoque.categorias.excluir')
  @HttpCode(200)
  @Audit({ entity: ENTITY })
  @ApiOperation({
    summary: 'Exclui (exclusão lógica). Só se nenhum produto ou serviço estiver usando',
  })
  @ApiZodResponse(200, categoriaSchema)
  @ApiErrorResponses(400, 401, 403, 404, 409)
  remove(@IdParam() id: string): Promise<Categoria> {
    return this.categorias.remove(id);
  }
}
