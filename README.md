# TicTask – extensão Azure DevOps para apontamento de horas

Apontamento de horas direto nas Tasks e User Stories/Bugs, com timer (iniciar/pausar/parar),
**Remaining calculado automaticamente**, estado da task acompanhando o trabalho, timesheet semanal
e calendário. Sem backend: os dados ficam no *Extension Data Service* do próprio Azure DevOps.

## O que a extensão adiciona

| Onde | Contribuição | O que faz |
|---|---|---|
| Tela principal do WI (aba Details) | `time-group` | ▶ Iniciar / ⏸ Pausar / ⏹ Parar / + Apontar, cronômetro e Est/Compl/Rest |
| Aba **Apontamentos** do WI | `time-tab` | Task: lista de apontamentos (início/fim/pausas), por pessoa/atividade. US/Bug: tasks filhas com horas, alertas de inconsistência, linha do tempo |
| Backlog e Sprint › painel lateral **TicTask** | `time-backlog-panel` | Timer em andamento, item selecionado no backlog com Iniciar/Apontar e minhas tasks abertas (o ADO não permite extensões na barra superior global) |
| Boards › **Meu tempo** | `my-time-hub` | Timer com pausar/parar, horas de hoje/semana, tasks paradas (Stopped/Waiting), tasks Active sem apontamento há 3+ dias e os apontamentos de hoje — tudo em árvore sob o item pai (Bug/US/TS), com as minhas outras tasks abertas do pai que não foram apontadas hoje |
| Boards › **TicTask** | `time-hub` | Timesheet semanal e Calendário (cada um vê só o seu). Gestores: timesheet/calendário de todos, **Time agora** (quem está com timer rodando, em qual task, há quanto tempo) e Configurações |

**Gestores** = administradores de qualquer time do projeto, mais os e-mails listados em
*Configurações › Gestores*. A checagem usa o escopo `vso.project` que a extensão já tem; o grupo
Project Administrators exigiria `vso.security_manage`, permissão ampla demais. Essa restrição é da
interface: tecnicamente, qualquer membro do projeto consegue ler os dados do Extension Data pela API REST.
| Diálogos no host | `time-dialog` | Apontar, "O que você vai fazer?", tasks padrão, pausar |

### Fluxo numa US/Bug
- **▶ Iniciar** na US abre "O que você vai fazer?": escolha uma das suas tasks abertas na US ou
  **Nova task** (atividade + descrição → título da task, atribuída a você, mesma área/iteração).
  Sem tasks na US, dá para criar junto as tasks padrão (Investigação, Desenvolvimento/Correção,
  Revisão, Testes).
- O revisor que entra na US de outro dev cria a própria "Revisão de PR" pelo mesmo diálogo.
- **⏹ Parar** abre o apontamento já preenchido com início, fim e pausas; o Remaining vem calculado
  (editável) e há a opção "Concluir task".

### Regras de horas e estado (configuráveis em Boards › TicTask › Configurações)
- Apontar: `Completed += horas`, `Remaining = max(0, Remaining − horas)`; task sem estimativa pede a
  estimativa no 1º apontamento. Editar aplica a diferença; excluir devolve as horas ao Remaining.
- Iniciar trabalho: task New/Stopped/Waiting → Active; US em New/Ready for Development → Active.
- Pausar: opcionalmente muda a task para Stopped/Waiting com motivo na discussão.
- Task fechada: pede confirmação e reabre (ou bloqueia, conforme configuração).
- Tudo vai num único patch → uma revisão no histórico do work item (quem/quando).

## Desenvolvimento

```bash
npm install
npm test            # vitest: regras de horas, datas, estado, timesheet, CSV e render dos diálogos
npm run typecheck   # tsc (TypeScript 7)
npm run build       # esbuild → dist/<página>.html + .js
npm run package     # gera out/ghmeyer0.tictask-<versão>.vsix
npm run package:dev # mesma extensão com id tictask-dev (para testar sem afetar a oficial)
```

Stack: React 19, Fluent UI v9, `azure-devops-extension-sdk` 4.2 (a API 5.279 ainda não aceita o
SDK 5), `azure-devops-extension-api`, FullCalendar 6, esbuild, vitest.

