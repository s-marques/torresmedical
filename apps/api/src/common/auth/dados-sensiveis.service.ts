import { Injectable } from '@nestjs/common';
import { RequestContextService } from '../context/request-context.service';

/**
 * Helper único para a permissão de ver dados sensíveis (`verDadosSensiveis`, LGPD). O guard
 * grava o valor no contexto da requisição. Fora de uma requisição, ou sem a flag, vale `false`:
 * o padrão é ocultar.
 */
@Injectable()
export class DadosSensiveisService {
  constructor(private readonly context: RequestContextService) {}

  permitido(): boolean {
    return this.context.getVerDadosSensiveis();
  }
}
