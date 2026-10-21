import { SALA_TIPO_ROTULOS, type Sala } from '@torres/shared';
import { PencilIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Modal } from '@/components/shared/Modal';
import { SePermitido } from '@/components/shared/SePermitido';
import { StatusAtivo } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { formatarMoeda } from '@/lib/forms/mascaras';

const SEM_VALOR = '-';

const METRAGEM = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

function Linha({ rotulo, children }: Readonly<{ rotulo: string; children: ReactNode }>) {
  return (
    <div className="flex items-start justify-between gap-4 border-b py-2 text-sm">
      <dt className="text-muted-foreground">{rotulo}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}

const moedaOuTraco = (valor: number | null) => formatarMoeda(valor) || SEM_VALOR;

export interface ModalDetalhesSalaProps {
  sala: Sala;
  onFechar: () => void;
  onEditar: () => void;
}

/** Lupa do card: "Detalhes da Sala", só leitura, com Fechar e Editar. */
export function ModalDetalhesSala({ sala, onFechar, onEditar }: Readonly<ModalDetalhesSalaProps>) {
  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo="Detalhes da Sala"
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
      <dl aria-label={`Dados de ${sala.nome}`}>
        <Linha rotulo="Nome">{sala.nome}</Linha>
        <Linha rotulo="Número">{sala.numero ?? SEM_VALOR}</Linha>
        <Linha rotulo="Andar">{sala.andar ?? SEM_VALOR}</Linha>
        <Linha rotulo="Tipo">{SALA_TIPO_ROTULOS[sala.tipo]}</Linha>
        <Linha rotulo="Capacidade">{sala.capacidade}</Linha>
        <Linha rotulo="Metragem">
          {sala.metragem === null ? SEM_VALOR : `${METRAGEM.format(sala.metragem)} m²`}
        </Linha>
        <Linha rotulo="Valor/Hora">{moedaOuTraco(sala.valorHora)}</Linha>
        <Linha rotulo="Valor/Turno">{moedaOuTraco(sala.valorTurno)}</Linha>
        <Linha rotulo="Valor Mensal">{moedaOuTraco(sala.valorMensal)}</Linha>
        <Linha rotulo="Equipamentos">{sala.equipamentos ?? SEM_VALOR}</Linha>
        <Linha rotulo="Status">
          <StatusAtivo ativo={sala.ativo} />
        </Linha>
      </dl>
    </Modal>
  );
}
