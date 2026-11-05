import { SearchIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import type { CompraXmlPrevia } from '@torres/shared';
import { useImportarXmlCompra } from './use-compras';

const TAMANHO_MAXIMO_BYTES = 5 * 1024 * 1024;

export interface ModalImportarXmlProps {
  onFechar: () => void;
  /** Recebe a prévia da nota para abrir "Nova Compra" já preenchida. */
  onPrevia: (previa: CompraXmlPrevia) => void;
}

/** Modal "Importar XML de NF-e": escolhe o arquivo e abre a compra com os dados da nota. */
export function ModalImportarXml({ onFechar, onPrevia }: Readonly<ModalImportarXmlProps>) {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const entrada = useRef<HTMLInputElement>(null);
  const importar = useImportarXmlCompra();

  function selecionar(evento: React.ChangeEvent<HTMLInputElement>) {
    const escolhido = evento.target.files?.[0] ?? null;
    if (escolhido && !escolhido.name.toLowerCase().endsWith('.xml')) {
      toast.error('Envie um arquivo XML.');
      if (entrada.current) entrada.current.value = '';
      setArquivo(null);
      return;
    }
    if (escolhido && escolhido.size > TAMANHO_MAXIMO_BYTES) {
      toast.error('O arquivo deve ter no máximo 5 MB.');
      if (entrada.current) entrada.current.value = '';
      setArquivo(null);
      return;
    }
    setArquivo(escolhido);
  }

  async function visualizar() {
    if (!arquivo) return;
    const previa = await importar.mutateAsync(await arquivo.text());
    onPrevia(previa);
  }

  return (
    <Modal aberto onAbertoChange={(aberto) => aberto || onFechar()} titulo="Importar XML de NF-e">
      <div className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="arquivo-xml">Arquivo XML da Nota Fiscal</Label>
          <input
            ref={entrada}
            id="arquivo-xml"
            type="file"
            accept=".xml,application/xml,text/xml"
            onChange={selecionar}
            className="rounded-md border px-3 py-2 text-sm"
          />
        </div>
        <Button
          type="button"
          disabled={!arquivo || importar.isPending}
          aria-busy={importar.isPending}
          onClick={() => void visualizar()}
        >
          <SearchIcon aria-hidden />
          Visualizar Nota
        </Button>
      </div>
    </Modal>
  );
}
