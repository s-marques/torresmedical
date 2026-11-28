import PDFDocument from 'pdfkit';
import type {
  ApresentacaoMensal,
  AvisoApresentacao,
  FormatoIndicadorApresentacao,
  IndicadorApresentacao,
  IndicadorApresentacaoId,
  PontoIndicador,
} from '@torres/shared';
import { collect, drawPageNumbers, type Doc } from '../../../common/export/pdf.writer';

const MARGIN = 48;
const COR_ATUAL = '#1F4E79';
const COR_ANTERIOR = '#9CA3AF';
const COR_TEXTO = '#111827';
const COR_SUAVE = '#4B5563';
const COR_LINHA = '#D1D5DB';
const ALTURA_LINHA = 24;
const DADO_INDISPONIVEL = 'Dado indisponível';

export const NOMES_INDICADOR: Readonly<Record<IndicadorApresentacaoId, string>> = {
  faturamento: 'Faturamento',
  'faturamento-futuro': 'Faturamento futuro (com base nos contratos)',
  'faturamento-produto': 'Faturamento por produto',
  ocupacao: 'Ocupação × vacância dos períodos',
  'despesas-centro-custo': 'Despesas por centro de custo',
  estoque: 'Estoque: consumo por categoria',
  leads: 'Leads que nos contataram, por origem',
  visitas: 'Visitas a médicos',
  'nps-medicos': 'NPS dos médicos clientes',
  'nps-pacientes': 'NPS dos pacientes dos médicos atendidos',
};

const TEXTO_AVISO: Readonly<Record<AvisoApresentacao, string>> = {
  PRODUTO_POR_MODALIDADE:
    'Produto = modalidade do contrato de sala (mensal, turno ou hora), enquanto o catálogo de produtos não existe. Títulos gerados no mês.',
  ESTOQUE_POR_CATEGORIA:
    'Saídas do mês por categoria, contra o esperado pela média dos 90 dias anteriores. As unidades variam entre as categorias, por isso não há total.',
  LEADS_POR_ORIGEM: 'Leads = negócios criados no mês, agrupados pela origem do cliente.',
  VISITAS_RECEBIDAS_INDISPONIVEL:
    'Visitas recebidas na clínica: dado indisponível, o sistema não tem esse registro.',
  NPS_PACIENTES_TODOS:
    'NPS de todos os pacientes pesquisados no mês: a pesquisa não distingue o atendimento pela recepção ou secretária.',
  OCUPACAO_PREVISAO_CONTRATOS:
    'Previsão do mês seguinte = períodos já contratados, sem estimativa.',
};

const ROTULO_COMPARACAO = {
  MES_ANTERIOR: 'Mês anterior',
  MEDIA_90_DIAS: 'Média dos 90 dias anteriores',
  NENHUMA: '',
} as const;

