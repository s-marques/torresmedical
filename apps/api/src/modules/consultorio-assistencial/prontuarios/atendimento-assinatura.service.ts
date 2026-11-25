import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import type {
  AssinaturaInput,
  Atendimento as AtendimentoDto,
  AtendimentoSnapshot,
  AtendimentoVersao as VersaoDto,
  AtendimentoVersaoLista,
  CreateAdendoInput,
  UpdateAtendimentoInput,
} from '@torres/shared';
import type {
  Atendimento as AtendimentoModel,
  AtendimentoVersao as VersaoModel,
} from '../../../generated/prisma/client';
import { semPermissao } from '../../../common/auth/escopo-dados.service';
import { isUuid } from '../../../common/auth/tokens';
import { RequestContextService } from '../../../common/context/request-context.service';
import { BusinessException } from '../../../common/errors/api.exception';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { UsuariosLookupService } from '../../configuracoes-gestao/usuarios/usuarios.service';
import { ProfissionaisService } from '../../gestao-profissionais/profissionais/profissionais.service';
import { AtendimentoAcessoService, atendimentoAssinado } from './atendimento-acesso.service';
import { hashDoSnapshot, snapshotDoAtendimento, toAtendimentoDto } from './atendimento.mapper';

function toVersaoDto(versao: VersaoModel, usuarioNome: string | null): VersaoDto {
  return {
    id: versao.id,
    atendimentoId: versao.atendimentoId,
    numero: versao.numero,
    tipo: versao.tipo,
    usuarioId: versao.usuarioId,
    usuarioNome,
    texto: versao.texto,
    antes: versao.antes as AtendimentoSnapshot | null,
    depois: versao.depois as unknown as AtendimentoSnapshot,
    hash: versao.hash,
    createdAt: versao.createdAt.toISOString(),
  };
}

/**
 * Edição, assinatura e adendos do atendimento (issue #151, mapa mental p. 1-2: "Assinaturas,
 * histórico e auditoria"). A assinatura é a confirmação com a senha do próprio usuário, que
 * precisa estar vinculado ao profissional responsável (decisão do dev; certificado ICP-Brasil
 * fica fora). Depois de assinado o conteúdo não muda: a correção entra como adendo, e cada
 * versão guarda quem, quando, o antes/depois e o hash do conteúdo.
 */
