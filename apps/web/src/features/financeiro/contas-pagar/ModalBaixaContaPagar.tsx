import {
  acceptDoUso,
  baixarContaPagarSchema,
  mensagemObrigatoria,
  validarArquivo,
  type ContaPagar,
} from '@torres/shared';
import { useRef, useState } from 'react';
import { Controller, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { formatarMoeda } from '@/lib/forms/mascaras';
import { mensagemDoErroDeUpload, uploadArquivo } from '@/lib/api/upload-arquivo';
import { divergenciaEmCentavos } from './regras-conta-pagar';
import { useBaixarContaPagar, useContasBancarias } from './use-contas-pagar';

const ID_FORMULARIO = 'form-baixar-conta-pagar';
const USO_COMPROVANTE = 'comprovante-conta-pagar';

function saldoPendente(conta: ContaPagar): number {
  return Math.max(0, Number(conta.valor) - Number(conta.valorPago));
}

export interface ModalBaixaContaPagarProps {
  conta: ContaPagar;
  onFechar: () => void;
}

/** Modal "Baixar Conta a Pagar": registra um pagamento, total ou parcial. */
export function ModalBaixaContaPagar({ conta, onFechar }: Readonly<ModalBaixaContaPagarProps>) {
  const { t } = useTranslation();
  const [parcial, setParcial] = useState(false);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const entrada = useRef<HTMLInputElement>(null);
  const baixar = useBaixarContaPagar(conta.id);
  const contasBancarias = useContasBancarias();
  const saldo = saldoPendente(conta);
  const form = useFormulario(baixarContaPagarSchema, {
    defaultValues: {
      dataPagamento: new Date().toISOString().slice(0, 10),
      valorPago: saldo,
      juros: 0,
      desconto: 0,
      formaPagamentoId: null,
      contaBancariaId: null,
      documento: '',
      observacoes: '',
      comprovanteArquivoId: null,
      justificativaDivergencia: '',
    },
  });
  const valorPago = useWatch({ control: form.control, name: 'valorPago' });
  const divergente = divergenciaEmCentavos(saldo, valorPago, parcial) !== 0;
  const opcoesContasBancarias = (contasBancarias.data?.data ?? []).map((c) => ({
    valor: c.id,
    rotulo: c.banco ? `${c.nome} - ${c.banco}` : c.nome,
  }));

  function selecionarArquivo(evento: React.ChangeEvent<HTMLInputElement>) {
    const selecionado = evento.target.files?.[0];
    if (!selecionado) return;
    const invalido = validarArquivo(
      { nome: selecionado.name, tipo: selecionado.type, tamanho: selecionado.size },
      USO_COMPROVANTE,
    );
    if (invalido) {
      toast.error(invalido);
      if (entrada.current) entrada.current.value = '';
      return;
    }
    setArquivo(selecionado);
  }

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo="Baixar Conta a Pagar"
      rodape={
        <FormAcoes
          form={form}
          formId={ID_FORMULARIO}
          rotuloEnviar="Confirmar Baixa"
          onCancelar={onFechar}
        />
      }
    >
      <p className="mb-4 text-sm text-muted-foreground">
        Registrar pagamento de <strong className="text-foreground">{conta.descricao}</strong>
        {conta.beneficiarioNome && ` — ${conta.beneficiarioNome}`}
      </p>
      <FormLayout
        id={ID_FORMULARIO}
        form={form}
        acoes={null}
        colunas={2}
        onSubmit={async (valores) => {
          if (divergente && !valores.justificativaDivergencia) {
            form.setError('justificativaDivergencia', {
              message: mensagemObrigatoria('Justificativa', 'f'),
            });
            return;
          }
          let comprovanteArquivoId: string | null = null;
          if (arquivo) {
            try {
              const enviado = await uploadArquivo({ uso: USO_COMPROVANTE, arquivo });
              comprovanteArquivoId = enviado.id;
            } catch (erro) {
              toast.error(mensagemDoErroDeUpload(erro));
              return;
            }
          }
          await baixar.mutateAsync({
            ...valores,
            comprovanteArquivoId,
            pagamentoParcial: parcial,
            justificativaDivergencia: divergente ? valores.justificativaDivergencia : null,
          });
          onFechar();
        }}
      >
        <div className="flex items-center gap-2 sm:col-span-2">
          <Checkbox
            id="pagamento-parcial"
            checked={parcial}
            onCheckedChange={(marcado) => {
              const marcadoBool = marcado === true;
              setParcial(marcadoBool);
              if (!marcadoBool) form.setValue('valorPago', saldo);
            }}
          />
          <Label htmlFor="pagamento-parcial" className="font-normal">
            Pagamento parcial
          </Label>
        </div>
        <FormField name="dataPagamento" label="Data de Pagamento" tipo="data" obrigatorio />
        {parcial ? (
          <FormField name="valorPago" label="Valor Pago" tipo="moeda" obrigatorio />
        ) : (
          <Controller
            control={form.control}
            name="valorPago"
            render={({ field }) => (
              <div className="grid content-start gap-2">
                <Label htmlFor="valor-pago-integral">Valor Pago *</Label>
                <input
                  id="valor-pago-integral"
                  type="text"
                  readOnly
                  value={formatarMoeda(field.value)}
                  className="h-9 rounded-md border bg-muted px-3 text-sm"
                />
              </div>
            )}
          />
        )}
        <FormField name="juros" label="Juros (R$)" tipo="moeda" />
        <FormField name="desconto" label="Desconto (R$)" tipo="moeda" />
        <FormField
          name="formaPagamentoId"
          label="Forma de Pagamento"
          tipo="entidade"
          entidade="formas-pagamento"
          filtros={{ finalidade: 'pagar' }}
          placeholder="Selecione"
        />
        <FormField
          name="contaBancariaId"
          label="Conta Bancária"
          tipo="select"
          opcoes={opcoesContasBancarias}
          placeholder="Selecione a conta"
        />
        {divergente && (
          <FormField
            name="justificativaDivergencia"
            label={t('contasPagar.baixa.justificativa')}
            tipo="textarea"
            obrigatorio
            descricao={t('contasPagar.baixa.justificativaAjuda', {
              esperado: formatarMoeda(saldo),
            })}
            className="sm:col-span-2"
          />
        )}
        <FormField name="documento" label="Documento / Nr Comprovante" className="sm:col-span-2" />
        <FormField
          name="observacoes"
          label="Observações"
          tipo="textarea"
          className="sm:col-span-2"
        />
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="comprovante">Comprovante (opcional)</Label>
          <input
            ref={entrada}
            id="comprovante"
            type="file"
            accept={acceptDoUso(USO_COMPROVANTE)}
            onChange={selecionarArquivo}
            className="text-sm"
          />
          {arquivo && <p className="text-sm text-muted-foreground">{arquivo.name}</p>}
        </div>
      </FormLayout>
    </Modal>
  );
}
