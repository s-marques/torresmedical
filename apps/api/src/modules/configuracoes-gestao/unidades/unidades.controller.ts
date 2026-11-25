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
  createUnidadeSchema,
  exportUnidadesQuerySchema,
  listUnidadesQuerySchema,
  unidadePageSchema,
  unidadeSchema,
  updateUnidadeSchema,
  type CreateUnidadeInput,
  type ExportUnidadesQuery,
  type ListUnidadesQuery,
  type UpdateUnidadeInput,
} from '@torres/shared';
import type { Unidade } from '../../../generated/prisma/client';
import { Audit } from '../../../common/audit/audit.decorator';
import { CurrentUser, RequirePermission } from '../../../common/auth/auth.decorators';
import type { UsuarioAutenticado } from '../../../common/auth/usuario-autenticado';
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
import { UnidadesService } from './unidades.service';

const ENTITY = 'Unidade';

/**
 * Recurso de referência do padrão de API. As unidades fazem parte da tela Minha Empresa,
 * por isso usam as permissões `configuracoes-gestao.minha-empresa.<acao>`.
 */
@ApiTags('Configurações / Gestão: Unidades')
@Controller('configuracoes-gestao/unidades')
export class UnidadesController {
  constructor(private readonly unidades: UnidadesService) {}

  @Get()
  @RequirePermission('configuracoes-gestao.minha-empresa.ver')
  @ApiOperation({ summary: 'Lista paginada, com busca, filtros e ordenação' })
  @ApiZodQuery(listUnidadesQuerySchema)
  @ApiZodResponse(200, unidadePageSchema)
  @ApiErrorResponses(400, 401, 403)
  list(
    @Query(new ZodValidationPipe(listUnidadesQuerySchema)) query: ListUnidadesQuery,
    @CurrentUser() usuario: UsuarioAutenticado,
  ): Promise<Page<Unidade>> {
    return this.unidades.list(query, usuario.empresaId);
  }

  // Antes de ":id" para "export" não ser tratado como id.
  @Get('export')
  @RequirePermission('configuracoes-gestao.minha-empresa.exportar')
  @Audit({ entity: ENTITY, action: 'EXPORT' })
  @ApiOperation({
    summary: 'Exporta em Excel ou PDF com os mesmos filtros e ordenação da listagem',
  })
  @ApiZodQuery(exportUnidadesQuerySchema)
  @ApiProduces(
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/pdf',
    'text/csv',
  )
  @ApiErrorResponses(400, 401, 403, 422)
  async export(
    @Query(new ZodValidationPipe(exportUnidadesQuerySchema)) query: ExportUnidadesQuery,
    @CurrentUser() usuario: UsuarioAutenticado,
  ): Promise<StreamableFile> {
    return toStreamableFile(await this.unidades.export(query, usuario.empresaId));
  }

  @Get(':id')
  @RequirePermission('configuracoes-gestao.minha-empresa.ver')
  @ApiOperation({ summary: 'Detalhe' })
  @ApiZodResponse(200, unidadeSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  findById(@IdParam() id: string, @CurrentUser() usuario: UsuarioAutenticado): Promise<Unidade> {
    return this.unidades.findByIdDaEmpresa(id, usuario.empresaId);
  }

  @Post()
  @RequirePermission('configuracoes-gestao.minha-empresa.criar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Cria' })
  @ApiZodBody(createUnidadeSchema)
  @ApiZodResponse(201, unidadeSchema)
  @ApiErrorResponses(400, 401, 403, 409, 422)
  create(
    @Body(new ZodValidationPipe(createUnidadeSchema)) body: CreateUnidadeInput,
    @CurrentUser() usuario: UsuarioAutenticado,
  ): Promise<Unidade> {
    return this.unidades.create(body, usuario.empresaId);
  }

  @Patch(':id')
  @RequirePermission('configuracoes-gestao.minha-empresa.editar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Altera' })
  @ApiZodBody(updateUnidadeSchema)
  @ApiZodResponse(200, unidadeSchema)
  @ApiErrorResponses(400, 401, 403, 404, 409)
  update(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(updateUnidadeSchema)) body: UpdateUnidadeInput,
    @CurrentUser() usuario: UsuarioAutenticado,
  ): Promise<Unidade> {
    return this.unidades.update(id, body, usuario.empresaId);
  }

  @Delete(':id')
  @RequirePermission('configuracoes-gestao.minha-empresa.excluir')
  @HttpCode(200)
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Exclui (exclusão lógica)' })
  @ApiZodResponse(200, unidadeSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  remove(@IdParam() id: string, @CurrentUser() usuario: UsuarioAutenticado): Promise<Unidade> {
    return this.unidades.remove(id, usuario.empresaId);
  }
}
