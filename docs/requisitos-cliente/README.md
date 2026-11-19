# Requisitos do cliente – Torres Medical

Documentos enviados pelo cliente em 12/11/2026 com os requisitos, as expectativas e as
funcionalidades esperadas do novo sistema. O DrIntelli citado nos documentos é o sistema
legado, o mesmo inventariado em [`docs/inventario/`](../inventario/README.md).

O inventário continua sendo a referência das **telas**. Estes documentos acrescentam as
**regras de negócio**, as prioridades e as lacunas que o inventário não mostra.

| Sigla nos cards | Documento | Conteúdo |
|---|---|---|
| **R** | [rastreio-dificuldades-drintelli-e-requisitos.pdf](rastreio-dificuldades-drintelli-e-requisitos.pdf) | Rastreio de dificuldades do DrIntelli e requisitos para o novo software. 29 páginas, seções 1 a 45: agenda e salas, ocupação, profissionais, onboarding, recepção, pacientes, prontuário, permissões, auditoria, financeiro, contratos, CRM, relatórios, LGPD, backup e prioridades por fase. |
| **MV** | [mapa-mental-visao-geral.pdf](mapa-mental-visao-geral.pdf) | Mapa mental: visão geral do sistema substituto ao DrIntelli. 3 páginas: módulos, fluxos críticos, fases e checklist antes de desligar o DrIntelli. |
| **IA** | [mapa-mental-falhas-drintelli-e-ia-whatsapp.pdf](mapa-mental-falhas-drintelli-e-ia-whatsapp.pdf) | Mapa mental: as 9 falhas do DrIntelli relatadas em julho (C1 a C9), a IA como primeiro atendimento no WhatsApp, o fluxo omnicanal e financeiro, e as prioridades e aceites (P0 a P2). |

## Onde cada requisito está no board

A matriz requisito → card fica em [`matriz-rastreabilidade.md`](matriz-rastreabilidade.md)
(origem: issue [#135](https://github.com/s-marques/torresmedical/issues/135)). Ao criar ou
complementar um card a partir destes documentos, atualize a matriz. Nos cards:

- label **`requisito-cliente`**: card criado ou complementado a partir destes documentos;
- label **`ajuste`**: ajuste de uma funcionalidade já entregue;
- milestones **Fase 1 a 4**: prioridade definida pelo cliente;
- seção **"Requisitos do cliente (12/11/2026)"** nos cards de tela pendentes.

Ao implementar um card, cite a sigla e a seção/página do documento (ex.: "R §2", "IA p. 4").
Os itens marcados como **Precisa de confirmação** nos cards seguem a seção "Dúvidas e
validação com o dev" do [`CLAUDE.md`](../../CLAUDE.md).

> Documentos com informação interna do cliente. Não copie trechos para fora do repositório.
