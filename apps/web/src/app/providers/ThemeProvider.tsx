import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import {
  applyTheme,
  readStoredTheme,
  resolveTheme,
  storeTheme,
  systemPrefersDark,
  ThemeContext,
  watchSystemTheme,
  type Theme,
} from '@/lib/theme';

/**
 * Tema claro, escuro ou do sistema. O do usuário logado vem da sessão (SincronizarPreferencias);
 * o navegador guarda uma cópia para aplicar antes da primeira pintura.
 */
export function ThemeProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);
  const prefersDark = useSyncExternalStore(watchSystemTheme, systemPrefersDark);
  const resolvedTheme = resolveTheme(theme, prefersDark);

  useEffect(() => applyTheme(resolvedTheme), [resolvedTheme]);

  const setTheme = useCallback((novo: Theme) => {
    storeTheme(novo);
    setThemeState(novo);
  }, []);

  const value = useMemo(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
