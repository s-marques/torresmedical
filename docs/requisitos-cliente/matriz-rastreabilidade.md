# Matriz de rastreabilidade: requisitos do cliente × board

Rastreia cada requisito dos documentos do cliente (recebidos em 12/11/2026) até os cards do
[board](https://github.com/users/s-marques/projects/2), para que o board represente o escopo
esperado: o que já foi entregue, o que precisa de ajuste e o que falta. Origem: issue [#135].

## Documentos

Arquivos nesta pasta (PR [#180]). Veja também o [README](README.md).

- **R** = **Rastreio de dificuldades do DrIntelli e requisitos para o novo software** (seções numeradas de 1 a 45) — [PDF](rastreio-dificuldades-drintelli-e-requisitos.pdf)
- **MV** = **Mapa mental: visão geral do sistema substituto ao DrIntelli** (3 páginas) — [PDF](mapa-mental-visao-geral.pdf)
- **IA** = **Mapa mental: falhas documentadas no DrIntelli + IA como primeiro atendimento** (4 páginas; C1 a C9 são as 9 falhas do DrIntelli relatadas em julho) — [PDF](mapa-mental-falhas-drintelli-e-ia-whatsapp.pdf)

O DrIntelli é o sistema legado. O inventário de telas ([`docs/inventario/`](../inventario/README.md))
continua sendo a referência das telas; os documentos acrescentam regras de negócio e lacunas.

## Como manter esta matriz

- Card novo criado a partir dos documentos: ganha a label `requisito-cliente` e entra na linha
  do requisito correspondente, no mesmo PR ou em um PR `docs`.
- A seção **Situação dos cards** é uma foto do board na data indicada. O status vivo é o do board.
  Atualize a foto quando revisar a matriz.

## Como ler o board
- Label **requisito-cliente**: card criado ou complementado a partir dos documentos.
- Label **ajuste**: card novo que ajusta uma funcionalidade já entregue (o card original não foi reaberto; a referência está no corpo).
- Milestones **Fase 1 a 4**: prioridade definida pelo cliente (R §44; MV p.3; IA p.4).
- Cards pendentes complementados ganharam a seção **Requisitos do cliente (12/11/2026)**, antes dos critérios de aceite.

## Matriz requisito → card

### Fundamentos

| Requisito | Fonte | Cards |
|---|---|---|
| Operar o coworking médico: comercial → contrato → sala → agenda → paciente → recepção → atendimento → financeiro → relacionamento → gestão | R §1, §43, conclusão; MV p.1 | [#142], [#153] |
| Sistema multiprofissional e multiempresa (Torres administra a infraestrutura; cada profissional, sua operação clínica) | R §37; IA p.3 | [#153], [#150] |
| Uma informação cadastrada uma vez alimenta toda a operação (contrato assinado → ativa, agenda, cobranças, MRR, ocupação, onboarding) | R conclusão | [#142], [#115], [#140] |

### Agenda, salas e ocupação

| Requisito | Fonte | Cards |
|---|---|---|
| Agenda matricial Sala × Dia × Horário × Profissional, filtros e cores/status | R §2; MV p.2 | [#137], [#1], [#110] |
| Impedir dupla ocupação da sala; agenda do médico ≠ agenda da sala | R §2, §3; MV p.2 | [#136] |
| Bloqueios, manutenção, reserva, cortesia e uso avulso de sala | R §2; MV p.1-2 | [#138] |
| Dashboard de ocupação (capacidade, contratado, utilizado, vago, por sala/dia/turno/profissional) | R §4; IA p.1 (C2) | [#139], [#60], [#50] |

### Profissionais

| Requisito | Fonte | Cards |
|---|---|---|
| Cadastro profissional, operacional e comercial completo | R §5 | [#140], [#53] |
| Documentos do profissional (contrato, CRM, RQE, licenças, certificados, sanitários) | R §5, §31 | [#141] |
| Onboarding com checklist automático | R §6; MV p.3 | [#142] |
| Linha do tempo do relacionamento | R §24 | [#144] |
| Classificação do parceiro (novo, ativo, estratégico, em expansão, em risco, inativo) | R §25, §44 F4 | [#143], [#56] |
| Indicação/encaminhamento entre profissionais | R §26 | [#146] |
| Pesquisa de experiência do profissional (30 dias) | R §36, §27 item 9 | [#145] |

### Recepção e pacientes

| Requisito | Fonte | Cards |
|---|---|---|
| Interface própria da recepção: atendimentos de hoje e status rápidos | R §7; MV p.1-2 | [#147] |
| Fila e tempo de espera (chegada, entrada, finalização) | R §12 | [#147], [#38], [#43] |
| Cadastro do paciente com origem, indicação, retorno, consentimentos e preferência de comunicação | R §8 | [#148], [#10] |
| Impedir/alertar duplicidade (CPF, telefone, e-mail, nome + nascimento) | R §9 | [#149] |
| Confirmação automática 24/48 h com resposta que atualiza a agenda | R §10 | [#4] |
| Controle de no-show e alerta de faltas recorrentes | R §11 | [#43], [#160] |

### Prontuário e acesso

| Requisito | Fonte | Cards |
|---|---|---|
| Prontuário individual por profissional e segregado | R §13, §14, §37; IA p.4 (aceite de segurança) | [#150], [#38] |
| Exames, anexos, documentos, assinatura e histórico de alterações | R §13; MV p.1-2 | [#151], [#42] |
| Modelos por profissão/especialidade | R §13, §38 | [#152] |
| Perfis Administrador, Gerência, Recepção, Médico, Financeiro, Comercial | R §14 | [#154], [#153] |
| Log de auditoria consultável (quem, o quê, quando, antes, depois) | R §15 | [#155], [#76] |

### Contratos e financeiro

| Requisito | Fonte | Cards |
|---|---|---|
| Contas a pagar completas (competência, centro de custo, anexo, duplicidade, divergência) | R §16, §31 | [#163] |
| Não permitir baixa sem confirmação / aprovação financeira | R §16; MV p.1-2 | [#164] |
| Recebíveis gerados automaticamente dos contratos | R §17 | [#115] |
| Status A vencer, Pago, Vencido, Parcial, Renegociado, Cancelado; contrato ligado ao financeiro | R §17, §19 | [#165] |
| Relatório de provisão de recebimentos (imprescindível) | R §17, §18 | [#167] |
| Inadimplência: painel e alertas −3, 0, +3, +7 dias | R §18 | [#166] |
| Reajustes (índice, periodicidade, próxima data, percentual, histórico, aviso de 30 dias) | R §20 | [#168] |
| Catálogo do coworking por SKU e receita por SKU | IA p.1 (C8), p.3; R §27 item 3 | [#169] |
| Dashboard financeiro (saldo previsto, receita contratada/recebida/pendente, inadimplência, contas a pagar, resultado) | R §28 | [#50] |
| Relatórios financeiros: receita total, DRE, conta contábil, semanal de contas a pagar | R §16; IA p.1 (C1, C6, C9) | [#52] |
| Estoque e compras de insumos do coworking, com previsão de compras | R §16, §30; IA p.1 (C7) | [#20], [#17], [#22], [#23], [#25], [#203] |

### CRM e relacionamento

| Requisito | Fonte | Cards |
|---|---|---|
| Pipeline do Torres dentro do sistema; lead do WhatsApp gera negócio | R §21 | [#13], [#174] |
| Ficha do lead médico, indicação (Top indicadores) e prospecção ativa (data da visita) | R §22 | [#7], [#14] |
| Follow-up obrigatório: próxima ação + data + responsável | R §23 | [#2], [#7] |
| Metas comerciais projetadas × realizadas | R §24 | [#172] |

### Gestão, painéis e relatórios

| Requisito | Fonte | Cards |
|---|---|---|
| Dashboard da gerência e relatório mensal de apresentação (10 indicadores) | R §27 | [#171], [#34], [#14] |
| Dashboard da operação (diário) e painel principal "Hoje" com alertas | R §29, §45; IA p.1 (C3, C5) | [#170] |
| NPS dos pacientes | R §27 item 10; IA p.1 (C3) | [#12] |
| Cancelamentos rastreáveis e motivos padronizados | R §34, §35; IA p.1 (C4) | [#162] |
| Central de notificações e tarefas | R §33, §45 | [#160] |
| Busca global por dados | R §32 | [#159], [#59] |

### IA no WhatsApp

| Requisito | Fonte | Cards |
|---|---|---|
| Números por profissional/clínica e viabilidade do provedor | IA p.2 item 1; p.4 | [#26], [#173] |
| Scripts por profissional com versões, aprovação e testes | IA p.2 item 2 | [#31], [#28] |
| Conversa inteligente sem inventar e sem decisão clínica | IA p.2 item 3 e regra | [#174] |
| Agendamento automático com slots verificados (aceite da IA) | IA p.2 item 4; p.4 | [#175] |
| Transferência humana com contexto | IA p.2 item 5; p.4 | [#176], [#29] |
| Monitoramento da IA e LGPD (consentimento, opt-out, auditoria) | IA p.2 item 6; p.3 | [#177] |

### Segurança, dados e migração

| Requisito | Fonte | Cards |
|---|---|---|
| LGPD: política de senha, controle de exportação, encerramento de acesso | R §41 | [#156] |
| Exportação de todos os dados em PDF/XLSX/CSV | R §39 | [#158] |
| Backup automático e restauração testável | R §40; MV p.3 | [#157] |
| Acesso pelo celular (web responsivo) | R §42 | [#161] |
| Migração integral do DrIntelli | MV p.1, p.3; IA p.4 | [#178] |
| Checklist antes de desligar o DrIntelli | MV p.3 | [#179] |

## Prioridade do cliente
- **Fase 1 — Operação essencial:** usuários e permissões, profissionais, pacientes, salas, agenda, recepção, prontuário, contratos, contas a receber, dashboard básico (R §44). MV e IA incluem nesta fase segurança, backup, exportação e migração integral antes do corte.
- **Fase 2 — Gestão:** CRM, follow-up, onboarding, ocupação, inadimplência, contas a pagar, documentos, relatórios e indicadores. IA p.4 coloca a **correção dos relatórios** (receita, DRE, NPS, cancelamentos, contratos, estoque, ocupação) como P0.
- **Fase 3 — Automação:** WhatsApp/IA, confirmações, lembretes, cobrança, pesquisa de satisfação, reativação, alertas.
- **Fase 4 — Inteligência:** BI, previsão de ocupação, receita projetada, churn, profissionais em risco, expansão.

## Cards do inventário sem requisito nos documentos
Vieram do inventário do DrIntelli e os documentos não falam deles. Ficam no board, sem milestone, até o cliente confirmar a prioridade:
[#5], [#27], [#30], [#39], [#40], [#44], [#46], [#61], [#62], [#63], [#64], [#65], [#66], [#68], [#69], [#70]

## Cards com escopo a confirmar por causa dos documentos
- [#6] Mensalidades: possível sobreposição com as cobranças dos contratos ([#115]).
- [#55] Receita Profissionais: o cliente pede financeiro só do coworking, sem misturar o caixa dos médicos.

## Regras gerais tiradas dos documentos (valem para todos os cards)
- Relatórios e indicadores são **testados contra dados conhecidos** (IA p.4).
- Filtros de período são mantidos ao navegar de um indicador para o detalhe (falhas C3 e C5).
- Nada é apagado: cancelamentos e exclusões guardam quem, quando e motivo (R §34).
- Não atribuir ao DrIntelli falhas ou limitações sem evidência (MV p.3).
- A IA não faz diagnóstico, prescrição nem decisões clínicas (IA p.2).

## Situação dos cards em 19/11/2026

| Card | Título | Fase | Status no board |
|---|---|---|---|
| [#1] | [Comercial / Atendimento] Agenda | — | Concluído |
| [#2] | [Comercial / Atendimento] Atividades | Fase 2 — Gestão | Concluído |
| [#4] | [Comercial / Atendimento] Confirmações | Fase 3 — Automação | Concluído |
| [#5] | [Comercial / Atendimento] Grupos WhatsApp | — | Em revisão |
| [#6] | [Comercial / Atendimento] Mensalidades | — | Em revisão |
| [#7] | [Comercial / Atendimento] Negócios | Fase 2 — Gestão | Em revisão |
| [#10] | [Comercial / Atendimento] Pacientes | — | Concluído |
| [#12] | [Comercial / Atendimento] Pesquisa NPS | Fase 3 — Automação | Concluído |
| [#13] | [Comercial / Atendimento] Pipeline | Fase 2 — Gestão | Concluído |
| [#14] | [Comercial / Atendimento] Relatórios | Fase 2 — Gestão | Backlog |
| [#17] | [Compras / Estoque] Baixa de Insumos | Fase 2 — Gestão | Concluído |
| [#20] | [Compras / Estoque] Estoque | Fase 2 — Gestão | Concluído |
| [#22] | [Compras / Estoque] Lotes / Validade | Fase 2 — Gestão | Concluído |
| [#23] | [Compras / Estoque] Pedidos em Trânsito | Fase 2 — Gestão | Concluído |
| [#25] | [Compras / Estoque] Relatórios | Fase 2 — Gestão | Backlog |
| [#26] | [Configurações / Gestão] Agentes IA | Fase 3 — Automação | Em revisão |
| [#27] | [Configurações / Gestão] AI Growth | — | Em desenvolvimento |
| [#28] | [Configurações / Gestão] Base de Conhecimento | Fase 3 — Automação | Em revisão |
| [#29] | [Configurações / Gestão] Bypass Agente | Fase 3 — Automação | Em revisão |
| [#30] | [Configurações / Gestão] Configurações | — | Concluído |
| [#31] | [Configurações / Gestão] Instruções Agente | Fase 3 — Automação | Em revisão |
| [#34] | [Configurações / Gestão] Relatórios | Fase 2 — Gestão | Backlog |
| [#38] | [Consultório / Assistencial] Atendimento Médico | Fase 1 — Operação essencial | Concluído |
| [#39] | [Consultório / Assistencial] Evolução por Voz | — | Em revisão |
| [#40] | [Consultório / Assistencial] Prestadores | — | Em revisão |
| [#42] | [Consultório / Assistencial] Receituários | Fase 1 — Operação essencial | Em revisão |
| [#43] | [Consultório / Assistencial] Relatórios | Fase 2 — Gestão | Backlog |
| [#44] | [Consultório / Assistencial] Soroterapia | — | Backlog |
| [#46] | [Financeiro] Conciliação | — | Em revisão |
| [#50] | [Financeiro] Indicadores | Fase 2 — Gestão | Backlog |
| [#52] | [Financeiro] Relatórios | Fase 2 — Gestão | Backlog |
| [#53] | [Gestão Profissionais] Profissionais | — | Concluído |
| [#55] | [Gestão Profissionais] Receita Profissionais | — | Backlog |
| [#56] | [Gestão Profissionais] Relatórios | Fase 2 — Gestão | Backlog |
| [#59] | [Painel] Busca Inteligente | Fase 4 — Inteligência | Backlog |
| [#60] | [Painel] Painel | — | Concluído |
| [#61] | [Patrimônio & Pessoal] Imóveis | — | Backlog |
| [#62] | [Patrimônio & Pessoal] Patrimônio | — | Backlog |
| [#63] | [Patrimônio & Pessoal] Veículos | — | Backlog |
| [#64] | [Regulatório / Qualidade] Alvarás e Licenças | — | Backlog |
| [#65] | [Regulatório / Qualidade] Coleta Resíduos | — | Backlog |
| [#66] | [Regulatório / Qualidade] Fiscal | — | Backlog |
| [#68] | [Regulatório / Qualidade] Não Conformidades | — | Backlog |
| [#69] | [Regulatório / Qualidade] Relatórios | — | Backlog |
| [#70] | [Regulatório / Qualidade] Treinamentos | — | Backlog |
| [#76] | [Base] Auditoria: audit_log + interceptor | — | Concluído |
| [#110] | [Gestão Profissionais] Salas: Cobranças e Mapa de Ocupação | — | Concluído |
| [#115] | [Gestão Profissionais] Salas: Cobranças dos contratos | — | Concluído |
| [#136] | [Comercial / Atendimento] Agenda: sala no agendamento e bloqueio de dupla ocupação | Fase 1 — Operação essencial | Backlog |
| [#137] | [Comercial / Atendimento] Agenda matricial: Sala × Dia × Horário × Profissional | Fase 1 — Operação essencial | Backlog |
| [#138] | [Gestão Profissionais] Salas: bloqueios e reservas (manutenção, reserva, cortesia, uso avulso) | Fase 1 — Operação essencial | Backlog |
| [#139] | [Painel] Ocupação efetiva: períodos utilizados × contratados × vagos | Fase 2 — Gestão | Backlog |
| [#140] | [Gestão Profissionais] Profissionais: cadastro operacional, clínico e comercial completo | Fase 1 — Operação essencial | Backlog |
| [#141] | [Gestão Profissionais] Profissionais: documentos com validade (contrato, CRM, RQE, licenças, certificados) | Fase 2 — Gestão | Backlog |
| [#142] | [Gestão Profissionais] Onboarding do profissional: checklist automático a partir do contrato | Fase 2 — Gestão | Backlog |
| [#143] | [Gestão Profissionais] Classificação automática do parceiro: novo, ativo, estratégico, em expansão, em risco, inativo | Fase 4 — Inteligência | Backlog |
| [#144] | [Gestão Profissionais] Profissionais: linha do tempo do relacionamento (do lead ao primeiro atendimento) | Fase 2 — Gestão | Backlog |
| [#145] | [Comercial / Atendimento] Pesquisa de experiência do profissional (30 dias de Torres e periódica) | Fase 3 — Automação | Backlog |
| [#146] | [Consultório / Assistencial] Encaminhamento de pacientes entre profissionais | Fase 2 — Gestão | Backlog |
| [#147] | [Comercial / Atendimento] Recepção: tela "Atendimentos de hoje" com status rápidos e tempos de espera | Fase 1 — Operação essencial | Backlog |
| [#148] | [Comercial / Atendimento] Pacientes: origem, indicação, consentimentos e dados de relacionamento | Fase 1 — Operação essencial | Backlog |
| [#149] | [Comercial / Atendimento] Pacientes: alerta de possível duplicidade (telefone, e-mail, nome + nascimento) | Fase 1 — Operação essencial | Backlog |
| [#150] | [Consultório / Assistencial] Prontuários: segregação por profissional (cada médico vê só os seus) | Fase 1 — Operação essencial | Backlog |
| [#151] | [Consultório / Assistencial] Prontuários: exames, anexos, assinatura e histórico de alterações | Fase 1 — Operação essencial | Backlog |
| [#152] | [Consultório / Assistencial] Prontuários: modelos por profissão e especialidade | Fase 1 — Operação essencial | Backlog |
| [#153] | [Configurações / Gestão] Usuários: vínculo do usuário ao profissional e escopo de dados | Fase 1 — Operação essencial | Concluído |
| [#154] | [Configurações / Gestão] Perfis de acesso padrão: Administrador, Gerência, Recepção, Médico, Financeiro, Comercial | Fase 1 — Operação essencial | Backlog |
| [#155] | [Configurações / Gestão] Auditoria: tela de consulta da trilha (quem, o quê, quando, antes e depois) | Fase 1 — Operação essencial | Backlog |
| [#156] | [Base] LGPD e segurança: política de senhas, controle de exportação e encerramento de acesso | Fase 1 — Operação essencial | Backlog |
| [#157] | [Base] Backup automático, redundância e restauração testada | Fase 1 — Operação essencial | Backlog |
| [#158] | [Base] Exportação completa de dados (PDF, XLSX e CSV), inclusive prontuários e documentos | Fase 1 — Operação essencial | Backlog |
| [#159] | [Base] Busca global por dados no ⌘K: paciente, profissional, CPF, telefone, CRM, contrato | Fase 2 — Gestão | Backlog |
| [#160] | [Base] Central de notificações e tarefas do dia | Fase 3 — Automação | Backlog |
| [#161] | [Base] Uso pelo celular: responsividade das telas essenciais | Fase 2 — Gestão | Backlog |
| [#162] | [Base] Cancelamentos rastreáveis com motivos padronizados (consulta, contrato, cobrança, período, proposta) | Fase 2 — Gestão | Backlog |
| [#163] | [Financeiro] Contas a Pagar: competência, centro de custo, documento anexo, duplicidade e divergência | Fase 2 — Gestão | Backlog |
| [#164] | [Financeiro] Contas a Pagar: aprovação financeira antes da baixa | Fase 2 — Gestão | Backlog |
| [#165] | [Financeiro] Contas a Receber: vínculo com contrato e profissional, baixa parcial e renegociação | Fase 1 — Operação essencial | Backlog |
| [#166] | [Financeiro] Inadimplência: painel e régua de cobrança (3 dias antes, no vencimento, 3 e 7 dias depois) | Fase 2 — Gestão | Backlog |
| [#167] | [Financeiro] Relatório de provisão de recebimentos (faturamento futuro dos contratos) | Fase 1 — Operação essencial | Backlog |
| [#168] | [Gestão Profissionais] Contratos de sala: reajuste (periodicidade, percentual, histórico) e aviso de 30 dias | Fase 1 — Operação essencial | Backlog |
| [#169] | [Compras / Estoque] Catálogo do coworking (SKU): locação mensal, período, hora, mídia indoor e eventos | Fase 2 — Gestão | Backlog |
| [#170] | [Painel] Visão "Hoje" da gestão e da operação, com alertas | Fase 1 — Operação essencial | Backlog |
| [#171] | [Configurações / Gestão] Relatório mensal de apresentação da gestão (indicadores do prédio) | Fase 2 — Gestão | Em revisão |
| [#172] | [Comercial / Atendimento] Metas comerciais: projetadas × realizadas por período | Fase 2 — Gestão | Backlog |
| [#173] | [Configurações / Gestão] WhatsApp multinúmero: viabilidade e autorização do provedor (validação por número) | Fase 3 — Automação | Backlog |
| [#174] | [Comercial / Atendimento] IA de primeiro atendimento no WhatsApp: conversa, intenção e qualificação | Fase 3 — Automação | Backlog |
| [#175] | [Comercial / Atendimento] IA: agendamento automático com horários verificados (agenda + sala) | Fase 3 — Automação | Backlog |
| [#176] | [Comercial / Atendimento] IA: transferência para a recepção com contexto e alerta de conversa sem resposta | Fase 3 — Automação | Backlog |
| [#177] | [Configurações / Gestão] IA: painel de monitoramento e controles de LGPD (consentimento, opt-out, auditoria) | Fase 3 — Automação | Backlog |
| [#178] | [Base] Migração de dados do DrIntelli: pacientes, profissionais, agendas futuras, prontuários e documentos | Fase 1 — Operação essencial | Backlog |
| [#179] | [Base] Checklist de desligamento do DrIntelli: operação em paralelo e aceite final | Fase 1 — Operação essencial | Backlog |
| [#203] | [Compras / Estoque] Gerar pedido de compra a partir da Sugestão do Estoque | Fase 2 — Gestão | Backlog |

Total: 93 cards — Concluído: 18; Em revisão: 11; Em desenvolvimento: 1; Backlog: 63.

[#1]: https://github.com/s-marques/torresmedical/issues/1
[#2]: https://github.com/s-marques/torresmedical/issues/2
[#4]: https://github.com/s-marques/torresmedical/issues/4
[#5]: https://github.com/s-marques/torresmedical/issues/5
[#6]: https://github.com/s-marques/torresmedical/issues/6
[#7]: https://github.com/s-marques/torresmedical/issues/7
[#10]: https://github.com/s-marques/torresmedical/issues/10
[#12]: https://github.com/s-marques/torresmedical/issues/12
[#13]: https://github.com/s-marques/torresmedical/issues/13
[#14]: https://github.com/s-marques/torresmedical/issues/14
[#17]: https://github.com/s-marques/torresmedical/issues/17
[#20]: https://github.com/s-marques/torresmedical/issues/20
[#22]: https://github.com/s-marques/torresmedical/issues/22
[#23]: https://github.com/s-marques/torresmedical/issues/23
[#25]: https://github.com/s-marques/torresmedical/issues/25
[#26]: https://github.com/s-marques/torresmedical/issues/26
[#27]: https://github.com/s-marques/torresmedical/issues/27
[#28]: https://github.com/s-marques/torresmedical/issues/28
[#29]: https://github.com/s-marques/torresmedical/issues/29
[#30]: https://github.com/s-marques/torresmedical/issues/30
[#31]: https://github.com/s-marques/torresmedical/issues/31
[#34]: https://github.com/s-marques/torresmedical/issues/34
[#38]: https://github.com/s-marques/torresmedical/issues/38
[#39]: https://github.com/s-marques/torresmedical/issues/39
[#40]: https://github.com/s-marques/torresmedical/issues/40
[#42]: https://github.com/s-marques/torresmedical/issues/42
[#43]: https://github.com/s-marques/torresmedical/issues/43
[#44]: https://github.com/s-marques/torresmedical/issues/44
[#46]: https://github.com/s-marques/torresmedical/issues/46
[#50]: https://github.com/s-marques/torresmedical/issues/50
[#52]: https://github.com/s-marques/torresmedical/issues/52
[#53]: https://github.com/s-marques/torresmedical/issues/53
[#55]: https://github.com/s-marques/torresmedical/issues/55
[#56]: https://github.com/s-marques/torresmedical/issues/56
[#59]: https://github.com/s-marques/torresmedical/issues/59
[#60]: https://github.com/s-marques/torresmedical/issues/60
[#61]: https://github.com/s-marques/torresmedical/issues/61
[#62]: https://github.com/s-marques/torresmedical/issues/62
[#63]: https://github.com/s-marques/torresmedical/issues/63
[#64]: https://github.com/s-marques/torresmedical/issues/64
[#65]: https://github.com/s-marques/torresmedical/issues/65
[#66]: https://github.com/s-marques/torresmedical/issues/66
[#68]: https://github.com/s-marques/torresmedical/issues/68
[#69]: https://github.com/s-marques/torresmedical/issues/69
[#70]: https://github.com/s-marques/torresmedical/issues/70
[#76]: https://github.com/s-marques/torresmedical/issues/76
[#110]: https://github.com/s-marques/torresmedical/issues/110
[#115]: https://github.com/s-marques/torresmedical/issues/115
[#135]: https://github.com/s-marques/torresmedical/issues/135
[#136]: https://github.com/s-marques/torresmedical/issues/136
[#137]: https://github.com/s-marques/torresmedical/issues/137
[#138]: https://github.com/s-marques/torresmedical/issues/138
[#139]: https://github.com/s-marques/torresmedical/issues/139
[#140]: https://github.com/s-marques/torresmedical/issues/140
[#141]: https://github.com/s-marques/torresmedical/issues/141
[#142]: https://github.com/s-marques/torresmedical/issues/142
[#143]: https://github.com/s-marques/torresmedical/issues/143
[#144]: https://github.com/s-marques/torresmedical/issues/144
[#145]: https://github.com/s-marques/torresmedical/issues/145
[#146]: https://github.com/s-marques/torresmedical/issues/146
[#147]: https://github.com/s-marques/torresmedical/issues/147
[#148]: https://github.com/s-marques/torresmedical/issues/148
[#149]: https://github.com/s-marques/torresmedical/issues/149
[#150]: https://github.com/s-marques/torresmedical/issues/150
[#151]: https://github.com/s-marques/torresmedical/issues/151
[#152]: https://github.com/s-marques/torresmedical/issues/152
[#153]: https://github.com/s-marques/torresmedical/issues/153
[#154]: https://github.com/s-marques/torresmedical/issues/154
[#155]: https://github.com/s-marques/torresmedical/issues/155
[#156]: https://github.com/s-marques/torresmedical/issues/156
[#157]: https://github.com/s-marques/torresmedical/issues/157
[#158]: https://github.com/s-marques/torresmedical/issues/158
[#159]: https://github.com/s-marques/torresmedical/issues/159
[#160]: https://github.com/s-marques/torresmedical/issues/160
[#161]: https://github.com/s-marques/torresmedical/issues/161
[#162]: https://github.com/s-marques/torresmedical/issues/162
[#163]: https://github.com/s-marques/torresmedical/issues/163
[#164]: https://github.com/s-marques/torresmedical/issues/164
[#165]: https://github.com/s-marques/torresmedical/issues/165
[#166]: https://github.com/s-marques/torresmedical/issues/166
[#167]: https://github.com/s-marques/torresmedical/issues/167
[#168]: https://github.com/s-marques/torresmedical/issues/168
[#169]: https://github.com/s-marques/torresmedical/issues/169
[#170]: https://github.com/s-marques/torresmedical/issues/170
[#171]: https://github.com/s-marques/torresmedical/issues/171
[#172]: https://github.com/s-marques/torresmedical/issues/172
[#173]: https://github.com/s-marques/torresmedical/issues/173
[#174]: https://github.com/s-marques/torresmedical/issues/174
[#175]: https://github.com/s-marques/torresmedical/issues/175
[#176]: https://github.com/s-marques/torresmedical/issues/176
[#177]: https://github.com/s-marques/torresmedical/issues/177
[#178]: https://github.com/s-marques/torresmedical/issues/178
[#179]: https://github.com/s-marques/torresmedical/issues/179
[#180]: https://github.com/s-marques/torresmedical/pull/180
[#203]: https://github.com/s-marques/torresmedical/issues/203
