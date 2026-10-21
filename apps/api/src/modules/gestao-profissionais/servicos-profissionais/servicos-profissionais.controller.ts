import { Body, Controller, Delete, Get, HttpCode, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  createServicoProfissionalSchema,
  listServicosProfissionaisQuerySchema,
  servicoProfissionalPageSchema,
  servicoProfissionalSchema,
  servicoProfissionalStatusSchema,
  updateServicoProfissionalSchema,
  type CreateServicoProfissionalInput,
  type ListServicosProfissionaisQuery,
  type ServicoProfissional,
  type ServicoProfissionalStatusInput,
  type UpdateServicoProfissionalInput,
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
import { ServicosProfissionaisService } from './servicos-profissionais.service';

const ENTITY = 'ServicoProfissional';

/** Tela Serviços Profissionais (`/servicos-profissionais`). */
@ApiTags('Gestão Profissionais: Serviços Profissionais')
@Controller('gestao-profissionais/servicos-profissionais')
export class ServicosProfissionaisController {
  constructor(private readonly servicos: ServicosProfissionaisService) {}

  @Get()
  @RequirePermission('gestao-profissionais.servicos-profissionais.ver')
  @ApiOperation({
    summary:
      'Lista paginada, agrupada por profissional, com busca e filtros de profissional e status',
  })
  @ApiZodQuery(listServicosProfissionaisQuerySchema)
  @ApiZodResponse(200, servicoProfissionalPageSchema)
  @ApiErrorResponses(400, 401, 403)
  list(
    @Query(new ZodValidationPipe(listServicosProfissionaisQuerySchema))
    query: ListServicosProfissionaisQuery,
  ): Promise<Page<ServicoProfissional>> {
    return this.servicos.list(query);
  }

  @Get(':id')
  @RequirePermission('gestao-profissionais.servicos-profissionais.ver')
  @ApiOperation({ summary: 'Detalhe' })
  @ApiZodResponse(200, servicoProfissionalSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  findById(@IdParam() id: string): Promise<ServicoProfissional> {
    return this.servicos.findById(id);
  }

  @Post()
  @RequirePermission('gestao-profissionais.servicos-profissionais.criar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Cria (Novo Serviço)' })
  @ApiZodBody(createServicoProfissionalSchema)
  @ApiZodResponse(201, servicoProfissionalSchema)
  @ApiErrorResponses(400, 401, 403)
  create(
    @Body(new ZodValidationPipe(createServicoProfissionalSchema))
    body: CreateServicoProfissionalInput,
  ): Promise<ServicoProfissional> {
    return this.servicos.create(body);
  }

  @Patch(':id')
  @RequirePermission('gestao-profissionais.servicos-profissionais.editar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Altera (Editar Serviço): substitui os campos do formulário' })
  @ApiZodBody(updateServicoProfissionalSchema)
  @ApiZodResponse(200, servicoProfissionalSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  update(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(updateServicoProfissionalSchema))
    body: UpdateServicoProfissionalInput,
  ): Promise<ServicoProfissional> {
    return this.servicos.update(id, body);
  }

  @Patch(':id/status')
  @RequirePermission('gestao-profissionais.servicos-profissionais.editar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Ativa ou desativa (ícone da linha)' })
  @ApiZodBody(servicoProfissionalStatusSchema)
  @ApiZodResponse(200, servicoProfissionalSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  alterarStatus(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(servicoProfissionalStatusSchema))
    body: ServicoProfissionalStatusInput,
  ): Promise<ServicoProfissional> {
    return this.servicos.alterarStatus(id, body.ativo);
  }

  @Delete(':id')
  @RequirePermission('gestao-profissionais.servicos-profissionais.excluir')
  @HttpCode(200)
  @Audit({ entity: ENTITY })
  @ApiOperation({
    summary: 'Exclui definitivamente, só se o serviço não tiver vínculo com outro cadastro',
  })
  @ApiZodResponse(200, servicoProfissionalSchema)
  @ApiErrorResponses(400, 401, 403, 404, 409)
  remove(@IdParam() id: string): Promise<ServicoProfissional> {
    return this.servicos.remove(id);
  }
}
