import {
  CONTA_PAGAR_POSSIVEL_DUPLICADA,
  contaPagarInputSchema,
  type ContaPagar,
  type ContaPagarFormulario,
  type ContaPagarPossivelDuplicada,
  type CreateContaPagarInput,
} from '@torres/shared';
import { useId, useRef, useState } from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { toast } from 'sonner';
import { FormField } from '@/components/shared/form/FormField';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ApiRequestError } from '@/lib/api/api-error';
import { mensagemDoErroDeUpload, uploadArquivo } from '@/lib/api/upload-arquivo';
import { ModalContaFinanceira } from '../contas-financeiras/ModalContaFinanceira';
import { valoresIniciaisContaFinanceira } from '../contas-financeiras/valores-iniciais';
import { AlertaDuplicidadeContaPagar } from './AlertaDuplicidadeContaPagar';
import { CamposAjusteContaPagar, USO_DOCUMENTO_CONTA_PAGAR } from './CamposAjusteContaPagar';
import { OPCOES_STATUS } from './opcoes';
import {
  useCriarContaPagar,
  useEditarContaPagar,
  verificarDuplicidadeContaPagar,
} from './use-contas-pagar';

function valoresIniciais(conta?: ContaPagar): ContaPagarFormulario {
  return {
    ...valoresIniciaisContaFinanceira(conta),
    beneficiarioTipo: conta?.beneficiarioTipo ?? 'FORNECEDOR',
    beneficiarioId: conta?.beneficiarioId ?? null,
    status: conta?.status ?? 'PENDENTE',
    competencia: conta?.competencia ?? '',
    centroCustoId: conta?.centroCustoId ?? null,
    documentoArquivoId: conta?.documentoArquivoId ?? null,
  };
}

/** Campos que identificam o título para a verificação de duplicidade (issue #163). */
function identificacao(valores: Pick<ContaPagarFormulario, keyof CreateContaPagarInput>) {
  return {
    beneficiarioTipo: valores.beneficiarioTipo ?? 'FORNECEDOR',
    beneficiarioId: valores.beneficiarioId ?? null,
    valor: valores.valor,
    dataVencimento: valores.dataVencimento,
    documento: valores.documento?.trim() || null,
  };
}

const assinaturaDe = (dados: ReturnType<typeof identificacao>) => JSON.stringify(dados);

/** Rótulo do campo e o checkbox "Funcionário" (desmarcado = Fornecedor, o padrão). */
function CampoBeneficiario() {
  const id = useId();
  const { control, setValue } = useFormContext<ContaPagarFormulario>();
  return (
    <div className="grid content-start gap-2 sm:col-span-2">
      <div className="flex items-center justify-between">
        <Controller
          control={control}
          name="beneficiarioTipo"
          render={({ field }) => (
            <>
              <Label htmlFor={id}>
                {field.value === 'FUNCIONARIO' ? 'Funcionário' : 'Fornecedor'}
              </Label>
              <div className="flex items-center gap-2">
                <Checkbox
                  id={`${id}-funcionario`}
                  checked={field.value === 'FUNCIONARIO'}
                  onCheckedChange={(marcado) => {
                    field.onChange(marcado === true ? 'FUNCIONARIO' : 'FORNECEDOR');
                    setValue('beneficiarioId', null);
                  }}
                />
                <Label htmlFor={`${id}-funcionario`} className="font-normal">
                  Funcionário
                </Label>
              </div>
            </>
          )}
        />
      </div>
      <Controller
        control={control}
        name="beneficiarioTipo"
        render={({ field: tipo }) => (
          <FormField
            name="beneficiarioId"
            label="Beneficiário"
            tipo="entidade"
            entidade={tipo.value === 'FUNCIONARIO' ? 'funcionarios' : 'fornecedores'}
            placeholder={
              tipo.value === 'FUNCIONARIO' ? 'Selecione o funcionário' : 'Selecione o fornecedor'
            }
            className="[&_label]:sr-only"
          />
        )}
      />
    </div>
  );
}

