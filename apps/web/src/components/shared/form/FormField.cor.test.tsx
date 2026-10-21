import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { FormField } from './FormField';
import { FormLayout } from './FormLayout';
import { useFormulario } from './use-formulario';

const schema = z.object({
  cor: z.string().regex(/^#[0-9a-fA-F]{6}$/, { error: 'Cor inválida' }),
});

function Exemplo({ onSubmit }: Readonly<{ onSubmit: (valores: { cor: string }) => void }>) {
  const form = useFormulario(schema, { defaultValues: { cor: '#3b82f6' } });
  return (
    <FormLayout form={form} onSubmit={onSubmit} rotuloEnviar="Enviar">
      <FormField name="cor" label="Cor" tipo="cor" />
    </FormLayout>
  );
}

describe('FormField tipo "cor"', () => {
  it('mostra o seletor e o campo hexadecimal com o valor atual', () => {
    render(<Exemplo onSubmit={vi.fn()} />);

    expect(screen.getByLabelText('Cor')).toHaveValue('#3b82f6');
    expect(screen.getByLabelText('Escolher Cor')).toHaveValue('#3b82f6');
  });

  it('digitar no campo valida o formato e envia o hexadecimal', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<Exemplo onSubmit={onSubmit} />);

    const campo = screen.getByLabelText('Cor');
    await user.clear(campo);
    await user.type(campo, 'azul');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(await screen.findByText('Cor inválida')).toBeVisible();
    expect(onSubmit).not.toHaveBeenCalled();

    await user.clear(campo);
    await user.type(campo, '#aa5500');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ cor: '#aa5500' }));
  });
});
