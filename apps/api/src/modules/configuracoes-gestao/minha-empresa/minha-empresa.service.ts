import { Transactional, TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import type {
  DiaHorario,
  Empresa as EmpresaDto,
  EmpresaInput,
  SalvarHorariosFuncionamentoInput,
  UsuarioResumo,
} from '@torres/shared';
import type {
  Empresa,
  HorarioFuncionamento,
  HorarioIntervalo,
} from '../../../generated/prisma/client';
import { AuditService } from '../../../common/audit/audit.service';
import { BusinessException } from '../../../common/errors/api.exception';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { ArquivosService } from '../../../common/storage/arquivos.service';

type HorarioComIntervalos = HorarioFuncionamento & { intervalos: HorarioIntervalo[] };

function toEmpresaDto(empresa: Empresa): EmpresaDto {
  return {
    id: empresa.id,
    nome: empresa.nome,
    documento: empresa.documento,
    email: empresa.email,
    telefone: empresa.telefone,
    logoArquivoId: empresa.logoArquivoId,
    createdAt: empresa.createdAt.toISOString(),
    updatedAt: empresa.updatedAt.toISOString(),
  };
}

function toDiaHorario(dia: number, horario: HorarioComIntervalos | undefined): DiaHorario {
  if (!horario) return { diaSemana: dia, fechado: true, abre: null, fecha: null, intervalos: [] };
  return {
    diaSemana: horario.diaSemana,
    fechado: horario.fechado,
    abre: horario.abre,
    fecha: horario.fecha,
    intervalos: horario.intervalos
      .sort((a, b) => a.ordem - b.ordem)
      .map((i) => ({ id: i.id, inicio: i.inicio, fim: i.fim })),
  };
}

/**
 * Dados da tela "Minha Empresa" (aba Dados: cadastro e logo; aba Usuários: lista somente
 * leitura; aba Horários: horário de funcionamento). `empresaId` sempre vem do usuário logado.
 */
@Injectable()
export class MinhaEmpresaService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly arquivos: ArquivosService,
    private readonly audit: AuditService,
  ) {}

  async obterDados(empresaId: string): Promise<EmpresaDto> {
    return toEmpresaDto(
      await this.txHost.tx.empresa.findUniqueOrThrow({ where: { id: empresaId } }),
    );
  }

  /**
   * Sem `@Audit` (a rota não tem `:id`: a empresa vem do usuário logado, não da URL).
   * Grava o audit_log manualmente, com o `before` de verdade (CLAUDE.md, seção 4).
   */
  @Transactional()
  async atualizarDados(empresaId: string, input: EmpresaInput): Promise<EmpresaDto> {
    const antes = await this.txHost.tx.empresa.findUniqueOrThrow({ where: { id: empresaId } });
    const atualizada = await this.txHost.tx.empresa.update({
      where: { id: empresaId },
      data: input,
    });
    await this.audit.record({
      action: 'UPDATE',
      entity: 'Empresa',
      entityId: empresaId,
      before: antes,
      after: atualizada,
    });
    return toEmpresaDto(atualizada);
  }

  @Transactional()
  async definirLogo(empresaId: string, arquivoId: string | null): Promise<EmpresaDto> {
    if (arquivoId) {
      const arquivo = await this.arquivos.findById(arquivoId);
      if (arquivo.uso !== 'logo-empresa') {
        throw new BusinessException('ARQUIVO_USO_INVALIDO', 'Arquivo inválido para este campo', {
          status: 400,
          details: [{ field: 'arquivoId', message: 'O arquivo enviado não é do tipo esperado' }],
        });
      }
    }
    const antes = await this.txHost.tx.empresa.findUniqueOrThrow({ where: { id: empresaId } });
    const atualizada = await this.txHost.tx.empresa.update({
      where: { id: empresaId },
      data: { logoArquivoId: arquivoId },
    });
    await this.audit.record({
      action: 'UPDATE',
      entity: 'Empresa',
      entityId: empresaId,
      before: antes,
      after: atualizada,
    });
    return toEmpresaDto(atualizada);
  }

  /** Somente leitura: criar/editar/excluir usuário é a tela própria "Usuários" (`/usuarios`). */
  async listarUsuarios(empresaId: string): Promise<UsuarioResumo[]> {
    const usuarios = await this.txHost.tx.usuario.findMany({
      where: { empresaId, deletedAt: null },
      include: { perfil: { select: { nome: true } } },
      orderBy: { nome: 'asc' },
    });
    return usuarios.map((u) => ({
      id: u.id,
      nome: u.nome,
      email: u.email,
      perfilNome: u.perfil?.nome ?? null,
      ativo: u.ativo,
      ultimoLoginEm: u.ultimoLoginEm?.toISOString() ?? null,
    }));
  }

  async listarHorarios(empresaId: string): Promise<DiaHorario[]> {
    const horarios = await this.buscarHorarios(empresaId);
    const porDia = new Map(horarios.map((h) => [h.diaSemana, h]));
    return Array.from({ length: 7 }, (_, dia) => toDiaHorario(dia, porDia.get(dia)));
  }

  /** "Salvar Horários": substitui a semana inteira. Auditoria manual (CLAUDE.md, seção 4: lote). */
  @Transactional()
  async salvarHorarios(
    empresaId: string,
    input: SalvarHorariosFuncionamentoInput,
  ): Promise<DiaHorario[]> {
    const antes = await this.listarHorarios(empresaId);
    await this.txHost.tx.horarioFuncionamento.deleteMany({ where: { empresaId } });
    for (const dia of input.dias) {
      await this.txHost.tx.horarioFuncionamento.create({
        data: {
          empresaId,
          diaSemana: dia.diaSemana,
          fechado: dia.fechado,
          abre: dia.fechado ? null : dia.abre,
          fecha: dia.fechado ? null : dia.fecha,
          intervalos: {
            create: dia.fechado
              ? []
              : dia.intervalos.map((intervalo, ordem) => ({
                  inicio: intervalo.inicio,
                  fim: intervalo.fim,
                  ordem,
                })),
          },
        },
      });
    }
    const depois = await this.listarHorarios(empresaId);
    await this.audit.record({
      action: 'UPDATE',
      entity: 'HorarioFuncionamento',
      entityId: empresaId,
      before: antes,
      after: depois,
    });
    return depois;
  }

  private buscarHorarios(empresaId: string): Promise<HorarioComIntervalos[]> {
    return this.txHost.tx.horarioFuncionamento.findMany({
      where: { empresaId },
      include: { intervalos: true },
    });
  }
}
