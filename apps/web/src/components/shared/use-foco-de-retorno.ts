import { useRef } from 'react';

interface EventoDeFoco {
  preventDefault: () => void;
}

/**
 * Devolve o foco a quem abriu o diálogo ao fechar. O Radix só devolve ao `<DialogTrigger>`;
 * os diálogos controlados (`aberto`/`onAbertoChange`) não têm trigger e o foco iria para o
 * `<body>`, o que atrapalha quem usa o teclado. Se o elemento sumiu (ex.: item de um menu),
 * o Radix segue o comportamento padrão.
 */
export function useFocoDeRetorno() {
  const origem = useRef<HTMLElement | null>(null);
  return {
    onOpenAutoFocus: () => {
      origem.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
    },
    onCloseAutoFocus: (evento: EventoDeFoco) => {
      const elemento = origem.current;
      origem.current = null;
      if (!elemento?.isConnected || elemento === document.body) return;
      evento.preventDefault();
      elemento.focus();
    },
  };
}
