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
  createPrestadorSchema,
  exportPrestadoresQuerySchema,
  listPrestadoresQuerySchema,
  prestadorPageSchema,
  prestadorSchema,
  updatePrestadorSchema,
  type CreatePrestadorInput,
  type ExportPrestadoresQuery,
  type ListPrestadoresQuery,
  type Prestador,
  type UpdatePrestadorInput,
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
import { PrestadoresService } from './prestadores.service';

const ENTITY = 'Prestador';

/** Tela Prestadores (`/prestadores`). */
@ApiTags('Consultório / Assistencial: Prestadores')
@Controller('consultorio-assistencial/prestadores')
export class PrestadoresController {
  constructor(private readonly prestadores: PrestadoresService) {}

  @Get()
  @RequirePermission('consultorio-assistencial.prestadores.ver')
  @ApiOperation({
    summary:
      'Lista paginada, com busca, nome, categoria, status (Todos/Ativo/Inativo/Bloqueado) e ordenação',
  })
  @ApiZodQuery(listPrestadoresQuerySchema)
  @ApiZodResponse(200, prestadorPageSchema)
  @ApiErrorResponses(400, 401, 403)
  list(
    @Query(new ZodValidationPipe(listPrestadoresQuerySchema)) query: ListPrestadoresQuery,
  ): Promise<Page<Prestador>> {
    return this.prestadores.list(query);
  }

  // Antes de ":id" para "export" não ser tratado como id.
  @Get('export')
  @RequirePermission('consultorio-assistencial.prestadores.exportar')
  @Audit({ entity: ENTITY, action: 'EXPORT' })
  @ApiOperation({
    summary: 'Exporta em Excel ou PDF com os mesmos filtros e ordenação da listagem',
  })
  @ApiZodQuery(exportPrestadoresQuerySchema)
  @ApiProduces(
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/pdf',
  )
  @ApiErrorResponses(400, 401, 403, 422)
  async export(
    @Query(new ZodValidationPipe(exportPrestadoresQuerySchema)) query: ExportPrestadoresQuery,
  ): Promise<StreamableFile> {
    return toStreamableFile(await this.prestadores.export(query));
  }

  @Get(':id')
  @RequirePermission('consultorio-assistencial.prestadores.ver')
  @ApiOperation({ summary: 'Detalhe' })
  @ApiZodResponse(200, prestadorSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  findById(@IdParam() id: string): Promise<Prestador> {
    return this.prestadores.findById(id);
  }

  @Post()
  @RequirePermission('consultorio-assistencial.prestadores.criar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Cria (Novo Prestador)' })
  @ApiZodBody(createPrestadorSchema)
  @ApiZodResponse(201, prestadorSchema)
  @ApiErrorResponses(400, 401, 403)
  create(
    @Body(new ZodValidationPipe(createPrestadorSchema)) body: CreatePrestadorInput,
  ): Promise<Prestador> {
    return this.prestadores.create(body);
  }

  @Patch(':id')
  @RequirePermission('consultorio-assistencial.prestadores.editar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Altera (Editar Prestador)' })
  @ApiZodBody(updatePrestadorSchema)
  @ApiZodResponse(200, prestadorSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  update(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(updatePrestadorSchema)) body: UpdatePrestadorInput,
  ): Promise<Prestador> {
    return this.prestadores.update(id, body);
  }

  @Delete(':id')
  @RequirePermission('consultorio-assistencial.prestadores.excluir')
  @HttpCode(200)
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Exclui (exclusão lógica)' })
  @ApiZodResponse(200, prestadorSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  remove(@IdParam() id: string): Promise<Prestador> {
    return this.prestadores.remove(id);
  }
}
