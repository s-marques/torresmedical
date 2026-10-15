import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import { matchMediaStub } from './match-media';

// O `pnpm -r test` roda API e web em paralelo: sob carga, 1 s (padrão) não basta para o findBy*.
configure({ asyncUtilTimeout: 5000 });

// APIs do navegador que o jsdom não implementa e que Radix, cmdk e o tema usam.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  vi.stubGlobal('matchMedia', matchMediaStub);
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
  document.documentElement.className = '';
  document.documentElement.removeAttribute('style');
});
