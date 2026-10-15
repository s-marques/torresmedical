import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ApiRequestError, ERRO_INESPERADO_API } from '@/lib/api/api-error';
import { apiFalsa, json } from '../../../test/render-app';
import { Modal } from '../Modal';
import { FormAcoes } from './FormAcoes';
import { FormField } from './FormField';
import { FormLayout } from './FormLayout';
import { useFormulario } from './use-formulario';

const PACIENTE = {
  id: '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f',
  label: 'Ana Teste',
  descricao: null,
};

const schema = z.object({
  nome: z.string().trim().min(1, { error: 'Informe o nome' }),
  cpf: z.string().length(11, { error: 'CPF inválido' }),
  valor: z.number({ error: 'Informe o valor' }),
  quantidade: z.number().nullable(),
  email: z.string(),
  senha: z.string(),
  telefone: z.string(),
  cep: z.string(),
  documento: z.string(),
  cnpj: z.string(),
  nascimento: z.string(),
  de: z.string(),
  ate: z.string(),
  tipo: z.string().min(1, { error: 'Selecione o tipo' }),
  pacienteId: z.string().nullable(),
  observacao: z.string(),
  aceite: z.boolean(),
  ativo: z.boolean(),
});

type Valores = z.input<typeof schema>;

const VAZIO: Valores = {
  nome: '',
  cpf: '',
  valor: null as unknown as number,
  quantidade: null,
  email: '',
  senha: '',
  telefone: '',
  cep: '',
  documento: '',
  cnpj: '',
  nascimento: '',
  de: '',
  ate: '',
  tipo: '',
  pacienteId: null,
  observacao: '',
  aceite: false,
  ativo: true,
};

function Formulario({
  onSubmit,
  emModal = false,
}: Readonly<{ onSubmit: (valores: z.output<typeof schema>) => unknown; emModal?: boolean }>) {
  const form = useFormulario(schema, { defaultValues: VAZIO });
  const campos = (
    <FormLayout
      form={form}
      onSubmit={onSubmit}
      id="form-teste"
      colunas={2}
      acoes={emModal ? null : undefined}
      onCancelar={() => {}}
    >
      <FormField name="nome" label="Nome" obrigatorio descricao="Nome completo" />
      <FormField name="cpf" label="CPF" tipo="cpf" obrigatorio />
      <FormField name="valor" label="Valor" tipo="moeda" obrigatorio />
      <FormField name="quantidade" label="Quantidade" tipo="numero" />
      <FormField name="email" label="E-mail" tipo="email" />
      <FormField name="senha" label="Senha" tipo="senha" />
      <FormField name="telefone" label="Telefone" tipo="telefone" />
      <FormField name="cep" label="CEP" tipo="cep" />
      <FormField name="documento" label="CPF/CNPJ" tipo="cpf-cnpj" />
      <FormField name="cnpj" label="CNPJ" tipo="cnpj" />
      <FormField name="nascimento" label="Nascimento" tipo="data" />
      <FormField name="de" nameAte="ate" label="Vencimento" tipo="periodo" />
      <FormField
        name="tipo"
        label="Tipo"
        tipo="select"
        obrigatorio
        opcoes={[
          { valor: 'a', rotulo: 'Opção A' },
          { valor: 'b', rotulo: 'Opção B' },
        ]}
      />
      <FormField name="pacienteId" label="Paciente" tipo="entidade" entidade="pacientes" />
      <FormField name="observacao" label="Observação" tipo="textarea" />
      <FormField name="aceite" label="Aceito os termos" tipo="checkbox" />
      <FormField name="ativo" label="Ativo" tipo="switch" />
    </FormLayout>
  );
  if (!emModal) return campos;
  return (
    <Modal
      aberto
      onAbertoChange={() => {}}
      titulo="Novo"
      rodape={<FormAcoes form={form} formId="form-teste" rotuloEnviar="Criar" />}
    >
      {campos}
    </Modal>
  );
}

function renderizar(onSubmit: (valores: z.output<typeof schema>) => unknown, emModal = false) {
  vi.stubGlobal(
    'fetch',
    apiFalsa({
      rotas: {
        '/api/lookups/pacientes': () =>
          json({ data: [PACIENTE], meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 } }),
      },
    }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <Formulario onSubmit={onSubmit} emModal={emModal} />
    </QueryClientProvider>,
  );
  return userEvent.setup();
}

const erroApi = (status: number, details?: { field: string; message: string }[]) =>
  new ApiRequestError(status, {
    statusCode: status,
    code: 'X',
    message: `Erro ${status}`,
    details,
  });

type Usuario = ReturnType<typeof userEvent.setup>;

/** Cola o texto no campo (um evento só, bem mais rápido que digitar tecla a tecla). */
async function colar(
  user: Usuario,
  rotulo: string,
  texto: string,
  raiz: HTMLElement = document.body,
) {
  await user.click(within(raiz).getByLabelText(rotulo));
  await user.paste(texto);
}

async function preencherObrigatorios(user: Usuario) {
  await colar(user, 'Nome', 'Unidade Centro');
  await colar(user, 'CPF', '123.456.789-01');
  await colar(user, 'Valor', '123456');
  await user.click(screen.getByRole('combobox', { name: 'Tipo' }));
  await user.click(await screen.findByRole('option', { name: 'Opção B' }));
}

