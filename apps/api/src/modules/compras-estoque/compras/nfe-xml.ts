import { BusinessException } from '../../../common/errors/api.exception';
import { ErrorCode } from '../../../common/errors/error-codes';

export interface NfeItem {
  codigo: string | null;
  codigoBarras: string | null;
  descricao: string;
  quantidade: number;
  valorUnitario: number;
}

export interface NfeDados {
  numeroNf: string | null;
  serieNf: string | null;
  /** `AAAA-MM-DD`. */
  dataEmissao: string | null;
  fornecedorNome: string | null;
  /** CNPJ ou CPF do emitente, somente dígitos. */
  fornecedorDocumento: string | null;
  frete: number;
  desconto: number;
  itens: NfeItem[];
}

const ENTIDADES: Readonly<Record<string, string>> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
};

function decodificar(texto: string): string {
  return texto.replaceAll(/&(?:amp|lt|gt|quot|apos);/g, (e) => ENTIDADES[e] ?? e).trim();
}

/** Texto da primeira ocorrência de `<tag>…</tag>` no trecho, sem prefixo de namespace. */
function tag(trecho: string, nome: string): string | null {
  const achado = new RegExp(String.raw`<${nome}(?:\s[^>]*)?>([^<]*)</${nome}>`).exec(trecho);
  const valor = achado?.[1] ? decodificar(achado[1]) : '';
  return valor || null;
}

/** Conteúdo do primeiro bloco `<nome>…</nome>`. */
function bloco(trecho: string, nome: string): string {
  const achado = new RegExp(String.raw`<${nome}(?:\s[^>]*)?>([\s\S]*?)</${nome}>`).exec(trecho);
  return achado?.[1] ?? '';
}

function numero(valor: string | null): number {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
}

function dataIso(valor: string | null): string | null {
  const dia = valor?.slice(0, 10);
  return dia && /^\d{4}-\d{2}-\d{2}$/.test(dia) ? dia : null;
}

/**
 * Lê os dados de uma NF-e (XML de nota ou `nfeProc`) para a prévia da compra. Só extrai o
 * necessário e não resolve entidades externas nem DTD: o XML é tratado como texto.
 */
export function lerNfeXml(xml: string): NfeDados {
  const semNamespace = xml.replaceAll(/<(\/?)[A-Za-z0-9_-]+:/g, '<$1');
  if (!/<infNFe[\s>]/.test(semNamespace)) {
    throw new BusinessException(ErrorCode.BUSINESS_RULE, 'O arquivo não é um XML de NF-e válido.');
  }
  const ide = bloco(semNamespace, 'ide');
  const emit = bloco(semNamespace, 'emit');
  const total = bloco(semNamespace, 'ICMSTot');

  const itens: NfeItem[] = [...semNamespace.matchAll(/<det(?:\s[^>]*)?>([\s\S]*?)<\/det>/g)].map(
    ([, det = '']) => {
      const prod = bloco(det, 'prod');
      const ean = tag(prod, 'cEAN');
      return {
        codigo: tag(prod, 'cProd'),
        codigoBarras: ean && /^\d+$/.test(ean) ? ean : null,
        descricao: tag(prod, 'xProd') ?? '',
        quantidade: numero(tag(prod, 'qCom')),
        valorUnitario: numero(tag(prod, 'vUnCom')),
      };
    },
  );

  return {
    numeroNf: tag(ide, 'nNF'),
    serieNf: tag(ide, 'serie'),
    dataEmissao: dataIso(tag(ide, 'dhEmi') ?? tag(ide, 'dEmi')),
    fornecedorNome: tag(emit, 'xNome'),
    fornecedorDocumento: tag(emit, 'CNPJ') ?? tag(emit, 'CPF'),
    frete: numero(tag(total, 'vFrete')),
    desconto: numero(tag(total, 'vDesc')),
    itens,
  };
}
