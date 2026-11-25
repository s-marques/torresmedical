import type { TransactionHost } from '@nestjs-cls/transactional';
import { Readable } from 'node:stream';
import { escopoFalso } from '../../../../test/utils/escopo-falso';
import * as documento from '../../../common/export/documento-pdf.writer';
import type { BlocoDocumento } from '../../../common/export/documento-pdf.writer';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import type { ArquivosService } from '../../../common/storage/arquivos.service';
import type { PacientesService } from '../../comercial-atendimento/pacientes/pacientes.service';
import type { ProfissionaisService } from '../../gestao-profissionais/profissionais/profissionais.service';
import type { ModelosProntuarioService } from '../modelos-prontuario/modelos-prontuario.service';
import type { PacientesVinculadosService } from '../pacientes-vinculados/pacientes-vinculados.service';
import type { PrescricoesService } from '../receituarios/prescricoes.service';
import type { AcessoProntuarioService } from './acesso-prontuario.service';
import {
  PRONTUARIO_ZIP_MAX_BYTES,
  ProntuarioExportacaoService,
} from './prontuario-exportacao.service';

const PACIENTE = '11111111-1111-4111-8111-111111111111';
const PROF_A = '22222222-2222-4222-8222-222222222222';
const PROF_B = '33333333-3333-4333-8333-333333333333';
const AGORA = new Date('2026-11-25T15:00:00.000Z');

