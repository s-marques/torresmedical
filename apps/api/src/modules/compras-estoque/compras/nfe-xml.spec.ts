import { lerNfeXml } from './nfe-xml';

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe"><NFe><infNFe Id="NFe1" versao="4.00">
<ide><serie>1</serie><nNF>55252</nNF><dhEmi>2026-11-04T10:00:00-04:00</dhEmi></ide>
<emit><CNPJ>12345678000190</CNPJ><xNome>Fornecedor &amp; Cia</xNome></emit>
<det nItem="1"><prod><cProd>CAD-01</cProd><cEAN>SEM GTIN</cEAN><xProd>Cadeira Goah</xProd><qCom>1.0000</qCom><vUnCom>892.5100</vUnCom></prod></det>
<det nItem="2"><prod><cProd>EVA-18</cProd><cEAN>7891234567895</cEAN><xProd>Evaporadora 18</xProd><qCom>2.0000</qCom><vUnCom>1224.6500</vUnCom></prod></det>
<total><ICMSTot><vFrete>10.50</vFrete><vDesc>5.00</vDesc></ICMSTot></total>
</infNFe></NFe></nfeProc>`;

describe('lerNfeXml', () => {
  it('extrai cabeçalho, emitente, totais e itens', () => {
    expect(lerNfeXml(XML)).toEqual({
      numeroNf: '55252',
      serieNf: '1',
      dataEmissao: '2026-11-04',
      fornecedorNome: 'Fornecedor & Cia',
      fornecedorDocumento: '12345678000190',
      frete: 10.5,
      desconto: 5,
      itens: [
        {
          codigo: 'CAD-01',
          codigoBarras: null,
          descricao: 'Cadeira Goah',
          quantidade: 1,
          valorUnitario: 892.51,
        },
        {
          codigo: 'EVA-18',
          codigoBarras: '7891234567895',
          descricao: 'Evaporadora 18',
          quantidade: 2,
          valorUnitario: 1224.65,
        },
      ],
    });
  });

  it('aceita prefixo de namespace nas tags', () => {
    const xml = XML.replaceAll(/<(\/?)(\w+)/g, '<$1nfe:$2').replace('<nfe:?xml', '<?xml');
    expect(lerNfeXml(xml).numeroNf).toBe('55252');
  });

  it('recusa arquivo que não é NF-e', () => {
    expect(() => lerNfeXml('<html></html>')).toThrow('XML de NF-e válido');
  });
});
