import { PACIENTE_SEXO_ROTULOS, PACIENTE_TIPO_ROTULOS, type PacienteResumo } from '@torres/shared';
import { HistoryIcon, PencilIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/shared/Modal';
import { SePermitido } from '@/components/shared/SePermitido';
import { Button } from '@/components/ui/button';
import { formatarData as formatarDataIdioma, formatarDataHora } from '@/lib/formatar';
import { formatarMascara } from '@/lib/forms/mascaras';
import { ConsentimentosPaciente } from './ConsentimentosPaciente';
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
  paciente: PacienteResumo;
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
  const { t } = useTranslation();
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

      <section aria-labelledby="titulo-relacionamento" className="mt-4 grid gap-3 border-t pt-4">
        <h3 id="titulo-relacionamento" className="text-sm font-semibold">
          {t('pacientes.relacionamento.titulo')}
        </h3>
        <dl className="grid gap-4 sm:grid-cols-2">
          <Item rotulo={t('pacientes.relacionamento.canalOrigem')}>
            {p.canalOrigem && t(`pacientes.canais.${p.canalOrigem}`)}
          </Item>
          <Item rotulo={t('pacientes.relacionamento.preferenciaComunicacao')}>
            {p.preferenciaComunicacao && t(`pacientes.preferencias.${p.preferenciaComunicacao}`)}
          </Item>
          <Item rotulo={t('pacientes.relacionamento.whatsapp')}>
            {p.whatsapp && formatarMascara('telefone', p.whatsapp)}
          </Item>
          <Item rotulo={t('pacientes.relacionamento.indicadoPorTipo')}>
            {p.indicacaoTipo &&
              [t(`pacientes.indicacaoTipos.${p.indicacaoTipo}`), p.indicacaoNome]
                .filter(Boolean)
                .join(': ')}
          </Item>
          <Item rotulo={t('pacientes.relacionamento.profissionalVinculo')}>
            {p.profissionalVinculoNome}
          </Item>
          <Item rotulo={t('pacientes.relacionamento.especialidadeVinculo')}>
            {p.especialidadeVinculoNome}
          </Item>
        </dl>
      </section>

      <section aria-labelledby="titulo-resumo" className="mt-4 grid gap-3 border-t pt-4">
        <h3 id="titulo-resumo" className="text-sm font-semibold">
          {t('pacientes.resumo.titulo')}
        </h3>
        <dl className="grid gap-4 sm:grid-cols-2">
          <Item rotulo={t('pacientes.resumo.primeiroAtendimento')}>
            {p.primeiroAtendimento && formatarDataIdioma(p.primeiroAtendimento)}
          </Item>
          <Item rotulo={t('pacientes.resumo.ultimoAtendimento')}>
            {p.ultimoAtendimento && formatarDataIdioma(p.ultimoAtendimento)}
          </Item>
          <Item rotulo={t('pacientes.resumo.proximoRetorno')}>
            {p.proximoRetorno && formatarDataHora(p.proximoRetorno)}
          </Item>
          <Item rotulo={t('pacientes.resumo.faltas')}>{String(p.faltas)}</Item>
        </dl>
      </section>

      <div className="mt-4">
        <ConsentimentosPaciente pacienteId={p.id} />
      </div>
    </Modal>
  );
}
