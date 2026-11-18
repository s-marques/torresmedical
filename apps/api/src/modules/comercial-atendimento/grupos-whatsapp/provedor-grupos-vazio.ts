import { Injectable } from '@nestjs/common';
import type { GrupoWhatsapp } from '@torres/shared';
import { ProvedorGruposWhatsapp } from './provedor-grupos-whatsapp';

/** Implementação provisória, até a integração com o provedor existir. */
@Injectable()
export class ProvedorGruposVazio extends ProvedorGruposWhatsapp {
  listarGrupos(): Promise<GrupoWhatsapp[]> {
    return Promise.resolve([]);
  }
}
