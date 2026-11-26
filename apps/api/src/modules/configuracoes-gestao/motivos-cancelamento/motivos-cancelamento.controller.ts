import { Body, Controller, Delete, Get, HttpCode, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  createMotivoCancelamentoSchema,
  listMotivosCancelamentoQuerySchema,
  motivoCancelamentoPageSchema,
  motivoCancelamentoSchema,
  updateMotivoCancelamentoSchema,
  type CreateMotivoCancelamentoInput,
  type ListMotivosCancelamentoQuery,
  type MotivoCancelamento,
  type UpdateMotivoCancelamentoInput,
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
import { MotivosCancelamentoService } from './motivos-cancelamento.service';

const ENTITY = 'MotivoCancelamento';

/** Tela Motivos de Cancelamento (`/config/motivos-cancelamento`, issue #162). */
@ApiTags('Configurações / Gestão: Motivos de Cancelamento')
@Controller('configuracoes-gestao/motivos-cancelamento')
export class MotivosCancelamentoController {
  constructor(private readonly motivos: MotivosCancelamentoService) {}

  @Get()
  @RequirePermission('configuracoes-gestao.motivos-cancelamento.ver')
  @ApiOperation({ summary: 'Lista paginada, com busca, tipo, status e ordenação' })
  @ApiZodQuery(listMotivosCancelamentoQuerySchema)
  @ApiZodResponse(200, motivoCancelamentoPageSchema)
  @ApiErrorResponses(400, 401, 403)
  list(
    @Query(new ZodValidationPipe(listMotivosCancelamentoQuerySchema))
    query: ListMotivosCancelamentoQuery,
  ): Promise<Page<MotivoCancelamento>> {
    return this.motivos.list(query);
  }

  @Get(':id')
  @RequirePermission('configuracoes-gestao.motivos-cancelamento.ver')
  @ApiOperation({ summary: 'Detalhe' })
  @ApiZodResponse(200, motivoCancelamentoSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  findById(@IdParam() id: string): Promise<MotivoCancelamento> {
    return this.motivos.findById(id);
  }

  @Post()
  @RequirePermission('configuracoes-gestao.motivos-cancelamento.criar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Cria um motivo no fim da lista do tipo' })
  @ApiZodBody(createMotivoCancelamentoSchema)
  @ApiZodResponse(201, motivoCancelamentoSchema)
  @ApiErrorResponses(400, 401, 403, 409)
  create(
    @Body(new ZodValidationPipe(createMotivoCancelamentoSchema))
    body: CreateMotivoCancelamentoInput,
  ): Promise<MotivoCancelamento> {
    return this.motivos.create(body);
  }

  @Patch(':id')
  @RequirePermission('configuracoes-gestao.motivos-cancelamento.editar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Altera (motivo de sistema não muda de nome, texto nem situação)' })
  @ApiZodBody(updateMotivoCancelamentoSchema)
  @ApiZodResponse(200, motivoCancelamentoSchema)
  @ApiErrorResponses(400, 401, 403, 404, 409)
  update(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(updateMotivoCancelamentoSchema))
    body: UpdateMotivoCancelamentoInput,
  ): Promise<MotivoCancelamento> {
    return this.motivos.update(id, body);
  }

  @Delete(':id')
  @RequirePermission('configuracoes-gestao.motivos-cancelamento.excluir')
  @HttpCode(200)
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Exclui (exclusão lógica; cancelamentos antigos mantêm o motivo)' })
  @ApiZodResponse(200, motivoCancelamentoSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  remove(@IdParam() id: string): Promise<MotivoCancelamento> {
    return this.motivos.remove(id);
  }
}
