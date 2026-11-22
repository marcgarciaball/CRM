import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Driver } from "@/lib/db/types";
import { createTask, listTasks, moveTask, setTaskStatus } from "@/lib/services/tasks";
import { as, setupDb, type Clients, type Team } from "./helpers";

let driver: Driver;
let t: Team;
let c: Clients;
beforeAll(async () => ({ driver, team: t, c } = await setupDb()));
afterAll(() => driver.close());

const task = (title: string, due_date: string | null = null) => as(t.maite, (q) => createTask(q, {
  client_id: c.a, title, assignee_id: null, due_date, priority: "medium", campaign_id: null, deliverable_id: null }));
const titles = async () => (await as(t.maite, (q) => listTasks(q, { client: c.a, manual: true }))).map((x) => x.title);

describe("orden manual de tareas", () => {
  it("las nuevas arriba; se mueven entre vecinas, al principio y al final; las hechas siguen al final", async () => {
    const a = await task("A"), b = await task("B"), cc = await task("C");
    expect((await titles()).slice(0, 3)).toEqual(["C", "B", "A"]);

    await as(t.sara, (q) => moveTask(q, a, cc, b));
    expect((await titles()).slice(0, 3)).toEqual(["C", "A", "B"]);
    await as(t.sara, (q) => moveTask(q, b, null, cc));
    expect((await titles()).slice(0, 3)).toEqual(["B", "C", "A"]);

    await as(t.sara, (q) => setTaskStatus(q, b, "done"));
    expect((await titles()).at(-1)).toBe("B");
  });

  it("con posiciones empatadas, renumera respetando el orden visible y coloca la tarea entre sus vecinas", async () => {
    await task("D");
    await driver.transaction((q) => q(`update tasks set position = 0 where client_id = $1`, [c.a]));
    const tied = await as(t.maite, (q) => listTasks(q, { client: c.a, manual: true }));
    // Lleva la tercera entre la primera y la segunda.
    await as(t.sara, (q) => moveTask(q, tied[2].id, tied[0].id, tied[1].id));
    const names = tied.map((x) => x.title);
    expect(await titles()).toEqual([names[0], names[2], names[1], ...names.slice(3)]);
  });
});
