# Telas do TicTask

## Aba Apontamentos

A aba **Apontamentos** do work item mostra o histórico completo:

- **Na Task**: cada apontamento com data, início–fim, pausas, atividade, horas e comentário, com totais
  por pessoa e por atividade. O autor pode editar ou excluir (até o limite de dias configurado).
- **Na US/Bug**: as tasks filhas com estimado, completo e restante, alertas de inconsistência (ex.: task
  fechada com Remaining, task ativa sem apontamento) e a linha do tempo de todos os apontamentos.

![Aba Apontamentos](../img/wi-aba-apontamentos.jpg)

## Painel no backlog

Em **Boards › Backlogs** ou **Sprints**, abra o painel lateral (ícone de painel no canto direito) e
escolha **TicTask**. Ele mostra:

- **Em andamento**: o timer atual, com pausar e concluir;
- **Selecionado no backlog**: o item clicado na lista, com **Iniciar** e **Apontar**;
- **Minhas tasks abertas**: as suas 10 tasks abertas mais recentes, com **Iniciar**.

![Painel TicTask no backlog](../img/backlog-painel.png)

## Hub TicTask

Em **Boards › TicTask** (primeiro item do menu do Boards). Todo mundo vê **Meu tempo**, **Timesheet**,
**Resumo** e **Calendário** com os próprios apontamentos; gestores veem também os de todo o time, mais
**Time agora** e [Configurações](Configurar-o-TicTask.md).

### Meu tempo

O painel do seu dia.

![Meu tempo](../img/hub-meu-tempo.png)

- **Timer**: o que está rodando agora, com pausar e concluir.
- **Horas**: total de hoje e da semana, e o botão **Apontar horas** (escolha a task na lista, agrupada
  pelo item pai).
- **Paradas**: suas tasks em Stopped, com o motivo da última pausa e há quantos dias úteis estão
  paradas. A partir de 5 dias úteis (configurável), o tempo fica em destaque. O **▶** retoma a task.
- **Sem apontamento recente**: suas tasks Active sem apontamento há 3 dias ou mais.
- **Hoje**: os apontamentos do dia em árvore (item pai › task › apontamentos), com editar e excluir.
  Suas outras tasks abertas do mesmo item pai aparecem como "não apontada hoje", com ▶ para iniciar.

### Timesheet

Horas por dia da semana, como uma planilha.

![Timesheet](../img/hub-timesheet.jpg)

- **◀ Esta semana ▶** navega por semana; **De / até** escolhe qualquer período.
- **Agrupar**: Usuário › Task › Atividade, Usuário › Item pai › Task, entre outros.
- **Detalhado**: mostra cada apontamento.
- **Exportar**: resumo ou apontamentos detalhados em CSV (abre no Excel).
- Gestores escolhem **Quem**: eu, uma pessoa ou o time todo.

### Resumo

As horas do período numa tabela só: uma linha por pessoa, US/Bug, task e atividade, e uma coluna por
dia, semana ou mês. Bom para fechar o mês ou ver onde foi o tempo de uma história.

![Resumo](../img/hub-resumo.png)

- **Período**: esta semana, semana passada, este mês ou mês passado; **◀ ▶** anda um mês (ou uma
  semana) e **De / até** escolhe qualquer intervalo.
- **Colunas**: por dia (agrupadas por semana), por semana ou por mês. **Só colunas com horas** esconde
  os dias sem apontamento.
- **Linhas**: escolha quais colunas formam as linhas. Desmarcando Task e Atividade, por exemplo, fica
  uma linha por US/Bug. Valores repetidos aparecem uma vez só, e cada US/Bug (ou pessoa) tem o seu
  total.
- As colunas da esquerda ficam fixas ao rolar para os lados. Clique na task ou na US para abri-la.
- **Exportar**: o resumo ou os apontamentos detalhados em CSV (abre no Excel).
- Gestores escolhem **Quem** (eu, todos ou um time) e, dentro dele, uma **Pessoa**.
- Período, colunas e linhas ficam lembrados no navegador.

### Calendário

Seus apontamentos na semana ou no dia, como uma agenda. Cada bloco mostra o item pai, a task, o horário
e a atividade.

![Calendário](../img/hub-calendario.jpg)

- **Arraste num horário vazio** para apontar naquele intervalo.
- **Arraste ou redimensione um bloco** para corrigir o horário (Completed e Remaining da task são
  ajustados).
- **Clique num bloco** para editar, duplicar ou excluir.
- O timer em andamento aparece como um bloco listrado.
- Gestores escolhem em **Calendário de** de quem é a agenda (a de outras pessoas é só leitura).

### Time agora (gestores)

Quem está com timer rodando, em qual task (e item pai) e desde quando, e quem pausou por último (com o
estado e o motivo). Atualiza a cada 30 segundos; timer aberto há mais de 10h (configurável) aparece em
vermelho (provável esquecimento).

![Time agora](../img/hub-time-agora.png)
