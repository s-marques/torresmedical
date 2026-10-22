import {
  createContratoHoraSchema,
  formatarDuracao,
  type ContratoHora,
  type ContratoHoraFormulario,
  type ContratoSala,
} from '@torres/shared';
import { DollarSignIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { SePermitido } from '@/components/shared/SePermitido';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { hojeISO } from '@/lib/datas';
import { formatarData } from '@/lib/formatar';
import { formatarMoeda } from '@/lib/forms/mascaras';
import { useHorasContrato, useLancarHora, useRemoverHora } from './use-horas-contrato';

const ID_FORMULARIO = 'form-horas-contrato';

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const HORAS = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 2,
});
const HORAS_CURTAS = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
const horasDe = (minutos: number) => minutos / 60;

function valoresIniciais(): ContratoHoraFormulario {
  return { data: hojeISO(), entrada: '08:00', saida: '09:00', observacao: '' };
}

export interface ModalHorasContratoProps {
  contrato: ContratoSala;
  onFechar: () => void;
}

/**
 * Relógio da tabela (contratos de Hora Avulsa): "Horas Utilizadas". Lança e lista as horas do
 * mês e mostra o total a cobrar. Gerar a cobrança depende da tela Contas a Receber.
 */
export function ModalHorasContrato({ contrato, onFechar }: Readonly<ModalHorasContratoProps>) {
  const hoje = new Date();
  const [mes, setMes] = useState(hoje.getMonth());
  const [ano, setAno] = useState(hoje.getFullYear());
  const [removendo, setRemovendo] = useState<ContratoHora | null>(null);
  const periodo = `${String(ano).padStart(4, '0')}-${String(mes + 1).padStart(2, '0')}`;
  const horas = useHorasContrato(contrato.id, ano >= 2000 && ano <= 2100 ? periodo : '');
  const lancar = useLancarHora(contrato.id);
  const remover = useRemoverHora(contrato.id);
  const form = useFormulario(createContratoHoraSchema, { defaultValues: valoresIniciais() });
  const resumo = horas.data?.resumo;
  const utilizadas = horasDe(resumo?.minutosUtilizados ?? 0);
  const valorHora = resumo?.valorHora ?? contrato.valorUnitario;

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo="Horas Utilizadas"
      tamanho="lg"
      rodape={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Total: {HORAS.format(utilizadas)}h × {formatarMoeda(valorHora)} ={' '}
            <strong className="text-foreground">{formatarMoeda(resumo?.valorTotal ?? 0)}</strong>
          </p>
          <Button
            type="button"
            disabled
            title="Disponível quando a tela Contas a Receber for entregue"
          >
            <DollarSignIcon aria-hidden />
            Gerar Cobrança
          </Button>
        </div>
      }
    >
      <div className="grid gap-4">
        <p className="text-sm text-muted-foreground">
          <strong>{contrato.salaNome}</strong> - {contrato.locatarioNome} (
          {formatarMoeda(contrato.valorUnitario)}/h)
        </p>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Select value={String(mes)} onValueChange={(valor) => setMes(Number(valor))}>
              <SelectTrigger aria-label="Mês" className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MESES.map((nome, indice) => (
                  <SelectItem key={nome} value={String(indice)}>
                    {nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              aria-label="Ano"
              type="number"
              className="w-24"
              value={ano}
              min={2000}
              max={2100}
              onChange={(evento) => setAno(Number(evento.target.value))}
            />
          </div>
          <div className="flex items-center gap-2 text-sm font-medium">
            <span className="rounded-md bg-muted px-2 py-1">
              {HORAS_CURTAS.format(utilizadas)}h /{' '}
              {resumo?.horasContratadas ?? contrato.quantidadeMensal ?? 0}h
            </span>
            <span className="rounded-md bg-blue-100 px-2 py-1 text-blue-700">
              {formatarMoeda(resumo?.valorTotal ?? 0)}
            </span>
          </div>
        </div>
        <SePermitido permissao="gestao-profissionais.salas.editar">
          <section className="rounded-lg border p-4" aria-label="Novo Lançamento">
            <h3 className="mb-3 text-sm font-medium">Novo Lançamento</h3>
            <FormLayout
              id={ID_FORMULARIO}
              form={form}
              acoes={null}
              colunas={3}
              onSubmit={async (valores) => {
                await lancar.mutateAsync(valores);
                form.reset({ ...valoresIniciais(), data: valores.data });
              }}
            >
              <FormField name="data" label="Data" tipo="data" obrigatorio />
              <FormField name="entrada" label="Entrada" tipo="hora" obrigatorio />
              <FormField name="saida" label="Saída" tipo="hora" obrigatorio />
              <FormField
                name="observacao"
                label="Obs."
                placeholder="Opcional"
                className="sm:col-span-2"
              />
              <div className="flex items-end">
                <Button type="submit" form={ID_FORMULARIO} className="w-full">
                  <PlusIcon aria-hidden />
                  Adicionar
                </Button>
              </div>
            </FormLayout>
          </section>
        </SePermitido>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 text-left">
              <th className="px-3 py-2 font-semibold">Data</th>
              <th className="px-3 py-2 font-semibold">Entrada</th>
              <th className="px-3 py-2 font-semibold">Saída</th>
              <th className="px-3 py-2 font-semibold">Duração</th>
              <th className="px-3 py-2 font-semibold">Obs.</th>
              <th className="px-3 py-2">
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {horas.data?.data.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                  Nenhuma hora registrada neste mês
                </td>
              </tr>
            )}
            {horas.data?.data.map((hora) => (
              <tr key={hora.id} className="border-t">
                <td className="px-3 py-2">{formatarData(hora.data)}</td>
                <td className="px-3 py-2">{hora.entrada}</td>
                <td className="px-3 py-2">{hora.saida}</td>
                <td className="px-3 py-2">{formatarDuracao(hora.duracaoMinutos)}</td>
                <td className="px-3 py-2">{hora.observacao ?? '-'}</td>
                <td className="px-3 py-2 text-right">
                  <SePermitido permissao="gestao-profissionais.salas.editar">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="text-destructive hover:text-destructive"
                      aria-label={`Remover lançamento de ${formatarData(hora.data)} ${hora.entrada}`}
                      title="Remover"
                      onClick={() => setRemovendo(hora)}
                    >
                      <Trash2Icon aria-hidden />
                    </Button>
                  </SePermitido>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ConfirmDialog
        aberto={removendo !== null}
        onAbertoChange={(aberto) => aberto || setRemovendo(null)}
        titulo="Remover lançamento?"
        descricao={
          removendo
            ? `O lançamento de ${formatarData(removendo.data)}, das ${removendo.entrada} às ${removendo.saida}, será removido.`
            : undefined
        }
        rotuloConfirmar="Remover"
        onConfirmar={() => (removendo ? remover.mutateAsync(removendo.id) : undefined)}
      />
    </Modal>
  );
}
