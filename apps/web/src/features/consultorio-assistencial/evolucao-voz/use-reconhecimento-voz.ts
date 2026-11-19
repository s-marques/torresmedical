import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Reconhecimento de voz do próprio navegador (Web Speech API), em pt-BR e em tempo real.
 * Escolhido pelo dev em vez de um provedor no back: nada de áudio passa pela API, só o texto
 * salvo. Funciona no Chrome e no Edge; nos demais a gravação fica indisponível.
 */

interface AlternativaVoz {
  transcript: string;
}

interface ResultadoVoz {
  readonly isFinal: boolean;
  readonly length: number;
  [indice: number]: AlternativaVoz;
}

interface EventoResultadoVoz {
  readonly resultIndex: number;
  readonly results: { readonly length: number; [indice: number]: ResultadoVoz };
}

interface EventoErroVoz {
  readonly error: string;
}

export interface ReconhecimentoVoz {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((evento: EventoResultadoVoz) => void) | null;
  onerror: ((evento: EventoErroVoz) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

export type ConstrutorReconhecimentoVoz = new () => ReconhecimentoVoz;

type JanelaComVoz = Window & {
  SpeechRecognition?: ConstrutorReconhecimentoVoz;
  webkitSpeechRecognition?: ConstrutorReconhecimentoVoz;
};

export function construtorReconhecimentoVoz(): ConstrutorReconhecimentoVoz | undefined {
  const janela = window as JanelaComVoz;
  return janela.SpeechRecognition ?? janela.webkitSpeechRecognition;
}

export const MENSAGEM_SEM_SUPORTE =
  'Seu navegador não permite transcrição por voz. Use o Google Chrome ou o Microsoft Edge.';
export const MENSAGEM_SEM_MICROFONE = 'Permita o acesso ao microfone para gravar a consulta.';
export const MENSAGEM_FALHA = 'Não foi possível continuar a transcrição. Tente gravar de novo.';

/** Erros que só encerram um trecho: a gravação continua sozinha. */
const ERROS_IGNORADOS = new Set(['no-speech', 'aborted']);
const ERROS_PERMISSAO = new Set(['not-allowed', 'service-not-allowed', 'audio-capture']);

export interface UseReconhecimentoVoz {
  suportado: boolean;
  gravando: boolean;
  /** Trecho ainda em reconhecimento (muda enquanto a pessoa fala). */
  parcial: string;
  erro: string | null;
  iniciar: () => void;
  parar: () => void;
}

/** `onTrecho` recebe cada trecho final reconhecido, já sem espaços nas pontas. */
export function useReconhecimentoVoz(onTrecho: (trecho: string) => void): UseReconhecimentoVoz {
  const [suportado] = useState(() => construtorReconhecimentoVoz() !== undefined);
  const [gravando, setGravando] = useState(false);
  const [parcial, setParcial] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const reconhecimento = useRef<ReconhecimentoVoz | null>(null);
  // O navegador encerra o reconhecimento depois de um silêncio: enquanto `continuar` for
  // verdadeiro, ele é reiniciado no `onend`.
  const continuar = useRef(false);
  const trechoRef = useRef(onTrecho);

  useEffect(() => {
    trechoRef.current = onTrecho;
  }, [onTrecho]);

  const encerrar = useCallback(() => {
    continuar.current = false;
    setGravando(false);
    setParcial('');
  }, []);

  const iniciar = useCallback(() => {
    const Construtor = construtorReconhecimentoVoz();
    if (!Construtor) {
      setErro(MENSAGEM_SEM_SUPORTE);
      return;
    }
    const rec = new Construtor();
    rec.lang = 'pt-BR';
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (evento) => {
      let emAndamento = '';
      for (let i = evento.resultIndex; i < evento.results.length; i++) {
        const resultado = evento.results[i];
        const texto = resultado?.[0]?.transcript ?? '';
        if (resultado?.isFinal) {
          const trecho = texto.trim();
          if (trecho) trechoRef.current(trecho);
        } else {
          emAndamento += texto;
        }
      }
      setParcial(emAndamento.trim());
    };
    rec.onerror = (evento) => {
      if (ERROS_IGNORADOS.has(evento.error)) return;
      setErro(ERROS_PERMISSAO.has(evento.error) ? MENSAGEM_SEM_MICROFONE : MENSAGEM_FALHA);
      encerrar();
    };
    rec.onend = () => {
      if (!continuar.current) return;
      try {
        rec.start();
      } catch {
        encerrar();
      }
    };
    reconhecimento.current = rec;
    continuar.current = true;
    setErro(null);
    try {
      rec.start();
      setGravando(true);
    } catch {
      setErro(MENSAGEM_FALHA);
      encerrar();
    }
  }, [encerrar]);

  const parar = useCallback(() => {
    encerrar();
    reconhecimento.current?.stop();
  }, [encerrar]);

  useEffect(
    () => () => {
      continuar.current = false;
      reconhecimento.current?.abort();
    },
    [],
  );

  return { suportado, gravando, parcial, erro, iniciar, parar };
}

/** Cronômetro da gravação em segundos: conta só enquanto `ativo`. */
export function useCronometro(ativo: boolean) {
  const [segundos, setSegundos] = useState(0);
  useEffect(() => {
    if (!ativo) return;
    const intervalo = window.setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => window.clearInterval(intervalo);
  }, [ativo]);
  const zerar = useCallback(() => setSegundos(0), []);
  return { segundos, zerar };
}

/** `00:00`; passa de 59 minutos sem virar hora (`75:03`). */
export function formatarCronometro(segundos: number): string {
  const minutos = Math.floor(segundos / 60);
  return `${String(minutos).padStart(2, '0')}:${String(segundos % 60).padStart(2, '0')}`;
}

/** Acrescenta o trecho reconhecido ao texto, separado por um espaço. */
export function juntarTrecho(texto: string, trecho: string): string {
  const base = texto.trimEnd();
  return base ? `${base} ${trecho}` : trecho;
}
