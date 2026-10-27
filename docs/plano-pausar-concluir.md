# Plano: Pausar e Concluir (0.7.0)

Status: **implementado na 0.7.x** (extensão, guia e n8n). Pendente: prints novos.

## Objetivo

O TicTask serve para medir quanto esforço vai em cada task, não para bater ponto. O modelo atual
(Pausar, Retomar, Encerrar com 3 opções de estado) confunde: Pausar e "Encerrar como Parada" fazem
quase a mesma coisa, e o tempo de um timer pausado fica pendente até alguém encerrar.

No novo modelo, **o timer guarda só o trecho que está rodando**. Pausar já aponta o trecho e
desconta o Remaining, então nada fica pendente.

## Os botões

| Botão | Quando usar | O que acontece |
|---|---|---|
| **▶ Iniciar** (Retomar nas Paradas) | "Vou trabalhar nisso agora" | Task → Active. Se outro timer seu estiver rodando, ele é pausado (1 clique). |
| **⏸ Pausar** | "Larguei esta task por agora, mas não terminei": outra task, reunião, revisão, aguardando alguém, almoço, fim do dia | 1 clique: aponta o trecho, desconta o Remaining, task → Stopped, aparece em Paradas. |
| **⏸ ▾ Pausar com motivo…** | Igual, quando vale registrar o porquê | Diálogo com motivo e detalhe; o texto vai para a discussão. |
| **✓ Concluir** | "Terminei esta task" | Diálogo: confere horário e Remaining (sugerido 0) e, opcionalmente, o próximo passo. Task → Closed. |
| **+ Apontar** | Esqueci o timer, ou é trabalho já feito | Diálogo manual, como hoje. |

Regra para o time: **"Pausar não é intervalo, é largar a task por agora. Café não precisa pausar."**

Estados da task:

- **Active**: alguém está com o timer nela agora.
- **Stopped**: começada, ninguém trabalhando nela agora.
- **Closed**: terminada.

## Exemplo: revisão de PR no meio do desenvolvimento

| Hora | Ação | Resultado |
|---|---|---|
| 11:30 | ▶ Iniciar na #100 Desenvolvimento | #100 Active, timer rodando |
| 11:45 | ▶ Iniciar na task de revisão (US do colega) | #100: apontado 11:30–11:45, Stopped. Revisão Active, timer rodando |
| 12:15 | ⏸ ▾ Pausar com motivo "Aguardando correções" | Revisão: apontado 11:45–12:15, Stopped, motivo na discussão |
| 12:15 | ▶ Retomar a #100 em Paradas | #100 Active |
| 14:00 | ⏸ Pausar (fim do expediente) | #100: apontado 12:15–14:00, Stopped |

Cada trecho é uma linha de apontamento. O intervalo entre linhas é o tempo em que a task não estava
sendo trabalhada, e não é descontado.

## Motivos (pausa e próximo passo)

Lista configurável em *Configurações › Estados › Motivos*. Cada motivo é de **pausa** (aparece no
menu ⏸ ▾) ou de **conclusão** (aparece no Concluir, no campo opcional **Próximo passo**). Padrões:

| Motivo | Tipo | Cenário | Também comenta na US |
|---|---|---|---|
| Aguardando revisão | Pausa | Subi as correções e espero nova revisão | Sim |
| Aguardando correções | Pausa | Revisei o PR e espero o autor ajustar os comentários | Sim |
| Revisando PR | Pausa | Parei a minha task para revisar o PR de alguém | Não |
| Apoio a colega | Pausa | Parei para ajudar alguém | Não |
| Aguardando terceiros | Pausa | Dependo de cliente, infra ou uma dúvida de negócio | Sim |
| Reunião | Pausa | Saí para uma reunião | Não |
| Enviado para revisão | Conclusão | Terminei o desenvolvimento e abri o PR | Sim |
| PR aprovado | Conclusão | Revisão terminada, ou correções aprovadas | Sim |
| Pronto para testes | Conclusão | Entreguei para o QA | Sim |
| Outro… | Pausa e conclusão (sempre aparece, não é configurável) | Só texto livre | Não |

- O diálogo tem os motivos (radio) e um campo opcional **Detalhe** (ex.: "PR !1234 do João").
- Comentário **sempre na task**, no mesmo patch do apontamento (uma revisão só):
  `⏸ Pausada: Aguardando revisão. PR !1234 do João`.
- Motivos com **"também comentar na US"** ligado escrevem também no WI pai, identificando task e
  pessoa: `⏸ #11222 Correção (Ana): Aguardando revisão. PR !1234` ou
  `✓ #11221 Desenvolvimento concluída (Ana): Enviado para revisão. PR !1234`. Ligado por padrão
  só nos motivos que afetam o andamento da história, porque cada comentário na US notifica quem a
  segue. Concluir sem próximo passo não comenta na US.
