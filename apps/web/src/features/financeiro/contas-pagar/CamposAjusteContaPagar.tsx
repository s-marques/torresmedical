import { acceptDoUso, validarArquivo, type ContaPagarFormulario } from '@torres/shared';
import { useRef } from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { FormField } from '@/components/shared/form/FormField';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useLinkArquivo } from '@/hooks/use-link-arquivo';

export const USO_DOCUMENTO_CONTA_PAGAR = 'documento-conta-pagar';

export interface CamposAjusteContaPagarProps {
  /** Arquivo escolhido e ainda não enviado (o envio acontece ao salvar). */
  arquivo: File | null;
  onArquivo: (arquivo: File | null) => void;
  /** Documento já anexado à conta (edição). */
  documentoAtualId: string | null;
}

/**
 * Campos da issue #163 no modal "Nova/Editar Conta a Pagar": competência (mês/ano), centro de
 * custo e o anexo do documento (boleto, fatura ou NF).
 */
export function CamposAjusteContaPagar({
  arquivo,
  onArquivo,
  documentoAtualId,
}: Readonly<CamposAjusteContaPagarProps>) {
  const { t } = useTranslation();
  const { control } = useFormContext<ContaPagarFormulario>();
  const entrada = useRef<HTMLInputElement>(null);
  const link = useLinkArquivo(documentoAtualId);

  function selecionar(evento: React.ChangeEvent<HTMLInputElement>) {
    const selecionado = evento.target.files?.[0];
    if (!selecionado) return;
    const invalido = validarArquivo(
      { nome: selecionado.name, tipo: selecionado.type, tamanho: selecionado.size },
      USO_DOCUMENTO_CONTA_PAGAR,
    );
    if (invalido) {
      toast.error(invalido);
      if (entrada.current) entrada.current.value = '';
      return;
    }
    onArquivo(selecionado);
  }

  return (
    <>
      <Controller
        control={control}
        name="competencia"
        render={({ field }) => (
          <div className="grid content-start gap-2">
            <Label htmlFor="competencia">{t('contasPagar.competencia')}</Label>
            <Input
              id="competencia"
              type="month"
              value={field.value ?? ''}
              onChange={(e) => field.onChange(e.target.value)}
              onBlur={field.onBlur}
            />
          </div>
        )}
      />
      <FormField
        name="centroCustoId"
        label={t('contasPagar.centroCusto')}
        tipo="entidade"
        entidade="centros-custo"
        placeholder={t('contasPagar.centroCustoPlaceholder')}
      />
      <div className="grid gap-2 sm:col-span-2">
        <Label htmlFor="documento-anexo">{t('contasPagar.anexoDocumento')}</Label>
        <input
          ref={entrada}
          id="documento-anexo"
          type="file"
          accept={acceptDoUso(USO_DOCUMENTO_CONTA_PAGAR)}
          onChange={selecionar}
          className="text-sm"
        />
        {arquivo && <p className="text-sm text-muted-foreground">{arquivo.name}</p>}
        {documentoAtualId && link.data && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <a
              href={link.data.url}
              target="_blank"
              rel="noreferrer"
              className="text-primary underline"
            >
              {t('contasPagar.anexoAtual')}
            </a>
            <span className="text-muted-foreground">{t('contasPagar.anexoSubstituir')}</span>
          </div>
        )}
      </div>
    </>
  );
}
