import { Controller, Get, Query, StreamableFile } from '@nestjs/common';
import { ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import {
  consultaRealizadaPageSchema,
  exportConsultasRealizadasQuerySchema,
  listConsultasRealizadasQuerySchema,
  totaisConsultasRealizadasQuerySchema,
  totaisConsultasRealizadasSchema,
  type ExportConsultasRealizadasQuery,
  type ListConsultasRealizadasQuery,
  type ConsultaRealizada,
  type TotaisConsultasRealizadas,
  type TotaisConsultasRealizadasQuery,
} from '@torres/shared';
import { Audit } from '../../../common/audit/audit.decorator';
import { RequirePermission } from '../../../common/auth/auth.decorators';
import { toStreamableFile } from '../../../common/export/export-response';
import type { Page } from '../../../common/pagination/paginate';
import {
  ApiErrorResponses,
  ApiZodQuery,
  ApiZodResponse,
} from '../../../common/swagger/zod-openapi';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { ConsultasRealizadasService } from './consultas-realizadas.service';

/** Tela Vendas/PDV (`/vendas`), aba Consultas Realizadas. */
@ApiTags('Comercial/Atendimento: Vendas/PDV')
@Controller('comercial-atendimento/vendas/consultas')
export class ConsultasRealizadasController {
  constructor(private readonly consultas: ConsultasRealizadasService) {}

  @Get()
  @RequirePermission('comercial-atendimento.vendas-pdv.ver')
  @ApiOperation({
    summary: 'Consultas realizadas (atendidas) no período, com filtro Todos/Pago/Pendente',
  })
  @ApiZodQuery(listConsultasRealizadasQuerySchema)
  @ApiZodResponse(200, consultaRealizadaPageSchema)
  @ApiErrorResponses(400, 401, 403)
  list(
    @Query(new ZodValidationPipe(listConsultasRealizadasQuerySchema))
    query: ListConsultasRealizadasQuery,
  ): Promise<Page<ConsultaRealizada>> {
    return this.consultas.list(query);
  }

  // Antes de qualquer rota com parâmetro, para "totais" e "export" não virarem id.
  @Get('totais')
  @RequirePermission('comercial-atendimento.vendas-pdv.ver')
  @ApiOperation({ summary: 'Cards Total Consultas, Valor Total e Recebido do período' })
  @ApiZodQuery(totaisConsultasRealizadasQuerySchema)
  @ApiZodResponse(200, totaisConsultasRealizadasSchema)
  @ApiErrorResponses(400, 401, 403)
  totais(
    @Query(new ZodValidationPipe(totaisConsultasRealizadasQuerySchema))
    query: TotaisConsultasRealizadasQuery,
  ): Promise<TotaisConsultasRealizadas> {
    return this.consultas.totais(query);
  }

  @Get('export')
  @RequirePermission('comercial-atendimento.vendas-pdv.exportar')
  @Audit({ entity: 'Agendamento', action: 'EXPORT' })
  @ApiOperation({
    summary: 'Exporta em Excel ou PDF com os mesmos filtros e ordenação da listagem',
  })
  @ApiZodQuery(exportConsultasRealizadasQuerySchema)
  @ApiProduces(
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/pdf',
  )
  @ApiErrorResponses(400, 401, 403, 422)
  async export(
    @Query(new ZodValidationPipe(exportConsultasRealizadasQuerySchema))
    query: ExportConsultasRealizadasQuery,
  ): Promise<StreamableFile> {
    return toStreamableFile(await this.consultas.export(query));
  }
}
