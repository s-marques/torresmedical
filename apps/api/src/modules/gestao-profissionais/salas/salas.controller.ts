import { Body, Controller, Delete, Get, HttpCode, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  createSalaSchema,
  listSalasQuerySchema,
  salaPageSchema,
  salaSchema,
  updateSalaSchema,
  type CreateSalaInput,
  type ListSalasQuery,
  type Sala,
  type UpdateSalaInput,
} from '@torres/shared';
import { Audit } from '../../../common/audit/audit.decorator';
import { RequirePermission } from '../../../common/auth/auth.decorators';
import type { Page } from '../../../common/pagination/paginate';
import {
  ApiErrorResponses,
  ApiZodBody,
  ApiZodQuery,
  ApiZodResponse,
} from '../../../common/swagger/zod-openapi';
import { IdParam } from '../../../common/validation/id-param.decorator';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { SalasService } from './salas.service';

const ENTITY = 'Sala';

/** Tela Gestão de Salas (`/salas`), aba Salas. */
@ApiTags('Gestão Profissionais: Salas')
@Controller('gestao-profissionais/salas')
export class SalasController {
  constructor(private readonly salas: SalasService) {}

  @Get()
  @RequirePermission('gestao-profissionais.salas.ver')
  @ApiOperation({ summary: 'Lista paginada, com busca e filtros de tipo e status' })
  @ApiZodQuery(listSalasQuerySchema)
  @ApiZodResponse(200, salaPageSchema)
  @ApiErrorResponses(400, 401, 403)
  list(
    @Query(new ZodValidationPipe(listSalasQuerySchema)) query: ListSalasQuery,
  ): Promise<Page<Sala>> {
    return this.salas.list(query);
  }

  @Get(':id')
  @RequirePermission('gestao-profissionais.salas.ver')
  @ApiOperation({ summary: 'Detalhe (lupa: Detalhes da Sala)' })
  @ApiZodResponse(200, salaSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  findById(@IdParam() id: string): Promise<Sala> {
    return this.salas.findById(id);
  }

  @Post()
  @RequirePermission('gestao-profissionais.salas.criar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Cria (Nova Sala)' })
  @ApiZodBody(createSalaSchema)
  @ApiZodResponse(201, salaSchema)
  @ApiErrorResponses(400, 401, 403)
  create(@Body(new ZodValidationPipe(createSalaSchema)) body: CreateSalaInput): Promise<Sala> {
    return this.salas.create(body);
  }

  @Patch(':id')
  @RequirePermission('gestao-profissionais.salas.editar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Altera (Editar Sala): substitui os campos do formulário' })
  @ApiZodBody(updateSalaSchema)
  @ApiZodResponse(200, salaSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  update(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(updateSalaSchema)) body: UpdateSalaInput,
  ): Promise<Sala> {
    return this.salas.update(id, body);
  }

  @Delete(':id')
  @RequirePermission('gestao-profissionais.salas.excluir')
  @HttpCode(200)
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Exclui (lógica), só se a sala não tiver contratos' })
  @ApiZodResponse(200, salaSchema)
  @ApiErrorResponses(400, 401, 403, 404, 409)
  remove(@IdParam() id: string): Promise<Sala> {
    return this.salas.remove(id);
  }
}
