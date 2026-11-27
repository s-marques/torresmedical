import { Controller, Get, Query, StreamableFile } from '@nestjs/common';
import { ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import {
  apresentacaoMensalQuerySchema,
  apresentacaoMensalSchema,
  type ApresentacaoMensal,
  type ApresentacaoMensalQuery,
} from '@torres/shared';
import { Audit } from '../../../common/audit/audit.decorator';
import { CurrentUser, RequirePermission } from '../../../common/auth/auth.decorators';
import type { UsuarioAutenticado } from '../../../common/auth/usuario-autenticado';
import { toStreamableFile } from '../../../common/export/export-response';
import { ApiErrorResponses, ApiZodQuery, ApiZodResponse } from '../../../common/swagger/zod-openapi';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { escreverApresentacaoPdf } from './apresentacao-pdf.writer';
import { ApresentacaoMensalService } from './apresentacao-mensal.service';

/** Entidade gravada no audit_log da exportação do PDF. */
export const ENTIDADE_APRESENTACAO_MENSAL = 'ApresentacaoMensal';

/**
 * Relatório mensal de apresentação da gestão (issue #171), dentro da tela Relatórios de Gestão
 * (`/gestao/relatorios`): os 10 indicadores do mês e o PDF, uma página por indicador.
 */
@ApiTags('Configurações / Gestão: apresentação mensal')
@Controller('configuracoes-gestao/apresentacao-mensal')
export class ApresentacaoMensalController {
  constructor(private readonly apresentacao: ApresentacaoMensalService) {}

  @Get()
  @RequirePermission('configuracoes-gestao.relatorios.ver')
  @ApiOperation({ summary: 'Indicadores do mês para a reunião mensal da gestão' })
  @ApiZodQuery(apresentacaoMensalQuerySchema)
  @ApiZodResponse(200, apresentacaoMensalSchema)
  @ApiErrorResponses(400, 401, 403)
  obter(
    @Query(new ZodValidationPipe(apresentacaoMensalQuerySchema)) { mes }: ApresentacaoMensalQuery,
    @CurrentUser() usuario: UsuarioAutenticado,
  ): Promise<ApresentacaoMensal> {
    return this.apresentacao.gerar(mes, usuario);
  }

  @Get('pdf')
  @RequirePermission('configuracoes-gestao.relatorios.exportar')
  @Audit({ entity: ENTIDADE_APRESENTACAO_MENSAL, action: 'EXPORT' })
  @ApiOperation({ summary: 'PDF em formato de apresentação, uma página por indicador' })
  @ApiZodQuery(apresentacaoMensalQuerySchema)
  @ApiProduces('application/pdf')
  @ApiErrorResponses(400, 401, 403)
  async pdf(
    @Query(new ZodValidationPipe(apresentacaoMensalQuerySchema)) { mes }: ApresentacaoMensalQuery,
    @CurrentUser() usuario: UsuarioAutenticado,
  ): Promise<StreamableFile> {
    const relatorio = await this.apresentacao.gerar(mes, usuario);
    return toStreamableFile({
      buffer: await escreverApresentacaoPdf(relatorio),
      contentType: 'application/pdf',
      filename: `apresentacao-mensal-${mes}.pdf`,
    });
  }
}

