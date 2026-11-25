import { PACIENTE_SEXO_ROTULOS, type PacienteResumoProntuario } from '@torres/shared';
import type { ReactNode } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import { formatarData } from '@/lib/formatar';

/** Duas primeiras iniciais do nome, para o avatar (ex.: "Lucas Zanchet" → "LZ"). */
function iniciais(nome: string): string {
  return nome
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase())
    .join('');
}

export interface PacienteHeaderProntuarioProps {
  paciente: PacienteResumoProntuario;
  /** Ações do cabeçalho, à direita (ex.: exportar o prontuário). */
  acoes?: ReactNode;
}

/** Cabeçalho do paciente ao abrir o prontuário: avatar, nome e dados de contato. */
export function PacienteHeaderProntuario({
  paciente,
  acoes,
}: Readonly<PacienteHeaderProntuarioProps>) {
  const contato = [paciente.email, paciente.celular ?? paciente.telefone].filter(Boolean);

  return (
    <Card>
      <CardContent className="flex items-center gap-4">
        <Avatar size="lg">
          <AvatarFallback className="bg-primary/10 text-primary font-medium">
            {iniciais(paciente.nome)}
          </AvatarFallback>
        </Avatar>
        <div className="grid gap-1">
          <h2 className="font-semibold">{paciente.nome}</h2>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {contato.map((valor) => (
              <span key={valor}>{valor}</span>
            ))}
            {paciente.dataNascimento && <span>Nasc: {formatarData(paciente.dataNascimento)}</span>}
            {paciente.sexo && <span>Sexo: {PACIENTE_SEXO_ROTULOS[paciente.sexo]}</span>}
          </div>
        </div>
        {acoes && <div className="ml-auto">{acoes}</div>}
      </CardContent>
    </Card>
  );
}
