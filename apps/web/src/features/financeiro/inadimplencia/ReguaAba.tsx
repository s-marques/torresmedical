import {
  MENSAGEM_PADRAO_MARCO,
  updateReguaMarcoSchema,
  VARIAVEIS_COBRANCA,
  type ReguaMarco,
  type UpdateReguaMarcoInput,
} from '@torres/shared';
import { PencilIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { SePermitido } from '@/components/shared/SePermitido';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { usePermissao } from '@/lib/auth/use-sessao';
import { useAtualizarMarco, useRegua } from './use-inadimplencia';

const ID_FORMULARIO = 'form-regua-mensagem';

/** Liga ou desliga uma opção do marco na hora (sem botão Salvar). */
function Opcao({
  marco,
  campo,
  rotulo,
}: Readonly<{
  marco: ReguaMarco;
  campo: 'ativo' | 'enviarWhatsapp' | 'alertaInterno';
  rotulo: string;
}>) {
  const atualizar = useAtualizarMarco(marco);
  const podeEditar = usePermissao('financeiro.inadimplencia.editar');
  const id = `${marco.marco}-${campo}`;
  return (
    <div className="flex items-center gap-2">
      <Switch
        id={id}
        checked={marco[campo]}
        disabled={!podeEditar || atualizar.isPending}
        onCheckedChange={(valor) => atualizar.mutate({ [campo]: valor })}
        aria-label={`${rotulo} (${marco.marco})`}
      />
      <label htmlFor={id} className="text-sm">
        {rotulo}
      </label>
    </div>
  );
}

function ModalMensagem({ marco, onFechar }: Readonly<{ marco: ReguaMarco; onFechar: () => void }>) {
  const { t } = useTranslation();
  const atualizar = useAtualizarMarco(marco, { formulario: true });
  const form = useFormulario<UpdateReguaMarcoInput, UpdateReguaMarcoInput>(updateReguaMarcoSchema, {
    defaultValues: { mensagem: marco.mensagem },
  });
  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo={t('inadimplencia.regua.modal.titulo', {
        marco: t(`inadimplencia.regua.marcos.${marco.marco}`),
      })}
      tamanho="md"
    >
      <FormLayout
        id={ID_FORMULARIO}
        form={form}
        acoes={
          <FormAcoes
            form={form}
            formId={ID_FORMULARIO}
            rotuloEnviar={t('comum.salvar')}
            onCancelar={onFechar}
          />
        }
        onSubmit={async (valores) => {
          await atualizar.mutateAsync(valores);
          onFechar();
        }}
      >
        <FormField
          name="mensagem"
          tipo="textarea"
          label={t('inadimplencia.regua.modal.mensagem')}
          obrigatorio
        />
        <p className="text-sm text-muted-foreground">
          {t('inadimplencia.regua.modal.variaveis', {
            lista: VARIAVEIS_COBRANCA.map((variavel) => `{${variavel}}`).join(', '),
          })}
        </p>
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              form.setValue('mensagem', MENSAGEM_PADRAO_MARCO[marco.marco], { shouldDirty: true })
            }
          >
            {t('inadimplencia.regua.modal.restaurar')}
          </Button>
        </div>
      </FormLayout>
    </Modal>
  );
}

/** Aba Régua de cobrança: os 4 marcos, com liga/desliga, canais e o texto da mensagem. */
export function ReguaAba() {
  const { t } = useTranslation();
  const regua = useRegua();
  const [editando, setEditando] = useState<ReguaMarco | null>(null);

  if (regua.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{t('inadimplencia.regua.erroCarregar')}</AlertDescription>
      </Alert>
    );
  }
  if (!regua.data) return <Skeleton className="h-48 w-full" />;

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">{t('inadimplencia.regua.descricao')}</p>
      <ul className="grid gap-4 lg:grid-cols-2">
        {regua.data.map((marco) => (
          <li key={marco.marco}>
            <Card data-testid={`marco-${marco.marco}`}>
              <CardContent className="grid gap-4 p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold">
                    {t(`inadimplencia.regua.marcos.${marco.marco}`)}
                  </h3>
                  <SePermitido permissao="financeiro.inadimplencia.editar">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setEditando(marco)}
                    >
                      <PencilIcon aria-hidden />
                      {t('inadimplencia.regua.editarMensagem')}
                    </Button>
                  </SePermitido>
                </div>
                <p className="whitespace-pre-wrap rounded-md bg-muted p-3 text-sm">
                  {marco.mensagem}
                </p>
                <div className="flex flex-wrap gap-x-6 gap-y-2">
                  <Opcao marco={marco} campo="ativo" rotulo={t('inadimplencia.regua.ativo')} />
                  <Opcao
                    marco={marco}
                    campo="enviarWhatsapp"
                    rotulo={t('inadimplencia.regua.whatsapp')}
                  />
                  <Opcao
                    marco={marco}
                    campo="alertaInterno"
                    rotulo={t('inadimplencia.regua.alertaInterno')}
                  />
                </div>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
      {editando && <ModalMensagem marco={editando} onFechar={() => setEditando(null)} />}
    </div>
  );
}
