import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
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

/** Tema claro, escuro ou do sistema, salvo no navegador. */
export function ThemeProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);
  const prefersDark = useSyncExternalStore(watchSystemTheme, systemPrefersDark);
  const resolvedTheme = resolveTheme(theme, prefersDark);

  useEffect(() => applyTheme(resolvedTheme), [resolvedTheme]);

  const value = useMemo(
    () => ({
      theme,
      resolvedTheme,
      setTheme: (novo: Theme) => {
        storeTheme(novo);
        setThemeState(novo);
      },
    }),
    [theme, resolvedTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
