import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyMigrationsAfter, createPgliteDriver } from "@/lib/db/pglite";
import type { Driver } from "@/lib/db/types";
import { createClient, getClient, listMyClients } from "@/lib/services/clients";
import { createDeliverable, transitionDeliverable } from "@/lib/services/deliverables";
import { createTask } from "@/lib/services/tasks";
import { as, setupDb, type Clients, type Team } from "./helpers";

let driver: Driver;
let t: Team;
let c: Clients;
beforeAll(async () => ({ driver, team: t, c } = await setupDb()));
afterAll(() => driver.close());

const LAST_OLD = "20261110000004_notifications.sql";

describe("clientes", () => {
  it("crear un cliente convierte a quien lo crea en propietaria", async () => {
    const id = await as(t.sara, (q) => createClient(q, { name: "Cliente nuevo" }));
    expect(await as(t.sara, (q) => getClient(q, id))).toMatchObject({ name: "Cliente nuevo", description: "", my_role: "owner" });
    const members = await driver.transaction((q) => q("select user_id, role from client_members where client_id = $1", [id]));
    expect(members).toEqual([{ user_id: t.sara, role: "owner" }]);
  });

  it("listMyClients solo devuelve los clientes propios", async () => {
    expect((await as(t.elisa, (q) => listMyClients(q))).map((x) => x.id).sort()).toEqual([c.a, c.b].sort());
    expect(await as(t.lonely, (q) => listMyClients(q))).toEqual([]);
  });

  it("el historial de entregables y tareas guarda el cliente del registro", async () => {
    const deliverable = await as(t.ecommerce, (q) => createDeliverable(q, {
      client_id: c.b, title: "Entregable B", channel: "other", campaign_id: null, owner_id: null, planned_date: null }));
    const task = await as(t.ecommerce, (q) => createTask(q, {
      client_id: c.b, title: "Tarea B", assignee_id: null, due_date: null, priority: "low", campaign_id: null, deliverable_id: null }));
    await as(t.ecommerce, (q) => transitionDeliverable(q, deliverable, "in_review"));
    const rows = await driver.transaction((q) => q<{ entity_type: string; client_id: string | null }>(
      "select entity_type, client_id from activity_log where entity_id = any($1::uuid[])", [[deliverable, task]]));
    expect(rows.filter((r) => r.entity_type === "deliverable").length).toBeGreaterThan(1); // creado + estado
    expect(rows.filter((r) => r.entity_type === "task").length).toBeGreaterThan(0);
    expect(rows.every((r) => r.client_id === c.b)).toBe(true);
  });

  it("la migración mueve los datos existentes al cliente «Amapola»", async () => {
    const d = await createPgliteDriver(undefined, { upTo: LAST_OLD });
    try {
      const ids = await d.transaction(async (q) => {
        const person = async (key: string, role: string, active: boolean) => {
          const [u] = await q<{ id: string }>("insert into auth.users (email) values ($1) returning id", [`${key}@test.invalid`]);
          await q("insert into profiles (id, display_name, role, active) values ($1, $2, $3, $4)", [u.id, key, role, active]);
          return u.id;
        };
        const admin = await person("admin", "admin", true);
        const member = await person("miembro", "member", true);
        const inactive = await person("inactiva", "member", false);
        const one = async (sql: string) => (await q<{ id: string }>(sql))[0].id;
        const campaign = await one("insert into campaigns (name) values ('Campaña') returning id");
        const deliverable = await one("insert into deliverables (title, channel) values ('Entregable', 'other') returning id");
        const task = await one("insert into tasks (title) values ('Tarea') returning id");
        const resource = await one("insert into resources (title, url) values ('Recurso', 'https://example.test/r') returning id");
        return { admin, member, inactive, campaign, deliverable, task, resource };
      });

      await applyMigrationsAfter(d, LAST_OLD);

      await d.transaction(async (q) => {
        const clients = await q<{ id: string; name: string }>("select id, name from clients");
        expect(clients).toHaveLength(1);
        expect(clients[0].name).toBe("Amapola");
        const client = clients[0].id;
        for (const [table, id] of [["campaigns", ids.campaign], ["deliverables", ids.deliverable], ["tasks", ids.task], ["resources", ids.resource]]) {
          expect(await q(`select client_id from ${table} where id = $1`, [id])).toEqual([{ client_id: client }]);
        }
        const members = await q<{ user_id: string; role: string }>("select user_id, role from client_members where client_id = $1", [client]);
        expect(members.sort((x, y) => x.role.localeCompare(y.role))).toEqual([
          { user_id: ids.member, role: "member" },
          { user_id: ids.admin, role: "owner" },
        ]);
        expect(members.some((m) => m.user_id === ids.inactive)).toBe(false);
        // El historial existente también queda asociado al cliente.
        expect(await q("select 1 from activity_log where client_id is distinct from $1", [client])).toHaveLength(0);
      });
    } finally {
      await d.close();
    }
  });

  it("en una base vacía la migración no crea ningún cliente", async () => {
    const d = await createPgliteDriver();
    try {
      expect(await d.transaction((q) => q("select count(*)::int as n from clients"))).toEqual([{ n: 0 }]);
    } finally {
      await d.close();
    }
  });
});
