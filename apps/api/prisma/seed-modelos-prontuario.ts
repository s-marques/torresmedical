import {
  modeloSecoesSchema,
  type ModeloProfissao,
  type ModeloSecoesFormulario,
} from '@torres/shared';
import type { Prisma } from '../src/generated/prisma/client';

/**
 * Modelos de prontuário iniciais (issue #152): um padrão por profissão citada pelo cliente
 * (R §38). O conteúdo é uma SUGESTÃO genérica, a validar com o cliente; o seed só cria os que
 * ainda não existem, então nunca sobrescreve o que a clínica editou.
 */

interface DefinicaoModelo {
  id: string;
  nome: string;
  profissao: ModeloProfissao;
  secoes: ModeloSecoesFormulario;
}

const texto = (chave: string, rotulo: string, obrigatorio = false) =>
  ({ chave, rotulo, tipo: 'TEXTO', obrigatorio }) as const;
const lista = (chave: string, rotulo: string, opcoes: string[]) =>
  ({ chave, rotulo, tipo: 'LISTA', opcoes }) as const;
const numero = (chave: string, rotulo: string, min?: number, max?: number) =>
  ({ chave, rotulo, tipo: 'NUMERO', min, max }) as const;
const escala = (chave: string, rotulo: string) => ({ chave, rotulo, tipo: 'ESCALA' }) as const;
const data = (chave: string, rotulo: string) => ({ chave, rotulo, tipo: 'DATA' }) as const;

export const MODELOS_PRONTUARIO_INICIAIS: readonly DefinicaoModelo[] = [
  {
    id: '8f2c1a10-0000-4000-8000-000000000001',
    nome: 'Consulta médica',
    profissao: 'MEDICO',
    secoes: [
      {
        titulo: 'Anamnese',
        campos: [
          texto('queixa_principal', 'Queixa principal', true),
          texto('historia_doenca_atual', 'História da doença atual'),
          texto('antecedentes', 'Antecedentes pessoais e familiares'),
        ],
      },
      {
        titulo: 'Exame físico',
        campos: [
          numero('pressao_sistolica', 'Pressão sistólica (mmHg)', 40, 300),
          numero('pressao_diastolica', 'Pressão diastólica (mmHg)', 20, 200),
          numero('frequencia_cardiaca', 'Frequência cardíaca (bpm)', 20, 250),
          texto('exame_fisico', 'Exame físico'),
        ],
      },
      {
        titulo: 'Conclusão',
        campos: [
          texto('hipotese_diagnostica', 'Hipótese diagnóstica'),
          texto('conduta', 'Conduta'),
          data('data_retorno', 'Data de retorno'),
        ],
      },
    ],
  },
  {
    id: '8f2c1a10-0000-4000-8000-000000000002',
    nome: 'Sessão de psicologia',
    profissao: 'PSICOLOGO',
    secoes: [
      {
        titulo: 'Demanda',
        campos: [
          texto('demanda', 'Demanda ou motivo da sessão', true),
          lista('tipo_sessao', 'Tipo de sessão', [
            'Avaliação inicial',
            'Acompanhamento',
            'Devolutiva',
          ]),
        ],
      },
      {
        titulo: 'Observações da sessão',
        campos: [
          escala('humor', 'Humor (0 a 10)'),
          escala('ansiedade', 'Ansiedade (0 a 10)'),
          texto('relato', 'Relato e observações'),
        ],
      },
      {
        titulo: 'Plano',
        campos: [
          texto('encaminhamentos', 'Encaminhamentos e tarefas'),
          data('proxima_sessao', 'Próxima sessão'),
        ],
      },
    ],
  },
  {
    id: '8f2c1a10-0000-4000-8000-000000000003',
    nome: 'Consulta de nutrição',
    profissao: 'NUTRICIONISTA',
    secoes: [
      {
        titulo: 'Avaliação antropométrica',
        campos: [
          numero('peso', 'Peso (kg)', 1, 500),
          numero('altura', 'Altura (cm)', 30, 250),
          numero('circunferencia_abdominal', 'Circunferência abdominal (cm)', 20, 300),
        ],
      },
      {
        titulo: 'Hábitos',
        campos: [
          texto('historico_alimentar', 'Histórico alimentar', true),
          lista('atividade_fisica', 'Atividade física', [
            'Sedentário',
            'Leve',
            'Moderada',
            'Intensa',
          ]),
          texto('restricoes', 'Alergias e restrições alimentares'),
        ],
      },
      {
        titulo: 'Plano alimentar',
        campos: [texto('plano', 'Orientações e plano alimentar'), data('retorno', 'Retorno')],
      },
    ],
  },
  {
    id: '8f2c1a10-0000-4000-8000-000000000004',
    nome: 'Avaliação fisioterapêutica',
    profissao: 'FISIOTERAPEUTA',
    secoes: [
      {
        titulo: 'Avaliação',
        campos: [
          texto('queixa', 'Queixa principal', true),
          escala('dor', 'Dor (0 a 10)'),
          texto('localizacao', 'Localização da dor'),
          texto('limitacoes', 'Limitações funcionais'),
        ],
      },
      {
        titulo: 'Exame físico',
        campos: [
          texto('amplitude_movimento', 'Amplitude de movimento'),
          texto('forca_muscular', 'Força muscular'),
        ],
      },
      {
        titulo: 'Tratamento',
        campos: [
          texto('objetivos', 'Objetivos do tratamento'),
          texto('conduta', 'Conduta e técnicas aplicadas'),
          numero('sessoes_previstas', 'Sessões previstas', 1, 200),
        ],
      },
    ],
  },
  {
    id: '8f2c1a10-0000-4000-8000-000000000005',
    nome: 'Atendimento de biomedicina',
    profissao: 'BIOMEDICO',
    secoes: [
      {
        titulo: 'Procedimento',
        campos: [
          texto('procedimento', 'Procedimento realizado', true),
          texto('area_tratada', 'Área tratada'),
          texto('produtos', 'Produtos e lotes utilizados'),
        ],
      },
      {
        titulo: 'Acompanhamento',
        campos: [
          texto('intercorrencias', 'Intercorrências'),
          texto('orientacoes', 'Orientações pós-procedimento'),
          data('retorno', 'Retorno'),
        ],
      },
    ],
  },
];

/** Cria só os modelos que ainda não existem (não sobrescreve o que a clínica editou). */
export async function applySeedModelosProntuario(tx: Prisma.TransactionClient): Promise<void> {
  for (const modelo of MODELOS_PRONTUARIO_INICIAIS) {
    if (await tx.modeloProntuario.findUnique({ where: { id: modelo.id } })) continue;
    const secoes = modeloSecoesSchema.parse(modelo.secoes);
    await tx.modeloProntuario.create({
      data: {
        id: modelo.id,
        nome: modelo.nome,
        profissao: modelo.profissao,
        profissionalId: null,
        versaoAtual: 1,
        versoes: { create: { numero: 1, nome: modelo.nome, secoes: secoes as unknown as object } },
      },
    });
  }
}
