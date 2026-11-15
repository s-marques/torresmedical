import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  confirmarSemCobrancaSchema,
  contratoSalaSchema,
  gerarCobrancasMesResumoSchema,
  gerarParcelaContratoSchema,
  type ConfirmarSemCobrancaInput,
  type ContratoSala,
  type GerarCobrancasMesResumo,
  type GerarParcelaContratoInput,
} from '@torres/shared';
import { RequirePermission } from '../../../common/auth/auth.decorators';
import { ApiErrorResponses, ApiZodBody, ApiZodResponse } from '../../../common/swagger/zod-openapi';
import { IdParam } from '../../../common/validation/id-param.decorator';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { ContratosSalaCobrancaService } from './contratos-sala-cobranca.service';

/**
 * Cobranças da aba Contratos (issue #115). A auditoria de cada conta a receber criada ou
 * cancelada é gravada pelo `ContasReceberService` (entidade `ContaReceber`), não por este
 * controller: as rotas aqui não criam/alteram `ContratoSala` diretamente.
 */
@ApiTags('Gestão Profissionais: Cobranças dos contratos de salas')
@Controller('gestao-profissionais/contratos-sala')
export class ContratosSalaCobrancaController {
  constructor(private readonly cobrancas: ContratosSalaCobrancaService) {}

  // Antes de ":id" (no ContratosSalaController) para não ser tratado como id.
  @Post('gerar-cobrancas-mes')
  @RequirePermission('gestao-profissionais.salas.editar')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Gera a cobrança do mês atual dos contratos Mensal ativos, sem duplicar',
  })
  @ApiZodResponse(200, gerarCobrancasMesResumoSchema)
  @ApiErrorResponses(401, 403)
  gerarCobrancasDoMes(): Promise<GerarCobrancasMesResumo> {
    return this.cobrancas.gerarCobrancasDoMes();
  }

  @Post(':id/gerar-parcela')
  @RequirePermission('gestao-profissionais.salas.editar')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Gera a parcela do mês informado manualmente (linha "Contrato sem cobrança")',
  })
  @ApiZodBody(gerarParcelaContratoSchema)
  @ApiZodResponse(200, contratoSalaSchema)
  @ApiErrorResponses(400, 401, 403, 404, 409)
  gerarParcela(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(gerarParcelaContratoSchema)) body: GerarParcelaContratoInput,
  ): Promise<ContratoSala> {
    return this.cobrancas.gerarParcela(id, body);
  }

  @Post(':id/confirmar-sem-cobranca')
  @RequirePermission('gestao-profissionais.salas.editar')
  @HttpCode(204)
  @ApiOperation({ summary: 'Confirma que o contrato não terá cobrança no mês informado' })
  @ApiZodBody(confirmarSemCobrancaSchema)
  @ApiErrorResponses(400, 401, 403, 404, 409)
  async confirmarSemCobranca(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(confirmarSemCobrancaSchema)) body: ConfirmarSemCobrancaInput,
  ): Promise<void> {
    await this.cobrancas.confirmarSemCobranca(id, body);
  }
}
