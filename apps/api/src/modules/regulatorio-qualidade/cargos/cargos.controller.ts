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
  cargoPageSchema,
  cargoSchema,
  createCargoSchema,
  exportCargosQuerySchema,
  listCargosQuerySchema,
  updateCargoSchema,
  type CreateCargoInput,
  type ExportCargosQuery,
  type ListCargosQuery,
  type UpdateCargoInput,
} from '@torres/shared';
import type { Cargo } from '../../../generated/prisma/client';
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
import { CargosService } from './cargos.service';

const ENTITY = 'Cargo';

/** Aba "Cargos" da tela Funcionários (`/funcionarios`). */
@ApiTags('Regulatório / Qualidade: Cargos')
@Controller('regulatorio-qualidade/cargos')
export class CargosController {
  constructor(private readonly cargos: CargosService) {}

  @Get()
  @RequirePermission('regulatorio-qualidade.funcionarios.ver')
  @ApiOperation({ summary: 'Lista paginada, com busca, status e ordenação' })
  @ApiZodQuery(listCargosQuerySchema)
  @ApiZodResponse(200, cargoPageSchema)
  @ApiErrorResponses(400, 401, 403)
  list(
    @Query(new ZodValidationPipe(listCargosQuerySchema)) query: ListCargosQuery,
  ): Promise<Page<Cargo>> {
    return this.cargos.list(query);
  }

  @Get('export')
  @RequirePermission('regulatorio-qualidade.funcionarios.exportar')
  @Audit({ entity: ENTITY, action: 'EXPORT' })
  @ApiOperation({ summary: 'Exporta em Excel ou PDF com os mesmos filtros e ordenação' })
  @ApiZodQuery(exportCargosQuerySchema)
  @ApiProduces(
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/pdf',
    'text/csv',
  )
  @ApiErrorResponses(400, 401, 403, 422)
  async export(
    @Query(new ZodValidationPipe(exportCargosQuerySchema)) query: ExportCargosQuery,
  ): Promise<StreamableFile> {
    return toStreamableFile(await this.cargos.export(query));
  }

  @Get(':id')
  @RequirePermission('regulatorio-qualidade.funcionarios.ver')
  @ApiOperation({ summary: 'Detalhe' })
  @ApiZodResponse(200, cargoSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  findById(@IdParam() id: string): Promise<Cargo> {
    return this.cargos.findById(id);
  }

  @Post()
  @RequirePermission('regulatorio-qualidade.funcionarios.criar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Cria (Novo Cargo)' })
  @ApiZodBody(createCargoSchema)
  @ApiZodResponse(201, cargoSchema)
  @ApiErrorResponses(400, 401, 403)
  create(@Body(new ZodValidationPipe(createCargoSchema)) body: CreateCargoInput): Promise<Cargo> {
    return this.cargos.create(body);
  }

  @Patch(':id')
  @RequirePermission('regulatorio-qualidade.funcionarios.editar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Altera (Editar Cargo)' })
  @ApiZodBody(updateCargoSchema)
  @ApiZodResponse(200, cargoSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  update(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(updateCargoSchema)) body: UpdateCargoInput,
  ): Promise<Cargo> {
    return this.cargos.update(id, body);
  }

  @Delete(':id')
  @RequirePermission('regulatorio-qualidade.funcionarios.excluir')
  @HttpCode(200)
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Exclui (exclusão lógica)' })
  @ApiZodResponse(200, cargoSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  remove(@IdParam() id: string): Promise<Cargo> {
    return this.cargos.remove(id);
  }
}
