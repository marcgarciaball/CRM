import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Driver } from "@/lib/db/types";
import { as, setupDb, type Clients, type Team } from "./helpers";

// Cifras inventadas. Reglas de acceso de las tablas de resultados.
let driver: Driver;
let t: Team;
let c: Clients;
beforeAll(async () => ({ driver, team: t, c } = await setupDb()));
afterAll(() => driver.close());
const sys = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => driver.transaction((q) => q<T>(sql, params));
beforeEach(async () => {
  await sys("delete from client_metrics_monthly");
  await sys("delete from client_meta_ads");
  await sys("update clients set archived_at = null");
});

const addMonth = (user: string, client: string, month = "2026-03-01") =>
  as(user, (q) => q("insert into client_metrics_monthly (client_id, month, ventas_totales) values ($1, $2, 100)", [client, month]));
const countMonths = (user: string, client: string) =>
  as(user, (q) => q<{ n: number }>("select count(*)::int as n from client_metrics_monthly where client_id = $1", [client])).then((r) => r[0].n);
const addAd = (user: string, client: string, month: string, campaign = "Camp") =>
  as(user, (q) => q("insert into client_meta_ads (client_id, month, campaign_name, spend) values ($1, $2, $3, 5)", [client, month, campaign]));

describe("histórico mensual", () => {
  it("lo ven y lo escriben las personas del cliente, nadie más", async () => {
    await addMonth(t.sara, c.a);
    expect(await countMonths(t.elisa, c.a)).toBe(1);
    expect(await countMonths(t.lonely, c.a)).toBe(0);
    await addMonth(t.ecommerce, c.b);
    expect(await countMonths(t.sara, c.b)).toBe(0);
  });

  it("no se escribe en un cliente ajeno", async () => {
    await expect(addMonth(t.sara, c.b)).rejects.toThrow();
  });

  it("solo la Propiedad borra", async () => {
    await addMonth(t.sara, c.a);
    await as(t.sara, (q) => q("delete from client_metrics_monthly where client_id = $1", [c.a]));
    expect(await countMonths(t.maite, c.a)).toBe(1);
    await as(t.maite, (q) => q("delete from client_metrics_monthly where client_id = $1", [c.a]));
    expect(await countMonths(t.maite, c.a)).toBe(0);
  });

  it("un cliente archivado es de solo lectura", async () => {
    await addMonth(t.maite, c.a);
    await sys("update clients set archived_at = now() where id = $1", [c.a]);
    await expect(addMonth(t.maite, c.a, "2026-04-01")).rejects.toThrow();
    expect(await countMonths(t.maite, c.a)).toBe(1);
  });

  it("el mes es el día 1 y datos_hasta cae dentro del mes", async () => {
    await expect(addMonth(t.maite, c.a, "2026-03-15")).rejects.toThrow();
    await expect(as(t.maite, (q) => q(
      "insert into client_metrics_monthly (client_id, month, data_until) values ($1, '2026-03-01', '2026-04-01')", [c.a],
    ))).rejects.toThrow();
  });

  it("guarda quién importó", async () => {
    await addMonth(t.sara, c.a);
    const [r] = await sys<{ imported_by: string }>("select imported_by from client_metrics_monthly");
    expect(r.imported_by).toBe(t.sara);
  });
});

describe("informe de Meta", () => {
  it("una persona del cliente sustituye meses con delete_meta_months; en un cliente ajeno, no", async () => {
    await addAd(t.sara, c.a, "2026-03-01");
    await addAd(t.sara, c.a, "2026-04-01");
    await as(t.sara, (q) => q("select delete_meta_months($1, array['2026-03-01']::date[])", [c.a]));
    const rows = await as(t.sara, (q) => q<{ month: string }>("select month from client_meta_ads where client_id = $1", [c.a]));
    expect(rows.map((r) => r.month)).toEqual(["2026-04-01"]);
    await expect(as(t.sara, (q) => q("select delete_meta_months($1, array['2026-04-01']::date[])", [c.b]))).rejects.toThrow();
  });

  it("un miembro no borra filas directamente", async () => {
    await addAd(t.sara, c.a, "2026-03-01");
    await as(t.sara, (q) => q("delete from client_meta_ads where client_id = $1", [c.a]));
    expect((await sys("select 1 from client_meta_ads")).length).toBe(1);
  });

  it("no admite dos filas iguales de campaña, anuncio y mes", async () => {
    await addAd(t.sara, c.a, "2026-03-01");
    await expect(addAd(t.sara, c.a, "2026-03-01")).rejects.toThrow();
  });

  it("delete_meta_months no funciona en un cliente archivado", async () => {
    await addAd(t.maite, c.a, "2026-03-01");
    await sys("update clients set archived_at = now() where id = $1", [c.a]);
    await expect(as(t.maite, (q) => q("select delete_meta_months($1, array['2026-03-01']::date[])", [c.a]))).rejects.toThrow();
  });
});
