import { Body, Controller, Delete, Get, HttpCode, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  createTipoAgendamentoSchema,
  listTiposAgendamentoQuerySchema,
  tipoAgendamentoPageSchema,
  tipoAgendamentoSchema,
  updateTipoAgendamentoSchema,
  type CreateTipoAgendamentoInput,
  type ListTiposAgendamentoQuery,
  type UpdateTipoAgendamentoInput,
} from '@torres/shared';
import type { TipoAgendamento } from '../../../generated/prisma/client';
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
import { TiposAgendamentoService } from './tipos-agendamento.service';

const ENTITY = 'TipoAgendamento';

/** Tela Tipos de Agendamento (`/config/tipos-agendamento`). */
@ApiTags('Configurações / Gestão: Tipos de Agendamento')
@Controller('configuracoes-gestao/tipos-agendamento')
export class TiposAgendamentoController {
  constructor(private readonly tipos: TiposAgendamentoService) {}

  @Get()
  @RequirePermission('configuracoes-gestao.tipos-agendamento.ver')
  @ApiOperation({ summary: 'Lista paginada, com busca, filtro de status e ordenação' })
  @ApiZodQuery(listTiposAgendamentoQuerySchema)
  @ApiZodResponse(200, tipoAgendamentoPageSchema)
  @ApiErrorResponses(400, 401, 403)
  list(
    @Query(new ZodValidationPipe(listTiposAgendamentoQuerySchema)) query: ListTiposAgendamentoQuery,
  ): Promise<Page<TipoAgendamento>> {
    return this.tipos.list(query);
  }

  @Get(':id')
  @RequirePermission('configuracoes-gestao.tipos-agendamento.ver')
  @ApiOperation({ summary: 'Detalhe' })
  @ApiZodResponse(200, tipoAgendamentoSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  findById(@IdParam() id: string): Promise<TipoAgendamento> {
    return this.tipos.findById(id);
  }

  @Post()
  @RequirePermission('configuracoes-gestao.tipos-agendamento.criar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Cria' })
  @ApiZodBody(createTipoAgendamentoSchema)
  @ApiZodResponse(201, tipoAgendamentoSchema)
  @ApiErrorResponses(400, 401, 403)
  create(
    @Body(new ZodValidationPipe(createTipoAgendamentoSchema)) body: CreateTipoAgendamentoInput,
  ): Promise<TipoAgendamento> {
    return this.tipos.create(body);
  }

  @Patch(':id')
  @RequirePermission('configuracoes-gestao.tipos-agendamento.editar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Altera' })
  @ApiZodBody(updateTipoAgendamentoSchema)
  @ApiZodResponse(200, tipoAgendamentoSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  update(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(updateTipoAgendamentoSchema)) body: UpdateTipoAgendamentoInput,
  ): Promise<TipoAgendamento> {
    return this.tipos.update(id, body);
  }

  @Delete(':id')
  @RequirePermission('configuracoes-gestao.tipos-agendamento.excluir')
  @HttpCode(200)
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Exclui (exclusão lógica)' })
  @ApiZodResponse(200, tipoAgendamentoSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  remove(@IdParam() id: string): Promise<TipoAgendamento> {
    return this.tipos.remove(id);
  }
}
