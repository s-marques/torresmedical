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
  createPerfilSchema,
  exportPerfisQuerySchema,
  listPerfisQuerySchema,
  perfilPageSchema,
  perfilSchema,
  updatePerfilSchema,
  type CreatePerfilInput,
  type ExportPerfisQuery,
  type ListPerfisQuery,
  type Perfil,
  type UpdatePerfilInput,
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
import { PerfisAcessoService } from './perfis-acesso.service';

const ENTITY = 'Perfil';

/** Tela Perfis de Acesso (`/perfis`). */
@ApiTags('Configurações / Gestão: Perfis de Acesso')
@Controller('configuracoes-gestao/perfis-acesso')
export class PerfisAcessoController {
  constructor(private readonly perfis: PerfisAcessoService) {}

  @Get()
  @RequirePermission('configuracoes-gestao.perfis-acesso.ver')
  @ApiOperation({ summary: 'Lista paginada, com busca, filtro de status e ordenação' })
  @ApiZodQuery(listPerfisQuerySchema)
  @ApiZodResponse(200, perfilPageSchema)
  @ApiErrorResponses(400, 401, 403)
  list(
    @Query(new ZodValidationPipe(listPerfisQuerySchema)) query: ListPerfisQuery,
  ): Promise<Page<Perfil>> {
    return this.perfis.list(query);
  }

  // Antes de ":id" para "export" não ser tratado como id.
  @Get('export')
  @RequirePermission('configuracoes-gestao.perfis-acesso.exportar')
  @Audit({ entity: ENTITY, action: 'EXPORT' })
  @ApiOperation({
    summary: 'Exporta em Excel ou PDF com os mesmos filtros e ordenação da listagem',
  })
  @ApiZodQuery(exportPerfisQuerySchema)
  @ApiProduces(
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/pdf',
    'text/csv',
  )
  @ApiErrorResponses(400, 401, 403, 422)
  async export(
    @Query(new ZodValidationPipe(exportPerfisQuerySchema)) query: ExportPerfisQuery,
  ): Promise<StreamableFile> {
    return toStreamableFile(await this.perfis.export(query));
  }

  @Get(':id')
  @RequirePermission('configuracoes-gestao.perfis-acesso.ver')
  @ApiOperation({ summary: 'Detalhe' })
  @ApiZodResponse(200, perfilSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  findById(@IdParam() id: string): Promise<Perfil> {
    return this.perfis.findById(id);
  }

  @Post()
  @RequirePermission('configuracoes-gestao.perfis-acesso.criar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Cria' })
  @ApiZodBody(createPerfilSchema)
  @ApiZodResponse(201, perfilSchema)
  @ApiErrorResponses(400, 401, 403)
  create(
    @Body(new ZodValidationPipe(createPerfilSchema)) body: CreatePerfilInput,
  ): Promise<Perfil> {
    return this.perfis.create(body);
  }

  @Patch(':id')
  @RequirePermission('configuracoes-gestao.perfis-acesso.editar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Altera' })
  @ApiZodBody(updatePerfilSchema)
  @ApiZodResponse(200, perfilSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  update(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(updatePerfilSchema)) body: UpdatePerfilInput,
  ): Promise<Perfil> {
    return this.perfis.update(id, body);
  }

  @Post(':id/duplicar')
  @RequirePermission('configuracoes-gestao.perfis-acesso.criar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Duplica o perfil (inclusive um padrão) com todas as permissões' })
  @ApiZodResponse(201, perfilSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  duplicar(@IdParam() id: string): Promise<Perfil> {
    return this.perfis.duplicar(id);
  }

  @Delete(':id')
  @RequirePermission('configuracoes-gestao.perfis-acesso.excluir')
  @HttpCode(200)
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Exclui (exclusão lógica)' })
  @ApiZodResponse(200, perfilSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  remove(@IdParam() id: string): Promise<Perfil> {
    return this.perfis.remove(id);
  }
}
