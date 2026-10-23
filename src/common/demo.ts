// Demo mode for documentation screenshots: with `tictask-demo=1` in the page URL, real titles,
// names, e-mails, comments and the project name are swapped on screen for fictitious ones.
// Only the rendered DOM changes: data read and written stays real.

type Kind = "parent" | "task" | "name" | "email" | "comment" | "team" | "project";

const PARENTS = [
  "Exportar relatório de vendas em PDF",
  "Cadastro de clientes com validação de CPF/CNPJ",
  "Notificar o cliente por e-mail quando o pedido for aprovado",
  "Erro ao salvar pedido com desconto acima de 50%",
  "Integração com o gateway de pagamento",
  "Painel de indicadores do financeiro",
  "Importação de produtos por planilha",
  "Tela de login não aceita senha com acento",
  "Histórico de alterações do contrato",
  "Agendamento de entregas por região",
  "Permissões por perfil de usuário",
  "Lentidão na listagem de pedidos",
  "Emissão de boleto pelo portal do cliente",
  "Busca de clientes por telefone",
  "Fila de reprocessamento de notas fiscais",
  "Relatório mensal de inadimplência",
];

const TASKS = [
  "Criar endpoint de exportação",
  "Ajustar validação do formulário",
  "Montar layout do relatório",
  "Escrever testes de integração",
  "Migrar dados da tabela antiga",
  "Corrigir cálculo do desconto",
  "Criar tela de filtros",
  "Revisar consultas lentas",
  "Configurar fila de mensagens",
  "Documentar a API",
  "Ajustar permissões do perfil",
  "Criar job de reprocessamento",
  "Tratar erro de timeout",
  "Criar componente de upload",
  "Validar regras com o cliente",
  "Publicar em homologação",
];

const PEOPLE = [
  "Ana Souza", "Bruno Lima", "Carla Mendes", "Diego Rocha", "Elisa Prado", "Felipe Costa", "Gabriela Nunes",
  "Heitor Alves", "Isabela Ramos", "João Teixeira", "Karen Duarte", "Leonardo Pires", "Marina Lopes",
  "Nicolas Barros", "Olívia Campos", "Paulo Viana", "Renata Freitas", "Sérgio Moura", "Tatiane Reis", "Vinícius Cardoso",
];

const COMMENTS = ["Ajustes após a revisão", "Alinhamento com o time", "Testes em homologação", "Correções apontadas no PR", "Validação com o cliente"];
const TEAMS = ["Time Produto", "Time Plataforma", "Time Financeiro", "Time Mobile"];

const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

let active = false;
/** Real text → fake text, applied as substring replacements (longest first). */
const swaps = new Map<string, string>();
/** Avatar initials, replaced only when they are a whole text node. */
const initials = new Map<string, string>();
const used: Record<string, Map<number, string>> = {};
let keep = new Set<string>();
let observer: MutationObserver | undefined;
let pending = false;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
/** Initials as Fluent's Avatar computes them: 2 words → both, 3 → first and third, more → only the first. */
function initialsOf(name: string): string {
  const w = name.split(/\s+/).filter(Boolean);
  const picked = w.length === 2 ? [w[0], w[1]] : w.length === 3 ? [w[0], w[2]] : w.slice(0, 1);
  return picked.map((x) => x[0]).join("").toUpperCase();
}

/** Same real value → same fake one in every frame (hub, dialogs, work item form). */
function pick(list: string[], key: string, kind: string): string {
  const owners = (used[kind] ??= new Map());
  let i = hash(key) % list.length;
  for (let tries = 0; tries < list.length; tries++, i = (i + 1) % list.length) {
    const owner = owners.get(i);
    if (owner === undefined || owner === key) {
      owners.set(i, key);
      return list[i];
    }
  }
  return list[hash(key) % list.length];
}

/** A person is keyed by first name, so "Lucas Eduardo" and "lucas.eduardo@…" become the same fake person. */
function fakePerson(firstName: string): string {
  return pick(PEOPLE, plain(firstName), "person");
}

const emailOf = (fakeName: string) => `${plain(fakeName).replace(/\s+/g, ".")}@contoso.com`;

