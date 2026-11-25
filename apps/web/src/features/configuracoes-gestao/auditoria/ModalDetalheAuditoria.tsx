import { diffAuditoria, type AuditLogItem } from '@torres/shared';
import { LockIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/ui/button';
import { formatarData, formatarDataHora } from '@/lib/formatar';
import { useRotulosAuditoria } from './rotulos';

const DATA_HORA_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

export interface ModalDetalheAuditoriaProps {
  item: AuditLogItem;
  onFechar: () => void;
}

/**
 * Detalhe de um registro da trilha: quem, quando, o quê e o diff campo a campo (antes → depois).
 * Em registro clínico que o usuário não pode ver, mostra só os nomes dos campos alterados.
 */
export function ModalDetalheAuditoria({ item, onFechar }: Readonly<ModalDetalheAuditoriaProps>) {
  const { t } = useTranslation();
  const { rotuloAcao, rotuloEntidade, rotuloCampo } = useRotulosAuditoria();
  const diff = item.restrito ? [] : diffAuditoria(item.before, item.after);

  const formatarValor = (valor: unknown): string => {
    if (valor === null || valor === undefined || valor === '') return '-';
    if (typeof valor === 'boolean') return valor ? t('comum.sim') : t('comum.nao');
    if (typeof valor === 'string') {
      if (DATA_HORA_ISO.test(valor)) return formatarDataHora(valor);
      if (DATA_ISO.test(valor)) return formatarData(valor);
      return valor;
    }
    return typeof valor === 'object' ? JSON.stringify(valor) : String(valor);
  };

  const meta: [string, string][] = [
    [t('auditoria.colunas.data'), formatarDataHora(item.occurredAt)],
    [t('auditoria.colunas.usuario'), item.userNome ?? item.userId],
    [t('auditoria.colunas.acao'), rotuloAcao(item.action)],
    [t('auditoria.colunas.entidade'), rotuloEntidade(item.entity)],
    [t('auditoria.colunas.registro'), item.entityId],
    ...(item.ip ? ([[t('auditoria.detalhe.ip'), item.ip]] as [string, string][]) : []),
    ...(item.requestId
      ? ([[t('auditoria.detalhe.requisicao'), item.requestId]] as [string, string][])
      : []),
  ];

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo={t('auditoria.detalhe.titulo')}
      descricao={t('auditoria.detalhe.descricao')}
      tamanho="xl"
      rodape={
        <Button type="button" variant="outline" onClick={onFechar}>
          {t('comum.fechar')}
        </Button>
      }
    >
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        {meta.map(([rotulo, valor]) => (
          <div key={rotulo} className="grid gap-0.5">
            <dt className="text-muted-foreground">{rotulo}</dt>
            <dd className="font-medium break-all">{valor}</dd>
          </div>
        ))}
      </dl>

      {item.restrito ? (
        <div role="note" className="mt-4 grid gap-2 rounded-md border p-3 text-sm">
          <p className="flex items-center gap-2 font-medium">
            <LockIcon aria-hidden className="size-4" />
            {t('auditoria.detalhe.restritoTitulo')}
          </p>
          <p className="text-muted-foreground">{t('auditoria.detalhe.restritoDescricao')}</p>
          <p>
            <span className="text-muted-foreground">
              {t('auditoria.detalhe.camposAlterados')}:{' '}
            </span>
            {item.campos.map((campo) => rotuloCampo(campo)).join(', ') || '-'}
          </p>
        </div>
      ) : diff.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">{t('auditoria.detalhe.semDiferencas')}</p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  {t('auditoria.detalhe.campo')}
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  {t('auditoria.detalhe.antes')}
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  {t('auditoria.detalhe.depois')}
                </th>
              </tr>
            </thead>
            <tbody>
              {diff.map(({ campo, antes, depois }) => (
                <tr key={campo} className="border-t align-top">
                  <th scope="row" className="px-3 py-2 text-left font-medium">
                    {rotuloCampo(campo)}
                  </th>
                  <td className="px-3 py-2 break-words text-destructive">{formatarValor(antes)}</td>
                  <td className="px-3 py-2 break-words text-emerald-700 dark:text-emerald-400">
                    {formatarValor(depois)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
