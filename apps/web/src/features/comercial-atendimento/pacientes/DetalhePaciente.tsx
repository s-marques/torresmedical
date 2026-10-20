import { PACIENTE_SEXO_ROTULOS, PACIENTE_TIPO_ROTULOS, type Paciente } from '@torres/shared';
import { HistoryIcon, PencilIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Modal } from '@/components/shared/Modal';
import { SePermitido } from '@/components/shared/SePermitido';
import { Button } from '@/components/ui/button';
import { formatarMascara } from '@/lib/forms/mascaras';
import { formatarData } from './formatadores';
import { StatusPaciente } from './StatusPaciente';

function Item({ rotulo, children }: Readonly<{ rotulo: string; children: ReactNode }>) {
  return (
    <div className="grid gap-1">
      <dt className="text-sm text-muted-foreground">{rotulo}</dt>
      <dd className="text-sm font-medium break-words">{children || '-'}</dd>
    </div>
  );
}

export interface DetalhePacienteProps {
  paciente: Paciente;
  onFechar: () => void;
  onEditar: () => void;
  onHistorico: () => void;
}

/** Modal de detalhe (clique na linha): dados do cadastro e atalhos para Histórico e Editar. */
export function DetalhePaciente({
  paciente: p,
  onFechar,
  onEditar,
  onHistorico,
}: Readonly<DetalhePacienteProps>) {
  const pf = p.tipo === 'PF';
  const endereco = [p.logradouro, p.numero, p.complemento, p.bairro, p.cidade, p.uf]
    .filter(Boolean)
    .join(', ');
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
          <SePermitido permissao="configuracoes-gestao.auditoria.ver">
            <Button type="button" variant="outline" onClick={onHistorico}>
              <HistoryIcon aria-hidden />
              Histórico
            </Button>
          </SePermitido>
          <SePermitido permissao="comercial-atendimento.pacientes.editar">
            <Button type="button" onClick={onEditar}>
              <PencilIcon aria-hidden />
              Editar
            </Button>
          </SePermitido>
        </>
      }
    >
      <dl className="grid gap-4 sm:grid-cols-2">
        <Item rotulo="Tipo">{PACIENTE_TIPO_ROTULOS[p.tipo]}</Item>
        <Item rotulo="Email">{p.email}</Item>
        <Item rotulo={pf ? 'CPF' : 'CNPJ'}>
          {p.documento && formatarMascara(pf ? 'cpf' : 'cnpj', p.documento)}
        </Item>
        {pf ? <Item rotulo="RG">{p.rg}</Item> : <Item rotulo="Razão Social">{p.razaoSocial}</Item>}
        <Item rotulo="Telefone">{p.telefone && formatarMascara('telefone', p.telefone)}</Item>
        <Item rotulo="Celular">{p.celular && formatarMascara('telefone', p.celular)}</Item>
        <Item rotulo={pf ? 'Data de Nascimento' : 'Data de Fundação'}>
          {p.dataNascimento ? formatarData(p.dataNascimento) : null}
        </Item>
        {pf ? (
          <Item rotulo="Sexo">{p.sexo && PACIENTE_SEXO_ROTULOS[p.sexo]}</Item>
        ) : (
          <Item rotulo="Representante Legal">{p.representanteNome}</Item>
        )}
        <Item rotulo="Profissão">{p.profissao}</Item>
        <Item rotulo="Origem">{p.origemNome}</Item>
        <Item rotulo="Campanhas WhatsApp">
          {p.aceitaCampanhasWhatsapp ? 'Aceita' : 'Não aceita'}
        </Item>
        <Item rotulo="Status">
          <StatusPaciente status={p.status} />
        </Item>
        {endereco && <Item rotulo="Endereço">{endereco}</Item>}
        {p.observacoes && <Item rotulo="Observações">{p.observacoes}</Item>}
      </dl>
    </Modal>
  );
}
