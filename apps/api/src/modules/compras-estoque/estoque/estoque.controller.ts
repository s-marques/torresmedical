import { Body, Controller, Get, Post, Query, StreamableFile } from '@nestjs/common';
import { ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import {
  ajusteEstoqueSchema,
  alertasEstoqueSchema,
  entradaEstoqueSchema,
  exportSugestaoQuerySchema,
  listMovimentacoesQuerySchema,
  listPosicaoQuerySchema,
  listSugestaoQuerySchema,
  movimentacaoEstoquePageSchema,
  movimentacaoEstoqueSchema,
  posicaoEstoquePageSchema,
  resumoEstoqueSchema,
  saidaEstoqueSchema,
  sugestaoCompraPageSchema,
  type AjusteEstoqueInput,
  type AlertasEstoque,
  type EntradaEstoqueInput,
  type ExportSugestaoQuery,
  type ListMovimentacoesQuery,
  type ListPosicaoQuery,
  type ListSugestaoQuery,
  type MovimentacaoEstoque,
  type PosicaoEstoque,
  type ResumoEstoque,
  type SaidaEstoqueInput,
  type SugestaoCompra,
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
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { EstoqueService } from './estoque.service';

const ENTITY = 'MovimentacaoEstoque';

/** Tela Estoque (`/estoque`). */
@ApiTags('Compras / Estoque: Estoque')
@Controller('compras-estoque/estoque')
export class EstoqueController {
  constructor(private readonly estoque: EstoqueService) {}

  @Get('resumo')
  @RequirePermission('compras-estoque.estoque.ver')
  @ApiOperation({ summary: 'Cards do topo: totais, valor em estoque e movimentações em 24 h' })
  @ApiZodResponse(200, resumoEstoqueSchema)
  @ApiErrorResponses(401, 403)
  resumo(): Promise<ResumoEstoque> {
    return this.estoque.resumo();
  }

  @Get('posicao')
  @RequirePermission('compras-estoque.estoque.ver')
  @ApiOperation({ summary: 'Aba Posição: saldo por produto, com status, categoria e busca' })
  @ApiZodQuery(listPosicaoQuerySchema)
  @ApiZodResponse(200, posicaoEstoquePageSchema)
  @ApiErrorResponses(400, 401, 403)
  posicao(
    @Query(new ZodValidationPipe(listPosicaoQuerySchema)) query: ListPosicaoQuery,
  ): Promise<Page<PosicaoEstoque>> {
    return this.estoque.posicao(query);
  }

  @Get('movimentacoes')
  @RequirePermission('compras-estoque.estoque.ver')
  @ApiOperation({ summary: 'Aba Movimentações: histórico com tipo, período e busca' })
  @ApiZodQuery(listMovimentacoesQuerySchema)
  @ApiZodResponse(200, movimentacaoEstoquePageSchema)
  @ApiErrorResponses(400, 401, 403)
  movimentacoes(
    @Query(new ZodValidationPipe(listMovimentacoesQuerySchema)) query: ListMovimentacoesQuery,
  ): Promise<Page<MovimentacaoEstoque>> {
    return this.estoque.movimentacoes(query);
  }

  @Get('alertas')
  @RequirePermission('compras-estoque.estoque.ver')
  @ApiOperation({ summary: 'Aba Alertas: produtos abaixo do estoque mínimo' })
  @ApiZodResponse(200, alertasEstoqueSchema)
  @ApiErrorResponses(401, 403)
  alertas(): Promise<AlertasEstoque> {
    return this.estoque.alertas();
  }

  @Get('sugestao')
  @RequirePermission('compras-estoque.estoque.ver')
  @ApiOperation({
    summary: 'Aba Sugestão: compra sugerida pelo consumo médio (90 dias) e pelo estoque mínimo',
  })
  @ApiZodQuery(listSugestaoQuerySchema)
  @ApiZodResponse(200, sugestaoCompraPageSchema)
  @ApiErrorResponses(400, 401, 403)
  sugestao(
    @Query(new ZodValidationPipe(listSugestaoQuerySchema)) query: ListSugestaoQuery,
  ): Promise<Page<SugestaoCompra>> {
    return this.estoque.sugestao(query);
  }

  @Get('sugestao/export')
  @RequirePermission('compras-estoque.estoque.exportar')
  @Audit({ entity: 'SugestaoCompra', action: 'EXPORT' })
  @ApiOperation({ summary: 'Exporta a sugestão de compra com os mesmos filtros e ordenação' })
  @ApiZodQuery(exportSugestaoQuerySchema)
  @ApiProduces(
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/pdf',
    'text/csv',
  )
  @ApiErrorResponses(400, 401, 403, 422)
  async exportSugestao(
    @Query(new ZodValidationPipe(exportSugestaoQuerySchema)) query: ExportSugestaoQuery,
  ): Promise<StreamableFile> {
    return toStreamableFile(await this.estoque.exportSugestao(query));
  }

  @Post('entradas')
  @RequirePermission('compras-estoque.estoque.criar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Entrada Manual: soma no saldo do produto' })
  @ApiZodBody(entradaEstoqueSchema)
  @ApiZodResponse(201, movimentacaoEstoqueSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  entrada(
    @Body(new ZodValidationPipe(entradaEstoqueSchema)) body: EntradaEstoqueInput,
  ): Promise<MovimentacaoEstoque> {
    return this.estoque.entrada(body);
  }

  @Post('saidas')
  @RequirePermission('compras-estoque.estoque.criar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Saída Manual: subtrai do saldo, sem deixar negativo' })
  @ApiZodBody(saidaEstoqueSchema)
  @ApiZodResponse(201, movimentacaoEstoqueSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  saida(
    @Body(new ZodValidationPipe(saidaEstoqueSchema)) body: SaidaEstoqueInput,
  ): Promise<MovimentacaoEstoque> {
    return this.estoque.saida(body);
  }

  @Post('ajustes')
  @RequirePermission('compras-estoque.estoque.editar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Ajuste Individual: o saldo passa a ser a quantidade contada' })
  @ApiZodBody(ajusteEstoqueSchema)
  @ApiZodResponse(201, movimentacaoEstoqueSchema)
  @ApiErrorResponses(400, 401, 403, 404, 409)
  ajuste(
    @Body(new ZodValidationPipe(ajusteEstoqueSchema)) body: AjusteEstoqueInput,
  ): Promise<MovimentacaoEstoque> {
    return this.estoque.ajuste(body);
  }
}