function montar(opcoes: { escopo?: readonly string[]; anexoBytes?: number } = {}) {
  const atendimentos = [
    {
      id: 'at-1',
      profissionalId: PROF_A,
      createdAt: AGORA,
      tipo: null,
      status: 'FINALIZADO',
      assinadoEm: null,
      queixa: 'Queixa fictícia',
      evolucao: null,
      diagnostico: null,
      conduta: null,
      observacoes: null,
      modeloVersaoId: null,
      respostas: null,
      evolucoes: [{ tipo: 'EVOLUCAO', createdAt: AGORA, texto: 'Evolução fictícia' }],
      receitas: [],
      documentos: [],
      versoes: [{ numero: 2, createdAt: AGORA, texto: 'Adendo fictício' }],
      anexos: [
        { tipo: 'EXAME', arquivoId: 'arq-1', data: new Date('2026-11-20'), descricao: null },
      ],
    },
  ];
  const tx = {
    prontuario: { findUnique: jest.fn().mockResolvedValue({ alergias: 'Nenhuma' }) },
    atendimento: { findMany: jest.fn().mockResolvedValue(atendimentos) },
    anamnese: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const prescricao = (id: string, numero: number, profissionalId: string, medicacao: string) => ({
    id,
    tipo: 'BRANCA',
    numero,
    profissionalId,
    dataPrescricao: '2026-11-01',
    medicacao,
    posologia: null,
  });
  const prescricoes = {
    todasDoPaciente: jest
      .fn()
      .mockResolvedValue([
        prescricao('p1', 1, PROF_A, 'Dipirona fictícia'),
        prescricao('p2', 2, PROF_B, 'Outra fictícia'),
      ]),
  };
  const arquivos = {
    findById: jest.fn().mockResolvedValue({
      id: 'arq-1',
      nomeOriginal: 'exame.pdf',
      tamanho: opcoes.anexoBytes ?? 10,
    }),
    ler: jest.fn().mockImplementation(() =>
      Promise.resolve({
        arquivo: { nomeOriginal: '../exame.pdf' },
        stream: Readable.from([Buffer.from('%PDF-')]),
      }),
    ),
  };
  const acessos = { registrar: jest.fn().mockResolvedValue(undefined) };
  const vinculados = { garantir: jest.fn().mockResolvedValue(undefined) };
  const service = new ProntuarioExportacaoService(
    { tx } as unknown as TransactionHost<PrismaAdapter>,
    {
      detalhe: jest.fn().mockResolvedValue({ nome: 'Paciente Fictício', documento: null }),
    } as unknown as PacientesService,
    {
      detalhe: jest.fn((id: string) =>
        Promise.resolve({ nome: id === PROF_A ? 'Dr. A' : 'Dra. B' }),
      ),
    } as unknown as ProfissionaisService,
    vinculados as unknown as PacientesVinculadosService,
    escopoFalso(opcoes.escopo),
    prescricoes as unknown as PrescricoesService,
    { versoesPorId: jest.fn().mockResolvedValue(new Map()) } as unknown as ModelosProntuarioService,
    acessos as unknown as AcessoProntuarioService,
    arquivos as unknown as ArquivosService,
  );
  return { service, tx, acessos, vinculados, arquivos };
}

describe('ProntuarioExportacaoService', () => {
  let blocos: BlocoDocumento[];

  beforeEach(() => {
    blocos = [];
    jest.spyOn(documento, 'writeDocumentoPdf').mockImplementation((doc) => {
      blocos = [...doc.blocos];
      return Promise.resolve(Buffer.from('%PDF-falso'));
    });
  });

  afterEach(() => jest.restoreAllMocks());

  const texto = () => JSON.stringify(blocos);

  it('gera o PDF com atendimento, evolução, adendo, anexo e a prescrição', async () => {
    const { service, acessos, vinculados } = montar();

    const arquivo = await service.exportar(PACIENTE, { incluirAnexos: false }, AGORA);

    expect(arquivo).toMatchObject({
      contentType: 'application/pdf',
      filename: 'prontuario-11111111-2026-11-25.pdf',
    });
    expect(vinculados.garantir).toHaveBeenCalledWith(PACIENTE);
    expect(acessos.registrar).toHaveBeenCalledWith(PACIENTE, 'EXPORTACAO');
    for (const esperado of ['Queixa fictícia', 'Evolução fictícia', 'Adendo 2', 'exame.pdf']) {
      expect(texto()).toContain(esperado);
    }
  });

  it('filtra o atendimento pelo escopo e a prescrição pelo profissional pedido', async () => {
    const { service, tx } = montar({ escopo: [PROF_A, PROF_B] });

    await service.exportar(PACIENTE, { profissionalId: PROF_A, incluirAnexos: false }, AGORA);

    expect(tx.atendimento.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { pacienteId: PACIENTE, deletedAt: null, profissionalId: PROF_A },
      }),
    );
    expect(texto()).toContain('Dipirona fictícia');
    expect(texto()).not.toContain('Outra fictícia');
  });

  it('403 quando o profissional pedido está fora do escopo, antes de ler ou registrar', async () => {
    const { service, tx, acessos } = montar({ escopo: [PROF_A] });

    await expect(
      service.exportar(PACIENTE, { profissionalId: PROF_B, incluirAnexos: false }),
    ).rejects.toMatchObject({ status: 403 });

    expect(tx.atendimento.findMany).not.toHaveBeenCalled();
    expect(acessos.registrar).not.toHaveBeenCalled();
  });

  it('devolve ZIP com o PDF e os anexos, com nome seguro', async () => {
    const { service, arquivos } = montar();

    const arquivo = await service.exportar(PACIENTE, { incluirAnexos: true }, AGORA);

    expect(arquivo.contentType).toBe('application/zip');
    expect(arquivo.filename).toBe('prontuario-11111111-2026-11-25.zip');
    expect(arquivos.ler).toHaveBeenCalledWith('arq-1');
    const nomes = arquivo.buffer.toString('latin1');
    expect(nomes).toContain('prontuario.pdf');
    expect(nomes).toContain('anexos/001-_exame.pdf');
  });

  it('422 quando os anexos passam do limite do ZIP síncrono', async () => {
    const { service } = montar({ anexoBytes: PRONTUARIO_ZIP_MAX_BYTES + 1 });

    await expect(service.exportar(PACIENTE, { incluirAnexos: true })).rejects.toMatchObject({
      code: 'EXPORT_LIMIT_EXCEEDED',
    });
  });
});
