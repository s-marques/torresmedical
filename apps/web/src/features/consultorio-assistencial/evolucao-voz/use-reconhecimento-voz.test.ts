import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  formatarCronometro,
  juntarTrecho,
  MENSAGEM_FALHA,
  useCronometro,
  useReconhecimentoVoz,
} from './use-reconhecimento-voz';

describe('formatarCronometro', () => {
  it('mostra minutos e segundos com dois dígitos', () => {
    expect(formatarCronometro(0)).toBe('00:00');
    expect(formatarCronometro(65)).toBe('01:05');
    expect(formatarCronometro(75 * 60 + 3)).toBe('75:03');
  });
});

describe('juntarTrecho', () => {
  it('separa os trechos por um espaço', () => {
    expect(juntarTrecho('', 'Olá')).toBe('Olá');
    expect(juntarTrecho('Olá  ', 'mundo')).toBe('Olá mundo');
  });
});

describe('useCronometro', () => {
  afterEach(() => vi.useRealTimers());

  it('conta só enquanto ativo e zera', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ ativo }) => useCronometro(ativo), {
      initialProps: { ativo: true },
    });
    act(() => vi.advanceTimersByTime(3000));
    expect(result.current.segundos).toBe(3);

    rerender({ ativo: false });
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.segundos).toBe(3);

    act(() => result.current.zerar());
    expect(result.current.segundos).toBe(0);
  });
});

describe('useReconhecimentoVoz', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('falha ao iniciar ou no meio da gravação mostra a mensagem e para', () => {
    class Falha {
      lang = '';
      continuous = false;
      interimResults = false;
      onresult = null;
      onerror: ((e: { error: string }) => void) | null = null;
      onend = null;
      start = vi.fn(() => {
        throw new Error('ocupado');
      });
      stop = vi.fn();
      abort = vi.fn();
    }
    vi.stubGlobal('SpeechRecognition', Falha);
    const { result } = renderHook(() => useReconhecimentoVoz(vi.fn()));

    act(() => result.current.iniciar());
    expect(result.current).toMatchObject({ gravando: false, erro: MENSAGEM_FALHA });
  });

  it('ignora "no-speech" e trata outros erros como falha', () => {
    let instancia: { onerror: ((e: { error: string }) => void) | null } | null = null;
    class Simples {
      lang = '';
      continuous = false;
      interimResults = false;
      onresult = null;
      onerror: ((e: { error: string }) => void) | null = null;
      onend = null;
      start = vi.fn();
      stop = vi.fn();
      abort = vi.fn();
      constructor() {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        instancia = this;
      }
    }
    vi.stubGlobal('SpeechRecognition', Simples);
    const { result, unmount } = renderHook(() => useReconhecimentoVoz(vi.fn()));

    act(() => result.current.iniciar());
    act(() => instancia?.onerror?.({ error: 'no-speech' }));
    expect(result.current).toMatchObject({ gravando: true, erro: null });

    act(() => instancia?.onerror?.({ error: 'network' }));
    expect(result.current).toMatchObject({ gravando: false, erro: MENSAGEM_FALHA });
    unmount();
  });
});
