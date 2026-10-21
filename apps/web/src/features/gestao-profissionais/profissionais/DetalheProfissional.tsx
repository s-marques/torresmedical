import {
  PROFISSIONAL_CORES,
  PROFISSIONAL_ESTADO_CIVIL_ROTULOS,
  type Profissional,
} from '@torres/shared';
import { PencilIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Modal } from '@/components/shared/Modal';
import { SePermitido } from '@/components/shared/SePermitido';
import { StatusAtivo } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { formatarMascara } from '@/lib/forms/mascaras';
import { AvatarProfissional } from './AvatarProfissional';
import { corHex, formatarComissao, formatarValor } from './formatadores';

function Item({
  rotulo,
  children,
  className,
}: Readonly<{ rotulo: string; children: ReactNode; className?: string }>) {
  return (
    <div className={className}>
      <dt className="text-sm text-muted-foreground">{rotulo}</dt>
      <dd className="text-sm font-medium break-words">{children || '-'}</dd>
    </div>
  );
}

export interface DetalheProfissionalProps {
  profissional: Profissional;
  onFechar: () => void;
  onEditar: () => void;
}

/** Modal de detalhe (clique na linha): resumo do cadastro, com Fechar e Editar. */
export function DetalheProfissional({
  profissional: p,
  onFechar,
  onEditar,
}: Readonly<DetalheProfissionalProps>) {
  const cor = PROFISSIONAL_CORES[p.corCalendario];
  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo={p.nome}
      tamanho="lg"
      rodape={
        <>
          <Button type="button" variant="outline" onClick={onFechar}>
            Fechar
          </Button>
          <SePermitido permissao="gestao-profissionais.profissionais.editar">
            <Button type="button" onClick={onEditar}>
              <PencilIcon aria-hidden />
              Editar
            </Button>
          </SePermitido>
        </>
      }
    >
      <div className="grid gap-5">
        <div className="flex items-center gap-3">
          <AvatarProfissional profissional={p} className="size-12" />
          <span className="text-lg font-semibold">{p.nome}</span>
        </div>
        <dl className="grid gap-4 sm:grid-cols-2">
          <Item rotulo="Especialidade">{p.especialidadeNome}</Item>
          <Item rotulo="Outras Especialidades">{p.outrasEspecialidades}</Item>
          <Item rotulo="Registro (CRM/CRO)">{p.registro}</Item>
          <span aria-hidden className="hidden sm:block" />
          <Item rotulo="Email">{p.email}</Item>
          <Item rotulo="Telefone">{p.telefone && formatarMascara('telefone', p.telefone)}</Item>
        </dl>
        <dl className="grid gap-4 sm:grid-cols-3">
          <Item rotulo="Duração Padrão">{`${p.duracaoPadrao} min`}</Item>
          <Item rotulo="Valor Consulta">{formatarValor(p.valorConsulta)}</Item>
          <Item rotulo="Comissão">{formatarComissao(p.comissao)}</Item>
        </dl>
        <dl className="grid gap-4 sm:grid-cols-2">
          <Item rotulo="Status">
            <StatusAtivo ativo={p.ativo} />
          </Item>
          <Item rotulo="Cor no Calendário">
            <span className="flex items-center gap-2">
              <span
                aria-hidden
                className="size-4 rounded-full"
                style={{ backgroundColor: corHex(p.corCalendario) }}
              />
              {cor.rotulo}
            </span>
          </Item>
          {p.estadoCivil && (
            <Item rotulo="Estado Civil">{PROFISSIONAL_ESTADO_CIVIL_ROTULOS[p.estadoCivil]}</Item>
          )}
        </dl>
      </div>
    </Modal>
  );
}
