import { Body, Controller, Get, Patch, Post, Query, StreamableFile } from '@nestjs/common';
import { ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import {
  createUsuarioSchema,
  exportUsuariosQuerySchema,
  listUsuariosQuerySchema,
  resetarSenhaUsuarioSchema,
  updateUsuarioSchema,
  usuarioPageSchema,
  usuarioSchema,
  type CreateUsuarioInput,
  type ExportUsuariosQuery,
  type ListUsuariosQuery,
  type ResetarSenhaUsuarioInput,
  type Usuario,
  type UsuarioPage,
  type UpdateUsuarioInput,
} from '@torres/shared';
import { Audit } from '../../../common/audit/audit.decorator';
import { CurrentUser, RequirePermission } from '../../../common/auth/auth.decorators';
import type { UsuarioAutenticado } from '../../../common/auth/usuario-autenticado';
import { toStreamableFile } from '../../../common/export/export-response';
import {
  ApiErrorResponses,
  ApiZodBody,
  ApiZodQuery,
  ApiZodResponse,
} from '../../../common/swagger/zod-openapi';
import { IdParam } from '../../../common/validation/id-param.decorator';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { UsuariosService } from './usuarios.service';

const ENTITY = 'Usuario';

/** Tela Usuários (`/usuarios`). */
@ApiTags('Configurações / Gestão: Usuários')
@Controller('configuracoes-gestao/usuarios')
export class UsuariosController {
  constructor(private readonly usuarios: UsuariosService) {}

  @Get()
  @RequirePermission('configuracoes-gestao.usuarios.ver')
  @ApiOperation({ summary: 'Lista paginada, com busca, filtro de status e ordenação' })
  @ApiZodQuery(listUsuariosQuerySchema)
  @ApiZodResponse(200, usuarioPageSchema)
  @ApiErrorResponses(400, 401, 403)
  list(
    @Query(new ZodValidationPipe(listUsuariosQuerySchema)) query: ListUsuariosQuery,
  ): Promise<UsuarioPage> {
    return this.usuarios.list(query);
  }

  // Antes de ":id" para "export" não ser tratado como id.
  @Get('export')
  @RequirePermission('configuracoes-gestao.usuarios.exportar')
  @Audit({ entity: ENTITY, action: 'EXPORT' })
  @ApiOperation({
    summary: 'Exporta em Excel ou PDF com os mesmos filtros e ordenação da listagem',
  })
  @ApiZodQuery(exportUsuariosQuerySchema)
  @ApiProduces(
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/pdf',
  )
  @ApiErrorResponses(400, 401, 403, 422)
  async export(
    @Query(new ZodValidationPipe(exportUsuariosQuerySchema)) query: ExportUsuariosQuery,
  ): Promise<StreamableFile> {
    return toStreamableFile(await this.usuarios.export(query));
  }

  @Get(':id')
  @RequirePermission('configuracoes-gestao.usuarios.ver')
  @ApiOperation({ summary: 'Detalhe (ação "Visualizar")' })
  @ApiZodResponse(200, usuarioSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  findById(@IdParam() id: string): Promise<Usuario> {
    return this.usuarios.findByIdDto(id);
  }

  @Post()
  @RequirePermission('configuracoes-gestao.usuarios.criar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Cria (Novo Usuario)' })
  @ApiZodBody(createUsuarioSchema)
  @ApiZodResponse(201, usuarioSchema)
  @ApiErrorResponses(400, 401, 403, 409)
  create(
    @Body(new ZodValidationPipe(createUsuarioSchema)) body: CreateUsuarioInput,
    @CurrentUser() criador: UsuarioAutenticado,
  ): Promise<Usuario> {
    return this.usuarios.create(body, criador.id);
  }

  @Patch(':id')
  @RequirePermission('configuracoes-gestao.usuarios.editar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Altera (Editar Usuario, inclusive a ação "Desativar")' })
  @ApiZodBody(updateUsuarioSchema)
  @ApiZodResponse(200, usuarioSchema)
  @ApiErrorResponses(400, 401, 403, 404, 409)
  update(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(updateUsuarioSchema)) body: UpdateUsuarioInput,
  ): Promise<Usuario> {
    return this.usuarios.update(id, body);
  }

  @Patch(':id/resetar-senha')
  @RequirePermission('configuracoes-gestao.usuarios.editar')
  @Audit({ entity: ENTITY, model: 'Usuario' })
  @ApiOperation({ summary: 'Reseta a senha (ação "Resetar Senha" do menu da linha)' })
  @ApiZodBody(resetarSenhaUsuarioSchema)
  @ApiZodResponse(200, usuarioSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  resetarSenha(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(resetarSenhaUsuarioSchema)) body: ResetarSenhaUsuarioInput,
  ): Promise<Usuario> {
    return this.usuarios.resetarSenha(id, body);
  }
}
