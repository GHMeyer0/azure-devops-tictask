# TicTask – extensão Azure DevOps para apontamento de horas

Apontamento de horas direto nas Tasks e User Stories/Bugs, com timer (iniciar/pausar/concluir),
**Remaining calculado automaticamente**, estado da task acompanhando o trabalho, timesheet semanal,
resumo por período e calendário. Sem backend: os dados ficam no *Extension Data Service* do próprio Azure DevOps.

## O que a extensão adiciona

| Onde | Contribuição | O que faz |
|---|---|---|
| Tela principal do WI (aba Details) | `time-group` | ▶ Iniciar / ⏸ Pausar (▾ com motivo) / ✓ Concluir / + Apontar, cronômetro e Est/Compl/Rest |
| Aba **Apontamentos** do WI | `time-tab` | Task: lista de apontamentos (início/fim/pausas), por pessoa/atividade. US/Bug: tasks filhas com horas, alertas de inconsistência, linha do tempo |
| Backlog e Sprint › painel lateral **TicTask** | `time-backlog-panel` | Timer em andamento, item selecionado no backlog com Iniciar/Apontar e minhas tasks abertas (o ADO não permite extensões na barra superior global) |
| Boards › **TicTask** (primeiro item do menu) | `time-hub` | **Meu tempo** para todos: timer com pausar/concluir, horas de hoje/semana, tasks paradas (Stopped, com motivo e há quantos dias úteis), tasks Active sem apontamento há 3+ dias e os apontamentos de hoje, em árvore sob o item pai (Bug/US/TS). **Timesheet**, **Resumo** (pessoa › US/Bug › task › atividade por dia, semana ou mês) e **Calendário** para todos, cada um só com os próprios apontamentos. Gestores: timesheet/resumo/calendário de todos, **Time agora** e Configurações |
| Diálogos no host | `time-dialog` | Apontar, "O que você vai fazer?", tasks padrão |

**Gestores** = administradores de qualquer time do projeto, mais os e-mails listados em
*Configurações › Gestores*. A checagem usa o escopo `vso.project` que a extensão já tem; o grupo
Project Administrators exigiria `vso.security_manage`, permissão ampla demais. Essa restrição é da
interface: tecnicamente, qualquer membro do projeto consegue ler os dados do Extension Data pela API REST.

### Fluxo numa US/Bug
- **▶ Iniciar** na US abre "O que você vai fazer?": escolha uma das suas tasks abertas na US ou
  **Nova task** (atividade + descrição → título da task, atribuída a você, mesma área/iteração).
  Sem tasks na US, dá para criar junto as tasks padrão (as marcadas como "Padrão" nas atividades).
- O revisor que entra na US de outro dev cria a própria "Revisão de PR" pelo mesmo diálogo.
- O timer guarda só o trecho que está rodando:
  - **⏸ Pausar** ("larguei a task por agora") aponta o trecho, desconta o Remaining e deixa a task em
    Stopped (aparece em Paradas). Um clique; o ▾ pede um motivo configurável, que vai para a discussão
    da task e, se o motivo estiver marcado, da US. Iniciar outro timer pausa o atual sozinho.
  - **✓ Concluir** ("terminei") abre o apontamento com Remaining sugerido 0 e um próximo passo
    opcional ("Enviado para revisão"…); a task vai para Closed.
  - O Pausar abre um diálogo quando o timer parece esquecido (dia anterior ou acima do limite) ou
    quando o Remaining zeraria ("Quanto ainda falta?").
- Fluxo de revisão: Desenvolvimento é concluída como "Enviado para revisão"; as correções vão numa
  única task de **Correção** por história. Iniciar na Desenvolvimento concluída sugere a Correção.

### Regras de horas e estado (configuráveis em Boards › TicTask › Configurações)
- Apontar: `Completed += horas`, `Remaining = max(0, Remaining − horas)`; task sem estimativa pede a
  estimativa no 1º apontamento. Editar aplica a diferença; excluir devolve as horas ao Remaining.
- Iniciar o timer: task New/Stopped → Active; US em New/Ready for Development → Active.
- Pausar: task → Stopped. Concluir: task → Closed. Apontamento manual numa task New: → Stopped.
- O processo precisa ter o estado **Stopped** na Task (categoria In Progress). A extensão não cria
  estados: exigiria permissão de administrador do processo. Estados de pausa configurados que o
  tipo de task não tem são ignorados.
