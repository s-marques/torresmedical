import {
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
} from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import {
  ARQUIVO_CAMPO,
  ARQUIVO_USOS,
  ARQUIVO_USO_KEYS,
  arquivoConteudoQuerySchema,
  arquivoLinkSchema,
  arquivoSchema,
  uploadArquivoQuerySchema,
  type ArquivoConteudoQuery,
  type ArquivoLink,
  type UploadArquivoQuery,
} from '@torres/shared';
import { Audit } from '../audit/audit.decorator';
import { Public, SomenteAutenticado } from '../auth/auth.decorators';
import { semPermissao } from '../auth/escopo-dados.service';
import { ApiErrorResponses, ApiZodQuery, ApiZodResponse } from '../swagger/zod-openapi';
import { IdParam } from '../validation/id-param.decorator';
import { ZodValidationPipe } from '../validation/zod-validation.pipe';
import { ArquivosService, type ArquivoDto, type ArquivoRecebido } from './arquivos.service';

const ENTITY = 'Arquivo';

/** Arquivo clínico (uso `privado`): só o recurso dono o entrega, depois de conferir o escopo. */
function garantirNaoPrivado(arquivo: ArquivoDto): void {
  const config = (ARQUIVO_USOS as Record<string, { privado?: boolean } | undefined>)[arquivo.uso];
  if (config?.privado) throw semPermissao();
}

/**
 * Serviço comum de arquivos, usado pelos formulários de várias telas: exige só o login.
 * A autorização de cada tela vale quando ela grava o id do arquivo no próprio endpoint.
 * `GET /:id/conteudo` é público: quem autoriza é a assinatura da URL temporária.
 */
@ApiTags('Arquivos')
@SomenteAutenticado()
@Controller('arquivos')
export class ArquivosController {
  constructor(private readonly arquivos: ArquivosService) {}

  @Post()
  @Audit({ entity: ENTITY })
  @ApiOperation({
    summary: 'Envia um arquivo (multipart, campo "arquivo") para o uso informado',
    description: `Usos: ${ARQUIVO_USO_KEYS.join(', ')}. Cada uso tem formatos e tamanho máximo próprios.`,
  })
  @ApiConsumes('multipart/form-data')
  @ApiZodQuery(uploadArquivoQuerySchema)
  @ApiBody({
    schema: {
      type: 'object',
      required: [ARQUIVO_CAMPO],
      properties: { [ARQUIVO_CAMPO]: { type: 'string', format: 'binary' } },
    },
  })
  @ApiZodResponse(201, arquivoSchema)
  @ApiErrorResponses(400, 401)
  upload(
    @Query(new ZodValidationPipe(uploadArquivoQuerySchema)) query: UploadArquivoQuery,
    @UploadedFile() arquivo: ArquivoRecebido | undefined,
  ): Promise<ArquivoDto> {
    return this.arquivos.upload(query.uso, arquivo);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Metadados do arquivo' })
  @ApiZodResponse(200, arquivoSchema)
  @ApiErrorResponses(400, 401, 404)
  async findById(@IdParam() id: string): Promise<ArquivoDto> {
    const arquivo = await this.arquivos.findById(id);
    garantirNaoPrivado(arquivo);
    return arquivo;
  }

  @Get(':id/link')
  @ApiOperation({ summary: 'URL temporária de download (para <img src> e <a href>)' })
  @ApiZodResponse(200, arquivoLinkSchema)
  @ApiErrorResponses(400, 401, 404)
  async link(@IdParam() id: string): Promise<ArquivoLink> {
    garantirNaoPrivado(await this.arquivos.findById(id));
    return this.arquivos.link(id);
  }

  @Get(':id/conteudo')
  @Public()
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Download pelo link temporário (assinatura e validade na query)' })
  @ApiZodQuery(arquivoConteudoQuerySchema)
  @ApiProduces('application/octet-stream')
  @ApiErrorResponses(400, 403, 404)
  async conteudo(
    @IdParam() id: string,
    @Query(new ZodValidationPipe(arquivoConteudoQuerySchema)) query: ArquivoConteudoQuery,
  ): Promise<StreamableFile> {
    const { arquivo, stream } = await this.arquivos.conteudo(id, query);
    return new StreamableFile(stream, {
      type: arquivo.contentType,
      length: arquivo.tamanho,
      disposition: contentDisposition(arquivo.nomeOriginal),
    });
  }

  @Delete(':id')
  @HttpCode(200)
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Exclui (exclusão lógica)' })
  @ApiZodResponse(200, arquivoSchema)
  @ApiErrorResponses(400, 401, 404)
  async remove(@IdParam() id: string): Promise<ArquivoDto> {
    garantirNaoPrivado(await this.arquivos.findById(id));
    return this.arquivos.remove(id);
  }
}

/** Sempre `attachment`: o navegador não abre o arquivo como página. Nome em UTF-8. */
export function contentDisposition(nome: string): string {
  const ascii = nome
    .normalize('NFD')
    .replaceAll(/[^\x20-\x7E]/g, '')
    .replaceAll(/["\\]/g, '');
  return `attachment; filename="${ascii || 'arquivo'}"; filename*=UTF-8''${encodeURIComponent(nome)}`;
}