function register(kind: Kind, real: string | undefined | null, fakeName?: string): void {
  const value = real?.trim();
  if (!value || value.length < 3 || swaps.has(value) || keep.has(plain(value))) return;
  // One- or two-word task titles ("Correção", "Finalizar entrega") are generic, and swapping them
  // would also hit the same word inside activity names ("Desenvolvimento/Correção").
  if (kind === "task" && value.split(/\s+/).length <= 2) return;
  let fake: string;
  switch (kind) {
    case "parent":
      fake = pick(PARENTS, value, kind);
      break;
    case "task":
      fake = pick(TASKS, value, kind);
      break;
    case "comment":
      fake = pick(COMMENTS, value, kind);
      break;
    case "team":
      fake = pick(TEAMS, value, kind);
      break;
    case "project":
      fake = "Contoso";
      break;
    case "name": {
      if (EMAIL.test(value)) return register("email", value);
      fake = fakePerson(value.split(/\s+/)[0]);
      initials.set(initialsOf(value), initialsOf(fake));
      break;
    }
    case "email": {
      const [local] = value.split("@");
      fake = emailOf(fakeName ?? fakePerson(local.split(/[._-]/)[0]));
      swaps.set(value.toLowerCase(), fake);
      break;
    }
  }
  swaps.set(value, fake);
  schedule();
}

/** Titles that are only an activity (e.g. "Investigação", "Revisão de PR") say nothing about the client. */
export function demoKeep(values: string[]): void {
  keep = new Set([...keep, ...values.filter(Boolean).map(plain)]);
}

/** Collects the values to hide from any API/Extension Data response. */
export function demoScan(data: unknown, depth = 0): void {
  if (!data || typeof data !== "object" || depth > 8) return;
  if (Array.isArray(data)) {
    for (const item of data) demoScan(item, depth + 1);
    return;
  }
  if (data instanceof Map) {
    for (const v of data.values()) demoScan(v, depth + 1);
    return;
  }
  const o = data as Record<string, unknown>;
  const type = (o.workItemType ?? o.type ?? o["System.WorkItemType"] ?? (o.fields as Record<string, unknown> | undefined)?.["System.WorkItemType"]) as string | undefined;
  const titleKind: Kind = type && type !== "Task" ? "parent" : "task";
  // Name and e-mail of the same person in one object: the fake e-mail follows the fake name.
  const email = [o.uniqueName, o.userEmail, o.email, o.mailAddress].find((v): v is string => typeof v === "string" && EMAIL.test(v));
  const name = [o.displayName, o.userName, email ? o.name : undefined].find((v): v is string => typeof v === "string" && !EMAIL.test(v));
  if (name && email) {
    register("name", name);
    register("email", email, swaps.get(name.trim()));
  }
  for (const [key, v] of Object.entries(o)) {
    if (typeof v === "string") {
      if (key === "title" || key === "System.Title" || key === "workItemTitle") register(titleKind, v);
      else if (key === "parentTitle") register("parent", v);
      else if (key === "displayName" || key === "userName") register("name", v);
      else if (key === "comment") register("comment", v);
      else if (key === "projectName" && o.name && typeof o.name === "string") register("team", o.name as string);
      else if (key === "System.AssignedTo" || key === "System.CreatedBy" || key === "System.ChangedBy") {
        const m = /^(.*?)\s*<([^>]+)>$/.exec(v);
        if (m) {
          register("name", m[1]);
          register("email", m[2]);
        }
      } else if (EMAIL.test(v)) register("email", v);
    } else if (v && typeof v === "object") demoScan(v, depth + 1);
  }
}

export function demoProject(name: string): void {
  register("project", name);
}

/** Text as demo mode shows it. */
export function swapText(text: string): string {
  let out = text;
  for (const [real, fake] of [...swaps].sort((a, b) => b[0].length - a[0].length)) {
    if (out.includes(real)) out = out.split(real).join(fake);
  }
  return out;
}

const ATTRS = ["title", "placeholder", "aria-label", "value"];

function apply(root: Node): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n: Node | null = walker.currentNode; n; n = walker.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) {
      const t = n.nodeValue ?? "";
      const next = initials.get(t.trim()) ?? swapText(t);
      if (next !== t) n.nodeValue = next;
    } else if (n instanceof Element) {
      for (const a of ATTRS) {
        const v = n.getAttribute(a);
        if (v) {
          const next = swapText(v);
          if (next !== v) n.setAttribute(a, next);
        }
      }
      if (n instanceof HTMLInputElement || n instanceof HTMLTextAreaElement) {
        const next = swapText(n.value);
        if (next !== n.value) n.value = next;
      }
    }
  }
}

function schedule(): void {
  if (!active || pending) return;
  pending = true;
  requestAnimationFrame(() => {
    pending = false;
    apply(document.body);
  });
}

export function demoActive(): boolean {
  return active;
}

/** Turns demo mode on when the host page URL has `tictask-demo=1`. */
export function startDemo(): void {
  if (active) return;
  active = true;
  observer = new MutationObserver((records) => {
    for (const r of records) apply(r.target);
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  schedule();
}
