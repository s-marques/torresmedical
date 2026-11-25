import { CSV_BOM, CSV_SEPARATOR, writeCsv } from './csv.writer';
import type { ExportTable } from './export.types';

const GERADO_EM = new Date('2026-10-14T02:00:00.000Z');

function csv(table: ExportTable): string {
  return writeCsv(table).toString('utf8');
}

describe('writeCsv', () => {
  it('grava BOM, cabeçalho e linhas com ; e CRLF', () => {
    const texto = csv({
      title: 'T',
      generatedAt: GERADO_EM,
      columns: [
        { key: 'nome', header: 'Nome' },
        { key: 'valor', header: 'Valor', type: 'currency' },
        { key: 'qtd', header: 'Qtd', type: 'number' },
        { key: 'dia', header: 'Dia', type: 'date' },
        { key: 'hora', header: 'Hora', type: 'datetime' },
        { key: 'ativo', header: 'Ativo', type: 'boolean' },
      ],
      rows: [['Ação', 10.5, 3, new Date('2026-10-14T00:00:00.000Z'), GERADO_EM, true]],
    });

    expect(texto.startsWith(CSV_BOM)).toBe(true);
    expect(texto.split('\r\n')).toEqual([
      `${CSV_BOM}Nome;Valor;Qtd;Dia;Hora;Ativo`,
      'Ação;10,5;3;14/10/2026;13/10/2026, 23:00;Sim',
      '',
    ]);
  });

  it('protege separador, aspas e quebra de linha', () => {
    const texto = csv({
      title: 'T',
      generatedAt: GERADO_EM,
      columns: [{ key: 'a', header: 'A' }],
      rows: [[`a${CSV_SEPARATOR}b`], ['diz "oi"'], ['l1\nl2']],
    });

    expect(texto).toContain('"a;b"');
    expect(texto).toContain('"diz ""oi"""');
    expect(texto).toContain('"l1\nl2"');
  });

  it('neutraliza fórmulas em texto, mas mantém números negativos', () => {
    const texto = csv({
      title: 'T',
      generatedAt: GERADO_EM,
      columns: [
        { key: 'a', header: 'A' },
        { key: 'n', header: 'N', type: 'number' },
      ],
      rows: [
        ['=1+1', -2.5],
        ['@cmd', null],
        ['-x', 'abc'],
      ],
    });
    const linhas = texto.split('\r\n');

    expect(linhas[1]).toBe("'=1+1;-2,5");
    expect(linhas[2]).toBe("'@cmd;");
    expect(linhas[3]).toBe("'-x;abc");
  });

  it('sem linhas grava só o cabeçalho', () => {
    const texto = csv({
      title: 'T',
      generatedAt: GERADO_EM,
      columns: [{ key: 'a', header: 'A' }],
      rows: [],
    });
    expect(texto).toBe('﻿A\r\n');
  });
});
