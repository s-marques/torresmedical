import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/components/shared/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatarData } from '@/lib/formatar';
import { StatusLicenca } from './StatusLicenca';
import { useListaLicencas } from './use-alvaras-licencas';

export interface AbaVencimentosProps {
  /** `alertas`: vencidas e a vencer em até 60 dias. `ordem-renovacao`: todas, por vencimento. */
  recurso: 'alertas' | 'ordem-renovacao';
  unidadeId: string;
}

/** Abas "Alertas" e "Ordem Renovacao": lista curta ordenada pelo vencimento mais próximo. */
export function AbaVencimentos({ recurso, unidadeId }: Readonly<AbaVencimentosProps>) {
  const { t } = useTranslation();
  const lista = useListaLicencas(recurso, unidadeId);

  if (lista.isPending) return <Skeleton className="h-32 w-full" />;
  if (lista.isError) return <EmptyState titulo={t('alvarasLicencas.erroCarregar')} />;
  if (lista.data.length === 0) {
    return (
      <EmptyState
        titulo={t(recurso === 'alertas' ? 'alvarasLicencas.semAlertas' : 'alvarasLicencas.vazio')}
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('alvarasLicencas.colunas.tipoLicenca')}</TableHead>
          <TableHead>{t('alvarasLicencas.colunas.unidade')}</TableHead>
          <TableHead>{t('alvarasLicencas.colunas.vencimento')}</TableHead>
          <TableHead>{t('alvarasLicencas.colunas.dias')}</TableHead>
          <TableHead>{t('alvarasLicencas.colunas.status')}</TableHead>
          <TableHead>{t('alvarasLicencas.colunas.responsavel')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {lista.data.map((licenca) => (
          <TableRow key={licenca.id}>
            <TableCell>{licenca.tipoLicencaNome}</TableCell>
            <TableCell>{licenca.unidadeNome}</TableCell>
            <TableCell>{formatarData(licenca.dataVencimento)}</TableCell>
            <TableCell>{licenca.diasRestantes ?? '-'}</TableCell>
            <TableCell>
              <StatusLicenca status={licenca.status} />
            </TableCell>
            <TableCell>{licenca.responsavel ?? '-'}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
