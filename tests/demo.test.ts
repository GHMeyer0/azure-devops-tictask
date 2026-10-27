import { describe, expect, it } from "vitest";
import { demoKeep, demoProject, demoScan, swapText } from "../src/common/demo";

describe("demo mode", () => {
  demoKeep(["Investigação", "Revisão de PR"]);
  demoProject("Acme");
  demoScan({
    workItemTitle: "Integrar com o sistema do cliente X",
    workItemType: "Task",
    parentTitle: "Projeto secreto do cliente X",
    userName: "Rafael Teles",
    userEmail: "rafael.teles@acme.com.br",
    comment: "Liguei para o cliente X",
  });
  demoScan({ id: 1, fields: { "System.Title": "Investigação", "System.WorkItemType": "Task", "System.AssignedTo": "Rafael Teles <Rafael.Teles@acme.com.br>" } });

  it("swaps titles, people, comments and the project name", () => {
    const shown = swapText("#11 Integrar com o sistema do cliente X · Projeto secreto do cliente X · Rafael Teles · Liguei para o cliente X · projeto Acme");
    expect(shown).not.toMatch(/cliente X|Rafael|Acme/);
    expect(shown).toContain("projeto Contoso");
  });

  it("maps a person's name and e-mail to the same fictitious person", () => {
    const name = swapText("Rafael Teles");
    const first = name.split(" ")[0].normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    expect(swapText("rafael.teles@acme.com.br")).toMatch(new RegExp(`^${first}\\.[a-z]+@contoso\\.com$`));
    expect(swapText("Rafael.Teles@acme.com.br")).toBe(swapText("rafael.teles@acme.com.br"));
  });

  it("keeps titles that are only an activity or one or two generic words", () => {
    demoScan({ workItemTitle: "Correção", workItemType: "Task" });
    expect(swapText("Investigação")).toBe("Investigação");
    expect(swapText("Desenvolvimento/Correção")).toBe("Desenvolvimento/Correção");
  });

  it("gives the e-mail of a person the same fake name", () => {
    demoScan({ name: "Ágatha Ribeiro", email: "aribeiro@acme.com.br" });
    const fake = swapText("Ágatha Ribeiro").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(" ", ".");
    expect(swapText("aribeiro@acme.com.br")).toBe(`${fake}@contoso.com`);
  });
});
