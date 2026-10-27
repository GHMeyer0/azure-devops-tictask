# Perguntas frequentes

**Fechei o navegador com o timer rodando. Perdi as horas?**
Não. O timer guarda só o horário de início, então continua contando. Ao voltar, pause ou conclua.

**Esqueci o timer ligado a noite toda.**
Clique em **Pausar**: o TicTask percebe e pergunta até que horas você trabalhou. Também dá para ajustar
o bloco depois pelo **Calendário**.

**Apareceu "TF401320: Rule Error for field Original Estimate".**
O processo deixa o Original Estimate somente leitura quando a task está Active. Desde a 0.7.3 o
TicTask grava a estimativa antes de mudar o estado, então o erro não deve mais aparecer. Se aparecer,
tente de novo e avise quem administra a extensão. Veja [Preparar o processo](Preparar-o-processo.md#regras-de-estimativa).

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

**Por que o Remaining não ficou como eu esperava?**
Ele é calculado como Remaining − horas apontadas, mas você pode digitar outro valor no campo
**Remaining após apontar** antes de salvar.

**Não vejo Time agora nem Configurações.**
São só para gestores (administradores de time ou e-mails listados nas configurações).

**Usávamos o Time Log. Dá para trazer o histórico?**
Sim, pelo CSV dele: veja [Migrar dados](Migrar-dados.md#do-time-log).

**Não recebo os lembretes no Google Chat.**
Confira com um gestor se você está em *Configurações › Google Chat › Quem recebe* e se você já abriu
uma conversa (DM) com o app no Google Chat. Os lembretes dependem de uma automação externa: veja
[Lembretes no Google Chat](Lembretes-no-Google-Chat.md).
