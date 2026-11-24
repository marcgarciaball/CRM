import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Driver } from "@/lib/db/types";
import { as, setupDb, type Clients, type Team } from "./helpers";

// Cifras inventadas. Acciones de Rentabilidad con la persona de `session.user`.
const session = vi.hoisted(() => ({ user: "" }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/auth", async () => {
  const { withUser } = await import("@/lib/db");
  const { getProfile } = await import("@/lib/services/core");
  return { requireUser: async () => (await withUser(session.user, (q) => getProfile(q, session.user)))! };
});

const A = await import("@/app/actions/profit");
const S = await import("@/lib/services/profit");
const { parseDecimal } = await import("@/lib/profit/form");

let driver: Driver;
let t: Team;
let c: Clients;
beforeAll(async () => ({ driver, team: t, c } = await setupDb()));
afterAll(() => driver.close());
const sys = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => driver.transaction((q) => q<T>(sql, params));
beforeEach(async () => {
  session.user = t.maite;
  for (const table of ["client_cost_settings", "client_fixed_costs", "client_products", "client_product_sales", "client_monthly_expenses"]) {
    await sys(`delete from ${table}`);
  }
  await sys("update clients set archived_at = null");
});
const form = (fields: Record<string, string | File>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};
const csv = (content: string, name = "datos.csv") => new File([content], name, { type: "text/csv" });
const SALES_HEADER = `"Month","Product title","Product variant title","Net sales","Quantity ordered","Reversed quantity","Orders","Month (20250101)","Net sales (20250101)","Quantity ordered (20250101)","Reversed quantity (20250101)","Orders (20250101)"`;
const salesFile = (month: string, title: string) => `${SALES_HEADER}\n"${month}-01","${title}","A6",10,1,0,1,"2025-01-01",0,0,0,0`;

describe("números de formulario", () => {
  it.each([
    ["1234.5", 1234.5], ["1.234,5", 1234.5], ["1234,5", 1234.5], ["1.234", 1234], ["0.5", 0.5], ["0,500", 0.5], ["", null], [" 7 ", 7],
  ])("%j → %j", (v, n) => expect(parseDecimal(v, "x")).toBe(n));
  it("rechaza lo que no es un número", () => expect(() => parseDecimal("12a", "el precio")).toThrow("El precio no es un número"));
});

describe("supuestos", () => {
  it("cualquiera del equipo los guarda; los porcentajes se escriben en %", async () => {
    session.user = t.sara;
    const r = await A.saveSettingsAction(null, form({ client_id: c.a, iva: "21", merma_tela: "35", precio_tela_m2: "7,00", horas_productivas_anuales: "3.200", tinta_m2: "" }));
    expect(r).toMatchObject({ ok: true });
    const s = await as(t.sara, (q) => S.getSettings(q, c.a));
    expect(s).toMatchObject({ iva: 0.21, merma_tela: 0.35, precio_tela_m2: 7, horas_productivas_anuales: 3200, tinta_m2: null, comision_pct: null });
  });
});

describe("costes fijos", () => {
  it("la Propiedad los crea, cambia y borra; un miembro solo ve totales", async () => {
    await A.saveFixedCostAction(null, form({ client_id: c.a, group: "personal", concept: "Salarios", monthly_amount: "2.000", note: "" }));
    const [row] = await as(t.maite, (q) => S.listFixedCosts(q, c.a));
    expect(row).toMatchObject({ group: "personal", concept: "Salarios", monthly_amount: 2000 });
    await A.saveFixedCostAction(null, form({ id: row.id, client_id: c.a, group: "personal", concept: "Salarios", monthly_amount: "2500", note: "" }));
    expect(await as(t.sara, (q) => S.fixedCostTotals(q, c.a))).toEqual({ personal: 2500, estructura: 0 });
    expect(await as(t.sara, (q) => S.listFixedCosts(q, c.a))).toEqual([]);
    session.user = t.sara;
    expect(await A.saveFixedCostAction(null, form({ client_id: c.a, group: "personal", concept: "X", monthly_amount: "1", note: "" })))
      .toMatchObject({ error: "Solo la Propiedad puede cambiar los costes fijos." });
    session.user = t.maite;
    await A.deleteFixedCostAction(null, form({ client_id: c.a, id: row.id }));
    expect(await as(t.maite, (q) => S.listFixedCosts(q, c.a))).toEqual([]);
  });
});

describe("productos", () => {
  it("un miembro crea y edita; borrar es de la Propiedad", async () => {
    session.user = t.sara;
    expect(await A.saveProductAction(null, form({
      client_id: c.a, family: "Lámina", format: "A5", price: "20", fabric_w_cm: "14,8", fabric_h_cm: "21", minutes: "3",
      support_cost: "1,10", packaging_cost: "0,5", shopify_title: "Revelado en lámina", variant_match: "15x21cm", active: "on", note: "",
    }))).toMatchObject({ ok: true });
    const [p] = await as(t.sara, (q) => S.listProducts(q, c.a));
    expect(p).toMatchObject({ family: "Lámina", price: 20, fabric_w_cm: 14.8, support_cost: 1.1, active: true, variant_match: "15x21cm" });
    await A.saveProductAction(null, form({ id: p.id, client_id: c.a, family: "Lámina", format: "A5", price: "22", note: "" }));
    expect((await as(t.sara, (q) => S.listProducts(q, c.a)))[0]).toMatchObject({ price: 22, active: false, shopify_title: null });
    expect(await A.deleteProductAction(null, form({ client_id: c.a, id: p.id }))).toMatchObject({ error: "Solo la Propiedad puede borrar productos." });
    session.user = t.maite;
    await A.deleteProductAction(null, form({ client_id: c.a, id: p.id }));
    expect(await as(t.maite, (q) => S.listProducts(q, c.a))).toEqual([]);
  });
});

