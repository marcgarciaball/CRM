import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedDemo } from "@/lib/demo/seed";
import { setDriver, withUser } from "@/lib/db";
import { createPgliteDriver } from "@/lib/db/pglite";
import type { Driver } from "@/lib/db/types";
import { clientSummaries, listClientPeople, listMyClients } from "@/lib/services/clients";

let driver: Driver;
beforeAll(async () => {
  driver = await createPgliteDriver();
  setDriver(driver);
  await seedDemo(driver);
});
afterAll(() => driver.close());

const sys = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => driver.transaction((q) => q<T>(sql, params));
const userId = async (key: string) => (await sys<{ id: string }>("select id from auth.users where email = $1", [`${key}@demo.invalid`]))[0].id;
const clientNames = async (key: string) => (await withUser(await userId(key), (q) => listMyClients(q))).map((c) => `${c.name}:${c.my_role}`);

describe("datos de la demo", () => {
  it("dos clientes: Elisa en los dos, Sara solo en el estudio, cada uno con su propiedad", async () => {
    expect(await clientNames("maite")).toEqual(["Estudio Demo:owner"]);
    expect(await clientNames("ecommerce")).toEqual(["Tienda Demo:owner"]);
    expect(await clientNames("sara")).toEqual(["Estudio Demo:member"]);
    expect(await clientNames("ainhoa")).toEqual(["Estudio Demo:member"]);
    expect(await clientNames("elisa")).toEqual(["Estudio Demo:member", "Tienda Demo:member"]);
  });

  it("nadie figura como invitación pendiente y los dos clientes tienen trabajo", async () => {
    const elisa = await userId("elisa");
    const summaries = await withUser(elisa, async (q) => {
      for (const c of await listMyClients(q)) expect((await listClientPeople(q, c.id)).every((p) => !p.pending)).toBe(true);
      return clientSummaries(q, "2000-01-01");
    });
    for (const s of summaries) expect(s.open_tasks).toBeGreaterThan(0);
    // La diapositiva de contenido y los estados nuevos siguen sembrados, ahora en los dos clientes.
    const slides = await sys<{ name: string; n: number }>(
      `select cl.name, count(*)::int as n from deliverables d join clients cl on cl.id = d.client_id
        where d.creative_format is not null group by cl.name order by cl.name`);
    expect(slides.map((r) => r.name)).toEqual(["Estudio Demo", "Tienda Demo"]);
    const statuses = (await sys<{ status: string }>("select distinct status from deliverables")).map((r) => r.status);
    expect(statuses).toEqual(expect.arrayContaining(["waiting_client", "on_hold", "discarded", "in_review"]));
  });
});
