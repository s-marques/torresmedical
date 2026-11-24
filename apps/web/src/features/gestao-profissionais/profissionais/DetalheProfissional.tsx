import {
  PROFISSIONAL_CORES,
  PROFISSIONAL_PROFISSAO_ROTULOS,
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
import { ClassificacaoProfissional } from './ClassificacaoProfissional';
import { ContratosProfissional } from './ContratosProfissional';
import { OnboardingProfissional } from './OnboardingProfissional';
import { DocumentosProfissional } from './DocumentosProfissional';
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
          <Item rotulo="Profissão">
            {p.profissao && PROFISSIONAL_PROFISSAO_ROTULOS[p.profissao]}
          </Item>
          <Item rotulo="Subespecialidade">{p.subespecialidade}</Item>
          <Item rotulo="CNPJ">{p.cnpj && formatarMascara('cnpj', p.cnpj)}</Item>
          <Item rotulo="RQE">
            {p.rqes.length > 0 &&
              p.rqes.map((r) => `${r.numero} (${r.especialidadeNome})`).join(', ')}
          </Item>
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
        {p.contatosAdministrativos.length > 0 && (
          <section
            aria-labelledby="titulo-contatos-profissional"
            className="grid gap-2 border-t pt-4"
          >
            <h3 id="titulo-contatos-profissional" className="text-sm font-semibold">
              Contatos Administrativos
            </h3>
            <ul className="grid gap-1 text-sm">
              {p.contatosAdministrativos.map((c) => (
                <li key={c.id}>
                  <span className="font-medium">{c.nome}</span>
                  {` — ${c.funcao}`}
                  {c.telefone && ` · ${formatarMascara('telefone', c.telefone)}`}
                  {c.email && ` · ${c.email}`}
                </li>
              ))}
            </ul>
          </section>
        )}
        <ClassificacaoProfissional profissional={p} />
        <OnboardingProfissional profissionalId={p.id} />
        <DocumentosProfissional profissionalId={p.id} />
        <ContratosProfissional profissionalId={p.id} />
      </div>
    </Modal>
  );
}
