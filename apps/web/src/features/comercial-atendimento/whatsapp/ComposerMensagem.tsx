import {
  enviarMensagemWhatsappSchema,
  type ConversaWhatsappStatus,
  type EnviarMensagemWhatsappInput,
} from '@torres/shared';
import {
  FileTextIcon,
  ImageIcon,
  MessageSquareTextIcon,
  MicIcon,
  PaperclipIcon,
  SendIcon,
  VideoIcon,
  type LucideIcon,
} from 'lucide-react';
import { useController, useFormContext } from 'react-hook-form';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { usePermissao } from '@/lib/auth/use-sessao';
import { useEnviarMensagem } from './use-whatsapp';

const AVISO_POR_STATUS: Partial<Record<ConversaWhatsappStatus, string>> = {
  AGUARDANDO: 'Conversa aguardando atendimento. Clique em "Assumir" para enviar mensagens.',
  FINALIZADA: 'Conversa finalizada.',
};

/** Anexos e respostas rápidas dependem da integração com o provedor (issue própria). */
const ANEXOS: readonly { rotulo: string; icone: LucideIcon }[] = [
  { rotulo: 'Imagem', icone: ImageIcon },
  { rotulo: 'Áudio', icone: MicIcon },
  { rotulo: 'Documento', icone: FileTextIcon },
  { rotulo: 'Vídeo', icone: VideoIcon },
];

const MOTIVO_DESABILITADO = 'Disponível com a integração';

/**
 * Rodapé do painel. Só em atendimento (e com a permissão de criar) dá para escrever; o texto
 * fica "Pendente" até a integração entregá-lo ao provedor. Anexos e respostas rápidas aparecem
 * desabilitados.
 */
export function ComposerMensagem({
  conversaId,
  status,
}: Readonly<{ conversaId: string; status: ConversaWhatsappStatus }>) {
  const podeCriar = usePermissao('comercial-atendimento.whatsapp.criar');
  const habilitado = status === 'EM_ATENDIMENTO' && podeCriar;
  const aviso = AVISO_POR_STATUS[status];
  const form = useFormulario<{ conteudo: string }, EnviarMensagemWhatsappInput>(
    enviarMensagemWhatsappSchema,
    { defaultValues: { conteudo: '' } },
  );
  const enviar = useEnviarMensagem(conversaId);

  return (
    <div className="grid gap-2 border-t px-4 py-3">
      {aviso && (
        <p
          role="status"
          className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:bg-amber-950 dark:text-amber-300"
        >
          {aviso}
        </p>
      )}
      <div className="flex gap-4 text-sm text-muted-foreground">
        {ANEXOS.map(({ rotulo, icone: Icone }) => (
          <Button
            key={rotulo}
            type="button"
            variant="ghost"
            size="sm"
            disabled
            title={MOTIVO_DESABILITADO}
          >
            <Icone aria-hidden />
            {rotulo}
          </Button>
        ))}
      </div>
      <FormLayout
        form={form}
        acoes={null}
        onSubmit={async (valores) => {
          await enviar.mutateAsync(valores);
          form.reset({ conteudo: '' });
        }}
      >
        <CampoMensagem habilitado={habilitado} />
      </FormLayout>
    </div>
  );
}

function CampoMensagem({ habilitado }: Readonly<{ habilitado: boolean }>) {
  const { control, formState } = useFormContext<{ conteudo: string }>();
  const { field, fieldState } = useController({ name: 'conteudo', control });
  return (
    <div className="grid gap-1 sm:col-span-2">
      <div className="flex items-center gap-2">
        {[
          { rotulo: 'Anexar arquivo', icone: PaperclipIcon },
          { rotulo: 'Respostas rápidas', icone: MessageSquareTextIcon },
        ].map(({ rotulo, icone: Icone }) => (
          <Button
            key={rotulo}
            type="button"
            variant="ghost"
            size="icon"
            disabled
            aria-label={rotulo}
            title={MOTIVO_DESABILITADO}
          >
            <Icone aria-hidden />
          </Button>
        ))}
        <Input
          {...field}
          aria-label="Mensagem"
          aria-invalid={Boolean(fieldState.error)}
          placeholder={
            habilitado ? 'Digite uma mensagem…' : 'Assuma a conversa para enviar mensagens'
          }
          disabled={!habilitado}
          autoComplete="off"
        />
        <Button
          type="submit"
          size="icon"
          aria-label="Enviar mensagem"
          className="bg-emerald-600 text-white hover:bg-emerald-700"
          disabled={!habilitado || formState.isSubmitting}
        >
          <SendIcon aria-hidden />
        </Button>
      </div>
      {fieldState.error && <p className="text-sm text-destructive">{fieldState.error.message}</p>}
    </div>
  );
}
