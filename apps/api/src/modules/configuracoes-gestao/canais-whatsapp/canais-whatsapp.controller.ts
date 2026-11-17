import { Body, Controller, Delete, Get, HttpCode, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  canalWhatsappPageSchema,
  canalWhatsappSchema,
  createCanalWhatsappSchema,
  definirUsuariosCanalWhatsappSchema,
  listCanaisWhatsappQuerySchema,
  updateCanalWhatsappSchema,
  usuariosCanalWhatsappSchema,
  type CanalWhatsapp,
  type CreateCanalWhatsappInput,
  type DefinirUsuariosCanalWhatsappInput,
  type ListCanaisWhatsappQuery,
  type UpdateCanalWhatsappInput,
  type UsuarioCanalWhatsapp,
} from '@torres/shared';
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
import { CanaisWhatsappService } from './canais-whatsapp.service';

const ENTITY = 'CanalWhatsapp';

/** Tela Agentes IA, "Canais WhatsApp" (`/agentes-ia`). */
@ApiTags('Configurações / Gestão: Agentes IA (canais WhatsApp)')
@Controller('configuracoes-gestao/canais-whatsapp')
export class CanaisWhatsappController {
  constructor(private readonly canais: CanaisWhatsappService) {}

  @Get()
  @RequirePermission('configuracoes-gestao.agentes-ia.ver')
  @ApiOperation({ summary: 'Lista os canais (cards), com busca por nome ou número' })
  @ApiZodQuery(listCanaisWhatsappQuerySchema)
  @ApiZodResponse(200, canalWhatsappPageSchema)
  @ApiErrorResponses(400, 401, 403)
  list(
    @Query(new ZodValidationPipe(listCanaisWhatsappQuerySchema)) query: ListCanaisWhatsappQuery,
  ): Promise<Page<CanalWhatsapp>> {
    return this.canais.list(query);
  }

  @Get('usuarios-disponiveis')
  @RequirePermission('configuracoes-gestao.agentes-ia.ver')
  @ApiOperation({ summary: 'Usuários ativos que podem receber acesso a um canal' })
  @ApiZodResponse(200, usuariosCanalWhatsappSchema)
  @ApiErrorResponses(401, 403)
  usuariosDisponiveis(): Promise<UsuarioCanalWhatsapp[]> {
    return this.canais.usuariosDisponiveis();
  }

  @Get(':id')
  @RequirePermission('configuracoes-gestao.agentes-ia.ver')
  @ApiOperation({ summary: 'Detalhe' })
  @ApiZodResponse(200, canalWhatsappSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  findById(@IdParam() id: string): Promise<CanalWhatsapp> {
    return this.canais.findByIdDto(id);
  }

  @Post()
  @RequirePermission('configuracoes-gestao.agentes-ia.criar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Cria o canal (DinastiAPI), desconectado' })
  @ApiZodBody(createCanalWhatsappSchema)
  @ApiZodResponse(201, canalWhatsappSchema)
  @ApiErrorResponses(400, 401, 403)
  create(
    @Body(new ZodValidationPipe(createCanalWhatsappSchema)) body: CreateCanalWhatsappInput,
  ): Promise<CanalWhatsapp> {
    return this.canais.create(body);
  }

  @Patch(':id')
  @RequirePermission('configuracoes-gestao.agentes-ia.editar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Altera nome, telefone e vínculo com o profissional' })
  @ApiZodBody(updateCanalWhatsappSchema)
  @ApiZodResponse(200, canalWhatsappSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  update(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(updateCanalWhatsappSchema)) body: UpdateCanalWhatsappInput,
  ): Promise<CanalWhatsapp> {
    return this.canais.update(id, body);
  }

  @Put(':id/usuarios')
  @RequirePermission('configuracoes-gestao.agentes-ia.editar')
  @Audit({ entity: ENTITY, action: 'UPDATE' })
  @ApiOperation({ summary: 'Define os usuários com acesso (vazio = todos)' })
  @ApiZodBody(definirUsuariosCanalWhatsappSchema)
  @ApiZodResponse(200, canalWhatsappSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  definirUsuarios(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(definirUsuariosCanalWhatsappSchema))
    body: DefinirUsuariosCanalWhatsappInput,
  ): Promise<CanalWhatsapp> {
    return this.canais.definirUsuarios(id, body);
  }

  @Delete(':id')
  @RequirePermission('configuracoes-gestao.agentes-ia.excluir')
  @HttpCode(200)
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Exclui o canal (exclusão lógica)' })
  @ApiZodResponse(200, canalWhatsappSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  remove(@IdParam() id: string): Promise<CanalWhatsapp> {
    return this.canais.remove(id);
  }
}
