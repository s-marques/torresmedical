import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { useState } from 'react';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/ui/button';
import { useDestinatarios, type FiltroConsulta } from './use-campanhas';

export interface ModalDestinatariosProps {
  filtro: FiltroConsulta;
  onFechar: () => void;
}

/** "Visualizar Clientes": quem o filtro alcança, com o telefone mascarado. */
export function ModalDestinatarios({ filtro, onFechar }: Readonly<ModalDestinatariosProps>) {
  const [pagina, setPagina] = useState(1);
  const consulta = useDestinatarios(filtro, pagina);
  const dados = consulta.data;
  const totalPaginas = Math.max(dados?.meta.totalPages ?? 1, 1);

  let conteudo;
  if (consulta.isError) {
    conteudo = (
      <p className="text-sm text-destructive">
        Não foi possível carregar os clientes. Confira o filtro.
      </p>
    );
  } else if (!dados) {
    conteudo = <p className="text-sm text-muted-foreground">Carregando…</p>;
  } else if (dados.data.length === 0) {
    conteudo = <p className="text-sm text-muted-foreground">Nenhum cliente encontrado.</p>;
  } else {
    conteudo = (
      <ul className="divide-y rounded-md border" aria-label="Clientes">
        {dados.data.map((d) => (
          <li key={d.pacienteId} className="flex justify-between gap-4 px-3 py-2 text-sm">
            <span>{d.nome}</span>
            <span className="text-muted-foreground">{d.telefone}</span>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo="Clientes da campanha"
      descricao={dados ? `${dados.meta.total} cliente(s) com celular` : undefined}
      rodape={
        <div className="flex w-full items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground">
            Página {pagina} de {totalPaginas}
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Página anterior"
              disabled={pagina <= 1}
              onClick={() => setPagina((p) => p - 1)}
            >
              <ChevronLeftIcon aria-hidden />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Próxima página"
              disabled={pagina >= totalPaginas}
              onClick={() => setPagina((p) => p + 1)}
            >
              <ChevronRightIcon aria-hidden />
            </Button>
          </div>
        </div>
      }
    >
      {conteudo}
    </Modal>
  );
}
