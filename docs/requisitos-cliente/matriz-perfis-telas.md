# Matriz perfil × tela dos perfis de acesso padrão (issue #154)

> **Gerada** de `packages/shared/src/auth/perfis-padrao.ts`. Não edite à mão: altere a definição e gere de novo.
> Para revisão do cliente (R §14). Os perfis podem ser duplicados e ajustados pela gerência, mas não excluídos.

| Sigla | Ações liberadas |
|---|---|
| **T** | ver, criar, editar, excluir, exportar |
| **E** | ver, criar, editar, exportar |
| **C** | ver, criar, editar |
| **L** | ver, exportar |
| **V** | ver |
| — | sem acesso |

## Perfis

| Perfil | Escopo de dados | Descrição |
|---|---|---|
| Administrador | TODOS | Acesso total ao sistema |
| Gerência | TODOS | Indicadores, contratos, ocupação, financeiro e gestão |
| Recepção | TODOS | Agenda e dados administrativos necessários ao atendimento |
| Médico | PROFISSIONAIS_VINCULADOS | Agenda e prontuário dos pacientes vinculados ao médico |
| Financeiro | TODOS | Financeiro, documentos e contratos necessários |
| Comercial | TODOS | CRM dos profissionais e leads, sem acesso ao conteúdo clínico |

## Matriz

### PAINEL

| Tela | Adm | Ger | Rec | Méd | Fin | Com |
|---|---|---|---|---|---|---|
| Painel | T | L | V | V | V | V |
| Busca Inteligente | T | V | V | V | — | V |

### COMERCIAL / ATENDIMENTO

| Tela | Adm | Ger | Rec | Méd | Fin | Com |
|---|---|---|---|---|---|---|
| Pipeline | T | L | — | — | — | T |
| Negócios | T | L | — | — | — | T |
| Atividades | T | L | C | — | — | T |
| Metas | T | L | — | — | — | V |
| Pacientes | T | L | E | V | — | C |
| Origens de Cliente | T | L | V | — | — | T |
| Agenda | T | L | T | C | V | V |
| Recepção | T | L | T | — | — | — |
| Confirmações | T | L | E | — | — | — |
| Orçamentos | T | L | E | — | V | E |
| Vendas/PDV | T | L | E | — | L | V |
| Pacotes | T | L | V | — | V | E |
| Mensalidades | T | L | V | — | E | V |
| WhatsApp | T | L | C | — | — | E |
| Campanhas | T | L | — | — | — | T |
| Grupos WhatsApp | T | L | — | — | — | T |
| Pesquisa NPS | T | L | V | — | — | E |
| Pesquisa do Profissional | T | L | — | V | — | E |
| Relatórios | T | L | — | — | — | L |

### CONSULTÓRIO / ASSISTENCIAL

| Tela | Adm | Ger | Rec | Méd | Fin | Com |
|---|---|---|---|---|---|---|
| Atendimento Médico | T | — | — | C | — | — |
| Receituários | T | — | — | E | — | — |
| Prontuários | T | — | — | E | — | — |
| Evolução por Voz | T | — | — | C | — | — |
| Soroterapia | T | — | — | E | — | — |
| Prestadores | T | — | — | V | — | — |
| Encaminhamentos | T | — | — | C | — | — |
| Relatórios | T | L | — | L | — | — |

### GESTÃO PROFISSIONAIS

| Tela | Adm | Ger | Rec | Méd | Fin | Com |
|---|---|---|---|---|---|---|
| Salas | T | E | V | V | — | — |
| Profissionais | T | E | V | V | V | E |
| Onboarding | T | E | — | — | V | V |
| Serviços Profissionais | T | E | V | V | — | V |
| Protocolos | T | E | — | V | — | — |
| Receita Profissionais | T | L | — | V | L | V |
| Relatórios | T | L | — | — | L | L |

### FINANCEIRO

| Tela | Adm | Ger | Rec | Méd | Fin | Com |
|---|---|---|---|---|---|---|
| Caixas | T | L | — | — | T | — |
| Contas a Receber | T | L | — | — | T | — |
| Contas a Pagar | T | L | — | — | T | — |
| Conciliação | T | L | — | — | T | — |
| Formas de Pagamento | T | L | — | — | T | — |
| Plano de Contas | T | L | — | — | T | — |
| Relatórios | T | L | — | — | L | — |
| Indicadores | T | L | — | — | L | — |
| Inadimplência | T | L | — | — | T | — |

### PATRIMÔNIO & PESSOAL

| Tela | Adm | Ger | Rec | Méd | Fin | Com |
|---|---|---|---|---|---|---|
| Patrimônio | T | L | — | — | L | — |
| Imóveis | T | L | — | — | L | — |
| Veículos | T | L | — | — | L | — |

### COMPRAS / ESTOQUE

| Tela | Adm | Ger | Rec | Méd | Fin | Com |
|---|---|---|---|---|---|---|
| Estoque | T | L | — | — | V | — |
| Entrada de Compras | T | L | — | — | E | — |
| Fornecedores | T | L | — | — | E | — |
| Produtos/Serviços | T | L | V | V | V | V |
| Categorias | T | L | — | — | V | — |
| Baixa de Insumos | T | L | — | — | — | — |
| Lotes / Validade | T | L | — | — | — | — |
| Pedidos em Trânsito | T | L | — | — | V | — |
| Relatórios | T | L | — | — | L | — |

### REGULATÓRIO / QUALIDADE

| Tela | Adm | Ger | Rec | Méd | Fin | Com |
|---|---|---|---|---|---|---|
| Alvarás e Licenças | T | L | — | — | V | — |
| Funcionários | T | E | — | — | V | — |
| Treinamentos | T | E | — | — | — | — |
| Não Conformidades | T | E | — | — | — | — |
| Coleta Resíduos | T | L | — | — | — | — |
| Fiscal | T | L | — | — | E | — |
| Relatórios | T | L | — | — | L | — |

### CONFIGURAÇÕES / GESTÃO

| Tela | Adm | Ger | Rec | Méd | Fin | Com |
|---|---|---|---|---|---|---|
| Relatórios | T | L | — | — | — | — |
| Usuários | T | E | — | — | — | — |
| Perfis de Acesso | T | E | — | — | — | — |
| AI Growth | T | L | — | — | — | L |
| Agentes IA | T | V | — | — | — | — |
| Instruções Agente | T | V | — | — | — | — |
| Base de Conhecimento | T | V | — | — | — | — |
| Bypass Agente | T | V | — | — | — | — |
| Tipos de Agendamento | T | E | V | — | — | — |
| Motivos de Cancelamento | T | — | — | — | — | — |
| Respostas Rápidas | T | E | V | — | — | E |
| Configurações | T | V | — | — | — | — |
| Minha Empresa | T | E | — | — | — | — |

### Permissões extras (fora das telas)

| Permissão | Adm | Ger | Rec | Méd | Fin | Com |
|---|---|---|---|---|---|---|
| `configuracoes-gestao.auditoria.ver` | ✔ | — | — | — | — | — |
| `gestao-profissionais.profissionais-documentos.validar` | ✔ | ✔ | — | — | — | — |
| `consultorio-assistencial.prontuarios-acessos.ver` | ✔ | — | — | — | — | — |
| `configuracoes-gestao.dados-pessoais.exportar` | ✔ | ✔ | — | — | ✔ | — |
| `financeiro.contas-pagar.aprovar` | ✔ | ✔ | — | — | — | — |
