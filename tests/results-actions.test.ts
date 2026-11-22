import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Driver } from "@/lib/db/types";
import { as, setupDb, type Clients, type Team } from "./helpers";

// Cifras inventadas. Las acciones se ejecutan fuera de Next con la persona de `session.user`.
const session = vi.hoisted(() => ({ user: "" }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/auth", async () => {
  const { withUser } = await import("@/lib/db");
  const { getProfile } = await import("@/lib/services/core");
  return { requireUser: async () => (await withUser(session.user, (q) => getProfile(q, session.user)))! };
});

const { importResultsAction, clearResultsAction } = await import("@/app/actions/results");
const { lastImports, listMetaCampaigns, listMetaMonths, listMonthly } = await import("@/lib/services/results");

let driver: Driver;
let t: Team;
let c: Clients;
beforeAll(async () => ({ driver, team: t, c } = await setupDb()));
afterAll(() => driver.close());
const sys = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => driver.transaction((q) => q<T>(sql, params));
beforeEach(async () => {
  session.user = t.sara;
  await sys("delete from client_metrics_monthly");
  await sys("delete from client_meta_ads");
  await sys("update clients set archived_at = null");
});

const monthlyCsv = (rows: [string, number][]) =>
  ["mes,ventas_totales,pedidos", ...rows.map(([m, v]) => `${m},${v},${v / 10}`)].join("\n");
const META_HEADER = `"Nombre de la campaña","Nombre del anuncio",Mes,Alcance,Divisa,"CPC (Coste por clic en el enlace)","Clics (todos)",Impresiones,Frecuencia,"Importe gastado (EUR)",Compras,"Coste por compra","Inicio del informe","Fin del informe"`;
const metaCsv = (rows: [string, string, number][]) =>
  [META_HEADER, ...rows.map(([camp, m, spend]) => `"${camp}","Ad","${m}-01 - ${m}-28",10,EUR,0.1,5,100,1,${spend},1,,${m}-01,${m}-28`)].join("\n");

const importFile = (client: string, content: string, name = "datos.csv") => {
  const fd = new FormData();
  fd.set("client_id", client);
  fd.set("file", new File([content], name, { type: "text/csv" }));
  return importResultsAction(null, fd);
};
const clear = (client: string, confirm = "BORRAR") => {
  const fd = new FormData();
  fd.set("client_id", client);
  fd.set("confirm", confirm);
  return clearResultsAction(null, fd);
};
const counts = async () => (await sys<{ m: number; a: number }>(
  "select (select count(*)::int from client_metrics_monthly) as m, (select count(*)::int from client_meta_ads) as a",
))[0];

describe("importar el histórico mensual", () => {
  it("añade meses y, al volver a subir, sustituye los que trae sin tocar los demás", async () => {
    expect(await importFile(c.a, monthlyCsv([["2026-01", 100], ["2026-02", 200], ["2026-03", 300]]))).toMatchObject({
      ok: true, notice: "Histórico mensual: 3 meses (3 nuevos, 0 sustituidos).",
    });
    expect(await importFile(c.a, monthlyCsv([["2026-02", 250], ["2026-03", 350], ["2026-04", 400]]))).toMatchObject({
      ok: true, notice: "Histórico mensual: 3 meses (1 nuevo, 2 sustituidos).",
    });
    const rows = await as(t.sara, (q) => listMonthly(q, c.a));
    expect(rows.map((r) => [r.month, r.ventas_totales])).toEqual([["2026-01", 100], ["2026-02", 250], ["2026-03", 350], ["2026-04", 400]]);
    expect(rows[0].ventas_brutas).toBeNull();
  });

  it("avisa de las columnas que faltan", async () => {
    const r = await importFile(c.a, monthlyCsv([["2026-01", 100]]));
    expect(r?.warning).toMatch(/Faltan columnas/);
  });
});

