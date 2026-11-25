import type { TransactionHost } from '@nestjs-cls/transactional';
import { Readable } from 'node:stream';
import { escopoFalso } from '../../../../test/utils/escopo-falso';
import type { AuditService } from '../../../common/audit/audit.service';
import type { RequestContextService } from '../../../common/context/request-context.service';
import {
  ExportacaoLoteFontes,
  type FonteExportacaoLote,
} from '../../../common/export/exportacao-lote.fontes';
import { ExportService } from '../../../common/export/export.service';
import type { EventPublisher } from '../../../common/messaging/event-publisher';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import type { ArquivosService } from '../../../common/storage/arquivos.service';
import {
  COMANDO_GERAR_EXPORTACAO_LOTE,
  EXPORTACAO_LOTE_ARQUIVOS_MAX_BYTES,
  ExportacaoLoteService,
  toExportacaoLoteDto,
} from './exportacao-lote.service';
import { GerarExportacaoLoteConsumer } from './gerar-exportacao-lote.consumer';

const ID = '11111111-1111-4111-8111-111111111111';
const AGORA = new Date('2026-11-25T15:00:00.000Z');

function registro(sobrescrever: Record<string, unknown> = {}) {
  return {
    id: ID,
    entidade: 'pacientes',
    incluirArquivos: true,
    status: 'PENDENTE',
    solicitadoPorId: 'u-1',
    solicitadaEm: AGORA,
    iniciadaEm: null,
    concluidaEm: null,
    expiraEm: null,
    arquivoId: null,
    tamanhoBytes: null,
    erroCodigo: null,
    ...sobrescrever,
  };
}

function fonteFalsa(parcial: Partial<FonteExportacaoLote> = {}): FonteExportacaoLote {
  return {
    entidade: 'pacientes',
    tabelas: jest.fn().mockResolvedValue([
      {
        nome: 'pacientes',
        arquivo: { buffer: Buffer.from('a;b\r\n'), contentType: 'text/csv', filename: 'p.csv' },
      },
    ]),
    ...parcial,
  };
}

function montar(opcoes: { fonte?: FonteExportacaoLote | null; escopo?: readonly string[] } = {}) {
  const fontes = new ExportacaoLoteFontes();
  const fonte = opcoes.fonte === undefined ? fonteFalsa() : opcoes.fonte;
  if (fonte) fontes.registrar(fonte);
  const delegate = {
    findFirst: jest.fn().mockResolvedValue(null),
    findUnique: jest.fn(),
    findUniqueOrThrow: jest.fn().mockResolvedValue(registro({ status: 'PROCESSANDO' })),
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    create: jest.fn().mockResolvedValue(registro()),
    update: jest.fn().mockResolvedValue(registro()),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  };
  const events = { publish: jest.fn().mockResolvedValue(undefined) };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const arquivos = {
    salvarGerado: jest.fn().mockResolvedValue({ id: 'zip-1' }),
    ler: jest.fn(),
  };
  const service = new ExportacaoLoteService(
    { tx: { exportacaoLote: delegate } } as unknown as TransactionHost<PrismaAdapter>,
    fontes,
    events as unknown as EventPublisher,
    audit as unknown as AuditService,
    { getUserId: () => 'u-1' } as unknown as RequestContextService,
    escopoFalso(opcoes.escopo),
    arquivos as unknown as ArquivosService,
    new ExportService(),
  );
  return { service, delegate, events, audit, arquivos, fontes };
}