describe("gastos mensuales", () => {
  it("la Propiedad los guarda y borra; el equipo los lee", async () => {
    await A.saveExpenseAction(null, form({ client_id: c.a, month: "2026-04", amount: "18.610", comment: "abrimos oficinas" }));
    expect(await as(t.sara, (q) => S.listExpenses(q, c.a))).toEqual([{ month: "2026-04", amount: 18610, comment: "abrimos oficinas" }]);
    session.user = t.sara;
    expect(await A.saveExpenseAction(null, form({ client_id: c.a, month: "2026-05", amount: "1", comment: "" })))
      .toMatchObject({ error: "Solo la Propiedad puede cambiar los gastos." });
    session.user = t.maite;
    await A.deleteExpenseAction(null, form({ client_id: c.a, month: "2026-04" }));
    expect(await as(t.maite, (q) => S.listExpenses(q, c.a))).toEqual([]);
  });
});

describe("importar", () => {
  const products = "familia,formato,precio,tela_ancho_cm,tela_alto_cm,minutos,soporte,embalaje,producto_shopify,variante_contiene,activo,nota\nMarcos,A4,42,,,15,9,4,,,,\nTela,A6,10,10.5,14.8,3,,0.5,,,,";
  const fixed = "grupo,concepto,importe_mes,nota\npersonal,Salarios,2000,\nestructura,Tinta,90,";

  it("escandallo y costes fijos: Propiedad y SUSTITUIR", async () => {
    expect((await A.importProfitAction(null, form({ client_id: c.a, file: csv(products) })))?.error).toBe("Escribe SUSTITUIR para confirmar: se borra la lista actual.");
    expect(await A.importProfitAction(null, form({ client_id: c.a, file: csv(products), confirm: "SUSTITUIR" }))).toMatchObject({ notice: "Escandallo: 2 productos." });
    expect(await A.importProfitAction(null, form({ client_id: c.a, file: csv(fixed), confirm: "SUSTITUIR" }))).toMatchObject({ notice: "Costes fijos: 2 líneas." });
    expect(await as(t.maite, (q) => S.fixedCostTotals(q, c.a))).toEqual({ personal: 2000, estructura: 90 });
    session.user = t.sara;
    expect((await A.importProfitAction(null, form({ client_id: c.a, file: csv(products), confirm: "SUSTITUIR" })))?.error).toBe("Solo la Propiedad puede sustituir el escandallo.");
    expect((await as(t.sara, (q) => S.listProducts(q, c.a))).map((p) => p.family)).toEqual(["Marcos", "Tela"]);
  });

  it("ventas por producto: cualquiera del equipo; sustituye solo sus meses", async () => {
    session.user = t.sara;
    expect(await A.importProfitAction(null, form({ client_id: c.a, file: csv(salesFile("2026-03", "Viejo")) }))).toMatchObject({ notice: "Ventas por producto: 1 fila en 1 mes." });
    await A.importProfitAction(null, form({ client_id: c.a, file: csv(salesFile("2026-04", "Otro")) }));
    await A.importProfitAction(null, form({ client_id: c.a, file: csv(salesFile("2026-03", "Nuevo")) }));
    const rows = await as(t.sara, (q) => S.listProductSales(q, c.a, "2026-01", "2026-12"));
    expect(rows.map((r) => [r.month, r.product_title, r.net_sales])).toEqual([["2026-03", "Nuevo", 10], ["2026-04", "Otro", 10]]);
    expect(await as(t.sara, (q) => S.shopifyTitles(q, c.a))).toEqual(["Nuevo", "Otro"]);
  });

  it("gastos: solo la Propiedad", async () => {
    expect(await A.importProfitAction(null, form({ client_id: c.a, file: csv("mes,gastos,comentario\n2026-04,100,x\n2026-05,200,") }))).toMatchObject({ notice: "Gastos: 2 meses." });
    session.user = t.sara;
    expect((await A.importProfitAction(null, form({ client_id: c.a, file: csv("mes,gastos,comentario\n2026-06,1,") })))?.error).toBe("Solo la Propiedad puede cambiar los gastos.");
  });

  it("un archivo que no es de Rentabilidad no escribe nada", async () => {
    expect((await A.importProfitAction(null, form({ client_id: c.a, file: csv("mes,ventas_totales\n2026-01,1") })))?.error).toContain("No reconozco el archivo");
    expect((await sys("select 1 from client_products")).length).toBe(0);
  });

  it("cliente archivado o ajeno: error", async () => {
    session.user = t.sara;
    expect((await A.importProfitAction(null, form({ client_id: c.b, file: csv(salesFile("2026-03", "X")) })))?.error).toBeTruthy();
    await sys("update clients set archived_at = now() where id = $1", [c.a]);
    session.user = t.maite;
    expect((await A.saveSettingsAction(null, form({ client_id: c.a, iva: "21" })))?.error).toBeTruthy();
  });
});
