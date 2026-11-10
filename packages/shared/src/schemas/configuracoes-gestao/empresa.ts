import { z } from 'zod';
import { cnpjValido, cpfValido } from '../comercial-atendimento/paciente';
import { textoObrigatorio } from '../common/obrigatorio';

export const EMPRESA_NOME_MAX = 200;

const nome = textoObrigatorio('Nome da Empresa', { max: EMPRESA_NOME_MAX });

const documento = z
  .string({ error: 'Informe o CNPJ / CPF' })
  .transform((valor) => valor.replaceAll(/\D/g, ''))
  .refine((valor) => valor.length === 11 || valor.length === 14, { error: 'CNPJ / CPF inválido' })
  .refine((valor) => (valor.length === 11 ? cpfValido(valor) : cnpjValido(valor)), {
    error: 'CNPJ / CPF inválido',
  });

const email = z
  .email({ error: 'E-mail inválido' })
  .nullish()
  .transform((valor) => valor || null);

const telefone = z
  .string({ error: 'Telefone inválido' })
  .nullish()
  .transform((valor) => (valor ? valor.replaceAll(/\D/g, '') : null))
  .refine((valor) => valor === null || [10, 11].includes(valor.length), {
    error: 'Telefone inválido',
  });

/** `PATCH /api/configuracoes-gestao/empresas/minha` (aba Dados, botão "Salvar Alterações"). */
export const empresaInputSchema = z.strictObject({ nome, documento, email, telefone });

export type EmpresaInput = z.infer<typeof empresaInputSchema>;

export const empresaSchema = z.object({
  id: z.uuid(),
  nome: z.string(),
  documento: z.string(),
  email: z.string().nullable(),
  telefone: z.string().nullable(),
  logoArquivoId: z.uuid().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type Empresa = z.infer<typeof empresaSchema>;

/** `PUT /api/configuracoes-gestao/empresas/logo` (enviado antes em `/api/arquivos`). */
export const empresaLogoInputSchema = z.strictObject({
  arquivoId: z.uuid({ error: 'Arquivo inválido' }).nullable(),
});

export type EmpresaLogoInput = z.infer<typeof empresaLogoInputSchema>;