- O motivo fica gravado no apontamento do trecho (`reason`, `reasonDetail`). Os de pausa aparecem em
  **Paradas** ao lado da task: "Aguardando revisão · há 2 dias".
- Em "Revisando PR" e "Apoio", o tempo da revisão/ajuda vai na task da revisão/ajuda (com timer
  nela). O motivo só explica por que esta task parou. O guia precisa deixar isso claro.

## Fluxo de revisão de PR

Combinado do time: a task de **Desenvolvimento** fecha quando o PR vai para revisão, e todas as
rodadas de correção vão numa **única task de Correção** por história. Assim a estimativa do
desenvolvimento fica limpa e o retrabalho de revisão aparece separado no Timesheet.

| Quem | Ação | Resultado |
|---|---|---|
| Dev | ✓ Concluir a Desenvolvimento, próximo passo **Enviado para revisão**, "PR !1234" | Desenvolvimento Closed. Comentário na US |
| Revisor | ▶ Iniciar na US → task de **Revisão** | Revisão Active |
| Revisor | ⏸ ▾ **Aguardando correções** | Revisão Stopped. Comentário na US |
| Dev | ▶ Iniciar na US → nova task de **Correção** (1ª rodada) | Correção Active |
| Dev | ⏸ ▾ **Aguardando revisão** | Correção Stopped. Comentário na US |
| Revisor | ▶ Retomar a Revisão em Paradas; se houver mais comentários, ⏸ ▾ **Aguardando correções** de novo | Rodadas seguintes usam as mesmas duas tasks |
| Dev | ▶ Retomar a Correção em Paradas | Mesma task, sem criar outra |
| Revisor | ✓ Concluir a Revisão, próximo passo **PR aprovado** | Revisão Closed. Comentário na US |
| Dev | ✓ Concluir a Correção | Correção Closed |

Ajudas do TicTask para esse combinado:

- No "O que você vai fazer?" da US, se já existe uma task de Correção sua (não fechada), ela vem
  selecionada em vez de sugerir uma nova.
- Ao iniciar um timer numa task de Desenvolvimento concluída como **Enviado para revisão**, o TicTask
  avisa: "Esta task foi concluída como Enviado para revisão. Usar a task de Correção?" com os
  botões **Usar a Correção** (cria se não existir) e **Reabrir mesmo assim**. Ele avisa, mas não
  impede.

## Atividades padrão

A atividade **Desenvolvimento/Correção** vira duas:

| Atividade | Activity no ADO | Título sugerido | Padrão | Estimativa |
|---|---|---|---|---|
| Desenvolvimento | Development | Desenvolvimento | Sim | 4h |
| Correção | Development | Correções da revisão | Não | 1h |

- Correção é só o retrabalho de revisão. Em Bug, o trabalho principal continua sendo
  Desenvolvimento.
- `guessActivity`: "corre", "ajust", "fix" → Correção; "desenv", "implement", "dev" → Desenvolvimento.
- Vale para projetos novos e para "Restaurar padrão". Projetos com atividades salvas (inclusive os
  que já separaram as duas) não mudam.

## Quando o Pausar abre um diálogo

O Pausar é 1 clique, exceto quando há algo a confirmar. Todos esses casos usam o mesmo diálogo de
pausa, mostrando só as partes necessárias:

1. **Motivo**: pelo menu ▾.
2. **Timer esquecido**: o trecho começou num dia anterior ou passa de **10h** (configurável). O
   diálogo pede o horário de fim real, para não apontar 16h.
3. **Remaining zerado**: o Remaining já está em 0, ou a pausa vai zerá-lo. O diálogo pede
   **"Quanto ainda falta nesta task?"** (obrigatório) e oferece **"Na verdade terminei → Concluir"**.
   O Completed recebe o tempo real e o Remaining o valor informado, então o estouro de estimativa
   fica visível.

Se o Iniciar pausa automaticamente outro timer e esse cai nos casos 2 ou 3, o diálogo abre antes de
iniciar o novo.

Trechos com menos de 1 minuto (clique sem querer) não são apontados.

## Avisos

| Situação | Onde avisa | Limite padrão (configurável) |
|---|---|---|
| Timer rodando há muito tempo ou desde um dia anterior | Barra em todas as telas do TicTask e mensagem no Chat | 10h |
| Task parada há muito tempo | Destaque âmbar em Paradas e linha no resumo diário do Chat ("2 tasks paradas há mais de 5 dias úteis") | 5 dias úteis |

Pausada de um dia para o outro ou no fim de semana é normal: o tempo já foi apontado.

## Mudanças por área

### Dados

