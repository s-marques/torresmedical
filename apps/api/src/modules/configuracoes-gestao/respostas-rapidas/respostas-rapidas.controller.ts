import { Body, Controller, Delete, Get, HttpCode, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  createRespostaRapidaSchema,
  listRespostasRapidasQuerySchema,
  respostaRapidaPageSchema,
  respostaRapidaSchema,
  updateRespostaRapidaSchema,
  type CreateRespostaRapidaInput,
  type ListRespostasRapidasQuery,
  type UpdateRespostaRapidaInput,
} from '@torres/shared';
import type { RespostaRapida } from '../../../generated/prisma/client';
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
import { RespostasRapidasService } from './respostas-rapidas.service';

const ENTITY = 'RespostaRapida';

/** Tela Respostas Rápidas (`/respostas-rapidas`). */
@ApiTags('Configurações / Gestão: Respostas Rápidas')
@Controller('configuracoes-gestao/respostas-rapidas')
export class RespostasRapidasController {
  constructor(private readonly respostas: RespostasRapidasService) {}

  @Get()
  @RequirePermission('configuracoes-gestao.respostas-rapidas.ver')
  @ApiOperation({ summary: 'Lista paginada, com busca (título, mensagem, categoria, atalho)' })
  @ApiZodQuery(listRespostasRapidasQuerySchema)
  @ApiZodResponse(200, respostaRapidaPageSchema)
  @ApiErrorResponses(400, 401, 403)
  list(
    @Query(new ZodValidationPipe(listRespostasRapidasQuerySchema)) query: ListRespostasRapidasQuery,
  ): Promise<Page<RespostaRapida>> {
    return this.respostas.list(query);
  }

  @Get(':id')
  @RequirePermission('configuracoes-gestao.respostas-rapidas.ver')
  @ApiOperation({ summary: 'Detalhe' })
  @ApiZodResponse(200, respostaRapidaSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  findById(@IdParam() id: string): Promise<RespostaRapida> {
    return this.respostas.findById(id);
  }

  @Post()
  @RequirePermission('configuracoes-gestao.respostas-rapidas.criar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Cria' })
  @ApiZodBody(createRespostaRapidaSchema)
  @ApiZodResponse(201, respostaRapidaSchema)
  @ApiErrorResponses(400, 401, 403)
  create(
    @Body(new ZodValidationPipe(createRespostaRapidaSchema)) body: CreateRespostaRapidaInput,
  ): Promise<RespostaRapida> {
    return this.respostas.create(body);
  }

  @Patch(':id')
  @RequirePermission('configuracoes-gestao.respostas-rapidas.editar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Altera (substitui todos os campos)' })
  @ApiZodBody(updateRespostaRapidaSchema)
  @ApiZodResponse(200, respostaRapidaSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  update(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(updateRespostaRapidaSchema)) body: UpdateRespostaRapidaInput,
  ): Promise<RespostaRapida> {
    return this.respostas.update(id, body);
  }

  @Delete(':id')
  @RequirePermission('configuracoes-gestao.respostas-rapidas.excluir')
  @HttpCode(200)
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Exclui (exclusão lógica)' })
  @ApiZodResponse(200, respostaRapidaSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  remove(@IdParam() id: string): Promise<RespostaRapida> {
    return this.respostas.remove(id);
  }
}
