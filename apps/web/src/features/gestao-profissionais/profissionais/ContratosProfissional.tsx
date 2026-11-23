import {
  CONTRATO_MODALIDADE_ROTULOS,
  descreverDiaContrato,
  descreverValorContrato,
  type ContratoSala,
} from '@torres/shared';
import { StatusContrato } from '../salas/StatusContrato';
import { formatarData } from './formatadores';
import { useContratosProfissional } from './use-profissionais';

function vigencia(contrato: ContratoSala): string {
  const inicio = formatarData(contrato.dataInicio);
  return contrato.dataFim ? `${inicio} a ${formatarData(contrato.dataFim)}` : `${inicio} em diante`;
}

/**
 * Aba "Contratos" do detalhe do profissional: somente leitura. Os dados vêm dos contratos de
 * sala (tela Salas), sem cópia no cadastro.
 */
export function ContratosProfissional({ profissionalId }: Readonly<{ profissionalId: string }>) {
  const consulta = useContratosProfissional(profissionalId);

  return (
    <section aria-labelledby="titulo-contratos-profissional" className="grid gap-3 border-t pt-4">
      <h3 id="titulo-contratos-profissional" className="text-sm font-semibold">
        Contratos
      </h3>
      {consulta.isPending && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {consulta.isError && (
        <p role="alert" className="text-sm text-destructive">
          Não foi possível carregar os contratos.
        </p>
      )}
      {consulta.data?.data.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhum contrato de sala.</p>
      )}
      <ul className="grid gap-2">
        {consulta.data?.data.map((contrato) => (
          <li key={contrato.id} className="grid gap-1 rounded-md border p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">
                {contrato.salaNumero
                  ? `${contrato.salaNome} (${contrato.salaNumero})`
                  : contrato.salaNome}
              </span>
              <StatusContrato status={contrato.status} />
            </div>
            <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted-foreground">Modalidade</dt>
                <dd>{CONTRATO_MODALIDADE_ROTULOS[contrato.modalidade]}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Vigência</dt>
                <dd>{vigencia(contrato)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Valor</dt>
                <dd>{descreverValorContrato(contrato)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Vencimento</dt>
                <dd>{`Dia ${contrato.diaVencimento}`}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs text-muted-foreground">Dias e horários</dt>
                <dd>
                  {contrato.dias.length ? contrato.dias.map(descreverDiaContrato).join(', ') : '-'}
                </dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
    </section>
  );
}
