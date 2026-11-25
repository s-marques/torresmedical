import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  buscaGlobalQuerySchema,
  buscaGlobalResponseSchema,
  type BuscaGlobalQuery,
  type BuscaGlobalResponse,
} from '@torres/shared';
import { CurrentUser, RequirePermission } from '../../../common/auth/auth.decorators';
import type { UsuarioAutenticado } from '../../../common/auth/usuario-autenticado';
import {
  ApiErrorResponses,
  ApiZodQuery,
  ApiZodResponse,
} from '../../../common/swagger/zod-openapi';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { BuscaService } from './busca.service';

/**
 * Busca global do ⌘K. Todo usuário com acesso ao Painel pode buscar; cada tipo de resultado só
 * aparece a quem vê a tela de origem do dado.
 */
@ApiTags('Painel: Busca global')
@Controller('painel/busca')
export class BuscaController {
  constructor(private readonly busca: BuscaService) {}

  @Get()
  @RequirePermission('painel.painel.ver')
  @ApiOperation({
    summary: 'Busca global por paciente, profissional, contrato, fornecedor e lead',
  })
  @ApiZodQuery(buscaGlobalQuerySchema)
  @ApiZodResponse(200, buscaGlobalResponseSchema)
  @ApiErrorResponses(400, 401, 403)
  buscar(
    @Query(new ZodValidationPipe(buscaGlobalQuerySchema)) query: BuscaGlobalQuery,
    @CurrentUser() usuario: UsuarioAutenticado,
  ): Promise<BuscaGlobalResponse> {
    return this.busca.buscar(usuario, query);
  }
}
