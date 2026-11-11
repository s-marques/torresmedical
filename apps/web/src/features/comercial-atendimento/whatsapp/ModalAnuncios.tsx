import { MegaphoneIcon } from 'lucide-react';
import { useId, useState } from 'react';
import { EmptyState } from '@/components/shared/EmptyState';
import { Modal } from '@/components/shared/Modal';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { periodoInicialAnuncios } from './formatar';

export interface ModalAnunciosProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
}

/**
 * Modal "Contatos vindos de anúncio" (botão Anúncios). A origem do anúncio chega pela
 * integração com o provedor do WhatsApp, que é de uma issue própria: até lá, só o período.
 * As colunas da lista dependem de um print do dev (pendente).
 */
export function ModalAnuncios({ aberto, onAbertoChange }: Readonly<ModalAnunciosProps>) {
  const [periodo, setPeriodo] = useState(periodoInicialAnuncios);
  const id = useId();

  return (
    <Modal
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo="Contatos vindos de anúncio"
      tamanho="lg"
    >
      <div className="grid gap-4">
        <div className="flex flex-wrap gap-4">
          <div className="grid gap-2">
            <Label htmlFor={`${id}-de`}>De</Label>
            <Input
              id={`${id}-de`}
              type="date"
              value={periodo.de}
              max={periodo.ate}
              onChange={(evento) => setPeriodo((p) => ({ ...p, de: evento.target.value }))}
              className="w-auto"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${id}-ate`}>Até</Label>
            <Input
              id={`${id}-ate`}
              type="date"
              value={periodo.ate}
              min={periodo.de}
              onChange={(evento) => setPeriodo((p) => ({ ...p, ate: evento.target.value }))}
              className="w-auto"
            />
          </div>
        </div>
        <EmptyState
          icone={MegaphoneIcon}
          titulo="Nenhum contato vindo de anúncio."
          descricao="Os contatos de anúncios chegam pela integração com o WhatsApp, ainda não disponível."
          className="rounded-lg border"
        />
      </div>
    </Modal>
  );
}
