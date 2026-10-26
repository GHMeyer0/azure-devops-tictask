# TicTask – guia para agentes

Extensão do Azure DevOps (publisher `ghmeyer0`, id `tictask`, privada) para apontar horas nas Tasks do
projeto **Tiino** (org `tunesoft`, processo **Agile 2024**). Sem backend: dados no Extension Data
Service. Leia também o [README](README.md) (arquitetura e regras), o [guia de uso](docs/como-usar.md)
e o [plano da 0.7](docs/plano-pausar-concluir.md).

Stack: TypeScript, React 19, Fluent UI v9 (+ `react-timepicker-compat` e `react-datepicker-compat`),
`azure-devops-extension-sdk` 4.x, FullCalendar 6, esbuild (`scripts/build.mjs`), vitest, tfx.
Idioma: UI, guia, commits e conversa em português; comentários de código em inglês.

## Fluxo de trabalho com o usuário

- **Versão:** a cada entrega, subir a versão em `package.json`, `vss-extension.json` e
  `package-lock.json` (as duas primeiras ocorrências), rodar `npx tsc --noEmit -p .`, `npx vitest run`
  e `npm run package` (gera `out/ghmeyer0.tictask-X.Y.Z.vsix`). Quem instala no ADO é o usuário; uma
  versão empacotada e não instalada pode ganhar outra correção e virar a próxima versão.
- **Commit só quando o usuário pedir.** Mensagem em português, com a versão no título.
- **Sempre atualizar a documentação** na mesma entrega: `docs/como-usar.md`, `README.md`,
  `overview.md` (página do marketplace, vai no .vsix: reempacotar se mudar) e prints de `docs/img/`.
- **Testar nas telas:** 1280×720, 1366×768, 1920×1080 e 1920×1200 (notebook do usuário, 2880×1800 a
  150%). Celular está fora de escopo.
- **Antes de implementar algo grande**, discutir o desenho com o usuário; ele costuma querer revisar.

## Testes no ADO (navegador embutido)

- Nunca fazer login pelo usuário; se cair na tela de login, pedir para ele entrar.
- Use as tasks do próprio usuário para teste e **limpe depois** (excluir pela interface devolve as horas;
  confira Completed/Remaining pela API e corrija com `test /rev`).
- **O timer do usuário é real:** iniciar um timer pausa o dele e aponta tempo de verdade. Pergunte antes.
- Com "Registrar na discussão" ligado (`postComment`), cada apontamento gera comentário no work item.
  Comentário só pode ser apagado pelo usuário: evite salvar apontamentos e motivos de teste e avise o
  que ficou. Motivo com "Comenta na US" notifica quem segue a US: não salve em teste.
- Cliques dentro do iframe da extensão falham com emulação de viewport em algumas situações: tire um
  screenshot novo antes de clicar; erros da extensão não aparecem no console do topo (iframe
  cross-origin).
- **Prints para a documentação:** abrir a página com `?tictask-demo=1` (modo demonstração troca nomes,
  títulos e iniciais dentro da extensão) **e** anonimizar a página do ADO em volta via JavaScript no
  topo (tunesoft→contoso, Tiino→Contoso, nomes de pessoas, títulos, avatar `.mectrl_profilepic`). Nada
  da organização pode aparecer. Os prints saem de `computer screenshot`/`zoom` (arquivos em
  `tool-results`), copiados para `docs/img/`.

## Modelo de uso (desde a 0.7)

- **Um timer por usuário**, guarda só o trecho que está rodando. Iniciar outro pausa o atual sozinho.
- **Pausar** = "larguei a task por agora": aponta o trecho, desconta o Remaining, task → Stopped
  (aparece em Paradas). Um clique; o ▾ abre "Pausar com motivo". Trecho < 1 min não é apontado.
- O diálogo de pausa também abre quando o timer parece esquecido (dia anterior ou > `runningAlertHours`),
  quando o Remaining zeraria ("Quanto ainda falta?") ou quando a task não tem estimativa.
