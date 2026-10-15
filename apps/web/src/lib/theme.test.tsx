import { render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '../app/providers/ThemeProvider';
import { matchMediaStub } from '../test/match-media';
import { readStoredTheme, resolveTheme, storeTheme, THEME_STORAGE_KEY, useTheme } from './theme';

function Exibir() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  return (
    <>
      <span data-testid="tema">{`${theme}/${resolvedTheme}`}</span>
      <button type="button" onClick={() => setTheme('dark')}>
        escuro
      </button>
    </>
  );
}

describe('tema', () => {
  it('resolve "system" pela preferência do sistema', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
  });

  it('lê o tema salvo e ignora valores inválidos', () => {
    expect(readStoredTheme()).toBe('system');
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    expect(readStoredTheme()).toBe('dark');
    localStorage.setItem(THEME_STORAGE_KEY, 'roxo');
    expect(readStoredTheme()).toBe('system');
  });

  it('funciona sem localStorage disponível', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });

    expect(() => storeTheme('dark')).not.toThrow();
    expect(readStoredTheme()).toBe('system');
  });

  it('segue o sistema escuro por padrão e aplica a classe dark no <html>', () => {
    vi.stubGlobal('matchMedia', (query: string) => matchMediaStub(query, true));

    render(
      <ThemeProvider>
        <Exibir />
      </ThemeProvider>,
    );

    expect(screen.getByTestId('tema')).toHaveTextContent('system/dark');
    expect(document.documentElement).toHaveClass('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
  });

  it('usa o tema salvo e salva o tema escolhido', async () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    render(
      <ThemeProvider>
        <Exibir />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('tema')).toHaveTextContent('light/light');

    await userEvent.click(screen.getByRole('button', { name: 'escuro' }));

    expect(screen.getByTestId('tema')).toHaveTextContent('dark/dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(document.documentElement).toHaveClass('dark');
  });

  it('exige o ThemeProvider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => renderHook(() => useTheme())).toThrow('useTheme precisa estar dentro');
  });
});
