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
  createImovelSchema,
  exportImoveisQuerySchema,
  imovelPageSchema,
  imovelSchema,
  listImoveisQuerySchema,
  updateImovelSchema,
  type CreateImovelInput,
  type ExportImoveisQuery,
  type Imovel,
  type ListImoveisQuery,
  type UpdateImovelInput,
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
import { ImoveisService } from './imoveis.service';

const ENTITY = 'Imovel';

/** Tela Imóveis (`/imoveis`). */
@ApiTags('Patrimônio & Pessoal: Imóveis')
@Controller('patrimonio-pessoal/imoveis')
export class ImoveisController {
  constructor(private readonly imoveis: ImoveisService) {}

  @Get()
  @RequirePermission('patrimonio-pessoal.imoveis.ver')
  @ApiOperation({ summary: 'Lista paginada, com busca e ordenação' })
  @ApiZodQuery(listImoveisQuerySchema)
  @ApiZodResponse(200, imovelPageSchema)
  @ApiErrorResponses(400, 401, 403)
  list(
    @Query(new ZodValidationPipe(listImoveisQuerySchema)) query: ListImoveisQuery,
  ): Promise<Page<Imovel>> {
    return this.imoveis.list(query);
  }

  // Antes de ":id" para "export" não ser tratado como id.
  @Get('export')
  @RequirePermission('patrimonio-pessoal.imoveis.exportar')
  @Audit({ entity: ENTITY, action: 'EXPORT' })
  @ApiOperation({
    summary: 'Exporta em Excel ou PDF com a mesma busca e ordenação da listagem',
  })
  @ApiZodQuery(exportImoveisQuerySchema)
  @ApiProduces(
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/pdf',
    'text/csv',
  )
  @ApiErrorResponses(400, 401, 403, 422)
  async export(
    @Query(new ZodValidationPipe(exportImoveisQuerySchema)) query: ExportImoveisQuery,
  ): Promise<StreamableFile> {
    return toStreamableFile(await this.imoveis.export(query));
  }

  @Get(':id')
  @RequirePermission('patrimonio-pessoal.imoveis.ver')
  @ApiOperation({ summary: 'Detalhe' })
  @ApiZodResponse(200, imovelSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  findById(@IdParam() id: string): Promise<Imovel> {
    return this.imoveis.findById(id);
  }

  @Post()
  @RequirePermission('patrimonio-pessoal.imoveis.criar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Cria (Novo Imóvel)' })
  @ApiZodBody(createImovelSchema)
  @ApiZodResponse(201, imovelSchema)
  @ApiErrorResponses(400, 401, 403)
  create(
    @Body(new ZodValidationPipe(createImovelSchema)) body: CreateImovelInput,
  ): Promise<Imovel> {
    return this.imoveis.create(body);
  }

  @Patch(':id')
  @RequirePermission('patrimonio-pessoal.imoveis.editar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Altera (Editar Imóvel)' })
  @ApiZodBody(updateImovelSchema)
  @ApiZodResponse(200, imovelSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  update(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(updateImovelSchema)) body: UpdateImovelInput,
  ): Promise<Imovel> {
    return this.imoveis.update(id, body);
  }

  @Delete(':id')
  @RequirePermission('patrimonio-pessoal.imoveis.excluir')
  @HttpCode(200)
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Exclui (exclusão lógica)' })
  @ApiZodResponse(200, imovelSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  remove(@IdParam() id: string): Promise<Imovel> {
    return this.imoveis.remove(id);
  }
}
