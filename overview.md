# TicTask – Apontamento de horas

- **Timer** iniciar / pausar / concluir direto na tela do work item (Task, User Story, Bug). Pausar
  já aponta o tempo; nada fica pendente.
- **Horas sempre batendo**: o *Completed Work* da task é a soma dos apontamentos e cada apontamento
  desconta do *Remaining Work*. Se a task recusar a gravação, o apontamento é desfeito e a pessoa é
  avisada; uma conferência ajusta tasks com o Completed editado à mão.
- **Na US/Bug**: escolha uma task sua ou crie uma nova informando a descrição; crie as tasks padrão
  (Investigação, Desenvolvimento, Revisão, Testes) com um clique.
- **Estado da task** acompanha o trabalho (timer rodando → Active, pausada → Stopped, concluída → Closed),
  com motivos de pausa e próximo passo comentados na task e na US.
- **Hub TicTask** (Boards): resumo de horas por pessoa, WI pai (US, Bug…), task e atividade (por dia,
  semana ou mês, com a lista detalhada de apontamentos e exportação em PDF ou CSV), calendário e
  configurações.
- Auditoria: cada apontamento guarda início/fim/pausas, quem apontou e o snapshot antes/depois da task.
- **Migração**: importa o histórico da extensão Time Log pelo CSV dela, sem alterar os work items.
