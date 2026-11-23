import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  pesquisaProfissionalPublicaSchema,
  respostaPesquisaProfissionalInputSchema,
  type PesquisaProfissionalPublica,
  type RespostaPesquisaProfissionalInput,
} from '@torres/shared';
import { z } from 'zod';
import { Public } from '../../../common/auth/auth.decorators';
import { ApiErrorResponses, ApiZodBody, ApiZodResponse } from '../../../common/swagger/zod-openapi';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { PesquisaProfissionalService } from './pesquisa-profissional.service';

const tokenSchema = z.string().min(20).max(200);

/**
 * Página pública de resposta: o profissional abre o link recebido pelo WhatsApp, sem login. O
 * token (256 bits aleatórios, só o hash fica no banco) é a única credencial.
 */
@ApiTags('Comercial / Atendimento: Pesquisa do Profissional (resposta pública)')
@Controller('pesquisa-profissional-publica')
export class PesquisaProfissionalPublicaController {
  constructor(private readonly pesquisas: PesquisaProfissionalService) {}

  @Public()
  @Get(':token')
  @ApiOperation({ summary: 'Dados da pesquisa do link (nome do profissional e se está aberta)' })
  @ApiZodResponse(200, pesquisaProfissionalPublicaSchema)
  @ApiErrorResponses(400, 404)
  obter(
    @Param('token', new ZodValidationPipe(tokenSchema)) token: string,
  ): Promise<PesquisaProfissionalPublica> {
    return this.pesquisas.obterPublica(token);
  }

  @Public()
  @Post(':token')
  @HttpCode(204)
  @ApiOperation({ summary: 'Registra a resposta (só a primeira vale)' })
  @ApiZodBody(respostaPesquisaProfissionalInputSchema)
  @ApiErrorResponses(400, 404, 409, 410)
  async responder(
    @Param('token', new ZodValidationPipe(tokenSchema)) token: string,
    @Body(new ZodValidationPipe(respostaPesquisaProfissionalInputSchema))
    body: RespostaPesquisaProfissionalInput,
  ): Promise<void> {
    await this.pesquisas.responder(token, body);
  }
}
