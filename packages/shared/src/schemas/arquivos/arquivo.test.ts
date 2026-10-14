import { describe, expect, it } from 'vitest';
import '../../zod-pt-br';
import {
  acceptDoUso,
  ARQUIVO_MAX_BYTES,
  ARQUIVO_USOS,
  ARQUIVO_VAZIO_MENSAGEM,
  arquivoConteudoQuerySchema,
  arquivoUsoConfig,
  descreverFormatos,
  extensaoArquivo,
  formatarTamanho,
  formatoDoArquivo,
  uploadArquivoQuerySchema,
  validarArquivo,
} from './arquivo';

const MB = 1024 * 1024;

describe('validarArquivo', () => {
  it('aceita formato e tamanho do uso, com MIME informado ou genérico', () => {
    expect(validarArquivo({ nome: 'foto.PNG', tipo: 'image/png', tamanho: MB }, 'avatar')).toBe(
      null,
    );
    expect(
      validarArquivo({ nome: 'extrato.ofx', tipo: '', tamanho: 10 }, 'extrato-conciliacao'),
    ).toBe(null);
    expect(
      validarArquivo(
        { nome: 'extrato.csv', tipo: 'application/vnd.ms-excel', tamanho: 10 },
        'extrato-conciliacao',
      ),
    ).toBe(null);
    expect(validarArquivo({ nome: 'nota.xml', tamanho: 10 }, 'nfe-xml')).toBe(null);
  });

  it('recusa extensão fora da whitelist do uso ou MIME incompatível', () => {
    const mensagem = 'Tipo de arquivo não permitido. Envie JPG, PNG ou GIF';
    expect(
      validarArquivo({ nome: 'doc.pdf', tipo: 'application/pdf', tamanho: 10 }, 'avatar'),
    ).toBe(mensagem);
    expect(validarArquivo({ nome: 'semextensao', tamanho: 10 }, 'avatar')).toBe(mensagem);
    expect(validarArquivo({ nome: 'foto.png', tipo: 'text/html', tamanho: 10 }, 'avatar')).toBe(
      mensagem,
    );
  });

  it('recusa arquivo vazio ou acima do limite do uso', () => {
    expect(validarArquivo({ nome: 'a.png', tamanho: 0 }, 'avatar')).toBe(ARQUIVO_VAZIO_MENSAGEM);
    expect(validarArquivo({ nome: 'a.png', tamanho: 2 * MB + 1 }, 'avatar')).toBe(
      'O arquivo deve ter no máximo 2 MB',
    );
    expect(validarArquivo({ nome: 'a.png', tamanho: 2 * MB }, 'avatar')).toBe(null);
  });
});

describe('auxiliares', () => {
  it('extensão, formatos e tamanho legíveis', () => {
    expect(extensaoArquivo('Relatório.Final.PDF')).toBe('pdf');
    expect(extensaoArquivo('.oculto')).toBe('');
    expect(descreverFormatos('nfe-xml')).toBe('XML');
    expect(descreverFormatos('extrato-conciliacao')).toBe('OFX ou CSV');
    expect(formatarTamanho(16 * MB)).toBe('16 MB');
    expect(formatarTamanho(1.5 * MB)).toBe('1.5 MB');
    expect(formatarTamanho(100)).toBe('1 KB');
    expect(formatoDoArquivo('a.jpeg', 'avatar')).toBe('jpeg');
    expect(formatoDoArquivo('a.webp', 'avatar')).toBeUndefined();
    expect(acceptDoUso('extrato-conciliacao')).toBe('.ofx,.csv');
    expect(arquivoUsoConfig('avatar')).toBe(ARQUIVO_USOS.avatar);
    expect(ARQUIVO_MAX_BYTES).toBe(16 * MB);
  });
});

describe('uploadArquivoQuerySchema', () => {
  it('exige um uso do catálogo', () => {
    expect(uploadArquivoQuerySchema.parse({ uso: 'avatar' })).toEqual({ uso: 'avatar' });
    expect(uploadArquivoQuerySchema.safeParse({}).error?.issues[0]?.message).toBe(
      'Informe o uso do arquivo',
    );
    expect(uploadArquivoQuerySchema.safeParse({ uso: 'x' }).error?.issues[0]?.message).toBe(
      'Uso de arquivo inválido',
    );
  });
});

describe('arquivoConteudoQuerySchema', () => {
  it('converte a expiração e confere o formato da assinatura', () => {
    const assinatura = 'a'.repeat(43);
    expect(arquivoConteudoQuerySchema.parse({ expira: '1700000000', assinatura })).toEqual({
      expira: 1700000000,
      assinatura,
    });
    const invalido = arquivoConteudoQuerySchema.safeParse({ expira: 'x', assinatura: 'curta' });
    expect(invalido.error?.issues.map((i) => i.message)).toEqual([
      'Link inválido',
      'Link inválido',
    ]);
  });
});
