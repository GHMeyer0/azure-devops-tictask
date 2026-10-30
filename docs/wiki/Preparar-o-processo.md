# Preparar o processo

O TicTask trabalha com o processo que a organização já usa (Agile, Scrum ou um processo herdado). Ele
não altera o processo: o que for preciso, um administrador da organização cria uma vez.

## Estado Stopped na Task

A pausa deixa a task num estado "começada, ninguém trabalhando nela". Por padrão é **Stopped**, que
não existe no processo Agile original.

Para criar: *Organization settings › Process › (seu processo herdado) › Task › States › New state*,
nome **Stopped**, categoria **In Progress**.

Outro nome também serve: configure em
[Configurações › Estados e motivos](Configurar-o-TicTask.md#estados-e-motivos). Sem nenhum estado de
pausa válido, a pausa aponta o tempo mas não muda o estado.

> A extensão não cria estados: isso exige ser administrador do processo e daria a todos os usuários
> da extensão permissão para alterar o processo da organização.

## Regras de estimativa

Alguns processos herdados têm regras na Task como:

- de **New** para **Active**, exigir *Original Estimate* e *Remaining Work*;
- com a task **Active**, deixar o *Original Estimate* somente leitura.

O TicTask lida com isso: iniciar o timer numa task sem estimativa pede a estimativa antes, e ela é
gravada numa revisão separada, antes da mudança de estado. Sem essa ordem, o ADO responde
`TF401320: Rule Error for field Original Estimate`.

## Tipos de WI pai

O grupo do TicTask funciona como "US" (escolher ou criar a task, somar as horas das filhas) nos tipos
listados em *Configurações › Geral › Tipos de WI pai*. O padrão é User Story, Technical Story e Bug; ajuste
aos nomes do seu processo.

## Tipo Rotina

Para apontar [rotinas internas](Rotinas-internas.md) (treinamento, release notes, administrativo):

1. *Organization settings › Process › (seu processo herdado) › **New work item type***: nome
   **Rotina**, um ícone e uma cor que a diferencie da User Story. O tipo novo já vem com os estados
   New, Active e Closed.
2. Não inclua Story Points no layout: rotina não é entrega e não deve pesar na velocity.
3. *Process › (seu processo) › **Backlog levels** › Stories › Edit*: marque **Rotina**. Sem isso ela
   não aparece no backlog e no quadro da sprint e não aceita tasks como filhas no quadro.
4. No **quadro (Kanban)** de cada time, confirme o mapeamento dos estados da Rotina para as colunas
   (o ADO pede na primeira vez; senão, em Configurações do quadro › Colunas).
5. No TicTask, *Configurações › Geral › Tipos de WI pai*: inclua **Rotina**. Em *Configurações ›
   Atividades*, crie **Treinamento** e **Administrativo** (Activity no ADO: *Documentation*).

O nome não precisa ser "Rotina": o TicTask usa o que estiver em *Tipos de WI pai*. Um tipo de work item
criado no processo herdado não pode ser renomeado depois, então escolha o nome antes.

## Esconder o TicTask em alguns tipos

Para esconder o grupo e a aba em tipos onde não fazem sentido (ex.: Epic, Feature):
*Organization settings › Process › (processo) › tipo de WI › Layout* → ocultar o grupo **TicTask** e a
página **Apontamentos**.
