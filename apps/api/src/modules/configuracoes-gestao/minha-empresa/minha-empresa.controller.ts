import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  empresaInputSchema,
  empresaLogoInputSchema,
  empresaSchema,
  horariosFuncionamentoResponseSchema,
  salvarHorariosFuncionamentoSchema,
  usuariosResponseSchema,
  type Empresa,
  type EmpresaInput,
  type EmpresaLogoInput,
  type SalvarHorariosFuncionamentoInput,
} from '@torres/shared';
import { CurrentUser, RequirePermission } from '../../../common/auth/auth.decorators';
import type { UsuarioAutenticado } from '../../../common/auth/usuario-autenticado';
import { ApiErrorResponses, ApiZodBody, ApiZodResponse } from '../../../common/swagger/zod-openapi';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { MinhaEmpresaService } from './minha-empresa.service';

/**
 * Tela "Minha Empresa" (`/settings/empresa`): abas Dados, Usuários e Horários. Nenhuma rota
 * tem `:id` (a empresa vem do usuário logado, não da URL): a auditoria é gravada manualmente
 * no service, não com `@Audit` (CLAUDE.md, seção 4).
 */
@ApiTags('Configurações / Gestão: Minha Empresa')
@Controller('configuracoes-gestao/minha-empresa')
export class MinhaEmpresaController {
  constructor(private readonly minhaEmpresa: MinhaEmpresaService) {}

  @Get()
  @RequirePermission('configuracoes-gestao.minha-empresa.ver')
  @ApiOperation({ summary: 'Dados cadastrais da empresa do usuário logado (aba Dados)' })
  @ApiZodResponse(200, empresaSchema)
  @ApiErrorResponses(401, 403)
  obterDados(@CurrentUser() usuario: UsuarioAutenticado): Promise<Empresa> {
    return this.minhaEmpresa.obterDados(usuario.empresaId);
  }

  @Put()
  @RequirePermission('configuracoes-gestao.minha-empresa.editar')
  @ApiOperation({ summary: '"Salvar Alterações" da aba Dados' })
  @ApiZodBody(empresaInputSchema)
  @ApiZodResponse(200, empresaSchema)
  @ApiErrorResponses(400, 401, 403, 409)
  atualizarDados(
    @Body(new ZodValidationPipe(empresaInputSchema)) body: EmpresaInput,
    @CurrentUser() usuario: UsuarioAutenticado,
  ): Promise<Empresa> {
    return this.minhaEmpresa.atualizarDados(usuario.empresaId, body);
  }

  @Put('logo')
  @RequirePermission('configuracoes-gestao.minha-empresa.editar')
  @ApiOperation({ summary: '"Trocar logo" (arquivo já enviado em /api/arquivos)' })
  @ApiZodBody(empresaLogoInputSchema)
  @ApiZodResponse(200, empresaSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  definirLogo(
    @Body(new ZodValidationPipe(empresaLogoInputSchema)) body: EmpresaLogoInput,
    @CurrentUser() usuario: UsuarioAutenticado,
  ): Promise<Empresa> {
    return this.minhaEmpresa.definirLogo(usuario.empresaId, body.arquivoId);
  }

  @Get('usuarios')
  @RequirePermission('configuracoes-gestao.minha-empresa.ver')
  @ApiOperation({ summary: 'Lista somente leitura da aba Usuários' })
  @ApiErrorResponses(401, 403)
  async listarUsuarios(@CurrentUser() usuario: UsuarioAutenticado) {
    const data = await this.minhaEmpresa.listarUsuarios(usuario.empresaId);
    return usuariosResponseSchema.parse({ data });
  }

  @Get('horarios')
  @RequirePermission('configuracoes-gestao.minha-empresa.ver')
  @ApiOperation({ summary: 'Horário de funcionamento dos 7 dias da semana' })
  @ApiErrorResponses(401, 403)
  async listarHorarios(@CurrentUser() usuario: UsuarioAutenticado) {
    const data = await this.minhaEmpresa.listarHorarios(usuario.empresaId);
    return horariosFuncionamentoResponseSchema.parse({ data });
  }

  @Put('horarios')
  @RequirePermission('configuracoes-gestao.minha-empresa.editar')
  @ApiOperation({ summary: '"Salvar Horários": substitui a semana inteira' })
  @ApiZodBody(salvarHorariosFuncionamentoSchema)
  @ApiErrorResponses(400, 401, 403)
  async salvarHorarios(
    @Body(new ZodValidationPipe(salvarHorariosFuncionamentoSchema))
    body: SalvarHorariosFuncionamentoInput,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    const data = await this.minhaEmpresa.salvarHorarios(usuario.empresaId, body);
    return horariosFuncionamentoResponseSchema.parse({ data });
  }
}