const MOEDA = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const NUMERO = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });
const UMA_CASA = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const MES_POR_EXTENSO = new Intl.DateTimeFormat('pt-BR', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/** `2026-10` → `Outubro de 2026`. */
export function mesPorExtenso(mes: string): string {
  const texto = MES_POR_EXTENSO.format(new Date(`${mes}-01T00:00:00Z`));
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** `2026-10` → `10/2026`. */
const mesCurto = (mes: string): string => `${mes.slice(5, 7)}/${mes.slice(0, 4)}`;

export function formatarValor(formato: FormatoIndicadorApresentacao, valor: number | null): string {
  if (valor === null) return DADO_INDISPONIVEL;
  if (formato === 'moeda') return MOEDA.format(valor);
  if (formato === 'percentual') return `${UMA_CASA.format(valor)}%`;
  if (formato === 'nps') return UMA_CASA.format(valor);
  return NUMERO.format(valor);
}

function formatarVariacao(formato: FormatoIndicadorApresentacao, variacao: number | null): string {
  if (variacao === null) return '—';
  const sinal = variacao > 0 ? '+' : '';
  const unidade = formato === 'moeda' || formato === 'numero' ? '%' : ' p.p.';
  return `${sinal}${UMA_CASA.format(variacao)}${unidade}`;
}

function cabecalho(doc: Doc, mes: string): void {
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor(COR_SUAVE)
    .text('Torres Medical · Relatório mensal da gestão', MARGIN, MARGIN - 12, {
      continued: true,
    })
    .text(mesPorExtenso(mes), { align: 'right' });
  doc
    .moveTo(MARGIN, MARGIN + 6)
    .lineTo(doc.page.width - MARGIN, MARGIN + 6)
    .strokeColor(COR_LINHA)
    .stroke();
}

function destaque(doc: Doc, indicador: IndicadorApresentacao, y: number): number {
  const { formato, valor, anterior, variacao, comparacao, serie } = indicador;
  const semNada = valor === null && serie.every((p) => p.valor === null);
  doc
    .font('Helvetica-Bold')
    .fontSize(30)
    .fillColor(semNada ? COR_SUAVE : COR_ATUAL);
  if (valor !== null || semNada) {
    doc.text(formatarValor(formato, valor), MARGIN, y);
  }
  if (valor !== null && comparacao !== 'NENHUMA') {
    doc
      .font('Helvetica')
      .fontSize(11)
      .fillColor(COR_SUAVE)
      .text(
        `${ROTULO_COMPARACAO[comparacao]}: ${anterior === null ? DADO_INDISPONIVEL : formatarValor(formato, anterior)}   ·   Variação: ${formatarVariacao(formato, variacao)}`,
        MARGIN,
        doc.y + 2,
      );
  }
  return doc.y + 14;
}

/** Barras verticais, uma por mês, a partir da linha do zero. */
function graficoTendencia(
  doc: Doc,
  formato: FormatoIndicadorApresentacao,
  serie: readonly PontoIndicador[],
  topo: number,
  altura: number,
): void {
  const largura = doc.page.width - MARGIN * 2;
  const valores = serie.flatMap((p) => (p.valor === null ? [] : [p.valor]));
  const maximo = Math.max(0, ...valores);
  const minimo = Math.min(0, ...valores);
  const amplitude = maximo - minimo || 1;
  const areaBarras = altura - 56;
  const zero = topo + 16 + (maximo / amplitude) * areaBarras;
  const passo = largura / Math.max(serie.length, 1);
  const barra = Math.min(passo * 0.6, 70);

  serie.forEach((ponto, i) => {
    const x = MARGIN + i * passo + (passo - barra) / 2;
    if (ponto.valor === null) {
      doc
        .font('Helvetica-Oblique')
        .fontSize(8)
        .fillColor(COR_SUAVE)
        .text(DADO_INDISPONIVEL, MARGIN + i * passo, zero - 10, { width: passo, align: 'center' });
    } else {
      const h = (Math.abs(ponto.valor) / amplitude) * areaBarras;
      const y = ponto.valor >= 0 ? zero - h : zero;
      doc.rect(x, y, barra, Math.max(h, 1)).fill(i === serie.length - 1 ? COR_ATUAL : COR_ANTERIOR);
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor(COR_TEXTO)
        .text(
          formatarValor(formato, ponto.valor),
          MARGIN + i * passo,
          ponto.valor >= 0 ? y - 11 : y + h + 2,
          {
            width: passo,
            align: 'center',
          },
        );
    }
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(COR_SUAVE)
      .text(mesCurto(ponto.rotulo), MARGIN + i * passo, topo + altura - 12, {
        width: passo,
        align: 'center',
      });
  });
  doc
    .moveTo(MARGIN, zero)
    .lineTo(MARGIN + largura, zero)
    .strokeColor(COR_LINHA)
    .stroke();
}

/** Quadradinho colorido e o texto (a Helvetica padrão não tem o glifo "■"). */
function legenda(doc: Doc, x: number, y: number, cor: string, texto: string): void {
  doc.rect(x, y + 1, 7, 7).fill(cor);
  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor(cor)
    .text(texto, x + 11, y, { lineBreak: false });
}

/** Uma linha por item: barra do mês e, abaixo, a de comparação. */
function graficoComparativo(
  doc: Doc,
  formato: FormatoIndicadorApresentacao,
  serie: readonly PontoIndicador[],
  topo: number,
  rotuloComparacao: string,
  rotuloAtual: string,
): number {
  const colunaRotulo = 230;
  const x0 = MARGIN + colunaRotulo + 8;
  const areaBarras = doc.page.width - MARGIN - x0 - 110;
  const maximo = Math.max(
    1,
    ...serie.flatMap((p) => [p.valor ?? 0, p.anterior ?? 0].map((v) => Math.abs(v))),
  );

  legenda(doc, x0, topo, COR_ATUAL, rotuloAtual);
  if (rotuloComparacao) legenda(doc, x0 + 130, topo, COR_ANTERIOR, rotuloComparacao);
  let y = topo + 16;
  for (const ponto of serie) {
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(COR_TEXTO)
      .text(ponto.rotulo, MARGIN, y + 2, { width: colunaRotulo, ellipsis: true, lineBreak: false });
    if (ponto.valor === null) {
      doc
        .font('Helvetica-Oblique')
        .fillColor(COR_SUAVE)
        .text(DADO_INDISPONIVEL, x0, y + 2, { lineBreak: false });
    } else {
      const larguraAtual = (Math.abs(ponto.valor) / maximo) * areaBarras;
      doc.rect(x0, y, Math.max(larguraAtual, 1), 8).fill(COR_ATUAL);
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor(COR_TEXTO)
        .text(formatarValor(formato, ponto.valor), x0 + larguraAtual + 6, y, { lineBreak: false });
      if (ponto.anterior !== null) {
        const larguraAnterior = (Math.abs(ponto.anterior) / maximo) * areaBarras;
        doc.rect(x0, y + 10, Math.max(larguraAnterior, 1), 5).fill(COR_ANTERIOR);
        doc
          .fillColor(COR_SUAVE)
          .text(formatarValor(formato, ponto.anterior), x0 + larguraAnterior + 6, y + 9, {
            lineBreak: false,
          });
      }
    }
    y += ALTURA_LINHA;
  }
  return y;
}

function listaDetalhe(doc: Doc, detalhe: readonly PontoIndicador[], y: number): number {
  if (detalhe.length === 0) return y;
  doc
    .font('Helvetica-Bold')
    .fontSize(10)
    .fillColor(COR_TEXTO)
    .text('Médicos que receberam visita no mês', MARGIN, y + 6);
  let linha = doc.y + 4;
  doc.font('Helvetica').fontSize(9);
  for (const ponto of detalhe) {
    doc
      .fillColor(COR_TEXTO)
      .text(ponto.rotulo, MARGIN, linha, { width: 360, lineBreak: false, ellipsis: true })
      .text(String(ponto.valor ?? 0), MARGIN + 370, linha, { lineBreak: false });
    linha += 13;
  }
  return linha;
}

function rodapeAvisos(doc: Doc, avisos: readonly AvisoApresentacao[]): void {
  if (avisos.length === 0) return;
  const texto = avisos.map((a) => TEXTO_AVISO[a]).join(' ');
  const altura = doc.heightOfString(texto, { width: doc.page.width - MARGIN * 2 });
  doc
    .font('Helvetica-Oblique')
    .fontSize(8)
    .fillColor(COR_SUAVE)
    .text(texto, MARGIN, doc.page.height - MARGIN - 18 - altura, {
      width: doc.page.width - MARGIN * 2,
    });
}

function paginaDoIndicador(
  doc: Doc,
  relatorio: ApresentacaoMensal,
  i: IndicadorApresentacao,
): void {
  cabecalho(doc, relatorio.mes);
  doc
    .font('Helvetica-Bold')
    .fontSize(20)
    .fillColor(COR_TEXTO)
    .text(`${i.numero}. ${NOMES_INDICADOR[i.id]}`, MARGIN, MARGIN + 22);
  let y = destaque(doc, i, doc.y + 10);

  if (i.grafico === 'tendencia') {
    graficoTendencia(doc, i.formato, i.serie, y + 6, 230);
  } else {
    y = graficoComparativo(
      doc,
      i.formato,
      i.serie,
      y,
      ROTULO_COMPARACAO[i.comparacao],
      mesPorExtenso(relatorio.mes),
    );
    listaDetalhe(doc, i.detalhe, y);
  }
  rodapeAvisos(doc, i.avisos);
}

/**
 * PDF em formato de apresentação (A4 paisagem): uma página por indicador, com o número, a
 * comparação e o gráfico. Em português, como as demais exportações.
 */
export function escreverApresentacaoPdf(relatorio: ApresentacaoMensal): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    layout: 'landscape',
    margin: MARGIN,
    bufferPages: true,
    autoFirstPage: false,
    info: {
      Title: `Relatório mensal da gestão — ${mesPorExtenso(relatorio.mes)}`,
      Creator: 'Torres Medical',
    },
  });
  const pronto = collect(doc);
  if (relatorio.indicadores.length === 0) {
    doc.addPage();
    cabecalho(doc, relatorio.mes);
    doc
      .font('Helvetica-Oblique')
      .fontSize(12)
      .fillColor(COR_SUAVE)
      .text('Nenhum indicador disponível para o seu perfil.', MARGIN, MARGIN + 30);
  }
  for (const indicador of relatorio.indicadores) {
    doc.addPage();
    paginaDoIndicador(doc, relatorio, indicador);
  }
  drawPageNumbers(doc);
  doc.end();
  return pronto;
}
