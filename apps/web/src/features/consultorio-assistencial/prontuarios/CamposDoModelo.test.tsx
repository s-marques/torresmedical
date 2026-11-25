import { modeloSecoesSchema, type AtendimentoModelo } from '@torres/shared';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormProvider, useForm } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';
import { CamposDoModelo, RespostasDoModelo } from './CamposDoModelo';
import { conferirRespostas, respostasIniciais } from './respostas-modelo';

vi.setConfig({ testTimeout: 20_000 });

const SECOES = modeloSecoesSchema.parse([
  {
    titulo: 'Avaliação',
    campos: [
      { chave: 'queixa', rotulo: 'Queixa', tipo: 'TEXTO', obrigatorio: true },
      { chave: 'peso', rotulo: 'Peso', tipo: 'NUMERO', min: 1, max: 500 },
      { chave: 'nivel', rotulo: 'Nível', tipo: 'LISTA', opcoes: ['Baixo', 'Alto'] },
      { chave: 'retorno', rotulo: 'Retorno', tipo: 'DATA' },
      { chave: 'dor', rotulo: 'Dor', tipo: 'ESCALA', min: 0, max: 3 },
    ],
  },
]);

function Formulario({ onEnviar }: Readonly<{ onEnviar: (valores: unknown) => void }>) {
  const form = useForm({ defaultValues: { respostas: respostasIniciais(SECOES, { peso: 70 }) } });
  return (
    <FormProvider {...form}>
      <form
        onSubmit={form.handleSubmit((valores) => {
          if (conferirRespostas(form, SECOES, valores.respostas, true)) onEnviar(valores.respostas);
        })}
      >
        <CamposDoModelo secoes={SECOES} />
        <button type="submit">Enviar</button>
      </form>
    </FormProvider>
  );
}

describe('respostasIniciais', () => {
  it('um valor por campo: texto vazio, número ou null conforme o tipo', () => {
    expect(respostasIniciais(SECOES, null)).toEqual({
      queixa: '',
      peso: null,
      nivel: '',
      retorno: '',
      dor: '',
    });
    expect(respostasIniciais(SECOES, { peso: 70, dor: 2, queixa: 'Dor' })).toMatchObject({
      queixa: 'Dor',
      peso: 70,
      dor: '2',
    });
  });
});

describe('CamposDoModelo', () => {
  it('renderiza um campo por tipo e confere as respostas ao enviar', async () => {
    const onEnviar = vi.fn();
    const user = userEvent.setup();
    render(<Formulario onEnviar={onEnviar} />);

    expect(screen.getByRole('group', { name: 'Avaliação' })).toBeVisible();
    expect(screen.getByLabelText(/Queixa/)).toBeVisible();
    expect(screen.getByLabelText('Peso')).toHaveValue(70);
    expect(screen.getByRole('combobox', { name: 'Nível' })).toBeVisible();
    expect(screen.getByLabelText('Retorno')).toHaveAttribute('type', 'date');

    await user.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(await screen.findByText('Queixa é obrigatório.')).toBeVisible();
    expect(onEnviar).not.toHaveBeenCalled();

    // A escala vai do mínimo ao máximo do campo.
    await user.click(screen.getByRole('combobox', { name: 'Dor' }));
    expect(await screen.findAllByRole('option')).toHaveLength(4);
    await user.click(screen.getByRole('option', { name: '2' }));
    await user.click(screen.getByRole('combobox', { name: 'Nível' }));
    await user.click(await screen.findByRole('option', { name: 'Alto' }));
    await user.type(screen.getByLabelText(/Queixa/), 'Dor lombar');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));

    await waitFor(() => expect(onEnviar).toHaveBeenCalled());
    expect(onEnviar).toHaveBeenCalledWith(
      expect.objectContaining({ queixa: 'Dor lombar', nivel: 'Alto', dor: '2', peso: 70 }),
    );
  });

  it('marca o valor fora da faixa', async () => {
    const user = userEvent.setup();
    render(<Formulario onEnviar={vi.fn()} />);

    const peso = screen.getByLabelText('Peso');
    await user.clear(peso);
    await user.type(peso, '900');
    await user.type(screen.getByLabelText(/Queixa/), 'x');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(await screen.findByText('Deve ser menor ou igual a 500')).toBeVisible();
  });
});

describe('RespostasDoModelo', () => {
  const modelo: AtendimentoModelo = {
    modeloId: '00000000-0000-4000-8000-0000000000f1',
    versaoId: '00000000-0000-4000-8000-0000000000f2',
    nome: 'Anamnese',
    versao: 3,
    secoes: SECOES,
  };

  it('mostra a versão usada, os valores formatados e "não informado" nos vazios', () => {
    render(
      <RespostasDoModelo
        modelo={modelo}
        respostas={{ queixa: 'Dor lombar', retorno: '2026-12-01', dor: 2, nivel: null }}
      />,
    );
    const secao = screen.getByRole('region', { name: 'Respostas do modelo' });
    expect(within(secao).getByText('Modelo: Anamnese (versão 3)')).toBeVisible();
    expect(within(secao).getByText('Dor lombar')).toBeVisible();
    expect(within(secao).getByText('01/12/2026')).toBeVisible();
    expect(within(secao).getByText('2/3')).toBeVisible();
    expect(within(secao).getAllByText('Não informado')).toHaveLength(2);
  });
});
