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
  createBemSchema,
  bemPageSchema,
  bemSchema,
  exportBensQuerySchema,
  listBensQuerySchema,
  resumoPatrimonioSchema,
  updateBemSchema,
  type CreateBemInput,
  type ExportBensQuery,
  type Bem,
  type ResumoPatrimonio,
  type ListBensQuery,
  type UpdateBemInput,
} from '@torres/shared';
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
import { PatrimonioService } from './patrimonio.service';

const ENTITY = 'Bem';

/** Tela Patrimônio (`/patrimonio`). */
@ApiTags('Patrimônio & Pessoal: Patrimônio')
@Controller('patrimonio-pessoal/patrimonio')
export class PatrimonioController {
  constructor(private readonly patrimonio: PatrimonioService) {}

  @Get()
  @RequirePermission('patrimonio-pessoal.patrimonio.ver')
  @ApiOperation({ summary: 'Lista paginada, com busca e ordenação' })
  @ApiZodQuery(listBensQuerySchema)
  @ApiZodResponse(200, bemPageSchema)
  @ApiErrorResponses(400, 401, 403)
  list(
    @Query(new ZodValidationPipe(listBensQuerySchema)) query: ListBensQuery,
  ): Promise<Page<Bem>> {
    return this.patrimonio.list(query);
  }

  @Get('resumo')
  @RequirePermission('patrimonio-pessoal.patrimonio.ver')
  @ApiOperation({ summary: 'Cartões do topo: Valor Total, Impostos Pendentes e Alertas Próximos' })
  @ApiZodResponse(200, resumoPatrimonioSchema)
  @ApiErrorResponses(401, 403)
  resumo(): Promise<ResumoPatrimonio> {
    return this.patrimonio.resumo();
  }

  // Antes de ":id" para "export" não ser tratado como id.
  @Get('export')
  @RequirePermission('patrimonio-pessoal.patrimonio.exportar')
  @Audit({ entity: ENTITY, action: 'EXPORT' })
  @ApiOperation({
    summary: 'Exporta em Excel ou PDF com a mesma busca e ordenação da listagem',
  })
  @ApiZodQuery(exportBensQuerySchema)
  @ApiProduces(
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/pdf',
    'text/csv',
  )
  @ApiErrorResponses(400, 401, 403, 422)
  async export(
    @Query(new ZodValidationPipe(exportBensQuerySchema)) query: ExportBensQuery,
  ): Promise<StreamableFile> {
    return toStreamableFile(await this.patrimonio.export(query));
  }

  @Get(':id')
  @RequirePermission('patrimonio-pessoal.patrimonio.ver')
  @ApiOperation({ summary: 'Detalhe' })
  @ApiZodResponse(200, bemSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  findById(@IdParam() id: string): Promise<Bem> {
    return this.patrimonio.findById(id);
  }

  @Post()
  @RequirePermission('patrimonio-pessoal.patrimonio.criar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Cria (Novo Bem)' })
  @ApiZodBody(createBemSchema)
  @ApiZodResponse(201, bemSchema)
  @ApiErrorResponses(400, 401, 403)
  create(@Body(new ZodValidationPipe(createBemSchema)) body: CreateBemInput): Promise<Bem> {
    return this.patrimonio.create(body);
  }

  @Patch(':id')
  @RequirePermission('patrimonio-pessoal.patrimonio.editar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Altera (Editar Bem)' })
  @ApiZodBody(updateBemSchema)
  @ApiZodResponse(200, bemSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  update(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(updateBemSchema)) body: UpdateBemInput,
  ): Promise<Bem> {
    return this.patrimonio.update(id, body);
  }

  @Delete(':id')
  @RequirePermission('patrimonio-pessoal.patrimonio.excluir')
  @HttpCode(200)
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Exclui (exclusão lógica)' })
  @ApiZodResponse(200, bemSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  remove(@IdParam() id: string): Promise<Bem> {
    return this.patrimonio.remove(id);
  }
}