- `ActiveTimer`: deixa de ter `status: "paused"`, `pauses` e vários segmentos; fica com um único
  `start`. Timers pausados da versão anterior: na primeira carga, o TicTask abre o diálogo de
  apontamento com os trechos deles (uma vez) e depois limpa o timer.
- `TimeEntry`: novos `reason?` e `reasonDetail?`; o campo `segments` continua (entradas antigas
  têm vários trechos).
- `Settings.states`: novos `reasons: { name: string; kind: "pause" | "conclude"; commentOnParent: boolean }[]`,
  `pausedAlertDays` (5) e `runningAlertHours` (10). `pauseStates` continua definindo o estado da
  pausa (o primeiro que o tipo de task tiver; padrão Stopped).
- Presença ("Time agora"): continua com `running` e com `paused` + motivo, para o gestor ver
  "Parado: aguardando revisão".

### Fluxos (`src/common/actions.ts`)

- `pauseTimer`: fecha o trecho, cria o apontamento (atividade e comentário do timer), desconta o
  Remaining, task → Stopped no mesmo patch, limpa o timer. Abre o diálogo nos casos acima.
- `startTimer` / `ensureCanStart`: sem a pergunta "encerrar e apontar o atual"; pausa o atual e
  mostra um aviso curto ("#100 pausada, 15m apontados").
- `concludeTimer` (substitui `stopTimer`): diálogo de apontamento em modo Concluir, Remaining
  sugerido 0, próximo passo opcional, task → Closed.
- `confirmStart`: o aviso da task de Desenvolvimento concluída como Enviado para revisão.
- `startOnParent`: pré-seleciona a task de Correção existente.
- Removidos: `resumeTimer`, `pendingPause` e a pergunta "Apontar a pausa?", `domain/pause.ts` e o
  preenchimento do + Apontar com a pausa.

### Telas

- `TimerControls`: **⏸ Pausar** como SplitButton do Fluent (menu: "Pausar com motivo…") e
  **✓ Concluir**. Sem Retomar: sem timer, a task mostra ▶ Iniciar.
- `LogDialog`: sai o radio "Depois de apontar, a task fica". Em modo Concluir, o estado é Closed, o
  título é "Concluir #id" e há o campo **Próximo passo** (motivos de conclusão + detalhe).
- Novo diálogo de pausa (`kind: "pause"`): motivo, detalhe, horário de fim (timer esquecido) e
  "Quanto ainda falta" (Remaining zerado).
- **Paradas** (Meu tempo e painel do backlog): motivo, "há X dias úteis" (pelo
  `Microsoft.VSTS.Common.StateChangeDate`), destaque após o limite, ▶ Retomar.
- **Configurações › Estados**: lista de motivos (nome, tipo, "também comentar na US") e os dois
  limites.
- **Configurações › Atividades**: padrão com Desenvolvimento e Correção separadas.
- Calendário e Timesheet: sem mudança, os trechos já são apontamentos.

### n8n / Google Chat

- Lembrete "sem apontamento na última hora": sem mudança.
- Novo: alerta de timer rodando acima do limite.
- Resumo diário: linha com as tasks paradas acima do limite.

### Documentação

- `docs/como-usar.md`: tabela "Quando usar cada um", fluxo de revisão de PR com a task de Correção,
  motivos, avisos, atividades.
  Sai a seção "Ajudar alguém no meio do seu trabalho" no formato atual (vira: inicie o timer numa
  task da ajuda).
- Prints novos em modo demonstração: controles do timer, menu de pausa, diálogo de pausa, Concluir,
  Paradas com motivo.
- README e overview.

### Testes

- Pausa: apontamento criado, Remaining descontado, estado Stopped, trecho < 1 min ignorado.
- Diálogo de pausa nos casos de timer esquecido e de Remaining zerado.
- Iniciar com outro timer rodando pausa o anterior.
- Concluir com próximo passo: comentário na task e, com a flag, na US.
- Aviso ao reabrir uma Desenvolvimento concluída como Enviado para revisão.
- `guessActivity` com Desenvolvimento e Correção separadas.
- Migração de um timer pausado da versão anterior.
- Render: SplitButton, diálogo de pausa, Paradas com motivo e destaque.

## Antes de começar

As versões 0.6.17–0.6.19 (Encerrar, radio de 3 opções) não estão commitadas nem instaladas, e o novo
modelo substitui parte delas. Sugestão: commitar como ponto de partida e seguir para a 0.7.0.

## Fora do escopo

- Mudar o estado da US automaticamente pelo próximo passo (ex.: Resolved em "Pronto para testes"):
  erra quando a US ainda tem outras tasks abertas.
- Criar a task de Correção para o autor quando o revisor pausa com "Aguardando correções": seria
  criar trabalho atribuído a outra pessoa. O dev cria ao começar a corrigir.