export interface ModalContaPagarProps {
  /** Sem conta: "Nova Conta a Pagar". Com conta: "Editar Conta a Pagar". */
  conta?: ContaPagar;
  onFechar: () => void;
}

/** Modal "Nova Conta a Pagar" e "Editar Conta a Pagar" (`/pagar`). */
export function ModalContaPagar({ conta, onFechar }: Readonly<ModalContaPagarProps>) {
  const criar = useCriarContaPagar();
  const editar = useEditarContaPagar(conta?.id ?? '');
  const form = useFormulario(contaPagarInputSchema, { defaultValues: valoresIniciais(conta) });
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [alerta, setAlerta] = useState<ContaPagarPossivelDuplicada[] | null>(null);
  /** Assinatura do título que o usuário já confirmou ("Lançar mesmo assim"). */
  const confirmada = useRef<string | null>(null);

  /** Falha na consulta não trava o lançamento: a API confere de novo ao gravar. */
  async function conferir(dados: ReturnType<typeof identificacao>) {
    try {
      return await verificarDuplicidadeContaPagar({ ...dados, contaPagarId: conta?.id });
    } catch {
      return [];
    }
  }

  /**
   * Confere a duplicidade, envia o anexo e grava. Sem a confirmação do usuário, mostra o alerta e
   * devolve `false` para o modal continuar aberto.
   */
  async function salvar(valores: CreateContaPagarInput): Promise<boolean> {
    const dados = identificacao(valores);
    const confirmado = confirmada.current === assinaturaDe(dados);
    if (!confirmado) {
      const candidatos = await conferir(dados);
      if (candidatos.length > 0) {
        setAlerta(candidatos);
        return false;
      }
    }
    let documentoArquivoId = valores.documentoArquivoId;
    if (arquivo) {
      try {
        documentoArquivoId = (await uploadArquivo({ uso: USO_DOCUMENTO_CONTA_PAGAR, arquivo })).id;
      } catch (erro) {
        toast.error(mensagemDoErroDeUpload(erro));
        return false;
      }
    }
    try {
      await (conta ? editar : criar).mutateAsync({
        ...valores,
        documentoArquivoId,
        duplicidadeConfirmada: confirmado || undefined,
      });
    } catch (erro) {
      // Alguém lançou uma conta parecida entre a consulta e o envio: mostra o alerta.
      if (erro instanceof ApiRequestError && erro.body?.code === CONTA_PAGAR_POSSIVEL_DUPLICADA) {
        const candidatos = await conferir(dados);
        if (candidatos.length > 0) {
          setAlerta(candidatos);
          return false;
        }
      }
      throw erro;
    }
    return true;
  }

  function continuarLancamento() {
    confirmada.current = assinaturaDe(identificacao(form.getValues()));
    setAlerta(null);
    (document.getElementById('form-conta-pagar') as HTMLFormElement | null)?.requestSubmit();
  }

  return (
    <>
      <ModalContaFinanceira
        titulo={conta ? 'Editar Conta a Pagar' : 'Nova Conta a Pagar'}
        editando={Boolean(conta)}
        form={form}
        formId="form-conta-pagar"
        onSubmit={salvar}
        onFechar={onFechar}
        finalidade="pagar"
        opcoesStatus={OPCOES_STATUS}
        pessoa={<CampoBeneficiario />}
        aposStatus={
          <CamposAjusteContaPagar
            arquivo={arquivo}
            onArquivo={setArquivo}
            documentoAtualId={conta?.documentoArquivoId ?? null}
          />
        }
      />
      {alerta && (
        <AlertaDuplicidadeContaPagar
          candidatos={alerta}
          onContinuar={continuarLancamento}
          onFechar={() => setAlerta(null)}
        />
      )}
    </>
  );
}
