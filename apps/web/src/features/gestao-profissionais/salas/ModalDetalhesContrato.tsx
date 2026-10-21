import {
  CONTRATO_INDICE_REAJUSTE_ROTULOS,
  CONTRATO_LOCATARIO_ROTULOS,
  CONTRATO_MODALIDADE_CAMPOS,
  CONTRATO_MODALIDADE_ROTULOS,
  CONTRATO_TIPO_RECEITA_ROTULOS,
  DIAS_SEMANA,
  descreverValorContrato,
  type ContratoSala,
} from '@torres/shared';
import { PencilIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Modal } from '@/components/shared/Modal';
import { SePermitido } from '@/components/shared/SePermitido';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatarData } from '@/lib/formatar';
import { formatarMoeda } from '@/lib/forms/mascaras';
import { StatusContrato } from './StatusContrato';

const SEM_VALOR = '-';

function Secao({ titulo, children }: Readonly<{ titulo: string; children: ReactNode }>) {
  return (
    <section className="mt-4 first:mt-0">
      <h3 className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {titulo}
      </h3>
      <dl>{children}</dl>
    </section>
  );
}

function Linha({ rotulo, children }: Readonly<{ rotulo: string; children: ReactNode }>) {
  return (
    <div className="flex items-start justify-between gap-4 border-b py-2 text-sm">
      <dt className="text-muted-foreground">{rotulo}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}

const simNao = (valor: boolean) => (valor ? 'Sim' : 'Não');

export interface ModalDetalhesContratoProps {
  contrato: ContratoSala;
  onFechar: () => void;
  onEditar: () => void;
}

/** Lupa da tabela: "Detalhes do Contrato", só leitura, com Fechar e Editar. */
export function ModalDetalhesContrato({
  contrato,
  onFechar,
  onEditar,
}: Readonly<ModalDetalhesContratoProps>) {
  const campos = CONTRATO_MODALIDADE_CAMPOS[contrato.modalidade];
  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo="Detalhes do Contrato"
      rodape={
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={onFechar}>
            Fechar
          </Button>
          <SePermitido permissao="gestao-profissionais.salas.editar">
            <Button type="button" onClick={onEditar}>
              <PencilIcon aria-hidden />
              Editar
            </Button>
          </SePermitido>
        </div>
      }
    >
      <div className="mb-3 flex gap-2">
        <StatusContrato status={contrato.status} />
        <Badge variant="outline">{CONTRATO_MODALIDADE_ROTULOS[contrato.modalidade]}</Badge>
        {contrato.permuta && <StatusBadge tom="alerta">Sem cobrança</StatusBadge>}
      </div>
      <Secao titulo="Identificação">
        <Linha rotulo="Sala">{contrato.salaNome}</Linha>
        <Linha rotulo="Locatário">{contrato.locatarioNome}</Linha>
        <Linha rotulo="Tipo Locatário">{CONTRATO_LOCATARIO_ROTULOS[contrato.locatarioTipo]}</Linha>
        <Linha rotulo="Especialidade">{contrato.especialidade ?? SEM_VALOR}</Linha>
      </Secao>
      <Secao titulo="Financeiro">
        <Linha rotulo="Valor Unitário">{descreverValorContrato(contrato)}</Linha>
        {campos.quantidade !== null && (
          <Linha rotulo={campos.quantidade.replace('/mês', '')}>
            {contrato.quantidadeMensal} {campos.unidadeQuantidade}/mês
          </Linha>
        )}
        <Linha rotulo="Valor Total Mensal">{formatarMoeda(contrato.valorTotalMensal)}</Linha>
        <Linha rotulo="Dia Vencimento">Dia {contrato.diaVencimento}</Linha>
        <Linha rotulo="Forma Pagamento">{contrato.formaPagamentoNome ?? 'Não informado'}</Linha>
        <Linha rotulo="Tipo Receita">{CONTRATO_TIPO_RECEITA_ROTULOS[contrato.tipoReceita]}</Linha>
        <Linha rotulo="Índice de Reajuste">
          {CONTRATO_INDICE_REAJUSTE_ROTULOS[contrato.indiceReajuste]}
        </Linha>
      </Secao>
      <Secao titulo="Vigência">
        <Linha rotulo="Início">{formatarData(contrato.dataInicio)}</Linha>
        <Linha rotulo="Fim">{contrato.dataFim ? formatarData(contrato.dataFim) : SEM_VALOR}</Linha>
      </Secao>
      <Secao titulo="Dias e horários">
        {contrato.dias.length === 0 && <Linha rotulo="Dias">{SEM_VALOR}</Linha>}
        {contrato.dias.map((dia) => (
          <Linha key={dia.diaSemana} rotulo={DIAS_SEMANA[dia.diaSemana] ?? ''}>
            {dia.inicio} às {dia.fim}
          </Linha>
        ))}
      </Secao>
      <Secao titulo="Configurações">
        <Linha rotulo="Permite Indicação">{simNao(contrato.permiteIndicacao)}</Linha>
        <Linha rotulo="Participa de Eventos">{simNao(contrato.participaEventos)}</Linha>
        {contrato.observacoes && <Linha rotulo="Observações">{contrato.observacoes}</Linha>}
        <Linha rotulo="Criado em">{formatarData(contrato.createdAt)}</Linha>
      </Secao>
    </Modal>
  );
}
