import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  agenteInstrucaoPageSchema,
  agenteInstrucaoSchema,
  agenteInstrucaoVersoesSchema,
  alterarStatusAgenteInstrucaoSchema,
  createAgenteInstrucaoSchema,
  listAgenteInstrucaoQuerySchema,
  updateAgenteInstrucaoSchema,
  type AgenteInstrucao,
  type AgenteInstrucaoVersao,
  type AlterarStatusAgenteInstrucaoInput,
  type CreateAgenteInstrucaoInput,
  type ListAgenteInstrucaoQuery,
  type UpdateAgenteInstrucaoInput,
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
import { AgenteInstrucoesService } from './agente-instrucoes.service';

const ENTITY = 'AgenteInstrucao';
const PERMISSAO = 'configuracoes-gestao.instrucoes-agente';

/** Aba "Instruções" da tela Instruções Agente (`/agentes-ia/instrucoes`). */
@ApiTags('Configurações / Gestão: Instruções Agente')
@Controller('configuracoes-gestao/agente-instrucoes')
export class AgenteInstrucoesController {
  constructor(private readonly instrucoes: AgenteInstrucoesService) {}

  @Get()
  @RequirePermission(`${PERMISSAO}.ver`)
  @ApiOperation({ summary: 'Lista paginada de instruções, com busca por nome e filtro de ativo' })
  @ApiZodQuery(listAgenteInstrucaoQuerySchema)
  @ApiZodResponse(200, agenteInstrucaoPageSchema)
  @ApiErrorResponses(400, 401, 403)
  list(
    @Query(new ZodValidationPipe(listAgenteInstrucaoQuerySchema)) query: ListAgenteInstrucaoQuery,
  ): Promise<Page<AgenteInstrucao>> {
    return this.instrucoes.list(query);
  }

  @Get(':id')
  @RequirePermission(`${PERMISSAO}.ver`)
  @ApiOperation({ summary: 'Detalhe' })
  @ApiZodResponse(200, agenteInstrucaoSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  findById(@IdParam() id: string): Promise<AgenteInstrucao> {
    return this.instrucoes.findById(id);
  }

  @Post()
  @RequirePermission(`${PERMISSAO}.criar`)
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Cria a instrução como rascunho (versão 1)' })
  @ApiZodBody(createAgenteInstrucaoSchema)
  @ApiZodResponse(201, agenteInstrucaoSchema)
  @ApiErrorResponses(400, 401, 403, 422)
  create(
    @Body(new ZodValidationPipe(createAgenteInstrucaoSchema)) body: CreateAgenteInstrucaoInput,
  ): Promise<AgenteInstrucao> {
    return this.instrucoes.create(body);
  }

  @Patch(':id')
  @RequirePermission(`${PERMISSAO}.editar`)
  @Audit({ entity: ENTITY })
  @ApiOperation({
    summary: 'Altera a instrução. Mudança de conteúdo gera nova versão e volta para rascunho',
  })
  @ApiZodBody(updateAgenteInstrucaoSchema)
  @ApiZodResponse(200, agenteInstrucaoSchema)
  @ApiErrorResponses(400, 401, 403, 404, 422)
  update(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(updateAgenteInstrucaoSchema)) body: UpdateAgenteInstrucaoInput,
  ): Promise<AgenteInstrucao> {
    return this.instrucoes.update(id, body);
  }

  @Patch(':id/status')
  @RequirePermission(`${PERMISSAO}.editar`)
  @Audit({ entity: ENTITY })
  @ApiOperation({
    summary:
      'Avança ou volta o ciclo: rascunho, em teste, aprovado e publicado (registra quem aprovou)',
  })
  @ApiZodBody(alterarStatusAgenteInstrucaoSchema)
  @ApiZodResponse(200, agenteInstrucaoSchema)
  @ApiErrorResponses(400, 401, 403, 404, 422)
  alterarStatus(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(alterarStatusAgenteInstrucaoSchema))
    body: AlterarStatusAgenteInstrucaoInput,
  ): Promise<AgenteInstrucao> {
    return this.instrucoes.alterarStatus(id, body.status);
  }

  @Get(':id/versoes')
  @RequirePermission(`${PERMISSAO}.ver`)
  @ApiOperation({ summary: 'Histórico de versões, da mais recente para a mais antiga' })
  @ApiZodResponse(200, agenteInstrucaoVersoesSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  versoes(@IdParam() id: string): Promise<AgenteInstrucaoVersao[]> {
    return this.instrucoes.versoes(id);
  }

  @Post(':id/versoes/:numero/restaurar')
  @RequirePermission(`${PERMISSAO}.editar`)
  @HttpCode(200)
  @Audit({ entity: ENTITY, action: 'UPDATE' })
  @ApiOperation({ summary: 'Volta o conteúdo de uma versão anterior (gera versão nova, rascunho)' })
  @ApiZodResponse(200, agenteInstrucaoSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  restaurar(
    @IdParam() id: string,
    @Param('numero', ParseIntPipe) numero: number,
  ): Promise<AgenteInstrucao> {
    return this.instrucoes.restaurarVersao(id, numero);
  }

  @Delete(':id')
  @RequirePermission(`${PERMISSAO}.excluir`)
  @HttpCode(200)
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Exclusão lógica' })
  @ApiZodResponse(200, agenteInstrucaoSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  remove(@IdParam() id: string): Promise<AgenteInstrucao> {
    return this.instrucoes.remove(id);
  }
}
