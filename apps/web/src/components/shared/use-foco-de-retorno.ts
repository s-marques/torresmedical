import { useRef } from 'react';

interface EventoDeFoco {
  preventDefault: () => void;
}

/**
 * Elemento que deve receber o foco de volta. Um item de menu (ex.: "Excluir" no "⋯" da linha)
 * some quando o menu fecha: nesse caso, volta para o botão que abriu o menu.
 */
function origemDoFoco(): HTMLElement | null {
  const ativo = document.activeElement;
  if (!(ativo instanceof HTMLElement) || ativo === document.body) return null;
  const menu = ativo.closest<HTMLElement>('[role="menu"]');
  // Os ids do React (`«r1»`) não servem direto em seletor CSS: compara o atributo.
  const gatilho = menu?.id
    ? Array.from(document.querySelectorAll<HTMLElement>('[aria-controls]')).find(
        (el) => el.getAttribute('aria-controls') === menu.id,
      )
    : undefined;
  return gatilho ?? ativo;
}

/**
 * Devolve o foco a quem abriu o diálogo ao fechar. O Radix só devolve ao `<DialogTrigger>`;
 * os diálogos controlados (`aberto`/`onAbertoChange`) não têm trigger e o foco iria para o
 * `<body>`, o que atrapalha quem usa o teclado. Se o elemento sumiu, o Radix segue o padrão.
 */
export function useFocoDeRetorno() {
  const origem = useRef<HTMLElement | null>(null);
  return {
    onOpenAutoFocus: () => {
      origem.current = origemDoFoco();
    },
    onCloseAutoFocus: (evento: EventoDeFoco) => {
      const elemento = origem.current;
      origem.current = null;
      if (!elemento?.isConnected) return;
      evento.preventDefault();
      elemento.focus();
    },
  };
}
