import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { FormField } from './FormField';
import { FormLayout } from './FormLayout';
import { useFormulario } from './use-formulario';

const schema = z.object({
  inicio: z.string().regex(/^\d{2}:\d{2}$/, { error: 'Informe a hora' }),
});

function Exemplo({ onSubmit }: Readonly<{ onSubmit: (valores: { inicio: string }) => void }>) {
  const form = useFormulario(schema, { defaultValues: { inicio: '' } });
  return (
    <FormLayout form={form} onSubmit={onSubmit} rotuloEnviar="Enviar">
      <FormField name="inicio" label="Início" tipo="hora" />
    </FormLayout>
  );
}

describe('FormField tipo "hora"', () => {
  it('usa o campo de hora do navegador e envia HH:MM', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<Exemplo onSubmit={onSubmit} />);

    const campo = screen.getByLabelText('Início');
    expect(campo).toHaveAttribute('type', 'time');

    await user.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(await screen.findByText('Informe a hora')).toBeVisible();
    expect(onSubmit).not.toHaveBeenCalled();

    await user.type(campo, '0830');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(onSubmit).toHaveBeenCalledWith({ inicio: '08:30' });
  });
});
