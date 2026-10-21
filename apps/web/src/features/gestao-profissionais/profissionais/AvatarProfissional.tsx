import type { Profissional } from '@torres/shared';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { corHex, iniciaisDe } from './formatadores';
import { useLinkArquivo } from './use-profissionais';

export interface AvatarProfissionalProps {
  profissional: Pick<Profissional, 'nome' | 'corCalendario' | 'fotoArquivoId'>;
  className?: string;
}

/** Foto do profissional ou, sem foto, as iniciais sobre a cor do calendário. */
export function AvatarProfissional({ profissional, className }: Readonly<AvatarProfissionalProps>) {
  const link = useLinkArquivo(profissional.fotoArquivoId);
  return (
    <Avatar className={cn('size-8', className)}>
      {link.data && <AvatarImage src={link.data.url} alt="" />}
      <AvatarFallback
        className="text-xs font-semibold text-white"
        style={{ backgroundColor: corHex(profissional.corCalendario) }}
      >
        {iniciaisDe(profissional.nome)}
      </AvatarFallback>
    </Avatar>
  );
}
