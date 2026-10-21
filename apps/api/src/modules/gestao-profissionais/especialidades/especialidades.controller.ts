import { Body, Controller, Delete, Get, HttpCode, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  createEspecialidadeSchema,
  especialidadePageSchema,
  especialidadeSchema,
  listEspecialidadesQuerySchema,
  updateEspecialidadeSchema,
  type CreateEspecialidadeInput,
  type Especialidade,
  type ListEspecialidadesQuery,
  type UpdateEspecialidadeInput,
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
import { EspecialidadesService } from './especialidades.service';

const ENTITY = 'Especialidade';

/**
 * Modal "Gerenciar Especialidades" da tela Profissionais. Usa as permissões da tela
 * (`gestao-profissionais.profissionais.*`). O combobox das outras telas é `/api/lookups/especialidades`.
 */
@ApiTags('Gestão Profissionais: Especialidades')
@Controller('gestao-profissionais/especialidades')
export class EspecialidadesController {
  constructor(private readonly especialidades: EspecialidadesService) {}

  @Get()
  @RequirePermission('gestao-profissionais.profissionais.ver')
  @ApiOperation({ summary: 'Lista paginada, com busca e ordenação' })
  @ApiZodQuery(listEspecialidadesQuerySchema)
  @ApiZodResponse(200, especialidadePageSchema)
  @ApiErrorResponses(400, 401, 403)
  list(
    @Query(new ZodValidationPipe(listEspecialidadesQuerySchema)) query: ListEspecialidadesQuery,
  ): Promise<Page<Especialidade>> {
    return this.especialidades.list(query);
  }

  @Post()
  @RequirePermission('gestao-profissionais.profissionais.editar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Adiciona' })
  @ApiZodBody(createEspecialidadeSchema)
  @ApiZodResponse(201, especialidadeSchema)
  @ApiErrorResponses(400, 401, 403, 409)
  create(
    @Body(new ZodValidationPipe(createEspecialidadeSchema)) body: CreateEspecialidadeInput,
  ): Promise<Especialidade> {
    return this.especialidades.create(body);
  }

  @Patch(':id')
  @RequirePermission('gestao-profissionais.profissionais.editar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Renomeia' })
  @ApiZodBody(updateEspecialidadeSchema)
  @ApiZodResponse(200, especialidadeSchema)
  @ApiErrorResponses(400, 401, 403, 404, 409)
  update(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(updateEspecialidadeSchema)) body: UpdateEspecialidadeInput,
  ): Promise<Especialidade> {
    return this.especialidades.update(id, body);
  }

  @Delete(':id')
  @RequirePermission('gestao-profissionais.profissionais.editar')
  @HttpCode(200)
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Exclui (exclusão lógica); bloqueia se houver profissional vinculado' })
  @ApiZodResponse(200, especialidadeSchema)
  @ApiErrorResponses(400, 401, 403, 404, 409)
  remove(@IdParam() id: string): Promise<Especialidade> {
    return this.especialidades.remove(id);
  }
}
