import { vi } from 'vitest';

/** `matchMedia` falso. Por padrão nada casa: tema do sistema claro e tela de desktop. */
export function matchMediaStub(query: string, matches = false): MediaQueryList {
  return {
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(() => false),
  };
}
