import type { CanalWhatsapp } from '@torres/shared';
import { useState } from 'react';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/ui/button';
import { SeletorUsuarios } from './SeletorUsuarios';
import { useDefinirUsuariosCanal } from './use-canais-whatsapp';

/** Modal "Usuários — <canal>": quem pode ver o canal. Nenhum marcado = todos têm acesso. */
export function ModalUsuariosCanal({
  canal,
  onFechar,
}: Readonly<{ canal: CanalWhatsapp; onFechar: () => void }>) {
  const [selecionados, setSelecionados] = useState<string[]>(canal.usuarioIds);
  const definir = useDefinirUsuariosCanal(canal.id);

  async function salvar() {
    await definir.mutateAsync({ usuarioIds: selecionados });
    onFechar();
  }

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo={`Usuarios — ${canal.nome}`}
      descricao="Selecione quais usuarios podem ver este canal. Se nenhum for selecionado, todos terao acesso."
      rodape={
        <>
          <Button type="button" variant="outline" onClick={onFechar}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={definir.isPending}
            onClick={() => void salvar().catch(() => undefined)}
          >
            Salvar
          </Button>
        </>
      }
    >
      <SeletorUsuarios value={selecionados} onChange={setSelecionados} mostrarEmail />
    </Modal>
  );
}
