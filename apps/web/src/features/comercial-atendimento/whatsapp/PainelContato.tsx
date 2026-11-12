import { formatarTelefoneWhatsapp, type ConversaWhatsappDetalhe } from '@torres/shared';
import {
  CalendarCheckIcon,
  CalendarIcon,
  ClipboardListIcon,
  PencilIcon,
  PhoneIcon,
  XIcon,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { SePermitido } from '@/components/shared/SePermitido';
import { Button } from '@/components/ui/button';
import { AvatarContato } from './AvatarContato';
import { useAlterarTagDaConversa } from './use-whatsapp';

function Secao({ titulo, children }: Readonly<{ titulo: string; children: ReactNode }>) {
  return (
    <section aria-label={titulo} className="grid gap-2 border-t px-4 py-3">
      <h3 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
        {titulo}
      </h3>
      {children}
    </section>
  );
}

/**
 * Atalhos para as telas que já existem. Só com paciente vinculado ao contato; as telas de
 * destino ainda não abrem com o paciente selecionado.
 */
const ACOES_RAPIDAS: readonly { rotulo: string; rota: string; icone: LucideIcon }[] = [
  { rotulo: 'Ver prontuário', rota: '/prontuarios', icone: ClipboardListIcon },
  { rotulo: 'Ver agendamentos', rota: '/agenda', icone: CalendarIcon },
  { rotulo: 'Realizar agendamento', rota: '/agenda', icone: CalendarCheckIcon },
];

/** Painel direito: contato, tags da conversa, ações rápidas e observações do paciente. */
export function PainelContato({ conversa }: Readonly<{ conversa: ConversaWhatsappDetalhe }>) {
  const { contato, canal, tags } = conversa;
  const removerTag = useAlterarTagDaConversa(conversa.id);
  const vinculado = contato.pacienteId !== null;

  return (
    <aside aria-label="Detalhes da conversa" className="w-72 shrink-0 overflow-y-auto border-l">
      <div className="grid justify-items-center gap-1 px-4 py-5 text-center">
        <AvatarContato nome={contato.nome} className="size-16 text-xl" />
        <p className="text-sm font-semibold">
          {contato.nome ?? formatarTelefoneWhatsapp(contato.telefone)}
        </p>
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <PhoneIcon aria-hidden className="size-3" />
          {formatarTelefoneWhatsapp(contato.telefone)}
        </p>
        <p className="text-xs text-blue-600 dark:text-blue-400">{canal.nome}</p>
        {contato.email && <p className="text-xs text-muted-foreground">{contato.email}</p>}
        {vinculado ? (
          <Button asChild variant="ghost" size="sm">
            <Link to="/clientes">
              <PencilIcon aria-hidden />
              Editar dados
            </Link>
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            disabled
            title="O contato ainda não está vinculado a um paciente"
          >
            <PencilIcon aria-hidden />
            Editar dados
          </Button>
        )}
      </div>

      <Secao titulo="Tags da conversa">
        {tags.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhuma tag</p>
        ) : (
          <ul aria-label="Tags aplicadas" className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <li
                key={tag.id}
                className="flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-white"
                style={{ backgroundColor: tag.cor }}
              >
                {tag.nome}
                <SePermitido permissao="comercial-atendimento.whatsapp.editar">
                  <button
                    type="button"
                    aria-label={`Remover a tag ${tag.nome}`}
                    disabled={removerTag.isPending}
                    onClick={() => removerTag.mutate({ tagId: tag.id, aplicar: false })}
                  >
                    <XIcon aria-hidden className="size-3" />
                  </button>
                </SePermitido>
              </li>
            ))}
          </ul>
        )}
      </Secao>

      <Secao titulo="Ações rápidas">
        <ul className="grid gap-1">
          {ACOES_RAPIDAS.map(({ rotulo, rota, icone: Icone }) => (
            <li key={rotulo}>
              {vinculado ? (
                <Button asChild variant="ghost" size="sm" className="w-full justify-start">
                  <Link to={rota}>
                    <Icone aria-hidden />
                    {rotulo}
                  </Link>
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled
                  className="w-full justify-start"
                  title="O contato ainda não está vinculado a um paciente"
                >
                  <Icone aria-hidden />
                  {rotulo}
                </Button>
              )}
            </li>
          ))}
        </ul>
      </Secao>

      <Secao titulo="Observações">
        <p className="text-sm text-muted-foreground">
          {contato.observacoes ?? 'Nenhuma observação registrada.'}
        </p>
      </Secao>
    </aside>
  );
}
