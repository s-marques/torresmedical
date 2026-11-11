import type { Usuario } from '@torres/shared';
import type { ReactNode } from 'react';
import { Modal } from '@/components/shared/Modal';
import { StatusAtivo } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { formatarDataHora } from '@/lib/formatar';
import { formatarMascara } from '@/lib/forms/mascaras';

export interface ModalVisualizarUsuarioProps {
  usuario: Usuario;
  onFechar: () => void;
}

/** Ação "Visualizar" do menu da linha: detalhe só leitura. */
export function ModalVisualizarUsuario({
  usuario,
  onFechar,
}: Readonly<ModalVisualizarUsuarioProps>) {
  const ITENS: Array<[string, ReactNode]> = [
    ['Nome', usuario.nome],
    ['Email', usuario.email],
    ['Telefone', usuario.telefone ? formatarMascara('telefone', usuario.telefone) : '-'],
    ['Cargo', usuario.cargo ?? '-'],
    ['Role', usuario.perfilNome ?? 'Sem perfil (usa padrão da role)'],
    ['Perfil', usuario.perfilNome ?? 'Sem perfil (usa padrão da role)'],
    ['Status', <StatusAtivo key="status" ativo={usuario.ativo} />],
    ['Ver dados sensíveis (LGPD)', usuario.verDadosSensiveis ? 'Sim' : 'Não'],
    ['Último Login', formatarDataHora(usuario.ultimoLoginEm)],
  ];

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo="Visualizar Usuario"
      rodape={
        <Button type="button" variant="outline" onClick={onFechar}>
          Fechar
        </Button>
      }
    >
      <dl className="grid gap-4 sm:grid-cols-2">
        {ITENS.map(([rotulo, valor]) => (
          <div key={rotulo}>
            <dt className="text-sm text-muted-foreground">{rotulo}</dt>
            <dd className="font-medium">{valor}</dd>
          </div>
        ))}
      </dl>
    </Modal>
  );
}
