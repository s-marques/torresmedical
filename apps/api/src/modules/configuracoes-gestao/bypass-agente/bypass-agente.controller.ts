import { Body, Controller, Delete, Get, HttpCode, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  alterarStatusBypassAgenteSchema,
  bypassAgentePageSchema,
  bypassAgenteSchema,
  createBypassAgenteSchema,
  listBypassAgenteQuerySchema,
  updateBypassAgenteSchema,
  type AlterarStatusBypassAgenteInput,
  type CreateBypassAgenteInput,
  type ListBypassAgenteQuery,
  type UpdateBypassAgenteInput,
} from '@torres/shared';
import type { BypassAgente } from '../../../generated/prisma/client';
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
import { BypassAgenteService } from './bypass-agente.service';

const ENTITY = 'BypassAgente';

/** Tela Bypass Agente (`/bypass-agente`). */
@ApiTags('Configurações / Gestão: Bypass Agente')
@Controller('configuracoes-gestao/bypass-agente')
export class BypassAgenteController {
  constructor(private readonly bypass: BypassAgenteService) {}

  @Get()
  @RequirePermission('configuracoes-gestao.bypass-agente.ver')
  @ApiOperation({ summary: 'Lista paginada, com busca (nome, telefone, cargo) e filtro de status' })
  @ApiZodQuery(listBypassAgenteQuerySchema)
  @ApiZodResponse(200, bypassAgentePageSchema)
  @ApiErrorResponses(400, 401, 403)
  list(
    @Query(new ZodValidationPipe(listBypassAgenteQuerySchema)) query: ListBypassAgenteQuery,
  ): Promise<Page<BypassAgente>> {
    return this.bypass.list(query);
  }

  @Get(':id')
  @RequirePermission('configuracoes-gestao.bypass-agente.ver')
  @ApiOperation({ summary: 'Detalhe' })
  @ApiZodResponse(200, bypassAgenteSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  findById(@IdParam() id: string): Promise<BypassAgente> {
    return this.bypass.findById(id);
  }

  @Post()
  @RequirePermission('configuracoes-gestao.bypass-agente.criar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Adiciona um telefone ao bypass' })
  @ApiZodBody(createBypassAgenteSchema)
  @ApiZodResponse(201, bypassAgenteSchema)
  @ApiErrorResponses(400, 401, 403, 409)
  create(
    @Body(new ZodValidationPipe(createBypassAgenteSchema)) body: CreateBypassAgenteInput,
  ): Promise<BypassAgente> {
    return this.bypass.create(body);
  }

  @Patch(':id')
  @RequirePermission('configuracoes-gestao.bypass-agente.editar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Altera telefone, nome e cargo' })
  @ApiZodBody(updateBypassAgenteSchema)
  @ApiZodResponse(200, bypassAgenteSchema)
  @ApiErrorResponses(400, 401, 403, 404, 409)
  update(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(updateBypassAgenteSchema)) body: UpdateBypassAgenteInput,
  ): Promise<BypassAgente> {
    return this.bypass.update(id, body);
  }

  @Patch(':id/status')
  @RequirePermission('configuracoes-gestao.bypass-agente.editar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Liga ou desliga o bypass do telefone (switch da coluna Status)' })
  @ApiZodBody(alterarStatusBypassAgenteSchema)
  @ApiZodResponse(200, bypassAgenteSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  alterarStatus(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(alterarStatusBypassAgenteSchema))
    body: AlterarStatusBypassAgenteInput,
  ): Promise<BypassAgente> {
    return this.bypass.alterarStatus(id, body.ativo);
  }

  @Delete(':id')
  @RequirePermission('configuracoes-gestao.bypass-agente.excluir')
  @HttpCode(200)
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Remove da lista (exclusão lógica)' })
  @ApiZodResponse(200, bypassAgenteSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  remove(@IdParam() id: string): Promise<BypassAgente> {
    return this.bypass.remove(id);
  }
}
