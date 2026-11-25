import {
  ATENDIMENTO_STATUS_ROTULOS,
  ATENDIMENTO_TIPO_ROTULOS,
  type Atendimento,
} from '@torres/shared';
import { BadgeCheckIcon, PlusIcon, StethoscopeIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/components/shared/EmptyState';
import { SePermitido } from '@/components/shared/SePermitido';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatarDataHora } from '@/lib/formatar';
import { ModalAtendimento } from './ModalAtendimento';
import { ModalDetalheAtendimento } from './ModalDetalheAtendimento';
import { useAtendimentos } from './use-prontuarios';

export interface AbaAtendimentosProps {
  pacienteId: string;
}

/** Aba "Atendimentos": histórico de atendimentos clínicos do paciente. */
export function AbaAtendimentos({ pacienteId }: Readonly<AbaAtendimentosProps>) {
  const [criando, setCriando] = useState(false);
  const [detalheId, setDetalheId] = useState<string | null>(null);
  const { data, isPending } = useAtendimentos(pacienteId);

  // O detalhe lê da lista, que se atualiza depois de assinar, editar ou registrar adendo.
  const detalhe = data?.data.find((atendimento) => atendimento.id === detalheId);

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Atendimentos</CardTitle>
          <p className="text-sm text-muted-foreground">
            Histórico de atendimentos médicos do paciente.
          </p>
        </div>
        <SePermitido permissao="consultorio-assistencial.prontuarios.criar">
          <Button type="button" onClick={() => setCriando(true)}>
            <PlusIcon aria-hidden />
            Novo Atendimento
          </Button>
        </SePermitido>
      </CardHeader>
      <CardContent>
        {isPending && <Skeleton className="h-32 w-full" aria-label="Carregando" />}
        {data && data.data.length === 0 && (
          <EmptyState icone={StethoscopeIcon} titulo="Nenhum atendimento registrado." />
        )}
        {data && data.data.length > 0 && (
          <ul className="divide-y rounded-lg border">
            {data.data.map((atendimento) => (
              <LinhaAtendimento
                key={atendimento.id}
                atendimento={atendimento}
                onDetalhes={() => setDetalheId(atendimento.id)}
              />
            ))}
          </ul>
        )}
      </CardContent>
      {criando && <ModalAtendimento pacienteId={pacienteId} onFechar={() => setCriando(false)} />}
      {detalhe && (
        <ModalDetalheAtendimento atendimento={detalhe} onFechar={() => setDetalheId(null)} />
      )}
    </Card>
  );
}

function LinhaAtendimento({
  atendimento,
  onDetalhes,
}: Readonly<{ atendimento: Atendimento; onDetalhes: () => void }>) {
  const { t } = useTranslation();
  return (
    <li className="grid gap-1 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">
            {atendimento.tipo ? ATENDIMENTO_TIPO_ROTULOS[atendimento.tipo] : 'Atendimento'}
          </Badge>
          <Badge variant="outline">{ATENDIMENTO_STATUS_ROTULOS[atendimento.status]}</Badge>
          {atendimento.assinadoEm && (
            <Badge>
              <BadgeCheckIcon className="size-3" aria-hidden />
              {t('atendimentoRegistros.assinado')}
            </Badge>
          )}
          {atendimento.profissionalNome && (
            <span className="text-sm text-muted-foreground">{atendimento.profissionalNome}</span>
          )}
        </div>
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          {formatarDataHora(atendimento.createdAt)}
          <Button type="button" variant="outline" size="sm" onClick={onDetalhes}>
            {t('atendimentoRegistros.detalhes')}
          </Button>
        </span>
      </div>
      {(atendimento.queixa ?? atendimento.diagnostico ?? atendimento.conduta) && (
        <p className="text-sm">
          {atendimento.queixa ?? atendimento.diagnostico ?? atendimento.conduta}
        </p>
      )}
    </li>
  );
}