Estrutura:
```
src/common/domain   regras puras (horas, Remaining, estado, timesheet, CSV) – testadas
src/common/data     Extension Data: apontamentos, timer do usuário, configurações
src/common/wit      leitura/escrita de work items (form service no WI aberto, REST nos demais)
src/common/actions  orquestra timer, apontar, editar, excluir, criar tasks
src/dialogs         diálogos (abertos no host via openCustomDialog)
src/workitem        grupo da tela principal e aba Apontamentos
src/hub             timesheet, calendário, configurações
src/pages           entradas de cada contribuição
```

## Publicar (privado)

1. O manifesto usa o publisher `ghmeyer0` (https://marketplace.visualstudio.com/manage/publishers/ghmeyer0).
   Para publicar em outro, troque `"publisher"` em `vss-extension.json` — o upload exige que sejam iguais.
2. `npm run package` e faça upload do `.vsix` em *New extension › Azure DevOps* (fica privado).
3. Compartilhe com a organização (ex.: uma org pessoal de teste, depois `tunesoft`) e instale em
   *Organization settings › Extensions*.
4. A cada nova versão, aumente `"version"` no manifesto antes de empacotar.

### Trocar de publisher (ex.: do interno para o pessoal)

A identidade da extensão é `publisher.id`: outro publisher é outra extensão, e o Extension Data
Service separa os dados por extensão — a nova começa vazia. Para levar os apontamentos:

1. Na extensão atual: termine o timer em andamento e use *Boards › TicTask › Configurações ›
   Exportar dados do projeto* (um JSON por projeto, com apontamentos excluídos e configurações).
2. Troque `"publisher"` no manifesto, empacote (`npm run package`), publique e instale a nova extensão.
3. Na nova: *Configurações › Escolher arquivo de exportação › Importar*. Os ids são mantidos
   (importar de novo sobrescreve, não duplica) e cada apontamento ganha a linha "importado de …"
   no histórico. Os campos dos work items não são alterados.
4. Confira o timesheet e só então desinstale a extensão antiga e remova o publisher.

A exportação lê os meses de jan/2024 até 12 meses à frente (`EXPORT_FIRST_MONTH` em
`src/common/data/migration.ts`).

Para esconder o grupo/aba em tipos de WI onde não fazem sentido (ex.: Epic/Feature):
*Organization settings › Process › (processo) › tipo de WI › Layout* → ocultar o grupo
"TicTask" e a página "Apontamentos".

## Dados e auditoria

- `te-{projeto}-{yyyyMM}`: apontamentos do mês (fonte do timesheet/calendário).
- `tw-{projeto}-{workItemId}`: índice por work item (mesmo id), usado pelas abas.
- `timer/active` (escopo do usuário): timer em andamento, só timestamps — continua contando com o
  navegador fechado.
- `settings-{projeto}`: configurações.
- `presence-{projeto}` (compartilhado no projeto, um documento por usuário): cópia do status do timer
  para o "Time agora" dos gestores. Desligável em Configurações.

Antes de iniciar qualquer timer, a extensão verifica se o usuário já tem um rodando ou pausado (só pode
haver um; o atual é parado e apontado antes) e avisa se outra pessoa está com timer na mesma task.

Cada apontamento guarda início/fim/trechos, usuário, atividade, comentário, estado e horas da task
antes/depois e um histórico de alterações. Exclusão é lógica (`deleted: true`), e o Completed/Remaining
da task tem revisão própria no histórico do work item.

### Limitações conhecidas
- O Extension Data Service não valida no servidor: um usuário técnico com acesso pode alterar
  documentos via REST. Mitigações: snapshot antes/depois, revisões do work item, soft delete com
  histórico. Se o compliance exigir trilha à prova de adulteração, o próximo passo é um backend
  (Azure Function + SQL) gravando os apontamentos.
- Só gestores veem e salvam as Configurações, mas a checagem é da interface (o documento `settings-{projeto}` pode ser gravado via REST por qualquer membro).
- Bundles de ~0,5–1 MB por página (Fluent UI + FullCalendar); dá para dividir em chunks depois.
