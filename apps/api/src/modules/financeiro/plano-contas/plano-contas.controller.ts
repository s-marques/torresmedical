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
  createPlanoContaSchema,
  exportPlanoContasQuerySchema,
  listPlanoContasQuerySchema,
  planoContaListaSchema,
  planoContaSchema,
  updatePlanoContaSchema,
  type CreatePlanoContaInput,
  type ExportPlanoContasQuery,
  type ListPlanoContasQuery,
  type UpdatePlanoContaInput,
} from '@torres/shared';
import type { PlanoConta } from '../../../generated/prisma/client';
import { Audit } from '../../../common/audit/audit.decorator';
import { RequirePermission } from '../../../common/auth/auth.decorators';
import { toStreamableFile } from '../../../common/export/export-response';
import {
  ApiErrorResponses,
  ApiZodBody,
  ApiZodQuery,
  ApiZodResponse,
} from '../../../common/swagger/zod-openapi';
import { IdParam } from '../../../common/validation/id-param.decorator';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { PlanoContasService } from './plano-contas.service';

const ENTITY = 'PlanoConta';

/** Tela Plano de Contas (`/plano-contas`). */
@ApiTags('Financeiro: Plano de Contas')
@Controller('financeiro/plano-contas')
export class PlanoContasController {
  constructor(private readonly contas: PlanoContasService) {}

  @Get()
  @RequirePermission('financeiro.plano-contas.ver')
  @ApiOperation({ summary: 'Lista todas as contas (sem paginação), com busca e filtro de tipo' })
  @ApiZodQuery(listPlanoContasQuerySchema)
  @ApiZodResponse(200, planoContaListaSchema)
  @ApiErrorResponses(400, 401, 403)
  list(
    @Query(new ZodValidationPipe(listPlanoContasQuerySchema)) query: ListPlanoContasQuery,
  ): Promise<{ data: PlanoConta[]; total: number }> {
    return this.contas.list(query);
  }

  // Antes de ":id" para "export" não ser tratado como id.
  @Get('export')
  @RequirePermission('financeiro.plano-contas.exportar')
  @Audit({ entity: ENTITY, action: 'EXPORT' })
  @ApiOperation({ summary: 'Exporta (Imprimir) em Excel ou PDF com os mesmos filtros da listagem' })
  @ApiZodQuery(exportPlanoContasQuerySchema)
  @ApiProduces(
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/pdf',
  )
  @ApiErrorResponses(400, 401, 403, 422)
  async export(
    @Query(new ZodValidationPipe(exportPlanoContasQuerySchema)) query: ExportPlanoContasQuery,
  ): Promise<StreamableFile> {
    return toStreamableFile(await this.contas.export(query));
  }

  @Get(':id')
  @RequirePermission('financeiro.plano-contas.ver')
  @ApiOperation({ summary: 'Detalhe' })
  @ApiZodResponse(200, planoContaSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  findById(@IdParam() id: string): Promise<PlanoConta> {
    return this.contas.findById(id);
  }

  @Post()
  @RequirePermission('financeiro.plano-contas.criar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Cria (Nova Conta)' })
  @ApiZodBody(createPlanoContaSchema)
  @ApiZodResponse(201, planoContaSchema)
  @ApiErrorResponses(400, 401, 403, 404, 409)
  create(
    @Body(new ZodValidationPipe(createPlanoContaSchema)) body: CreatePlanoContaInput,
  ): Promise<PlanoConta> {
    return this.contas.create(body);
  }

  @Patch(':id')
  @RequirePermission('financeiro.plano-contas.editar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Altera (Editar Conta e interruptor Ativar/Desativar com `ativo`)' })
  @ApiZodBody(updatePlanoContaSchema)
  @ApiZodResponse(200, planoContaSchema)
  @ApiErrorResponses(400, 401, 403, 404, 409, 422)
  update(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(updatePlanoContaSchema)) body: UpdatePlanoContaInput,
  ): Promise<PlanoConta> {
    return this.contas.update(id, body);
  }

  @Delete(':id')
  @RequirePermission('financeiro.plano-contas.excluir')
  @HttpCode(200)
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Exclui (exclusão lógica); bloqueada se a conta tiver subcontas' })
  @ApiZodResponse(200, planoContaSchema)
  @ApiErrorResponses(400, 401, 403, 404, 422)
  remove(@IdParam() id: string): Promise<PlanoConta> {
    return this.contas.remove(id);
  }
}
