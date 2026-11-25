import { Body, Controller, Delete, Get, HttpCode, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  listModelosQuerySchema,
  modeloAtualizacaoSchema,
  modeloPadraoInputSchema,
  modeloProntuarioPageSchema,
  modeloProntuarioSchema,
  modeloProprioInputSchema,
  type CreateModeloPadraoInput,
  type CreateModeloProprioInput,
  type ListModelosQuery,
  type ModeloProntuario,
  type ModeloProntuarioPage,
  type UpdateModeloInput,
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
import { ModelosProntuarioService } from './modelos-prontuario.service';

const ENTITY = 'ModeloProntuario';
const PERMISSAO_PADRAO = 'consultorio-assistencial.modelos-prontuario.gerir' as const;

/**
 * Modelos de prontuário por profissão e especialidade (issue #152), na aba "Modelos" da tela
 * Prontuários. O profissional cria e altera os seus (`prontuarios.criar/editar/excluir`); os
 * modelos padrão da clínica ficam nas rotas `/padrao`, só da gerência.
 */
@ApiTags('Consultório / Assistencial: Modelos de prontuário')
@Controller('consultorio-assistencial/modelos-prontuario')
export class ModelosProntuarioController {
  constructor(private readonly modelos: ModelosProntuarioService) {}

  @Get()
  @RequirePermission('consultorio-assistencial.prontuarios.ver')
  @ApiOperation({ summary: 'Lista os modelos (padrão e dos profissionais do escopo)' })
  @ApiZodQuery(listModelosQuerySchema)
  @ApiZodResponse(200, modeloProntuarioPageSchema)
  @ApiErrorResponses(400, 401, 403)
  listar(
    @Query(new ZodValidationPipe(listModelosQuerySchema)) query: ListModelosQuery,
  ): Promise<ModeloProntuarioPage> {
    return this.modelos.listar(query);
  }

  @Get(':id')
  @RequirePermission('consultorio-assistencial.prontuarios.ver')
  @ApiOperation({ summary: 'Detalhe do modelo, com as seções da versão atual' })
  @ApiZodResponse(200, modeloProntuarioSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  detalhe(@IdParam() id: string): Promise<ModeloProntuario> {
    return this.modelos.detalhe(id);
  }

  // --- Modelo do próprio profissional ----------------------------------------------------------

  @Post()
  @RequirePermission('consultorio-assistencial.prontuarios.criar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Cria um modelo do próprio profissional' })
  @ApiZodBody(modeloProprioInputSchema)
  @ApiZodResponse(201, modeloProntuarioSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  criar(
    @Body(new ZodValidationPipe(modeloProprioInputSchema)) body: CreateModeloProprioInput,
  ): Promise<ModeloProntuario> {
    return this.modelos.criarProprio(body);
  }

  @Patch(':id')
  @RequirePermission('consultorio-assistencial.prontuarios.editar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Altera o modelo do profissional; mudar as seções cria nova versão' })
  @ApiZodBody(modeloAtualizacaoSchema)
  @ApiZodResponse(200, modeloProntuarioSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  atualizar(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(modeloAtualizacaoSchema)) body: UpdateModeloInput,
  ): Promise<ModeloProntuario> {
    return this.modelos.atualizar(id, body, false);
  }

  @Delete(':id')
  @HttpCode(200)
  @RequirePermission('consultorio-assistencial.prontuarios.excluir')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Exclui o modelo do profissional (lógica; atendimentos não mudam)' })
  @ApiZodResponse(200, modeloProntuarioSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  excluir(@IdParam() id: string): Promise<ModeloProntuario> {
    return this.modelos.excluir(id, false);
  }

  // --- Modelo padrão da clínica (gerência) -----------------------------------------------------

  @Post('padrao')
  @RequirePermission(PERMISSAO_PADRAO)
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Cria um modelo padrão da clínica' })
  @ApiZodBody(modeloPadraoInputSchema)
  @ApiZodResponse(201, modeloProntuarioSchema)
  @ApiErrorResponses(400, 401, 403)
  criarPadrao(
    @Body(new ZodValidationPipe(modeloPadraoInputSchema)) body: CreateModeloPadraoInput,
  ): Promise<ModeloProntuario> {
    return this.modelos.criarPadrao(body);
  }

  @Patch('padrao/:id')
  @RequirePermission(PERMISSAO_PADRAO)
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Altera o modelo padrão; mudar as seções cria nova versão' })
  @ApiZodBody(modeloAtualizacaoSchema)
  @ApiZodResponse(200, modeloProntuarioSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  atualizarPadrao(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(modeloAtualizacaoSchema)) body: UpdateModeloInput,
  ): Promise<ModeloProntuario> {
    return this.modelos.atualizar(id, body, true);
  }

  @Delete('padrao/:id')
  @HttpCode(200)
  @RequirePermission(PERMISSAO_PADRAO)
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Exclui o modelo padrão (lógica; atendimentos não mudam)' })
  @ApiZodResponse(200, modeloProntuarioSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  excluirPadrao(@IdParam() id: string): Promise<ModeloProntuario> {
    return this.modelos.excluir(id, true);
  }
}
