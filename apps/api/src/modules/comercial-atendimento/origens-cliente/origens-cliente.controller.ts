import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Patch,
  Post,
  Query,
  StreamableFile,
} from '@nestjs/common';
import { ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import {
  alterarAtivaOrigemClienteSchema,
  createOrigemClienteSchema,
  exportOrigensClienteQuerySchema,
  listOrigensClienteQuerySchema,
  moverOrigemClienteSchema,
  origemClientePageSchema,
  origemClienteSchema,
  updateOrigemClienteSchema,
  type AlterarAtivaOrigemClienteInput,
  type CreateOrigemClienteInput,
  type ExportOrigensClienteQuery,
  type ListOrigensClienteQuery,
  type MoverOrigemClienteInput,
  type UpdateOrigemClienteInput,
} from '@torres/shared';
import type { OrigemCliente } from '../../../generated/prisma/client';
import { Audit } from '../../../common/audit/audit.decorator';
import { RequirePermission } from '../../../common/auth/auth.decorators';
import { toStreamableFile } from '../../../common/export/export-response';
import type { Page } from '../../../common/pagination/paginate';
import {
  ApiErrorResponses,
  ApiZodBody,
  ApiZodQuery,
  ApiZodResponse,
} from '../../../common/swagger/zod-openapi';
import { IdParam } from '../../../common/validation/id-param.decorator';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { OrigensClienteService } from './origens-cliente.service';

const ENTITY = 'OrigemCliente';

/** Tela Origens de Cliente (`/origens-cliente`). */
@ApiTags('Comercial / Atendimento: Origens de Cliente')
@Controller('comercial-atendimento/origens-cliente')
export class OrigensClienteController {
  constructor(private readonly origens: OrigensClienteService) {}

  @Get()
  @RequirePermission('comercial-atendimento.origens-cliente.ver')
  @ApiOperation({ summary: 'Lista paginada, com busca, status e ordenação' })
  @ApiZodQuery(listOrigensClienteQuerySchema)
  @ApiZodResponse(200, origemClientePageSchema)
  @ApiErrorResponses(400, 401, 403)
  list(
    @Query(new ZodValidationPipe(listOrigensClienteQuerySchema)) query: ListOrigensClienteQuery,
  ): Promise<Page<OrigemCliente>> {
    return this.origens.list(query);
  }

  // Antes de ":id" para "export" não ser tratado como id.
  @Get('export')
  @RequirePermission('comercial-atendimento.origens-cliente.exportar')
  @Audit({ entity: ENTITY, action: 'EXPORT' })
  @ApiOperation({
    summary: 'Exporta em Excel ou PDF com os mesmos filtros e ordenação da listagem',
  })
  @ApiZodQuery(exportOrigensClienteQuerySchema)
  @ApiProduces(
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/pdf',
    'text/csv',
  )
  @ApiErrorResponses(400, 401, 403, 422)
  async export(
    @Query(new ZodValidationPipe(exportOrigensClienteQuerySchema))
    query: ExportOrigensClienteQuery,
  ): Promise<StreamableFile> {
    return toStreamableFile(await this.origens.export(query));
  }

  @Get(':id')
  @RequirePermission('comercial-atendimento.origens-cliente.ver')
  @ApiOperation({ summary: 'Detalhe' })
  @ApiZodResponse(200, origemClienteSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  findById(@IdParam() id: string): Promise<OrigemCliente> {
    return this.origens.findById(id);
  }

  @Post()
  @RequirePermission('comercial-atendimento.origens-cliente.criar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Cria (Nova Origem): o código vem do nome e entra no fim da lista' })
  @ApiZodBody(createOrigemClienteSchema)
  @ApiZodResponse(201, origemClienteSchema)
  @ApiErrorResponses(400, 401, 403, 409)
  create(
    @Body(new ZodValidationPipe(createOrigemClienteSchema)) body: CreateOrigemClienteInput,
  ): Promise<OrigemCliente> {
    return this.origens.create(body);
  }

  @Patch(':id')
  @RequirePermission('comercial-atendimento.origens-cliente.editar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Renomeia (Renomear Origem)' })
  @ApiZodBody(updateOrigemClienteSchema)
  @ApiZodResponse(200, origemClienteSchema)
  @ApiErrorResponses(400, 401, 403, 404, 409)
  update(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(updateOrigemClienteSchema)) body: UpdateOrigemClienteInput,
  ): Promise<OrigemCliente> {
    return this.origens.update(id, body);
  }

  @Patch(':id/ativa')
  @RequirePermission('comercial-atendimento.origens-cliente.editar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Ativa ou desativa (interruptor Ativa)' })
  @ApiZodBody(alterarAtivaOrigemClienteSchema)
  @ApiZodResponse(200, origemClienteSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  alterarAtiva(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(alterarAtivaOrigemClienteSchema))
    body: AlterarAtivaOrigemClienteInput,
  ): Promise<OrigemCliente> {
    return this.origens.alterarAtiva(id, body.ativa);
  }

  @Patch(':id/mover')
  @RequirePermission('comercial-atendimento.origens-cliente.editar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Move para cima ou para baixo, trocando de lugar com a vizinha' })
  @ApiZodBody(moverOrigemClienteSchema)
  @ApiZodResponse(200, origemClienteSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  mover(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(moverOrigemClienteSchema)) body: MoverOrigemClienteInput,
  ): Promise<OrigemCliente> {
    return this.origens.mover(id, body);
  }

  @Delete(':id')
  @RequirePermission('comercial-atendimento.origens-cliente.excluir')
  @HttpCode(200)
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Exclui (exclusão lógica). Só se nenhum cliente estiver usando' })
  @ApiZodResponse(200, origemClienteSchema)
  @ApiErrorResponses(400, 401, 403, 404, 409)
  remove(@IdParam() id: string): Promise<OrigemCliente> {
    return this.origens.remove(id);
  }
}
