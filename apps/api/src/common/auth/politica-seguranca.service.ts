import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import {
  POLITICA_PADRAO,
  validarSenhaPolitica,
  type PoliticaSeguranca,
  type PoliticaSegurancaInput,
  type RegrasSenha,
} from '@torres/shared';
import { BusinessException } from '../errors/api.exception';
import type { PrismaAdapter } from '../prisma/prisma-transaction';

export const SENHA_FORA_DA_POLITICA = 'SENHA_FORA_DA_POLITICA';

/**
 * Política de segurança da empresa (issue #156, R §41): regras de senha, bloqueio por
 * tentativas, troca no primeiro acesso, expiração e carência do acesso do profissional.
 * Sem linha no banco, vale `POLITICA_PADRAO`. Está em `common/auth` porque o login e a troca de
 * senha dependem dela; a tela fica em `configuracoes-gestao`.
 */
@Injectable()
export class PoliticaSegurancaService {
  constructor(private readonly txHost: TransactionHost<PrismaAdapter>) {}

  async obter(empresaId: string): Promise<PoliticaSeguranca> {
    const linha = await this.txHost.tx.politicaSeguranca.findUnique({ where: { empresaId } });
    if (!linha) return { ...POLITICA_PADRAO, updatedAt: null };
    return {
      tamanhoMinimo: linha.tamanhoMinimo,
      exigirMaiuscula: linha.exigirMaiuscula,
      exigirSimbolo: linha.exigirSimbolo,
      tentativasBloqueio: linha.tentativasBloqueio,
      minutosBloqueio: linha.minutosBloqueio,
      trocaPrimeiroAcesso: linha.trocaPrimeiroAcesso,
      expiracaoDias: linha.expiracaoDias,
      carenciaProfissionalDias: linha.carenciaProfissionalDias,
      updatedAt: linha.updatedAt.toISOString(),
    };
  }

  /** Política da única empresa do sistema, para rotinas sem usuário (agendadores). */
  async obterDaPrimeiraEmpresa(): Promise<PoliticaSeguranca> {
    const empresa = await this.txHost.tx.empresa.findFirst({
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    return empresa ? this.obter(empresa.id) : { ...POLITICA_PADRAO, updatedAt: null };
  }

  async regrasSenha(empresaId: string): Promise<RegrasSenha> {
    const { tamanhoMinimo, exigirMaiuscula, exigirSimbolo } = await this.obter(empresaId);
    return { tamanhoMinimo, exigirMaiuscula, exigirSimbolo };
  }

  /** Grava a política. O estado anterior vem de `obter`, para o `audit_log`. */
  async atualizar(empresaId: string, input: PoliticaSegurancaInput): Promise<PoliticaSeguranca> {
    await this.txHost.tx.politicaSeguranca.upsert({
      where: { empresaId },
      create: { empresaId, ...input },
      update: input,
    });
    return this.obter(empresaId);
  }

  /**
   * Recusa a senha que não cumpre a política, com a mensagem de cada regra (400, campo
   * `campo`). As regras fixas (letras e números) já são conferidas pelo schema Zod.
   */
  async garantirSenhaValida(empresaId: string, senha: string, campo = 'senha'): Promise<void> {
    const erros = validarSenhaPolitica(senha, await this.regrasSenha(empresaId));
    if (erros.length === 0) return;
    throw new BusinessException(SENHA_FORA_DA_POLITICA, erros.join('. '), {
      status: 400,
      details: erros.map((message) => ({ field: campo, message })),
    });
  }
}