// Formulário com todos os tipos de campo: sob a carga do `pnpm -r test`, passa dos 5 s padrão.
describe('FormLayout e FormField', { timeout: 15_000 }, () => {
  it('mostra as mensagens dos obrigatórios e foca o primeiro campo inválido', async () => {
    const onSubmit = vi.fn();
    const user = renderizar(onSubmit);

    const nome = screen.getByLabelText('Nome');
    expect(nome).toHaveAttribute('aria-required', 'true');
    expect(nome).toHaveAccessibleDescription('Nome completo');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Informe o nome')).toBeInTheDocument();
    expect(screen.getByText('CPF inválido')).toBeInTheDocument();
    expect(screen.getByText('Informe o valor')).toBeInTheDocument();
    expect(screen.getByText('Selecione o tipo')).toBeInTheDocument();
    expect(nome).toHaveAttribute('aria-invalid', 'true');
    expect(nome).toHaveAccessibleDescription('Nome completo Informe o nome');
    expect(nome).toHaveFocus();
    expect(onSubmit).not.toHaveBeenCalled();

    // Corrigido o campo, a mensagem some ao digitar.
    await user.type(nome, 'X');
    await waitFor(() => expect(screen.queryByText('Informe o nome')).not.toBeInTheDocument());
  });

  it('aplica as máscaras e envia os valores de cada tipo de campo', async () => {
    const onSubmit = vi.fn();
    const user = renderizar(onSubmit);

    await preencherObrigatorios(user);
    expect(screen.getByLabelText('CPF')).toHaveValue('123.456.789-01');
    expect((screen.getByLabelText('Valor') as HTMLInputElement).value).toMatch(/^R\$\s1\.234,56$/);
    await colar(user, 'Quantidade', '3');
    await colar(user, 'E-mail', 'a@example.com');
    await colar(user, 'Senha', 'segredo');
    await colar(user, 'Telefone', '65999998888');
    expect(screen.getByLabelText('Telefone')).toHaveValue('(65) 99999-8888');
    await colar(user, 'CEP', '78000123');
    await colar(user, 'CPF/CNPJ', '12345678000195');
    expect(screen.getByLabelText('CPF/CNPJ')).toHaveValue('12.345.678/0001-95');
    await colar(user, 'CNPJ', '1');
    await colar(user, 'Nascimento', '2000-01-31');
    const periodo = screen.getByRole('group', { name: 'Vencimento' });
    await colar(user, 'De', '2026-10-01', periodo);
    await colar(user, 'até', '2026-10-31', periodo);
    await user.click(screen.getByRole('combobox', { name: 'Paciente' }));
    await user.click(await screen.findByRole('option', { name: 'Ana Teste' }));
    await colar(user, 'Observação', 'Obs');
    await user.click(screen.getByRole('checkbox', { name: 'Aceito os termos' }));
    await user.click(screen.getByRole('switch', { name: 'Ativo' }));
    await user.clear(screen.getByLabelText('Quantidade'));
    await colar(user, 'Quantidade', '4');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({
      nome: 'Unidade Centro',
      cpf: '12345678901',
      valor: 1234.56,
      quantidade: 4,
      email: 'a@example.com',
      senha: 'segredo',
      telefone: '65999998888',
      cep: '78000123',
      documento: '12345678000195',
      cnpj: '1',
      nascimento: '2000-01-31',
      de: '2026-10-01',
      ate: '2026-10-31',
      tipo: 'b',
      pacienteId: PACIENTE.id,
      observacao: 'Obs',
      aceite: true,
      ativo: false,
    });
  });

  it('leva os details do 400 aos campos, com foco no primeiro', async () => {
    const onSubmit = vi
      .fn()
      .mockRejectedValue(erroApi(400, [{ field: 'cpf', message: 'CPF já cadastrado' }]));
    const user = renderizar(onSubmit);

    await preencherObrigatorios(user);
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('CPF já cadastrado')).toBeInTheDocument();
    expect(screen.getByLabelText('CPF')).toHaveFocus();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each([
    [erroApi(409), 'Erro 409'],
    [new Error('interno'), ERRO_INESPERADO_API],
  ])('mostra o erro geral do servidor no topo (%#)', async (erro, mensagem) => {
    const user = renderizar(vi.fn().mockRejectedValue(erro));

    await preencherObrigatorios(user);
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(mensagem);
  });

  it('401 e 403 ficam com o tratamento global', async () => {
    const onSubmit = vi
      .fn()
      .mockRejectedValueOnce(erroApi(403))
      .mockRejectedValueOnce(erroApi(401));
    const user = renderizar(onSubmit);

    await preencherObrigatorios(user);
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('no Modal, o botão do rodapé envia o formulário e fica ocupado durante o envio', async () => {
    let concluir = () => {};
    const onSubmit = vi.fn(() => new Promise<void>((resolve) => (concluir = resolve)));
    const user = renderizar(onSubmit, true);

    await preencherObrigatorios(user);
    const criar = screen.getByRole('button', { name: 'Criar' });
    await user.click(criar);

    await waitFor(() => expect(criar).toHaveAttribute('aria-busy', 'true'));
    await user.click(criar);
    expect(onSubmit).toHaveBeenCalledOnce();
    concluir();
    await waitFor(() => expect(criar).toHaveAttribute('aria-busy', 'false'));
  });
});