describe('ExportacaoLoteService', () => {
  describe('solicitar', () => {
    it('grava o pedido e publica o comando', async () => {
      const { service, delegate, events } = montar();

      const dto = await service.solicitar({ entidade: 'pacientes', incluirArquivos: true });

      expect(dto).toMatchObject({ id: ID, status: 'PENDENTE', disponivel: false });
      expect(delegate.create).toHaveBeenCalledWith({
        data: { entidade: 'pacientes', incluirArquivos: false, solicitadoPorId: 'u-1' },
      });
      expect(events.publish).toHaveBeenCalledWith(COMANDO_GERAR_EXPORTACAO_LOTE, {
        exportacaoId: ID,
      });
    });

    it('422 para entidade sem fonte registrada', async () => {
      const { service, events } = montar({ fonte: null });

      await expect(
        service.solicitar({ entidade: 'pacientes', incluirArquivos: false }),
      ).rejects.toMatchObject({ code: 'EXPORTACAO_INDISPONIVEL', status: 422 });
      expect(events.publish).not.toHaveBeenCalled();
    });

    it('409 quando já existe pedido da entidade em andamento', async () => {
      const { service, delegate, events } = montar();
      delegate.findFirst.mockResolvedValue({ id: 'outro' });

      await expect(
        service.solicitar({ entidade: 'pacientes', incluirArquivos: false }),
      ).rejects.toMatchObject({ code: 'EXPORTACAO_EM_ANDAMENTO', status: 409 });
      expect(delegate.create).not.toHaveBeenCalled();
      expect(events.publish).not.toHaveBeenCalled();
    });

    it('403 para perfil com escopo restrito', async () => {
      const { service } = montar({ escopo: ['p-1'] });

      await expect(
        service.solicitar({ entidade: 'pacientes', incluirArquivos: false }),
      ).rejects.toMatchObject({ status: 403 });
      await expect(service.listar({} as never)).rejects.toMatchObject({ status: 403 });
      await expect(service.baixar(ID)).rejects.toMatchObject({ status: 403 });
    });
  });

  describe('processar', () => {
    it('gera o ZIP, grava o arquivo, conclui e audita', async () => {
      const { service, delegate, arquivos, audit } = montar();

      await expect(service.processar(ID)).resolves.toBe(true);

      expect(arquivos.salvarGerado).toHaveBeenCalledWith(
        expect.objectContaining({ uso: 'exportacao-lote', contentType: 'application/zip' }),
      );
      expect(delegate.update).toHaveBeenCalledWith({
        where: { id: ID },
        data: expect.objectContaining({ status: 'CONCLUIDA', arquivoId: 'zip-1' }),
      });
      const { expiraEm, concluidaEm } = delegate.update.mock.calls[0][0].data as {
        expiraEm: Date;
        concluidaEm: Date;
      };
      expect(expiraEm.getTime() - concluidaEm.getTime()).toBe(24 * 60 * 60 * 1000);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'UPDATE', entityId: ID }),
      );
    });

    it('não processa de novo um pedido já iniciado (idempotência)', async () => {
      const { service, delegate, arquivos } = montar();
      delegate.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.processar(ID)).resolves.toBe(false);
      expect(arquivos.salvarGerado).not.toHaveBeenCalled();
    });

    it('inclui os arquivos da fonte e o índice no ZIP', async () => {
      const fonte = fonteFalsa({
        arquivos: jest.fn().mockResolvedValue([{ caminho: 'anexos/a1', arquivoId: 'arq-1' }]),
      });
      const { service, arquivos } = montar({ fonte });
      arquivos.ler.mockResolvedValue({
        arquivo: { nomeOriginal: 'Exame Final.PDF', contentType: 'application/pdf', tamanho: 5 },
        stream: Readable.from([Buffer.from('%PDF-')]),
      });

      await service.processar(ID);

      const zip = (arquivos.salvarGerado.mock.calls[0][0] as { conteudo: Buffer }).conteudo;
      const nomes = zip.toString('latin1');
      expect(nomes).toContain('anexos/a1.pdf');
      expect(nomes).toContain('arquivos.csv');
    });

    it('marca FALHOU com código estável quando os arquivos passam do limite', async () => {
      const fonte = fonteFalsa({
        arquivos: jest.fn().mockResolvedValue([{ caminho: 'anexos/a1', arquivoId: 'arq-1' }]),
      });
      const { service, delegate, arquivos } = montar({ fonte });
      const stream = Readable.from([Buffer.from('x')]);
      arquivos.ler.mockResolvedValue({
        arquivo: {
          nomeOriginal: 'grande.pdf',
          contentType: 'application/pdf',
          tamanho: EXPORTACAO_LOTE_ARQUIVOS_MAX_BYTES + 1,
        },
        stream,
      });

      await expect(service.processar(ID)).resolves.toBe(true);

      expect(delegate.update).toHaveBeenCalledWith({
        where: { id: ID },
        data: expect.objectContaining({ status: 'FALHOU', erroCodigo: 'ARQUIVOS_ACIMA_DO_LIMITE' }),
      });
      expect(arquivos.salvarGerado).not.toHaveBeenCalled();
      expect(stream.destroyed).toBe(true);
    });

    it('marca FALHOU sem vazar a mensagem do erro', async () => {
      const fonte = fonteFalsa({ tabelas: jest.fn().mockRejectedValue(new Error('CPF 123')) });
      const { service, delegate, audit } = montar({ fonte });

      await service.processar(ID);

      expect(delegate.update).toHaveBeenCalledWith({
        where: { id: ID },
        data: expect.objectContaining({ status: 'FALHOU', erroCodigo: 'ERRO_PROCESSAMENTO' }),
      });
      expect(JSON.stringify(audit.record.mock.calls)).not.toContain('CPF');
    });

    it('marca FALHOU quando a fonte deixou de existir', async () => {
      const { service, delegate, fontes } = montar();
      (fontes as unknown as { fontes: Map<string, unknown> }).fontes.clear();

      await service.processar(ID);

      expect(delegate.update).toHaveBeenCalledWith({
        where: { id: ID },
        data: expect.objectContaining({ erroCodigo: 'ENTIDADE_INDISPONIVEL' }),
      });
    });
  });

  describe('baixar', () => {
    it('devolve o conteúdo do ZIP dentro da validade', async () => {
      const { service, delegate, arquivos } = montar();
      delegate.findUnique.mockResolvedValue(
        registro({
          status: 'CONCLUIDA',
          arquivoId: 'zip-1',
          expiraEm: new Date(AGORA.getTime() + 1000),
        }),
      );
      arquivos.ler.mockResolvedValue({ arquivo: {}, stream: Readable.from([]) });

      await service.baixar(ID, AGORA);

      expect(arquivos.ler).toHaveBeenCalledWith('zip-1');
    });

    it('404 se não existe ou não terminou, 410 se expirou', async () => {
      const { service, delegate } = montar();
      delegate.findUnique.mockResolvedValueOnce(null);
      await expect(service.baixar(ID, AGORA)).rejects.toMatchObject({ status: 404 });

      delegate.findUnique.mockResolvedValueOnce(registro({ status: 'PROCESSANDO' }));
      await expect(service.baixar(ID, AGORA)).rejects.toMatchObject({
        code: 'EXPORTACAO_INDISPONIVEL',
        status: 404,
      });

      delegate.findUnique.mockResolvedValueOnce(
        registro({ status: 'CONCLUIDA', arquivoId: 'zip-1', expiraEm: AGORA }),
      );
      await expect(service.baixar(ID, AGORA)).rejects.toMatchObject({
        code: 'EXPORTACAO_EXPIRADA',
        status: 410,
      });
    });
  });

  it('entidades() devolve só as que têm fonte, na ordem do catálogo', () => {
    const { service } = montar();
    expect(service.entidades()).toEqual([
      { id: 'pacientes', rotulo: 'Pacientes', comArquivos: false },
    ]);
  });

  it('toExportacaoLoteDto marca como indisponível quando expirou', () => {
    const concluida = registro({
      status: 'CONCLUIDA',
      arquivoId: 'zip-1',
      expiraEm: new Date(AGORA.getTime() - 1),
    });
    expect(toExportacaoLoteDto(concluida as never, AGORA).disponivel).toBe(false);
    expect(
      toExportacaoLoteDto({ ...concluida, expiraEm: new Date(AGORA.getTime() + 1) } as never, AGORA)
        .disponivel,
    ).toBe(true);
  });
});

describe('GerarExportacaoLoteConsumer', () => {
  it('delega o processamento ao service', async () => {
    const processar = jest.fn().mockResolvedValue(true);
    const consumer = new GerarExportacaoLoteConsumer({
      processar,
    } as unknown as ExportacaoLoteService);

    await consumer.handle({ payload: { exportacaoId: ID } } as never);

    expect(processar).toHaveBeenCalledWith(ID);
  });
});

describe('ExportacaoLoteFontes', () => {
  it('registra, obtém e lista as fontes', () => {
    const fontes = new ExportacaoLoteFontes();
    const fonte = fonteFalsa();

    fontes.registrar(fonte);

    expect(fontes.obter('pacientes')).toBe(fonte);
    expect(fontes.obter('profissionais')).toBeUndefined();
    expect(fontes.disponiveis()).toEqual(['pacientes']);
  });
});

describe('ExportService.semLimite', () => {
  it('só dispensa o teto de linhas dentro do callback', async () => {
    const service = new ExportService();

    await service.semLimite(async () => {
      service.ensureWithinLimit(1_000_000);
    });

    expect(() => service.ensureWithinLimit(1_000_000)).toThrow();
  });
});
