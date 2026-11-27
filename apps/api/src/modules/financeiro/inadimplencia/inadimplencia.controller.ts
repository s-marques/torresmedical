import { Body, Controller, Get, Patch, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  cobrancaEnviadaPageSchema,
  listCobrancasEnviadasQuerySchema,
  listTitulosInadimplentesQuerySchema,
  painelInadimplenciaSchema,
  reguaCobrancaSchema,
  reguaMarcoSchema,
  tituloInadimplentePageSchema,
  updateReguaMarcoSchema,
  type CobrancaEnviada,
  type ListCobrancasEnviadasQuery,
  type ListTitulosInadimplentesQuery,
  type PainelInadimplencia,
  type ReguaMarco,
  type TituloInadimplente,
  type UpdateReguaMarcoInput,
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
import { InadimplenciaService } from './inadimplencia.service';
import { ReguaCobrancaService } from './regua-cobranca.service';

/** Tela Inadimplência (`/financeiro/inadimplencia`, issue #166). */
@ApiTags('Financeiro: Inadimplência')
@Controller('financeiro/inadimplencia')
export class InadimplenciaController {
  constructor(
    private readonly inadimplencia: InadimplenciaService,
    private readonly regua: ReguaCobrancaService,
  ) {}

  @Get('painel')
  @RequirePermission('financeiro.inadimplencia.ver')
  @ApiOperation({
    summary: 'A receber hoje, vencidos (valor e quantidade), aging e inadimplentes',
  })
  @ApiZodResponse(200, painelInadimplenciaSchema)
  @ApiErrorResponses(401, 403)
  painel(): Promise<PainelInadimplencia> {
    return this.inadimplencia.painel();
  }

  @Get('titulos')
  @RequirePermission('financeiro.inadimplencia.ver')
  @ApiOperation({ summary: 'Títulos vencidos que o painel soma, com faixa e profissional' })
  @ApiZodQuery(listTitulosInadimplentesQuerySchema)
  @ApiZodResponse(200, tituloInadimplentePageSchema)
  @ApiErrorResponses(400, 401, 403)
  titulos(
    @Query(new ZodValidationPipe(listTitulosInadimplentesQuerySchema))
    query: ListTitulosInadimplentesQuery,
  ): Promise<Page<TituloInadimplente>> {
    return this.inadimplencia.titulos(query);
  }

  @Get('cobrancas')
  @RequirePermission('financeiro.inadimplencia.ver')
  @ApiOperation({ summary: 'Histórico das cobranças enviadas pela régua, por título e marco' })
  @ApiZodQuery(listCobrancasEnviadasQuerySchema)
  @ApiZodResponse(200, cobrancaEnviadaPageSchema)
  @ApiErrorResponses(400, 401, 403)
  cobrancas(
    @Query(new ZodValidationPipe(listCobrancasEnviadasQuerySchema))
    query: ListCobrancasEnviadasQuery,
  ): Promise<Page<CobrancaEnviada>> {
    return this.inadimplencia.cobrancas(query);
  }

  @Get('regua')
  @RequirePermission('financeiro.inadimplencia.ver')
  @ApiOperation({ summary: 'Os quatro marcos da régua de cobrança, em ordem' })
  @ApiZodResponse(200, reguaCobrancaSchema)
  @ApiErrorResponses(401, 403)
  listarRegua(): Promise<ReguaMarco[]> {
    return this.regua.listar();
  }

  @Patch('regua/:id')
  @RequirePermission('financeiro.inadimplencia.editar')
  @Audit({ entity: 'ReguaCobranca' })
  @ApiOperation({ summary: 'Liga ou desliga o marco, escolhe os canais e edita o texto' })
  @ApiZodBody(updateReguaMarcoSchema)
  @ApiZodResponse(200, reguaMarcoSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  atualizarRegua(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(updateReguaMarcoSchema)) body: UpdateReguaMarcoInput,
  ): Promise<ReguaMarco> {
    return this.regua.atualizar(id, body);
  }
}
