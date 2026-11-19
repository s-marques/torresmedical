import { Body, Controller, Get, Patch, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  atualizarPreferenciasSchema,
  meuAvatarInputSchema,
  meuPerfilInputSchema,
  meuPerfilSchema,
  preferenciasSchema,
  type AtualizarPreferenciasInput,
  type MeuAvatarInput,
  type MeuPerfil,
  type MeuPerfilInput,
  type Preferencias,
} from '@torres/shared';
import { CurrentUser, RequirePermission } from '../../../common/auth/auth.decorators';
import type { UsuarioAutenticado } from '../../../common/auth/usuario-autenticado';
import { ApiErrorResponses, ApiZodBody, ApiZodResponse } from '../../../common/swagger/zod-openapi';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { ConfiguracoesService } from './configuracoes.service';

/**
 * Tela "Configurações" (`/settings`, issue #30): abas Perfil, Preferências e Aparência do
 * usuário logado. Permissões `configuracoes-gestao.configuracoes.<ver|editar>` (confirmado
 * pelo dev). Sem `:id`: o usuário vem da sessão e a auditoria é gravada no service.
 */
@ApiTags('Configurações / Gestão: Configurações')
@Controller('configuracoes-gestao/configuracoes')
export class ConfiguracoesController {
  constructor(private readonly configuracoes: ConfiguracoesService) {}

  @Get('perfil')
  @RequirePermission('configuracoes-gestao.configuracoes.ver')
  @ApiOperation({ summary: 'Dados do usuário logado (aba Perfil)' })
  @ApiZodResponse(200, meuPerfilSchema)
  @ApiErrorResponses(401, 403)
  obterPerfil(@CurrentUser() usuario: UsuarioAutenticado): Promise<MeuPerfil> {
    return this.configuracoes.obterPerfil(usuario.id);
  }

  @Put('perfil')
  @RequirePermission('configuracoes-gestao.configuracoes.editar')
  @ApiOperation({ summary: '"Salvar Alterações" da aba Perfil' })
  @ApiZodBody(meuPerfilInputSchema)
  @ApiZodResponse(200, meuPerfilSchema)
  @ApiErrorResponses(400, 401, 403, 409)
  atualizarPerfil(
    @Body(new ZodValidationPipe(meuPerfilInputSchema)) body: MeuPerfilInput,
    @CurrentUser() usuario: UsuarioAutenticado,
  ): Promise<MeuPerfil> {
    return this.configuracoes.atualizarPerfil(usuario.id, body);
  }

  @Put('perfil/avatar')
  @RequirePermission('configuracoes-gestao.configuracoes.editar')
  @ApiOperation({ summary: '"Enviar avatar" (arquivo já enviado em /api/arquivos, uso avatar)' })
  @ApiZodBody(meuAvatarInputSchema)
  @ApiZodResponse(200, meuPerfilSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  definirAvatar(
    @Body(new ZodValidationPipe(meuAvatarInputSchema)) body: MeuAvatarInput,
    @CurrentUser() usuario: UsuarioAutenticado,
  ): Promise<MeuPerfil> {
    return this.configuracoes.definirAvatar(usuario.id, body.arquivoId);
  }

  @Get('preferencias')
  @RequirePermission('configuracoes-gestao.configuracoes.ver')
  @ApiOperation({ summary: 'Preferências e aparência do usuário logado' })
  @ApiZodResponse(200, preferenciasSchema)
  @ApiErrorResponses(401, 403)
  obterPreferencias(@CurrentUser() usuario: UsuarioAutenticado): Promise<Preferencias> {
    return this.configuracoes.obterPreferencias(usuario.id);
  }

  @Patch('preferencias')
  @RequirePermission('configuracoes-gestao.configuracoes.editar')
  @ApiOperation({ summary: 'Grava interruptores (Preferências) e opções (Aparência) alterados' })
  @ApiZodBody(atualizarPreferenciasSchema)
  @ApiZodResponse(200, preferenciasSchema)
  @ApiErrorResponses(400, 401, 403)
  atualizarPreferencias(
    @Body(new ZodValidationPipe(atualizarPreferenciasSchema)) body: AtualizarPreferenciasInput,
    @CurrentUser() usuario: UsuarioAutenticado,
  ): Promise<Preferencias> {
    return this.configuracoes.atualizarPreferencias(usuario.id, body);
  }
}
