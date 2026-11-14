import { Body, Controller, Delete, Get, HttpCode, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  atividadeNegocioInputSchema,
  atividadeNegocioSchema,
  moverNegocioSchema,
  negocioInputSchema,
  negocioSchema,
  perderNegocioSchema,
  quadroQuerySchema,
  quadroSchema,
  responsavelListaSchema,
  type AtividadeNegocio,
  type AtividadeNegocioInput,
  type MoverNegocioInput,
  type Negocio,
  type NegocioInput,
  type PerderNegocioInput,
  type Quadro,
  type QuadroQuery,
  type Responsavel,
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
import { NegociosService } from './negocios.service';

const ENTITY = 'Negocio';

/** Tela Pipeline (`/crm`): quadro de negócios por estágio. */
@ApiTags('Comercial/Atendimento: Pipeline')
@Controller('comercial-atendimento/pipeline')
export class NegociosController {
  constructor(private readonly negocios: NegociosService) {}

  @Get('quadro')
  @RequirePermission('comercial-atendimento.pipeline.ver')
  @ApiOperation({
    summary:
      'Colunas do pipeline com os negócios abertos (busca por título, nome, telefone, CPF ou CNPJ do cliente) e o resumo por status',
  })
  @ApiZodQuery(quadroQuerySchema)
  @ApiZodResponse(200, quadroSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  quadro(@Query(new ZodValidationPipe(quadroQuerySchema)) query: QuadroQuery): Promise<Quadro> {
    return this.negocios.quadro(query);
  }

  @Get('responsaveis')
  @RequirePermission('comercial-atendimento.pipeline.ver')
  @ApiOperation({ summary: 'Usuários ativos para o campo Responsável' })
  @ApiZodResponse(200, responsavelListaSchema)
  @ApiErrorResponses(401, 403)
  responsaveis(): Promise<Responsavel[]> {
    return this.negocios.responsaveis();
  }

  @Get('negocios/:id')
  @RequirePermission('comercial-atendimento.pipeline.ver')
  @ApiOperation({ summary: 'Detalhe do negócio, com a próxima ação' })
  @ApiZodResponse(200, negocioSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  findById(@IdParam() id: string): Promise<Negocio> {
    return this.negocios.findById(id);
  }

  @Post('negocios')
  @RequirePermission('comercial-atendimento.pipeline.criar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Cria (Novo Negócio)' })
  @ApiZodBody(negocioInputSchema)
  @ApiZodResponse(201, negocioSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  create(@Body(new ZodValidationPipe(negocioInputSchema)) body: NegocioInput): Promise<Negocio> {
    return this.negocios.create(body);
  }

  @Patch('negocios/:id')
  @RequirePermission('comercial-atendimento.pipeline.editar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Altera (Editar)' })
  @ApiZodBody(negocioInputSchema)
  @ApiZodResponse(200, negocioSchema)
  @ApiErrorResponses(400, 401, 403, 404, 422)
  update(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(negocioInputSchema)) body: NegocioInput,
  ): Promise<Negocio> {
    return this.negocios.update(id, body);
  }

  @Patch('negocios/:id/mover')
  @RequirePermission('comercial-atendimento.pipeline.editar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Move o negócio aberto para outro estágio do mesmo pipeline' })
  @ApiZodBody(moverNegocioSchema)
  @ApiZodResponse(200, negocioSchema)
  @ApiErrorResponses(400, 401, 403, 404, 422)
  mover(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(moverNegocioSchema)) body: MoverNegocioInput,
  ): Promise<Negocio> {
    return this.negocios.mover(id, body);
  }

  @Patch('negocios/:id/ganho')
  @RequirePermission('comercial-atendimento.pipeline.editar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Marca o negócio aberto como ganho' })
  @ApiZodResponse(200, negocioSchema)
  @ApiErrorResponses(400, 401, 403, 404, 422)
  ganhar(@IdParam() id: string): Promise<Negocio> {
    return this.negocios.ganhar(id);
  }

  @Patch('negocios/:id/perdido')
  @RequirePermission('comercial-atendimento.pipeline.editar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Marca o negócio aberto como perdido, com o motivo de perda' })
  @ApiZodBody(perderNegocioSchema)
  @ApiZodResponse(200, negocioSchema)
  @ApiErrorResponses(400, 401, 403, 404, 422)
  perder(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(perderNegocioSchema)) body: PerderNegocioInput,
  ): Promise<Negocio> {
    return this.negocios.perder(id, body);
  }

  @Delete('negocios/:id')
  @RequirePermission('comercial-atendimento.pipeline.excluir')
  @HttpCode(200)
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Exclui (exclusão lógica)' })
  @ApiZodResponse(200, negocioSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  remove(@IdParam() id: string): Promise<Negocio> {
    return this.negocios.remove(id);
  }

  @Post('negocios/:id/atividades')
  @RequirePermission('comercial-atendimento.pipeline.criar')
  @Audit({ entity: 'AtividadeNegocio' })
  @ApiOperation({ summary: 'Agenda a próxima ação do negócio (Agendar Follow-up)' })
  @ApiZodBody(atividadeNegocioInputSchema)
  @ApiZodResponse(201, atividadeNegocioSchema)
  @ApiErrorResponses(400, 401, 403, 404, 422)
  agendarAtividade(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(atividadeNegocioInputSchema)) body: AtividadeNegocioInput,
  ): Promise<AtividadeNegocio> {
    return this.negocios.agendarAtividade(id, body);
  }

  @Patch('atividades/:id/concluir')
  @RequirePermission('comercial-atendimento.pipeline.editar')
  @Audit({ entity: 'AtividadeNegocio' })
  @ApiOperation({ summary: 'Conclui a próxima ação do negócio' })
  @ApiZodResponse(200, atividadeNegocioSchema)
  @ApiErrorResponses(400, 401, 403, 404, 422)
  concluirAtividade(@IdParam() id: string): Promise<AtividadeNegocio> {
    return this.negocios.concluirAtividade(id);
  }
}
