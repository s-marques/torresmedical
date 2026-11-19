import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { entrar } from '@/lib/auth/sessao';
import { errosDoZod } from '@/lib/forms/erros-zod';
import { apiFalsa, sessaoJson, USUARIO_TESTE } from '../../test/render-app';
import { iniciais } from '@/lib/formatar';
import { SePermitido } from './SePermitido';

async function logarCom(permissoes: (typeof USUARIO_TESTE)['permissoes']) {
  vi.stubGlobal(
    'fetch',
    apiFalsa({
      rotas: { '/api/auth/login': () => sessaoJson({ ...USUARIO_TESTE, permissoes }) },
    }),
  );
  await entrar({ email: 'pessoa@example.com', senha: 'x' });
}

describe('SePermitido', () => {
  it('mostra o conteúdo com a permissão', async () => {
    await logarCom(['financeiro.caixas.criar']);

    render(
      <SePermitido permissao="financeiro.caixas.criar">
        <button type="button">Novo caixa</button>
      </SePermitido>,
    );

    expect(screen.getByRole('button', { name: 'Novo caixa' })).toBeInTheDocument();
  });

  it('esconde sem a permissão, ou mostra a alternativa', async () => {
    await logarCom(['financeiro.caixas.ver']);

    render(
      <>
        <SePermitido permissao="financeiro.caixas.criar">
          <button type="button">Novo caixa</button>
        </SePermitido>
        <SePermitido permissao="financeiro.caixas.excluir" senao={<span>Somente leitura</span>}>
          <button type="button">Excluir</button>
        </SePermitido>
      </>,
    );

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('Somente leitura')).toBeInTheDocument();
  });

  it('sem sessão não mostra nada', () => {
    render(
      <SePermitido permissao="financeiro.caixas.ver">
        <span>Caixas</span>
      </SePermitido>,
    );

    expect(screen.queryByText('Caixas')).not.toBeInTheDocument();
  });
});

describe('utilitários', () => {
  it('iniciais do primeiro e do último nome', () => {
    expect(iniciais('ana maria souza')).toBe('AS');
    expect(iniciais('Bruno')).toBe('B');
    expect(iniciais('  ')).toBe('?');
  });

  it('erros do Zod: o primeiro de cada campo', () => {
    expect(
      errosDoZod([
        { path: ['email'], message: 'Informe o e-mail' },
        { path: ['email'], message: 'outra' },
        { path: ['endereco', 'cep'], message: 'CEP inválido' },
      ]),
    ).toEqual({ email: 'Informe o e-mail', 'endereco.cep': 'CEP inválido' });
  });
});
