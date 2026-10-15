import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from './ConfirmDialog';
import { Modal } from './Modal';

function Confirmacao({ onConfirmar }: Readonly<{ onConfirmar: () => unknown }>) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <Button onClick={() => setAberto(true)}>Excluir unidade</Button>
      <ConfirmDialog
        aberto={aberto}
        onAbertoChange={setAberto}
        titulo="Excluir unidade?"
        descricao="Esta ação não pode ser desfeita."
        rotuloConfirmar="Excluir"
        onConfirmar={onConfirmar}
      />
    </>
  );
}

describe('ConfirmDialog', () => {
  it('confirma pelo teclado, espera a ação e fecha devolvendo o foco', async () => {
    const user = userEvent.setup();
    let concluir = () => {};
    const onConfirmar = vi.fn(() => new Promise<void>((resolve) => (concluir = resolve)));
    render(<Confirmacao onConfirmar={onConfirmar} />);

    await user.click(screen.getByRole('button', { name: 'Excluir unidade' }));
    const dialogo = await screen.findByRole('alertdialog', { name: 'Excluir unidade?' });
    expect(dialogo).toHaveAccessibleDescription('Esta ação não pode ser desfeita.');
    // O foco começa no "Cancelar" (ação segura); Tab leva ao "Excluir".
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus();
    await user.tab();
    await user.keyboard('{Enter}');

    expect(onConfirmar).toHaveBeenCalledOnce();
    const excluir = screen.getByRole('button', { name: 'Excluir' });
    expect(excluir).toHaveAttribute('aria-disabled', 'true');
    expect(excluir).toHaveFocus();
    // Esc e cliques repetidos são ignorados enquanto a ação roda.
    await user.keyboard('{Escape}');
    await user.click(excluir);
    expect(onConfirmar).toHaveBeenCalledOnce();
    concluir();
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Excluir unidade' })).toHaveFocus(),
    );
  });

  it('continua aberto quando a ação falha', async () => {
    const user = userEvent.setup();
    const onConfirmar = vi.fn().mockRejectedValue(new Error('falhou'));
    render(<Confirmacao onConfirmar={onConfirmar} />);

    await user.click(screen.getByRole('button', { name: 'Excluir unidade' }));
    await user.click(await screen.findByRole('button', { name: 'Excluir' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Excluir' })).toHaveAttribute(
        'aria-disabled',
        'false',
      ),
    );
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('cancela com Esc sem executar a ação', async () => {
    const user = userEvent.setup();
    const onConfirmar = vi.fn();
    render(<Confirmacao onConfirmar={onConfirmar} />);

    await user.click(screen.getByRole('button', { name: 'Excluir unidade' }));
    await screen.findByRole('alertdialog');
    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(onConfirmar).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Excluir unidade' })).toHaveFocus();
  });
});

describe('Modal', () => {
  it('abre com título, conteúdo e rodapé e fecha pelo botão Fechar', async () => {
    const user = userEvent.setup();
    const onAbertoChange = vi.fn();
    render(
      <Modal
        aberto
        onAbertoChange={onAbertoChange}
        titulo="Nova unidade"
        rodape={<Button>Salvar</Button>}
      >
        <p>Corpo</p>
      </Modal>,
    );

    const dialogo = screen.getByRole('dialog', { name: 'Nova unidade' });
    expect(dialogo).toHaveTextContent('Corpo');
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(onAbertoChange).toHaveBeenCalledWith(false);
  });

  it('mostra a descrição quando informada', () => {
    render(
      <Modal
        aberto
        onAbertoChange={() => {}}
        titulo="Editar"
        descricao="Altere os dados."
        tamanho="lg"
      >
        <p>Corpo</p>
      </Modal>,
    );

    expect(screen.getByRole('dialog')).toHaveAccessibleDescription('Altere os dados.');
  });
});
