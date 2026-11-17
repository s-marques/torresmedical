import { CAMPANHA_STATUS_ROTULO, CAMPANHA_TIPO_ENVIO_ROTULO } from '@torres/shared';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatarDataHora } from '@/lib/formatar';
import { descreverDias, descreverFiltro } from './textos';
import { useCampanhas, useMensagensAutomaticas, useResumoCampanhas } from './use-campanhas';

function Cartao({
  rotulo,
  valor,
  rodape,
}: Readonly<{ rotulo: string; valor: string; rodape?: ReactNode }>) {
  return (
    <div className="grid gap-1 rounded-lg border bg-card p-4">
      <p className="text-sm text-muted-foreground">{rotulo}</p>
      <p className="text-2xl font-semibold">{valor}</p>
      {rodape && <div className="text-xs text-muted-foreground">{rodape}</div>}
    </div>
  );
}

function Secao({ titulo, children }: Readonly<{ titulo: string; children: ReactNode }>) {
  return (
    <section className="grid gap-3 rounded-lg border bg-card p-4" aria-label={titulo}>
      <h2 className="font-semibold">{titulo}</h2>
      {children}
    </section>
  );
}

/** Aba "Relatórios": cartões, Histórico de Campanhas e resumo das mensagens automáticas. */
export function AbaRelatorios() {
  const resumo = useResumoCampanhas().data;
  const campanhas = useCampanhas().data?.data ?? [];
  const automacoes = useMensagensAutomaticas().data ?? [];

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4" data-testid="resumo-campanhas">
        <Cartao
          rotulo="Total Campanhas"
          valor={String(resumo?.totalCampanhas ?? 0)}
          rodape={<Badge variant="secondary">{resumo?.concluidas ?? 0} concluídas</Badge>}
        />
        <Cartao
          rotulo="Mensagens Enviadas"
          valor={String(resumo?.mensagensEnviadas ?? 0)}
          rodape={`de ${resumo?.destinatarios ?? 0} destinatários`}
        />
        <Cartao
          rotulo="Taxa de Sucesso"
          valor={`${(resumo?.taxaSucesso ?? 0).toLocaleString('pt-BR')}%`}
        />
        <Cartao
          rotulo="Automações"
          valor={String(resumo?.automacoes ?? 0)}
          rodape={
            <span className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{resumo?.automacoesAtivas ?? 0} ativas</Badge>
              {resumo?.automacoesEnviados ?? 0} enviados
            </span>
          }
        />
      </div>

      <Secao titulo="Histórico de Campanhas">
        {campanhas.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nenhuma campanha registrada.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Data do Envio</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Destinatários</TableHead>
                <TableHead>Enviados</TableHead>
                <TableHead>Falhas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campanhas.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>{c.nome}</TableCell>
                  <TableCell>{formatarDataHora(c.agendadaPara)}</TableCell>
                  <TableCell>{CAMPANHA_STATUS_ROTULO[c.status]}</TableCell>
                  <TableCell>{c.totalDestinatarios}</TableCell>
                  <TableCell>{c.totalEnviados}</TableCell>
                  <TableCell>{c.totalFalhas}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Secao>

      <Secao titulo="Mensagens Automáticas — Resumo">
        {automacoes.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nenhuma mensagem automática.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Filtro</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Horário</TableHead>
                <TableHead>Dias</TableHead>
                <TableHead>Total Enviados</TableHead>
                <TableHead>Último Envio</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {automacoes.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>{a.nome}</TableCell>
                  <TableCell>{CAMPANHA_TIPO_ENVIO_ROTULO[a.tipoEnvio]}</TableCell>
                  <TableCell>{descreverFiltro(a)}</TableCell>
                  <TableCell>{a.ativa ? 'Ativa' : 'Inativa'}</TableCell>
                  <TableCell>{a.horario}</TableCell>
                  <TableCell>{descreverDias(a.diasSemana)}</TableCell>
                  <TableCell>{a.totalEnviados}</TableCell>
                  <TableCell>{formatarDataHora(a.ultimoEnvioEm)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Secao>
    </div>
  );
}
