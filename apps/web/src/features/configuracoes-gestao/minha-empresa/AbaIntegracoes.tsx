import { CalendarIcon, LinkIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Aba "Integrações": só exibição (confirmado com o dev). A integração com o Google Calendar
 * (OAuth) fica para uma issue futura dedicada.
 */
export function AbaIntegracoes() {
  return (
    <div className="grid gap-4 rounded-lg border p-6">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <CalendarIcon aria-hidden className="size-5" />
        Google Calendar
      </h2>
      <p className="text-sm text-muted-foreground">
        Conecte sua agenda do Google para sincronizar consultas.
      </p>
      <div className="grid justify-items-center gap-3 py-8 text-center">
        <CalendarIcon aria-hidden className="size-10 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Nenhuma conta Google conectada.</p>
        <Button type="button" disabled>
          <LinkIcon aria-hidden />
          Conectar Google Agenda
        </Button>
      </div>
    </div>
  );
}