describe("importar el informe de Meta", () => {
  it("sustituye solo los meses que trae el archivo", async () => {
    expect(await importFile(c.a, metaCsv([["Uno", "2026-03", 10], ["Dos", "2026-04", 20]]))).toMatchObject({
      ok: true, notice: "Meta Ads: 2 filas en 2 meses.",
    });
    await importFile(c.a, metaCsv([["Tres", "2026-04", 5]]));
    const rows = await sys<{ campaign_name: string }>("select campaign_name from client_meta_ads order by month, campaign_name");
    expect(rows.map((r) => r.campaign_name)).toEqual(["Uno", "Tres"]);
  });

  it("suma por mes y por campaña con números, de mayor a menor gasto", async () => {
    await importFile(c.a, metaCsv([["Uno", "2026-03", 10], ["Dos", "2026-03", 30], ["Dos", "2026-04", 5]]));
    const months = await as(t.sara, (q) => listMetaMonths(q, c.a));
    expect(months).toEqual([
      { month: "2026-03", spend: 40, impressions: 200, clicks: 10, purchases: 2 },
      { month: "2026-04", spend: 5, impressions: 100, clicks: 5, purchases: 1 },
    ]);
    const camps = await as(t.sara, (q) => listMetaCampaigns(q, c.a, "2026-01", "2026-12"));
    expect(camps.map((x) => [x.campaign_name, x.spend, x.months])).toEqual([["Dos", 35, ["2026-03", "2026-04"]], ["Uno", 10, ["2026-03"]]]);
    expect((await as(t.sara, (q) => listMetaCampaigns(q, c.a, "2026-04", "2026-04"))).map((x) => x.spend)).toEqual([5]);
  });

  it("recuerda quién importó cada archivo", async () => {
    await importFile(c.a, metaCsv([["Uno", "2026-03", 10]]));
    const last = await as(t.sara, (q) => lastImports(q, c.a));
    expect(last.meta?.by).toBe("Sara");
    expect(last.monthly).toBeNull();
  });
});

describe("archivos no válidos o sin permiso: no se escribe nada", () => {
  it.each([
    ["cabecera desconocida", "Order,Total\n1,2", "datos.csv", "No reconozco el archivo"],
    ["extensión", monthlyCsv([["2026-01", 1]]), "datos.xlsx", "Sube un archivo .csv."],
    ["vacío", "", "datos.csv", "El archivo está vacío."],
    ["demasiado grande", `mes,ventas_totales\n${"2026-01,1\n".repeat(60_000)}`, "datos.csv", "El archivo pesa más de 512 KB."],
  ])("%s", async (_label, content, name, message) => {
    const r = await importFile(c.a, content, name);
    expect(r?.error).toContain(message);
    expect(await counts()).toEqual({ m: 0, a: 0 });
  });

  it("en un cliente ajeno", async () => {
    expect((await importFile(c.b, monthlyCsv([["2026-01", 1]])))?.error).toBeTruthy();
    expect(await counts()).toEqual({ m: 0, a: 0 });
  });

  it("en un cliente archivado", async () => {
    await sys("update clients set archived_at = now() where id = $1", [c.a]);
    expect((await importFile(c.a, monthlyCsv([["2026-01", 1]])))?.error).toBeTruthy();
    expect(await counts()).toEqual({ m: 0, a: 0 });
  });
});

describe("borrar todos los resultados", () => {
  const seed = async () => {
    session.user = t.ecommerce; // propietaria de A y de B
    await importFile(c.a, monthlyCsv([["2026-01", 1]]));
    await importFile(c.a, metaCsv([["Uno", "2026-03", 10]]));
    await importFile(c.b, monthlyCsv([["2026-01", 1]]));
  };

  it("un miembro no puede", async () => {
    await seed();
    session.user = t.sara;
    expect(await clear(c.a)).toMatchObject({ error: "Solo la Propiedad puede borrar los resultados." });
    expect(await counts()).toEqual({ m: 2, a: 1 });
  });

  it("pide escribir BORRAR", async () => {
    await seed();
    session.user = t.maite;
    expect((await clear(c.a, "borrar todo"))?.error).toBe("Escribe BORRAR para confirmar.");
    expect(await counts()).toEqual({ m: 2, a: 1 });
  });

  it("la Propiedad borra los de su cliente y no los de otro", async () => {
    await seed();
    session.user = t.maite;
    expect(await clear(c.a)).toMatchObject({ ok: true, notice: "Resultados borrados." });
    expect(await counts()).toEqual({ m: 1, a: 0 });
  });
});
