import type {
  Atendimento,
  AtendimentoAnexo,
  AtendimentoDocumento,
  AtendimentoSnapshot,
  AtendimentoVersao,
} from '@torres/shared';
import { DownloadIcon, FilePlusIcon, FileTextIcon, PaperclipIcon, Trash2Icon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { SePermitido } from '@/components/shared/SePermitido';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatarData, formatarDataHora } from '@/lib/formatar';
import { ModalAnexoAtendimento } from './ModalAnexoAtendimento';
import { ModalDocumentoAtendimento } from './ModalDocumentoAtendimento';
import {
  linkDoAnexo,
  useAnexos,
  useDocumentos,
  useRemoverAnexo,
  useRemoverDocumentoAtendimento,
  useVersoes,
} from './use-atendimento-registros';

interface SecaoProps {
  atendimento: Atendimento;
}

function Secao({
  id,
  titulo,
  acao,
  children,
}: Readonly<{ id: string; titulo: string; acao?: ReactNode; children: ReactNode }>) {
  return (
    <section aria-labelledby={id} className="grid gap-2 border-t pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={id} className="text-sm font-semibold">
          {titulo}
        </h3>
        {acao}
      </div>
      {children}
    </section>
  );
}

/** Exames e anexos do atendimento, com download por link temporário (issue #151). */
export function SecaoAnexos({ atendimento }: Readonly<SecaoProps>) {
  const { t } = useTranslation();
  const { pacienteId, id: atendimentoId } = atendimento;
  const consulta = useAnexos(pacienteId, atendimentoId);
  const remover = useRemoverAnexo(pacienteId, atendimentoId);
  const [criando, setCriando] = useState(false);
  const [removendo, setRemovendo] = useState<AtendimentoAnexo | null>(null);

  async function baixar(anexo: AtendimentoAnexo) {
    try {
      const link = await linkDoAnexo(pacienteId, atendimentoId, anexo.id);
      window.open(link.url, '_blank', 'noopener,noreferrer');
    } catch {
      toast.error(t('atendimentoRegistros.mensagens.erroBaixar'));
    }
  }

  return (
    <Secao
      id={`anexos-${atendimentoId}`}
      titulo={t('atendimentoRegistros.anexos.titulo')}
      acao={
        <SePermitido permissao="consultorio-assistencial.prontuarios.criar">
          <Button type="button" size="sm" onClick={() => setCriando(true)}>
            <FilePlusIcon aria-hidden />
            {t('atendimentoRegistros.anexos.novo')}
          </Button>
        </SePermitido>
      }
    >
      {consulta.isPending && (
        <Skeleton className="h-10 w-full" aria-label={t('comum.carregando')} />
      )}
      {consulta.data?.data.length === 0 && (
        <p className="text-sm text-muted-foreground">{t('atendimentoRegistros.anexos.vazio')}</p>
      )}
      {consulta.data && consulta.data.data.length > 0 && (
        <ul className="divide-y rounded-lg border">
          {consulta.data.data.map((anexo) => (
            <li
              key={anexo.id}
              className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
            >
              <div className="grid gap-0.5 text-sm">
                <span className="flex flex-wrap items-center gap-2">
                  <PaperclipIcon className="size-4" aria-hidden />
                  <Badge variant="secondary">
                    {t(`atendimentoRegistros.tiposAnexo.${anexo.tipo}`)}
                  </Badge>
                  <span>{anexo.arquivoNome ?? '-'}</span>
                  <span className="text-muted-foreground">{formatarData(anexo.data)}</span>
                </span>
                {anexo.descricao && (
                  <span className="text-muted-foreground">{anexo.descricao}</span>
                )}
              </div>
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label={t('atendimentoRegistros.anexos.baixar', {
                    nome: anexo.arquivoNome ?? '',
                  })}
                  onClick={() => void baixar(anexo)}
                >
                  <DownloadIcon aria-hidden />
                  {t('atendimentoRegistros.acoes.baixar')}
                </Button>
                {!atendimento.assinadoEm && (
                  <SePermitido permissao="consultorio-assistencial.prontuarios.excluir">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      aria-label={t('atendimentoRegistros.anexos.excluir', {
                        nome: anexo.arquivoNome ?? '',
                      })}
                      onClick={() => setRemovendo(anexo)}
                    >
                      <Trash2Icon aria-hidden />
                    </Button>
                  </SePermitido>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {criando && (
        <ModalAnexoAtendimento
          pacienteId={pacienteId}
          atendimentoId={atendimentoId}
          onFechar={() => setCriando(false)}
        />
      )}
      <ConfirmDialog
        aberto={removendo !== null}
        onAbertoChange={(aberto) => aberto || setRemovendo(null)}
        titulo={t('atendimentoRegistros.anexos.confirmarExcluir')}
        descricao={removendo?.arquivoNome ?? undefined}
        rotuloConfirmar={t('atendimentoRegistros.acoes.excluir')}
        onConfirmar={() => (removendo ? remover.mutateAsync(removendo.id) : undefined)}
      />
    </Secao>
  );
}

/** Documentos emitidos no atendimento: atestado, declaração e solicitação de exame. */
export function SecaoDocumentos({ atendimento }: Readonly<SecaoProps>) {
  const { t } = useTranslation();
  const { pacienteId, id: atendimentoId } = atendimento;
  const consulta = useDocumentos(pacienteId, atendimentoId);
  const remover = useRemoverDocumentoAtendimento(pacienteId, atendimentoId);
  const [criando, setCriando] = useState(false);
  const [removendo, setRemovendo] = useState<AtendimentoDocumento | null>(null);

  return (
    <Secao
      id={`documentos-${atendimentoId}`}
      titulo={t('atendimentoRegistros.documentos.titulo')}
      acao={
        <SePermitido permissao="consultorio-assistencial.prontuarios.criar">
          <Button type="button" size="sm" onClick={() => setCriando(true)}>
            <FileTextIcon aria-hidden />
            {t('atendimentoRegistros.documentos.novo')}
          </Button>
        </SePermitido>
      }
    >
      {consulta.isPending && (
        <Skeleton className="h-10 w-full" aria-label={t('comum.carregando')} />
      )}
      {consulta.data?.data.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {t('atendimentoRegistros.documentos.vazio')}
        </p>
      )}
      {consulta.data && consulta.data.data.length > 0 && (
        <ul className="divide-y rounded-lg border">
          {consulta.data.data.map((documento) => (
            <li key={documento.id} className="flex items-start justify-between gap-2 px-3 py-2">
              <div className="grid gap-0.5 text-sm">
                <span className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">
                    {t(`atendimentoRegistros.tiposDocumento.${documento.tipo}`)}
                  </Badge>
                  <span className="text-muted-foreground">
                    {formatarData(documento.dataEmissao)}
                  </span>
                </span>
                <span className="whitespace-pre-wrap">{documento.texto}</span>
              </div>
              {!atendimento.assinadoEm && (
                <SePermitido permissao="consultorio-assistencial.prontuarios.excluir">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label={t('atendimentoRegistros.documentos.excluir', {
                      tipo: t(`atendimentoRegistros.tiposDocumento.${documento.tipo}`),
                    })}
                    onClick={() => setRemovendo(documento)}
                  >
                    <Trash2Icon aria-hidden />
                  </Button>
                </SePermitido>
              )}
            </li>
          ))}
        </ul>
      )}
      {criando && (
        <ModalDocumentoAtendimento
          pacienteId={pacienteId}
          atendimentoId={atendimentoId}
          onFechar={() => setCriando(false)}
        />
      )}
      <ConfirmDialog
        aberto={removendo !== null}
        onAbertoChange={(aberto) => aberto || setRemovendo(null)}
        titulo={t('atendimentoRegistros.documentos.confirmarExcluir')}
        rotuloConfirmar={t('atendimentoRegistros.acoes.excluir')}
        onConfirmar={() => (removendo ? remover.mutateAsync(removendo.id) : undefined)}
      />
    </Secao>
  );
}

const CAMPOS_SNAPSHOT = ['queixa', 'evolucao', 'diagnostico', 'conduta', 'observacoes'] as const;

function Snapshot({
  rotulo,
  snapshot,
}: Readonly<{ rotulo: string; snapshot: AtendimentoSnapshot }>) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-1 rounded-md border p-2">
      <p className="text-xs font-semibold uppercase text-muted-foreground">{rotulo}</p>
      <dl className="grid gap-1 text-sm">
        {CAMPOS_SNAPSHOT.filter((campo) => snapshot[campo]).map((campo) => (
          <div key={campo}>
            <dt className="text-muted-foreground">{t(`atendimentoRegistros.campos.${campo}`)}</dt>
            <dd className="whitespace-pre-wrap">{snapshot[campo]}</dd>
          </div>
        ))}
        {snapshot.adendos.map((texto, indice) => (
          <div key={`${indice}-${texto}`}>
            <dt className="text-muted-foreground">
              {t('atendimentoRegistros.versoes.adendoNumero', { numero: indice + 1 })}
            </dt>
            <dd className="whitespace-pre-wrap">{texto}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function LinhaVersao({ versao }: Readonly<{ versao: AtendimentoVersao }>) {
  const { t } = useTranslation();
  return (
    <li className="grid gap-2 px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex flex-wrap items-center gap-2">
          <Badge variant={versao.tipo === 'ASSINATURA' ? 'default' : 'secondary'}>
            {t('atendimentoRegistros.versoes.titulo', {
              numero: versao.numero,
              tipo: t(`atendimentoRegistros.tiposVersao.${versao.tipo}`),
            })}
          </Badge>
          <span>{versao.usuarioNome ?? '-'}</span>
        </span>
        <span className="text-muted-foreground">{formatarDataHora(versao.createdAt)}</span>
      </div>
      {versao.texto && <p className="whitespace-pre-wrap">{versao.texto}</p>}
      <details>
        <summary className="cursor-pointer text-muted-foreground">
          {t('atendimentoRegistros.versoes.verAlteracao')}
        </summary>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {versao.antes && (
            <Snapshot rotulo={t('atendimentoRegistros.versoes.antes')} snapshot={versao.antes} />
          )}
          <Snapshot rotulo={t('atendimentoRegistros.versoes.depois')} snapshot={versao.depois} />
        </div>
        <p className="mt-2 break-all text-xs text-muted-foreground">
          {t('atendimentoRegistros.versoes.hash', { hash: versao.hash })}
        </p>
      </details>
    </li>
  );
}

/** Histórico de versões: a assinatura e cada adendo (quem, quando, antes e depois). */
export function SecaoVersoes({ atendimento }: Readonly<SecaoProps>) {
  const { t } = useTranslation();
  const consulta = useVersoes(atendimento.pacienteId, atendimento.id);

  return (
    <Secao id={`versoes-${atendimento.id}`} titulo={t('atendimentoRegistros.versoes.secao')}>
      {consulta.isPending && (
        <Skeleton className="h-10 w-full" aria-label={t('comum.carregando')} />
      )}
      {consulta.data?.data.length === 0 && (
        <p className="text-sm text-muted-foreground">{t('atendimentoRegistros.versoes.vazio')}</p>
      )}
      {consulta.data && consulta.data.data.length > 0 && (
        <ul className="divide-y rounded-lg border">
          {consulta.data.data.map((versao) => (
            <LinhaVersao key={versao.id} versao={versao} />
          ))}
        </ul>
      )}
    </Secao>
  );
}
