import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  gerarCodigoOrigemCliente,
  isPermissao,
  MOTIVO_CODIGO_CONTRATO_CANCELADO,
  MOTIVO_CODIGO_OUTRO,
  TIPOS_CANCELAMENTO,
} from '@torres/shared';

/**
 * Garante que a migration dos cancelamentos (issue #162) segue o código: os motivos iniciais têm
 * o código que o gerador do cadastro geraria (a conferência de nome repetido depende disso), cada
 * tipo tem o "Outro" de sistema e o administrador só recebe permissões do catálogo.
 */
const PASTA = join(__dirname, 'migrations');
const nome = readdirSync(PASTA).find((n) => n.endsWith('_criar_cancelamentos'));
const sql = readFileSync(join(PASTA, nome ?? '', 'migration.sql'), 'utf8');

interface MotivoSql {
  tipo: string;
  nome: string;
  codigo: string;
  exigeTexto: boolean;
  sistema: boolean;
  ordem: number;
}

function motivosNoSql(): MotivoSql[] {
  const bloco = sql.slice(
    sql.indexOf('INSERT INTO "motivos_cancelamento"'),
    sql.indexOf('-- Histórico dos cancelamentos'),
  );
  const linha = /^\s*\('([A-Z]+)', '([^']+)', '([^']+)', (true|false), (true|false), (\d+)\),?$/gm;
  return [...bloco.matchAll(linha)].map(
    ([, tipo = '', n = '', codigo = '', texto, sistema, ordem]) => ({
      tipo,
      nome: n,
      codigo,
      exigeTexto: texto === 'true',
      sistema: sistema === 'true',
      ordem: Number(ordem),
    }),
  );
}

describe('migration criar_cancelamentos', () => {
  const motivos = motivosNoSql();

  it('existe e traz motivos para os cinco tipos', () => {
    expect(nome).toBeDefined();
    expect([...new Set(motivos.map((m) => m.tipo))].sort()).toEqual([...TIPOS_CANCELAMENTO].sort());
  });

  // O motivo de sistema da cascata tem código fixo (o código o procura por ele).
  it.each(motivos.filter((m) => m.codigo !== MOTIVO_CODIGO_CONTRATO_CANCELADO))(
    '$tipo / $nome: o código é o que o cadastro geraria',
    (motivo) => {
      expect(motivo.codigo).toBe(gerarCodigoOrigemCliente(motivo.nome));
    },
  );

  it('cada tipo tem um "Outro" de sistema que exige a observação, por último na lista', () => {
    for (const tipo of TIPOS_CANCELAMENTO) {
      const doTipo = motivos.filter((m) => m.tipo === tipo);
      const outro = doTipo.find((m) => m.codigo === MOTIVO_CODIGO_OUTRO);
      expect(outro).toMatchObject({ sistema: true, exigeTexto: true, ordem: 99 });
      expect(Math.max(...doTipo.map((m) => m.ordem))).toBe(99);
    }
  });

  it('nomes e códigos não se repetem dentro do tipo', () => {
    for (const tipo of TIPOS_CANCELAMENTO) {
      const doTipo = motivos.filter((m) => m.tipo === tipo);
      expect(new Set(doTipo.map((m) => m.codigo)).size).toBe(doTipo.length);
      expect(new Set(doTipo.map((m) => m.nome.toLowerCase())).size).toBe(doTipo.length);
    }
  });

  it('a lista de contrato traz os motivos do documento do cliente (R §35)', () => {
    const contrato = motivos.filter((m) => m.tipo === 'CONTRATO' && !m.sistema).map((m) => m.nome);
    expect(contrato).toEqual([
      'Valor',
      'Mudança de cidade',
      'Baixa demanda',
      'Estrutura própria',
      'Horários',
      'Experiência',
    ]);
  });

  it('o motivo usado pela cascata das parcelas existe na cobrança como motivo de sistema', () => {
    expect(
      motivos.find((m) => m.tipo === 'COBRANCA' && m.codigo === MOTIVO_CODIGO_CONTRATO_CANCELADO),
    ).toMatchObject({ sistema: true });
  });

  it('o Administrador recebe só permissões válidas do catálogo', () => {
    const permissoes = [...sql.matchAll(/\('Administrador', '([^']+)'\)/g)].map((m) => m[1] ?? '');
    expect(permissoes.length).toBeGreaterThan(0);
    expect(permissoes.every((p) => isPermissao(p))).toBe(true);
  });

  it('o histórico é só de inserção: a migration não apaga nem altera registros existentes', () => {
    const depois = sql.slice(sql.indexOf('-- Histórico dos cancelamentos'));
    expect(depois).not.toMatch(/\b(DELETE|UPDATE|DROP|TRUNCATE)\b/);
  });
});
