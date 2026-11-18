import type { GrupoWhatsapp } from '@torres/shared';

/**
 * Porta para o provedor de WhatsApp (Dinasti API). A integração real é uma issue própria:
 * enquanto ela não existe, `ProvedorGruposVazio` devolve lista vazia.
 */
export abstract class ProvedorGruposWhatsapp {
  /** Grupos de que o número do canal participa. */
  abstract listarGrupos(canalId: string): Promise<GrupoWhatsapp[]>;
}
