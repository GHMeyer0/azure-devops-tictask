# Perguntas frequentes

**Fechei o navegador com o timer rodando. Perdi as horas?**
Não. O timer guarda só o horário de início, então continua contando. Ao voltar, pause ou conclua.

**Esqueci o timer ligado a noite toda.**
Clique em **Pausar**: o TicTask percebe e pergunta até que horas você trabalhou. Também dá para ajustar
o bloco depois pelo **Calendário**.

**Apareceu "TF401320: Rule Error for field Original Estimate".**
O processo deixa o Original Estimate somente leitura (sempre, ou com a task Active). Desde a 0.7.3 o
TicTask grava a estimativa antes de mudar o estado e, desde a 0.11.3, quando o processo recusa o campo
("Error code: ReadOnly"), grava de novo sem ele: a estimativa fica só no Remaining e aparece um aviso.
Antes disso, pausar um timer numa task sem estimativa podia falhar e o timer não parava. Para não
tentar gravar o campo, um gestor desliga *Configurações › Geral › Gravar o Original Estimate*. Veja
[Preparar o processo](Preparar-o-processo.md#regras-de-estimativa).

**Apareceu "The field 'State' contains the value '…' that is not in the list of supported values".**
O processo do projeto não tem esse estado (por exemplo, a task usa Aberto / Em Desenvolvimento /
Fechado em vez de New / Active / Closed). Desde a 0.11.4 o TicTask acha o equivalente pela categoria do
estado e, se ainda assim o estado for recusado, aponta as horas sem mudar o estado e avisa. Veja
[Projetos com outro processo](Preparar-o-processo.md#projetos-com-outro-processo).

**Apareceu "Rule Error for field Description. Error code: Required, InvalidEmpty".**
O processo exige descrição na task. Desde a 0.11.5 o TicTask cria tasks com descrição e, numa task
existente sem descrição, preenche com o título e avisa. Para outro campo obrigatório, o aviso diz qual
preencher na task. Veja [Campos obrigatórios](Preparar-o-processo.md#campos-obrigatórios).

**Preciso pausar para tomar café?**
Não. Pausar é largar a task por agora (outra task, reunião, almoço, fim do dia). O TicTask mede o
esforço em cada task, não é ponto.

**Qual a diferença entre Pausar e Concluir?**
Os dois apontam o tempo. **Pausar** deixa a task em Stopped, para voltar depois; **Concluir** fecha a
task (Closed) e pergunta o próximo passo. Veja o diagrama em [Usar numa Task](Usar-numa-Task.md#estado-da-task).

**Apontei na task errada.**
Exclua o apontamento (Meu tempo › Hoje, aba Apontamentos ou Calendário) e aponte de novo na task
certa. A exclusão devolve as horas ao Remaining da task errada.

**Não consigo editar um apontamento antigo.**
A edição fica bloqueada depois de alguns dias (definido em *Configurações › Geral*). Fale com um gestor.

**Não consigo apontar numa data antiga.**
O mesmo limite vale para criar: não dá para apontar (nem arrastar no Calendário) para antes dele,
porque o apontamento já nasceria sem poder ser corrigido. O tempo de um timer esquecido é sempre
apontado, mesmo que tenha começado antes do limite. Precisa registrar algo mais antigo? Fale com um
gestor.

**O Completed da task está diferente das horas apontadas.**
Numa task com apontamentos, o Completed é sempre a soma deles. Se alguém editou o campo à mão, a tela
da task mostra o aviso com o botão **Ajustar**, e o próximo apontamento também corrige. Não edite o
Completed no formulário: se faltou alguma hora, use **Apontar** com a data em que o trabalho foi feito.
Um gestor confere o projeto inteiro em *Configurações › Dados › Conferir o Completed das tasks*.

**Apareceu "Apontamento não registrado".**
O Azure DevOps recusou a gravação da task (uma regra do processo ou um campo obrigatório, por exemplo),
e o TicTask desfez o apontamento para não deixar a task com horas sem apontamento. O aviso traz o
motivo: corrija o que foi pedido e aponte de novo.

**Por que o Remaining não ficou como eu esperava?**
Ele é calculado como Remaining − horas apontadas, mas você pode digitar outro valor no campo
**Remaining após apontar** antes de salvar.

**Não vejo Time agora nem Configurações.**
São só para gestores (administradores de time ou e-mails listados nas configurações).

**Trabalho em vários projetos. Preciso abrir o TicTask em cada um?**
Não. Meu tempo, Resumo e Calendário mostram as suas horas de todos os projetos que você acessa, em
qualquer projeto em que você abrir o hub. No Resumo, deixe **Todos os projetos** e marque **Projeto**
em Linhas para ver o dia separado por projeto (bom para lançar em outro sistema de horas). Pausar,
editar ou retomar algo de outro projeto grava naquele projeto, com as configurações dele. Para apontar
uma task nova de outro projeto pelo Calendário ou por **Apontar horas**, abra o TicTask naquele projeto.

**Usávamos o Time Log. Dá para trazer o histórico?**
Sim, pelo CSV dele: veja [Migrar dados](Migrar-dados.md#do-time-log).

**Não recebo os lembretes no Google Chat.**
Confira com um gestor se você está em *Configurações › Google Chat › Quem recebe* e se você já abriu
uma conversa (DM) com o app no Google Chat. Os lembretes dependem de uma automação externa: veja
[Lembretes no Google Chat](Lembretes-no-Google-Chat.md).