- Task fechada: pede confirmação e reabre (ou bloqueia, conforme configuração).
- Limite de dias (Configurações › Geral, padrão 7): depois dele o autor não edita nem exclui o
  apontamento, e também não cria nem move apontamentos para antes dele (exceto o tempo de um timer).
- Regras do processo: no Tiino, Original Estimate e Remaining são obrigatórios para sair de New e o
  Original Estimate fica somente leitura em Active. Por isso a estimativa é gravada antes do estado
  (duas revisões), e iniciar o timer numa task sem estimativa pede a estimativa antes.
- Horas, Remaining e estado vão num único patch (uma revisão no histórico), exceto quando o apontamento também define a estimativa: aí são duas (estimativa, depois estado).

Guia de uso com prints: [docs/como-usar.md](docs/como-usar.md).

## Desenvolvimento

```bash
npm install
npm test            # vitest: regras de horas, datas, estado, timesheet, resumo, CSV e render dos diálogos
npm run typecheck   # tsc (TypeScript 7)
npm run build       # esbuild → dist/<página>.html + .js
npm run package     # gera out/ghmeyer0.tictask-<versão>.vsix
npm run package:dev # mesma extensão com id tictask-dev (para testar sem afetar a oficial)
```

Stack: React 19, Fluent UI v9, `azure-devops-extension-sdk` 4.2 (a API 5.279 ainda não aceita o
SDK 5), `azure-devops-extension-api`, FullCalendar 6, esbuild, vitest.

Estrutura:
```
src/common/domain   regras puras (horas, Remaining, estado, timesheet, resumo, CSV) – testadas
src/common/data     Extension Data: apontamentos, timer do usuário, configurações
src/common/wit      leitura/escrita de work items (form service no WI aberto, REST nos demais)
src/common/actions  orquestra timer, apontar, editar, excluir, criar tasks
src/dialogs         diálogos (abertos no host via openCustomDialog)
src/workitem        grupo da tela principal e aba Apontamentos
src/hub             meu tempo, timesheet, resumo, calendário, configurações
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

## Prints para a documentação (modo demonstração)

Com `?tictask-demo=1` na URL da página do ADO (hub, work item ou backlog), a extensão troca na tela
títulos, nomes, e-mails, comentários e o nome do projeto por dados fictícios (`src/common/demo.ts`).
Só o que aparece muda: leitura e gravação continuam com os dados reais. Títulos de task com uma ou
duas palavras e os nomes das atividades não são trocados. A parte da página que é do próprio ADO
(organização, avatar, campos do work item) fica fora do iframe e precisa ser trocada à parte antes do print.

## Dados e auditoria

- `te-{projeto}-{yyyyMM}`: apontamentos do mês (fonte do timesheet/calendário).
- `tw-{projeto}-{workItemId}`: índice por work item (mesmo id), usado pelas abas.
- `timer/active` (escopo do usuário): timer em andamento, só timestamps — continua contando com o
  navegador fechado.
- `settings-{projeto}`: configurações.
- `presence-{projeto}` (compartilhado no projeto, um documento por usuário): cópia do status do timer
  para o "Time agora" dos gestores. Desligável em Configurações.

Antes de iniciar qualquer timer, a extensão pausa o timer que o usuário tiver em outra task (só pode
haver um; o tempo dele é apontado) e avisa se outra pessoa está com timer na mesma task. Timers
pausados por versões anteriores à 0.7.0 continuam com Retomar; pausar ou concluir aponta todos os
trechos deles. Depois de uma pausa, o `presence` guarda a task pausada e o motivo até o próximo timer.

Cada apontamento guarda início/fim/trechos, usuário, atividade, comentário, motivo (pausa ou próximo passo), estado e horas da task
antes/depois e um histórico de alterações. Exclusão é lógica (`deleted: true`), e o Completed/Remaining
da task tem revisão própria no histórico do work item.

### Limitações conhecidas
- O Extension Data Service não valida no servidor: um usuário técnico com acesso pode alterar
  documentos via REST. Mitigações: snapshot antes/depois, revisões do work item, soft delete com
  histórico. Se o compliance exigir trilha à prova de adulteração, o próximo passo é um backend
  (Azure Function + SQL) gravando os apontamentos.
- Só gestores veem e salvam as Configurações, mas a checagem é da interface (o documento `settings-{projeto}` pode ser gravado via REST por qualquer membro).
- Bundles de ~0,5–1 MB por página (Fluent UI + FullCalendar); dá para dividir em chunks depois.