- **Concluir** = "terminei": Remaining sugerido 0, próximo passo opcional, task → Closed.
- Estados: Active = alguém com timer nela; Stopped = começada, ninguém nela; Closed = terminada.
  Apontamento manual numa task New deixa Stopped.
- Motivos configuráveis (`settings.states.reasons`, tipo `pause` ou `conclude`, flag `commentOnParent`).
  "Outro…" (texto livre) é fixo na interface.
- Fluxo de revisão: Desenvolvimento concluída como "Enviado para revisão"; correções numa única task
  de **Correção** por história (atividade separada de Desenvolvimento).
- `lockDays` (Configurações › Geral): depois dele o autor não edita nem exclui, e também não cria nem
  move apontamentos para antes dele. Exceção: o tempo de um timer é sempre apontado.

## Armadilhas já resolvidas (não reintroduzir)

- **Extension Data:** gravar com `__etag: -1` (timer, presença e apontamentos). Sem isso:
  "The document version does not match" — inclusive ao excluir/editar apontamento, que lido de uma
  coleção carrega a versão dela, e o erro vinha depois de as horas já voltarem para a task.
- **Leitura atrasada:** logo depois de gravar, a leitura pode devolver a versão anterior. O timer tem
  `savedAt` e, ao ser limpo, vira um marcador `{ cleared: true, savedAt }`; telas ignoram leituras mais
  antigas do que o que mostram (`isOlder` em `data/timerRepo.ts`).
- **Ponte host/iframe:** `null` vira `undefined` na configuração dos diálogos; use `== null`.
- **Diálogo do host:** largura fixa de 480px (440px de conteúdo); o conteúdo é fluido.
- **Menus/popovers no grupo da tela do work item** são cortados pelo iframe pequeno: o ▾ do Pausar abre
  um diálogo, não um menu.
- **Regras do processo Tiino na Task:** de New para Active exige Original Estimate e Remaining; com a
  task Active o Original Estimate fica somente leitura (até na mesma gravação). Por isso a estimativa é
  gravada antes do estado (duas revisões) e iniciar timer em task sem estimativa pede a estimativa.
  Erro visto: `TF401320: Rule Error for field Original Estimate`.
- O processo precisa do estado **Stopped** na Task; a extensão não cria estados.
- `Microsoft.VSTS.Common.StateChangeDate` é lido com os campos da task (dias parada em Paradas).

## n8n (ipaas.tunesoft.com.br) e Google Chat

Workflows: `TT · LIB · Ler TicTask` (Pnn4PR3VNtLAytyZ), `TT · CRON · Lembrete de apontamento`
(kNMZQi8ju9UKV1vY, de hora em hora), `CHAT · CRON · Resumo diário 7h30` (zgUkaw00IwltDwcK). Usam
`ADO · LIB · GET na API do ADO` (WRMJ1ndESbYkoCjZ) e `CHAT · LIB · Enviar card por DM` (4hxyshOCta5XWlU4).

- A LIB classifica cada documento **pelo conteúdo**, não pelo `pairedItem`: com muitos apontamentos o
  `pairedItem` do GET não aponta a URL de origem e tudo virava "resposta sem origem" (lembretes pararam
  de sair em 23/10/2026 até a correção).
- `update_workflow` reescreve o workflow inteiro a partir do código do SDK: reproduza todos os nós.
  O SDK não aceita template com tag (`String.raw`); evite `\` e `${` dentro do `jsCode`.
- Depois de `update_workflow` é preciso `publish_workflow`.
- A LIB só pode ser chamada por workflows do mesmo projeto: um workflow temporário de teste é negado.
  Não rode os CRONs à mão (mandam mensagens reais ao time); confira a próxima execução agendada com
  `search_executions` / `get_execution`.
- Mudanças nos dados da extensão (campos novos em apontamentos, presença, configurações) precisam ser
  refletidas na LIB.
