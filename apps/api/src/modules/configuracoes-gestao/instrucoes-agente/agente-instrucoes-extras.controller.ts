import { Body, Controller, Delete, Get, HttpCode, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  agenteInstrucaoExtraPageSchema,
  agenteInstrucaoExtraSchema,
  alterarAtivoAgenteSchema,
  createAgenteInstrucaoExtraSchema,
  listAgenteInstrucaoExtraQuerySchema,
  updateAgenteInstrucaoExtraSchema,
  type AlterarAtivoAgenteInput,
  type CreateAgenteInstrucaoExtraInput,
  type ListAgenteInstrucaoExtraQuery,
  type UpdateAgenteInstrucaoExtraInput,
} from '@torres/shared';
import type { AgenteInstrucaoExtra } from '../../../generated/prisma/client';
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
import { AgenteInstrucoesExtrasService } from './agente-instrucoes-extras.service';

const ENTITY = 'AgenteInstrucaoExtra';
const PERMISSAO = 'configuracoes-gestao.instrucoes-agente';

/** Aba "Instruções Extras" da tela Instruções Agente. */
@ApiTags('Configurações / Gestão: Instruções Agente')
@Controller('configuracoes-gestao/agente-instrucoes-extras')
export class AgenteInstrucoesExtrasController {
  constructor(private readonly extras: AgenteInstrucoesExtrasService) {}

  @Get()
  @RequirePermission(`${PERMISSAO}.ver`)
  @ApiOperation({ summary: 'Lista paginada, com busca (título, descrição) e filtro de ativo' })
  @ApiZodQuery(listAgenteInstrucaoExtraQuerySchema)
  @ApiZodResponse(200, agenteInstrucaoExtraPageSchema)
  @ApiErrorResponses(400, 401, 403)
  list(
    @Query(new ZodValidationPipe(listAgenteInstrucaoExtraQuerySchema))
    query: ListAgenteInstrucaoExtraQuery,
  ): Promise<Page<AgenteInstrucaoExtra>> {
    return this.extras.list(query);
  }

  @Get(':id')
  @RequirePermission(`${PERMISSAO}.ver`)
  @ApiOperation({ summary: 'Detalhe' })
  @ApiZodResponse(200, agenteInstrucaoExtraSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  findById(@IdParam() id: string): Promise<AgenteInstrucaoExtra> {
    return this.extras.findById(id);
  }

  @Post()
  @RequirePermission(`${PERMISSAO}.criar`)
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Cria uma instrução extra' })
  @ApiZodBody(createAgenteInstrucaoExtraSchema)
  @ApiZodResponse(201, agenteInstrucaoExtraSchema)
  @ApiErrorResponses(400, 401, 403)
  create(
    @Body(new ZodValidationPipe(createAgenteInstrucaoExtraSchema))
    body: CreateAgenteInstrucaoExtraInput,
  ): Promise<AgenteInstrucaoExtra> {
    return this.extras.create(body);
  }

  @Patch(':id')
  @RequirePermission(`${PERMISSAO}.editar`)
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Altera título, descrição e ativo' })
  @ApiZodBody(updateAgenteInstrucaoExtraSchema)
  @ApiZodResponse(200, agenteInstrucaoExtraSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  update(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(updateAgenteInstrucaoExtraSchema))
    body: UpdateAgenteInstrucaoExtraInput,
  ): Promise<AgenteInstrucaoExtra> {
    return this.extras.update(id, body);
  }

  @Patch(':id/ativo')
  @RequirePermission(`${PERMISSAO}.editar`)
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Liga ou desliga a instrução extra (switch do card)' })
  @ApiZodBody(alterarAtivoAgenteSchema)
  @ApiZodResponse(200, agenteInstrucaoExtraSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  alterarAtivo(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(alterarAtivoAgenteSchema)) body: AlterarAtivoAgenteInput,
  ): Promise<AgenteInstrucaoExtra> {
    return this.extras.alterarAtivo(id, body.ativo);
  }

  @Delete(':id')
  @RequirePermission(`${PERMISSAO}.excluir`)
  @HttpCode(200)
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Exclusão lógica' })
  @ApiZodResponse(200, agenteInstrucaoExtraSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  remove(@IdParam() id: string): Promise<AgenteInstrucaoExtra> {
    return this.extras.remove(id);
  }
}
