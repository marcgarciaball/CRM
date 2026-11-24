import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Driver } from "@/lib/db/types";
import { as, setupDb, type Clients, type Team } from "./helpers";

// Cifras inventadas. Reglas de acceso de Rentabilidad. A: maite y ecommerce propietarias, sara miembro. B: ecommerce y elisa.
let driver: Driver;
let t: Team;
let c: Clients;
beforeAll(async () => ({ driver, team: t, c } = await setupDb()));
afterAll(() => driver.close());
const sys = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => driver.transaction((q) => q<T>(sql, params));
const TABLES = ["client_cost_settings", "client_fixed_costs", "client_products", "client_product_sales", "client_monthly_expenses"];
beforeEach(async () => {
  for (const table of TABLES) await sys(`delete from ${table}`);
  await sys("update clients set archived_at = null");
});
const count = async (user: string, table: string, client: string) =>
  (await as(user, (q) => q<{ n: number }>(`select count(*)::int as n from ${table} where client_id = $1`, [client])))[0].n;
const addCost = (user: string, client: string, grp = "personal", amount = 2000) =>
  as(user, (q) => q("insert into client_fixed_costs (client_id, grp, concept, monthly_amount) values ($1, $2, 'Salarios', $3)", [client, grp, amount]));
const addProduct = (user: string, client: string) =>
  as(user, (q) => q<{ id: string }>("insert into client_products (client_id, family, price) values ($1, 'Lámina', 20) returning id", [client]));

describe("costes fijos: líneas solo para la Propiedad, totales para todo el equipo", () => {
  it("un miembro no ve las líneas pero sí los totales por grupo", async () => {
    await addCost(t.maite, c.a);
    await addCost(t.maite, c.a, "estructura", 800);
    expect(await count(t.sara, "client_fixed_costs", c.a)).toBe(0);
    expect(await count(t.maite, "client_fixed_costs", c.a)).toBe(2);
    const totals = await as(t.sara, (q) => q<{ grp: string; monthly: number }>("select grp, monthly::float8 as monthly from fixed_cost_totals($1) order by grp", [c.a]));
    expect(totals).toEqual([{ grp: "estructura", monthly: 800 }, { grp: "personal", monthly: 2000 }]);
  });
  it("un miembro no escribe costes fijos; alguien sin acceso no ve ni los totales", async () => {
    await expect(addCost(t.sara, c.a)).rejects.toThrow();
    await expect(as(t.lonely, (q) => q("select * from fixed_cost_totals($1)", [c.a]))).rejects.toThrow();
  });
  it("sustituir la lista: solo la Propiedad", async () => {
    await addCost(t.maite, c.a);
    const rows = JSON.stringify([{ grp: "estructura", concept: "Alquiler", monthly_amount: 800, note: "", position: 0 }]);
    await expect(as(t.sara, (q) => q("select replace_fixed_costs($1, $2::jsonb)", [c.a, rows]))).rejects.toThrow();
    await as(t.maite, (q) => q("select replace_fixed_costs($1, $2::jsonb)", [c.a, rows]));
    expect((await sys<{ concept: string }>("select concept from client_fixed_costs")).map((r) => r.concept)).toEqual(["Alquiler"]);
  });
});

describe("productos y supuestos: todo el equipo edita, la Propiedad borra y sustituye", () => {
  it("un miembro crea y cambia productos y supuestos, pero no borra", async () => {
    const [p] = await addProduct(t.sara, c.a);
    await as(t.sara, (q) => q("update client_products set price = 25 where id = $1", [p.id]));
    await as(t.sara, (q) => q("insert into client_cost_settings (client_id, iva) values ($1, 0.21)", [c.a]));
    await as(t.sara, (q) => q("delete from client_products where id = $1", [p.id]));
    expect(await count(t.maite, "client_products", c.a)).toBe(1);
    await as(t.maite, (q) => q("delete from client_products where id = $1", [p.id]));
    expect(await count(t.maite, "client_products", c.a)).toBe(0);
  });
  it("sustituir el escandallo: solo la Propiedad", async () => {
    const rows = JSON.stringify([{ position: 0, family: "Marcos", format: "A4", price: 42, active: true, note: "" }]);
    await expect(as(t.sara, (q) => q("select replace_products($1, $2::jsonb)", [c.a, rows]))).rejects.toThrow();
    await addProduct(t.maite, c.a);
    await as(t.maite, (q) => q("select replace_products($1, $2::jsonb)", [c.a, rows]));
    expect((await sys<{ family: string }>("select family from client_products")).map((r) => r.family)).toEqual(["Marcos"]);
  });
  it("un cliente ajeno no se ve ni se escribe", async () => {
    await addProduct(t.ecommerce, c.b);
    expect(await count(t.sara, "client_products", c.b)).toBe(0);
    await expect(addProduct(t.sara, c.b)).rejects.toThrow();
  });
});

describe("ventas por producto", () => {
  const rows = (month: string, title = "Lámina") => JSON.stringify([{ month, product_title: title, variant_title: "A6", net_sales: 10, quantity: 1, reversed_quantity: 0, orders: 1 }]);
  it("un miembro importa y sustituye solo los meses que trae; no admite un archivo vacío", async () => {
    await as(t.sara, (q) => q("select import_product_sales($1, $2::jsonb)", [c.a, rows("2026-03-01", "Viejo")]));
    await as(t.sara, (q) => q("select import_product_sales($1, $2::jsonb)", [c.a, rows("2026-04-01", "Otro")]));
    await as(t.sara, (q) => q("select import_product_sales($1, $2::jsonb)", [c.a, rows("2026-03-01", "Nuevo")]));
    const got = await sys<{ product_title: string }>("select product_title from client_product_sales order by month");
    expect(got.map((r) => r.product_title)).toEqual(["Nuevo", "Otro"]);
    await expect(as(t.sara, (q) => q("select import_product_sales($1, '[]'::jsonb)", [c.a]))).rejects.toThrow();
    await expect(as(t.sara, (q) => q("select import_product_sales($1, $2::jsonb)", [c.b, rows("2026-03-01")]))).rejects.toThrow();
  });
});

describe("gastos mensuales: los ve todo el equipo, los escribe la Propiedad", () => {
  it("miembro lee y no escribe", async () => {
    await as(t.maite, (q) => q("insert into client_monthly_expenses (client_id, month, amount, comment) values ($1, '2026-04-01', 100, 'oficina')", [c.a]));
    expect(await count(t.sara, "client_monthly_expenses", c.a)).toBe(1);
    await expect(as(t.sara, (q) => q("insert into client_monthly_expenses (client_id, month, amount) values ($1, '2026-05-01', 1)", [c.a]))).rejects.toThrow();
  });
});

describe("cliente archivado", () => {
  it("no admite cambios", async () => {
    await sys("update clients set archived_at = now() where id = $1", [c.a]);
    await expect(addProduct(t.maite, c.a)).rejects.toThrow();
    await expect(addCost(t.maite, c.a)).rejects.toThrow();
    await expect(as(t.maite, (q) => q("select replace_products($1, '[{\"family\":\"x\",\"position\":0}]'::jsonb)", [c.a]))).rejects.toThrow();
  });
});