@Injectable()
export class AtendimentoAssinaturaService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly acesso: AtendimentoAcessoService,
    private readonly usuarios: UsuariosLookupService,
    private readonly profissionais: ProfissionaisService,
    private readonly contexto: RequestContextService,
  ) {}

  /** Corrige o conteúdo de um atendimento ainda não assinado. */
  async atualizar(
    pacienteId: string,
    atendimentoId: string,
    input: UpdateAtendimentoInput,
  ): Promise<AtendimentoDto> {
    const atual = await this.acesso.carregar(pacienteId, atendimentoId);
    if (atual.assinadoEm) throw atendimentoAssinado();
    const alterado = await this.txHost.tx.atendimento.update({
      where: { id: atual.id },
      data: input,
    });
    return this.paraDto(alterado);
  }

  /**
   * Finaliza e assina. Atendimento da agenda precisa ser finalizado antes (tela Atendimento
   * Médico); o registrado direto no prontuário é finalizado junto com a assinatura.
   */
  async assinar(
    pacienteId: string,
    atendimentoId: string,
    input: AssinaturaInput,
  ): Promise<AtendimentoDto> {
    const atual = await this.acesso.carregar(pacienteId, atendimentoId);
    if (atual.assinadoEm) {
      throw new BusinessException('ATENDIMENTO_JA_ASSINADO', 'Atendimento já assinado.', {
        status: 409,
      });
    }
    const usuarioId = await this.confirmarResponsavel(atual, input.senha);
    if (atual.status !== 'FINALIZADO' && atual.agendamentoId) {
      throw new BusinessException(
        'ATENDIMENTO_NAO_FINALIZADO',
        'Finalize o atendimento antes de assinar.',
        { status: 409 },
      );
    }

    const agora = new Date();
    const depois = snapshotDoAtendimento(atual, []);
    const hash = hashDoSnapshot(depois);
    const assinado = await this.txHost.tx.atendimento.update({
      where: { id: atual.id },
      data: {
        status: 'FINALIZADO',
        finalizadoEm: atual.finalizadoEm ?? agora,
        assinadoEm: agora,
        assinadoPorId: usuarioId,
        assinaturaHash: hash,
      },
    });
    await this.txHost.tx.atendimentoVersao.create({
      data: {
        atendimentoId: atual.id,
        numero: 1,
        tipo: 'ASSINATURA',
        usuarioId,
        antes: undefined,
        depois: depois as unknown as object,
        hash,
      },
    });
    return this.paraDto(assinado);
  }

  /** Correção de um atendimento assinado: nova versão com o texto do adendo, sem tocar no original. */
  async adendo(
    pacienteId: string,
    atendimentoId: string,
    input: CreateAdendoInput,
  ): Promise<VersaoDto> {
    const atual = await this.acesso.carregar(pacienteId, atendimentoId);
    if (!atual.assinadoEm) {
      throw new BusinessException(
        'ATENDIMENTO_NAO_ASSINADO',
        'Atendimento ainda não assinado: edite o registro.',
        { status: 409 },
      );
    }
    const usuarioId = await this.garantirResponsavel(atual);

    const versoes = await this.txHost.tx.atendimentoVersao.findMany({
      where: { atendimentoId: atual.id },
      orderBy: { numero: 'asc' },
      select: { numero: true, texto: true },
    });
    const anteriores = versoes.flatMap((v) => (v.texto ? [v.texto] : []));
    const antes = snapshotDoAtendimento(atual, anteriores);
    const depois = snapshotDoAtendimento(atual, [...anteriores, input.texto]);
    const numero = (versoes.at(-1)?.numero ?? 1) + 1;
    const criada = await this.txHost.tx.atendimentoVersao.create({
      data: {
        atendimentoId: atual.id,
        numero,
        tipo: 'ADENDO',
        usuarioId,
        texto: input.texto,
        antes: antes as unknown as object,
        depois: depois as unknown as object,
        hash: hashDoSnapshot(depois),
      },
    });
    const nomes = await this.usuarios.nomesPorIds([usuarioId]);
    return toVersaoDto(criada, nomes.get(usuarioId) ?? null);
  }

  /** Histórico de versões (assinatura e adendos), da mais antiga para a mais recente. */
  async versoes(pacienteId: string, atendimentoId: string): Promise<AtendimentoVersaoLista> {
    const atual = await this.acesso.carregar(pacienteId, atendimentoId, 'VERSOES');
    const versoes = await this.txHost.tx.atendimentoVersao.findMany({
      where: { atendimentoId: atual.id },
      orderBy: { numero: 'asc' },
    });
    const nomes = await this.usuarios.nomesPorIds(versoes.map((v) => v.usuarioId));
    return { data: versoes.map((v) => toVersaoDto(v, nomes.get(v.usuarioId) ?? null)) };
  }

  /** Nome de quem assinou e total de adendos de cada atendimento (listagem do prontuário). */
  async resumos(
    atendimentos: readonly AtendimentoModel[],
  ): Promise<Map<string, { assinadoPorNome: string | null; totalAdendos: number }>> {
    const resumos = new Map<string, { assinadoPorNome: string | null; totalAdendos: number }>();
    const assinados = atendimentos.filter((a) => a.assinadoEm);
    if (assinados.length === 0) return resumos;

    const [nomes, adendos] = await Promise.all([
      this.usuarios.nomesPorIds(
        assinados.flatMap((a) => (a.assinadoPorId ? [a.assinadoPorId] : [])),
      ),
      this.txHost.tx.atendimentoVersao.groupBy({
        by: ['atendimentoId'],
        where: { atendimentoId: { in: assinados.map((a) => a.id) }, tipo: 'ADENDO' },
        _count: { _all: true },
      }),
    ]);
    const totais = new Map(adendos.map((g) => [g.atendimentoId, g._count._all]));
    for (const a of assinados) {
      resumos.set(a.id, {
        assinadoPorNome: a.assinadoPorId ? (nomes.get(a.assinadoPorId) ?? null) : null,
        totalAdendos: totais.get(a.id) ?? 0,
      });
    }
    return resumos;
  }

  // --- Internos ----------------------------------------------------------------------------

  private async paraDto(atendimento: AtendimentoModel): Promise<AtendimentoDto> {
    const [resumo, profissional] = await Promise.all([
      this.resumos([atendimento]),
      this.profissionais.detalhe(atendimento.profissionalId).catch(() => null),
    ]);
    return toAtendimentoDto(atendimento, profissional?.nome ?? null, resumo.get(atendimento.id));
  }

  /** Só o usuário vinculado ao profissional responsável assina ou escreve adendo (403). */
  private async garantirResponsavel(atendimento: AtendimentoModel): Promise<string> {
    const usuarioId = this.contexto.getUserId();
    if (
      !usuarioId ||
      !isUuid(usuarioId) ||
      !(await this.usuarios.vinculadoAoProfissional(usuarioId, atendimento.profissionalId))
    ) {
      throw semPermissao();
    }
    return usuarioId;
  }

  /** Responsável pelo atendimento e senha confirmada (422 `ASSINATURA_SENHA_INVALIDA`). */
  private async confirmarResponsavel(
    atendimento: AtendimentoModel,
    senha: string,
  ): Promise<string> {
    const usuarioId = await this.garantirResponsavel(atendimento);
    if (!(await this.usuarios.confirmarSenha(usuarioId, senha))) {
      throw new BusinessException('ASSINATURA_SENHA_INVALIDA', 'Senha incorreta.', {
        status: 422,
        details: [{ field: 'senha', message: 'Senha incorreta.' }],
      });
    }
    return usuarioId;
  }
}
