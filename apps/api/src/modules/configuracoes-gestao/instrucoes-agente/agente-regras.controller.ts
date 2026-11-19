import { Body, Controller, Delete, Get, HttpCode, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  agenteRegraPageSchema,
  agenteRegraSchema,
  alterarAtivoAgenteSchema,
  createAgenteRegraSchema,
  listAgenteRegraQuerySchema,
  updateAgenteRegraSchema,
  type AlterarAtivoAgenteInput,
  type CreateAgenteRegraInput,
  type ListAgenteRegraQuery,
  type UpdateAgenteRegraInput,
} from '@torres/shared';
import type { AgenteRegra } from '../../../generated/prisma/client';
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
import { AgenteRegrasService } from './agente-regras.service';

const ENTITY = 'AgenteRegra';
const PERMISSAO = 'configuracoes-gestao.instrucoes-agente';

/** Aba "Regras" da tela Instruções Agente. */
@ApiTags('Configurações / Gestão: Instruções Agente')
@Controller('configuracoes-gestao/agente-regras')
export class AgenteRegrasController {
  constructor(private readonly regras: AgenteRegrasService) {}

  @Get()
  @RequirePermission(`${PERMISSAO}.ver`)
  @ApiOperation({
    summary: 'Lista paginada, com busca (nome, descrição) e filtros de status, tipo e ação',
  })
  @ApiZodQuery(listAgenteRegraQuerySchema)
  @ApiZodResponse(200, agenteRegraPageSchema)
  @ApiErrorResponses(400, 401, 403)
  list(
    @Query(new ZodValidationPipe(listAgenteRegraQuerySchema)) query: ListAgenteRegraQuery,
  ): Promise<Page<AgenteRegra>> {
    return this.regras.list(query);
  }

  @Get(':id')
  @RequirePermission(`${PERMISSAO}.ver`)
  @ApiOperation({ summary: 'Detalhe' })
  @ApiZodResponse(200, agenteRegraSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  findById(@IdParam() id: string): Promise<AgenteRegra> {
    return this.regras.findById(id);
  }

  @Post()
  @RequirePermission(`${PERMISSAO}.criar`)
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Cria uma regra' })
  @ApiZodBody(createAgenteRegraSchema)
  @ApiZodResponse(201, agenteRegraSchema)
  @ApiErrorResponses(400, 401, 403, 409)
  create(
    @Body(new ZodValidationPipe(createAgenteRegraSchema)) body: CreateAgenteRegraInput,
  ): Promise<AgenteRegra> {
    return this.regras.create(body);
  }

  @Patch(':id')
  @RequirePermission(`${PERMISSAO}.editar`)
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Altera a regra' })
  @ApiZodBody(updateAgenteRegraSchema)
  @ApiZodResponse(200, agenteRegraSchema)
  @ApiErrorResponses(400, 401, 403, 404, 409)
  update(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(updateAgenteRegraSchema)) body: UpdateAgenteRegraInput,
  ): Promise<AgenteRegra> {
    return this.regras.update(id, body);
  }

  @Patch(':id/ativo')
  @RequirePermission(`${PERMISSAO}.editar`)
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Liga ou desliga a regra (switch da coluna Ativo)' })
  @ApiZodBody(alterarAtivoAgenteSchema)
  @ApiZodResponse(200, agenteRegraSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  alterarAtivo(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(alterarAtivoAgenteSchema)) body: AlterarAtivoAgenteInput,
  ): Promise<AgenteRegra> {
    return this.regras.alterarAtivo(id, body.ativo);
  }

  @Delete(':id')
  @RequirePermission(`${PERMISSAO}.excluir`)
  @HttpCode(200)
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Exclusão lógica' })
  @ApiZodResponse(200, agenteRegraSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  remove(@IdParam() id: string): Promise<AgenteRegra> {
    return this.regras.remove(id);
  }
}
