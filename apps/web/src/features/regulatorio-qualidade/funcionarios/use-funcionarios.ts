import {
  funcionarioSchema,
  type CreateFuncionarioInput,
  type Funcionario,
  type UpdateFuncionarioInput,
} from '@torres/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api/client';
import { META_FORMULARIO } from '@/lib/api/query-client';

export const URL_FUNCIONARIOS = '/api/regulatorio-qualidade/funcionarios';

function useMutationFuncionario<TVariaveis>(
  mutationFn: (variaveis: TVariaveis) => Promise<Funcionario>,
  { formulario = false, sucesso }: { formulario?: boolean; sucesso?: string },
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    meta: formulario ? META_FORMULARIO : undefined,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['data-grid', URL_FUNCIONARIOS] });
      if (sucesso) toast.success(sucesso);
    },
  });
}

function chamar(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown) {
  return apiFetch(`${URL_FUNCIONARIOS}${path}`, { method, body, schema: funcionarioSchema });
}

export function useCriarFuncionario() {
  return useMutationFuncionario((dados: CreateFuncionarioInput) => chamar('', 'POST', dados), {
    formulario: true,
    sucesso: 'Funcionário cadastrado.',
  });
}

export function useEditarFuncionario(id: string) {
  return useMutationFuncionario(
    (dados: UpdateFuncionarioInput) => chamar(`/${id}`, 'PATCH', dados),
    { formulario: true, sucesso: 'Funcionário atualizado.' },
  );
}

export function useExcluirFuncionario() {
  return useMutationFuncionario((id: string) => chamar(`/${id}`, 'DELETE'), {
    sucesso: 'Funcionário excluído.',
  });
}

export function useDesativarFuncionario() {
  return useMutationFuncionario(
    (funcionario: Funcionario) =>
      chamar(`/${funcionario.id}`, 'PATCH', { ...paraEntrada(funcionario), status: 'inativo' }),
    { sucesso: 'Funcionário desativado.' },
  );
}

/** Monta o corpo do `PATCH` (substitui todos os campos) a partir do registro atual. */
function paraEntrada(f: Funcionario): UpdateFuncionarioInput {
  return {
    nome: f.nome,
    cpf: f.cpf ?? '',
    rg: f.rg ?? '',
    dataNascimento: f.dataNascimento ?? '',
    dataAdmissao: f.dataAdmissao ?? '',
    telefone: f.telefone ?? '',
    email: f.email ?? '',
    endereco: f.endereco ?? '',
    cargoId: f.cargoId,
    salario: f.salario === null ? null : Number(f.salario),
    tipoContrato: f.tipoContrato,
    cargaHoraria: f.cargaHoraria,
    pis: f.pis ?? '',
    ctps: f.ctps ?? '',
    banco: f.banco ?? '',
    agencia: f.agencia ?? '',
    conta: f.conta ?? '',
    status: f.ativo ? 'ativo' : 'inativo',
    observacoes: f.observacoes ?? '',
  };
}
