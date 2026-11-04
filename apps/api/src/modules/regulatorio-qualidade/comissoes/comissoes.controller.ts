import { Body, Controller, Delete, Get, HttpCode, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  comissaoPageSchema,
  comissaoSchema,
  createComissaoSchema,
  listComissoesQuerySchema,
  updateComissaoSchema,
  type Comissao,
  type ComissaoPage,
  type CreateComissaoInput,
  type ListComissoesQuery,
  type UpdateComissaoInput,
} from '@torres/shared';
import { Audit } from '../../../common/audit/audit.decorator';
import { RequirePermission } from '../../../common/auth/auth.decorators';
import {
  ApiErrorResponses,
  ApiZodBody,
  ApiZodQuery,
  ApiZodResponse,
} from '../../../common/swagger/zod-openapi';
import { IdParam } from '../../../common/validation/id-param.decorator';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { ComissoesService } from './comissoes.service';

const ENTITY = 'Comissao';

/** Aba "Comissões" da tela Funcionários (`/funcionarios`): lançamentos do funcionário selecionado. */
@ApiTags('Regulatório / Qualidade: Comissões')
@Controller('regulatorio-qualidade/funcionarios/:funcionarioId/comissoes')
export class ComissoesController {
  constructor(private readonly comissoes: ComissoesService) {}

  @Get()
  @RequirePermission('regulatorio-qualidade.funcionarios.ver')
  @ApiOperation({ summary: 'Lista paginada das comissões do funcionário' })
  @ApiZodQuery(listComissoesQuerySchema)
  @ApiZodResponse(200, comissaoPageSchema)
  @ApiErrorResponses(400, 401, 403)
  list(
    @IdParam('funcionarioId') funcionarioId: string,
    @Query(new ZodValidationPipe(listComissoesQuerySchema)) query: ListComissoesQuery,
  ): Promise<ComissaoPage> {
    return this.comissoes.list(funcionarioId, query);
  }

  @Post()
  @RequirePermission('regulatorio-qualidade.funcionarios.criar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Lança uma nova comissão para o funcionário' })
  @ApiZodBody(createComissaoSchema)
  @ApiZodResponse(201, comissaoSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  create(
    @IdParam('funcionarioId') funcionarioId: string,
    @Body(new ZodValidationPipe(createComissaoSchema)) body: CreateComissaoInput,
  ): Promise<Comissao> {
    return this.comissoes.create(funcionarioId, body);
  }

  @Patch(':id')
  @RequirePermission('regulatorio-qualidade.funcionarios.editar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Altera uma comissão' })
  @ApiZodBody(updateComissaoSchema)
  @ApiZodResponse(200, comissaoSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  update(
    @IdParam('funcionarioId') funcionarioId: string,
    @IdParam() id: string,
    @Body(new ZodValidationPipe(updateComissaoSchema)) body: UpdateComissaoInput,
  ): Promise<Comissao> {
    return this.comissoes.update(funcionarioId, id, body);
  }

  @Delete(':id')
  @RequirePermission('regulatorio-qualidade.funcionarios.excluir')
  @HttpCode(200)
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Exclui (exclusão lógica)' })
  @ApiZodResponse(200, comissaoSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  remove(
    @IdParam('funcionarioId') funcionarioId: string,
    @IdParam() id: string,
  ): Promise<Comissao> {
    return this.comissoes.remove(funcionarioId, id);
  }
}
