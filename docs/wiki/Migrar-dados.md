# Migrar dados

## Do Time Log

Quem já apontava horas com a extensão **Time Log** traz o histórico para o TicTask pelo CSV dela.
Feito por um gestor, uma vez por projeto:

1. No projeto, abra *Project settings › **Time Log Admin*** e clique em **Download all logs as CSV**.
   O arquivo tem todos os apontamentos de todas as pessoas.
2. No TicTask, *Configurações › **Dados** › Importar do Time Log* › **Escolher CSV do Time Log**.
3. Confira a prévia: quantidade, período, horas por pessoa e os tipos do Time Log que não existem como
   atividade no TicTask.
4. Clique em **Importar**.

| No Time Log | No TicTask |
|---|---|
| Data e minutos | Data e duração. O Time Log não guarda horário: os apontamentos de cada pessoa no dia ficam em sequência a partir das **08:00** (ex.: 08:00–13:00, 13:00–14:30). O total do dia fica certo; o horário é aproximado. |
| Pessoa (nome e id) | O mesmo usuário do Azure DevOps. O e-mail vem das pessoas dos times do projeto; quem saiu do time fica sem e-mail, mas os apontamentos continuam com o nome. |
| Work item | O mesmo work item, com título e item pai lidos do ADO. Se ele não existir mais, o apontamento fica só com o número. |
| Type | A atividade de mesmo nome (sem diferenciar maiúsculas). Tipo sem atividade correspondente entra com o próprio nome; cadastre em *Atividades* se quiser cor e *Activity* no ADO. |
| Comment | Comentário. |

**O que a importação não faz:**

- **Não altera os work items.** O Time Log já somou essas horas no *Completed Work* e descontou do
  *Remaining*: aplicar de novo duplicaria.
- **Não duplica.** Cada linha do CSV vira sempre o mesmo apontamento (`timelog-<id>`): importar o
  arquivo de novo (por exemplo, com mais linhas) só sobrescreve os que já entraram.
- **Não respeita o limite de dias de edição**, porque é histórico. Depois de importados, os
  apontamentos antigos ficam só para leitura, como qualquer outro.

Apontamentos de mais de 24h (o Time Log permite) entram inteiros no dia, e no Calendário terminam num
dia seguinte. Depois de importar, desinstale o Time Log ou combine com o time de apontar só no
TicTask, para não lançar as mesmas horas duas vezes.

Uma extensão não lê os dados de outra: por isso o caminho é o CSV. O código está em
[`src/common/domain/timelogImport.ts`](https://github.com/GHMeyer0/azure-devops-tictask/blob/main/src/common/domain/timelogImport.ts).

## Para outro publisher

A identidade da extensão é `publisher.id`: outro publisher é outra extensão, e o Extension Data
Service separa os dados por extensão. A nova começa vazia. Para levar os apontamentos:

1. Na extensão atual: termine o timer em andamento e use *Boards › TicTask › Configurações › Dados ›
   Exportar dados do projeto* (um JSON por projeto, com apontamentos excluídos e configurações).
2. Troque `"publisher"` no manifesto, empacote (`npm run package`), publique e instale a nova extensão.
3. Na nova: *Configurações › Dados › Escolher arquivo de exportação › Importar*. Os ids são mantidos
   (importar de novo sobrescreve, não duplica) e cada apontamento ganha a linha "importado de …"
   no histórico. Os campos dos work items não são alterados.
4. Confira o timesheet e só então desinstale a extensão antiga e remova o publisher.

A exportação lê os meses de jan/2020 até 12 meses à frente (`EXPORT_FIRST_MONTH` em
`src/common/data/migration.ts`).
