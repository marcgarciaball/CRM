import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assetProblem, parseAssetPath } from "@/lib/assets";
import type { Driver } from "@/lib/db/types";
import { addAsset, assetsByDeliverable, getAsset, listAssets, moveAsset, removeAsset, uploadTarget } from "@/lib/services/assets";
import { getCampaign, createCampaign } from "@/lib/services/campaigns";
import { createClient, setClientArchived } from "@/lib/services/clients";
import { listActivity } from "@/lib/services/core";
import { createDeliverable, getDeliverable, transitionDeliverable, updateDeliverable } from "@/lib/services/deliverables";
import { as, setupDb, type Clients, type Team } from "./helpers";

let driver: Driver;
let t: Team;
let c: Clients;
beforeAll(async () => ({ driver, team: t, c } = await setupDb()));
afterAll(() => driver.close());

const piece = (extra = {}) => ({
  client_id: c.a, title: "Post: qué hace un ingeniero de datos", channel: "linkedin" as const, campaign_id: null, owner_id: null, planned_date: "2026-11-18", ...extra,
});
const create = (extra = {}) => as(t.sara, (q) => createDeliverable(q, piece(extra)));
const get = (id: string) => as(t.sara, (q) => getDeliverable(q, id)).then((d) => d!);
async function approved(extra = {}) {
  const id = await create(extra);
  await as(t.sara, (q) => transitionDeliverable(q, id, "in_review"));
  await as(t.maite, (q) => transitionDeliverable(q, id, "approved"));
  return id;
}
const file = (deliverableId: string, clientId = c.a, name = "final.jpg") => ({
  deliverable_id: deliverableId, kind: "image" as const, storage_path: `${clientId}/${deliverableId}/${randomUUID()}.jpg`,
  file_name: name, mime_type: "image/jpeg" as const, size_bytes: 1234,
});

describe("campos de la diapositiva", () => {
  it("guarda formatos, tipo de creatividad, inspo y copy in, y admite el canal LinkedIn", async () => {
    const id = await create({ formats: "1080×1350 · Story", creative_format: "carousel", inspo: "https://example.test/ref", copy_in: "Tu fábrica produce." });
    expect(await get(id)).toMatchObject({ channel: "linkedin", formats: "1080×1350 · Story", creative_format: "carousel", inspo: "https://example.test/ref", copy_in: "Tu fábrica produce." });
    await expect(as(t.sara, (q) => updateDeliverable(q, id, null, { creative_format: "gif" as never }))).rejects.toMatchObject({ code: "23514" });
  });

  it("cambiar el copy in crea una revisión y devuelve a revisión lo validado; la inspo y los formatos no", async () => {
    const id = await approved();
    await as(t.sara, (q) => updateDeliverable(q, id, null, { inspo: "Referencias nuevas", formats: "9:16", creative_format: "dynamic" }));
    expect(await get(id)).toMatchObject({ status: "approved", revision: 1 });
    await as(t.sara, (q) => updateDeliverable(q, id, null, { copy_in: "Titular nuevo dentro de la pieza" }));
    expect(await get(id)).toMatchObject({ status: "in_review", revision: 2 });
  });
});

describe("estados de espera, pausa y descarte", () => {
  it("se puede aparcar desde preparación y retomar", async () => {
    const id = await create();
    for (const parked of ["waiting_client", "waiting_marketing", "on_hold"] as const) {
      await as(t.sara, (q) => transitionDeliverable(q, id, parked));
      expect((await get(id)).status).toBe(parked);
    }
    await as(t.sara, (q) => transitionDeliverable(q, id, "in_preparation"));
    expect((await get(id)).status).toBe("in_preparation");
  });

  it("aparcar no es un atajo para validar: sin validación no vuelve a «validado» ni se programa", async () => {
    const id = await create();
    await as(t.sara, (q) => transitionDeliverable(q, id, "in_review"));
    await as(t.sara, (q) => transitionDeliverable(q, id, "on_hold"));
    await expect(as(t.sara, (q) => transitionDeliverable(q, id, "approved"))).rejects.toThrow(/no está aprobada/);
    await expect(as(t.maite, (q) => transitionDeliverable(q, id, "approved"))).rejects.toThrow(/no está aprobada/);
    await expect(as(t.sara, (q) => transitionDeliverable(q, id, "scheduled"))).rejects.toThrow(/no permitido/);
    await expect(as(t.sara, (q) => transitionDeliverable(q, id, "published", { published_on: "2026-11-18" }))).rejects.toThrow(/no permitido/);
  });

  it("lo validado que se aparca vuelve a «validado» si no ha cambiado, y a revisión si ha cambiado", async () => {
    const same = await approved();
    await as(t.elisa, (q) => transitionDeliverable(q, same, "waiting_marketing"));
    await as(t.elisa, (q) => transitionDeliverable(q, same, "approved"));
    expect(await get(same)).toMatchObject({ status: "approved", approved_revision: 1 });

    const changed = await approved();
    await as(t.elisa, (q) => transitionDeliverable(q, changed, "waiting_client"));
    await as(t.sara, (q) => updateDeliverable(q, changed, null, { copy: "Texto nuevo del cliente" }));
    expect(await get(changed)).toMatchObject({ status: "waiting_client", revision: 2 });
    await expect(as(t.elisa, (q) => transitionDeliverable(q, changed, "approved"))).rejects.toThrow(/no está aprobada/);
    await as(t.elisa, (q) => transitionDeliverable(q, changed, "in_review"));
    await as(t.maite, (q) => transitionDeliverable(q, changed, "approved"));
    expect(await get(changed)).toMatchObject({ status: "approved", approved_revision: 2 });
  });

  it("lo descartado solo se recupera a preparación, lo publicado no se aparca, y todo queda en el historial", async () => {
    const id = await approved();
    await as(t.sara, (q) => transitionDeliverable(q, id, "discarded"));
    await expect(as(t.sara, (q) => transitionDeliverable(q, id, "approved"))).rejects.toThrow(/no permitido/);
    await expect(as(t.sara, (q) => transitionDeliverable(q, id, "on_hold"))).rejects.toThrow(/no permitido/);
    await as(t.sara, (q) => transitionDeliverable(q, id, "in_preparation"));
    const log = await as(t.sara, (q) => listActivity(q, "deliverable", id));
    expect(log.filter((a) => a.action === "status").map((a) => a.detail.to)).toEqual(["in_preparation", "discarded", "approved", "in_review"]);

    const published = await approved();
    await as(t.elisa, (q) => transitionDeliverable(q, published, "published", { published_on: "2026-11-18" }));
    await expect(as(t.elisa, (q) => transitionDeliverable(q, published, "on_hold"))).rejects.toThrow(/publicado no cambia/);
  });

  it("lo descartado no cuenta en el progreso de la campaña", async () => {
    const campaign = await as(t.maite, (q) => createCampaign(q, { client_id: c.a, name: "Black Days", start_date: null, end_date: null, owner_id: null }));
    const keep = await create({ campaign_id: campaign });
    const drop = await create({ campaign_id: campaign });
    await as(t.sara, (q) => transitionDeliverable(q, drop, "discarded"));
    expect((await as(t.sara, (q) => getCampaign(q, campaign)))!.deliverables_total).toBe(1);
    expect(keep).toBeTruthy();
  });
});

describe("creatividad final (archivos)", () => {
  it("los archivos se guardan en el orden de subida y se pueden reordenar (carrusel)", async () => {
    const id = await create({ creative_format: "carousel" });
    const ids: string[] = [];
    for (const name of ["01.jpg", "02.jpg", "03.jpg"]) ids.push(await as(t.ainhoa, (q) => addAsset(q, file(id, c.a, name))));
    const names = async () => (await as(t.sara, (q) => listAssets(q, id))).map((a) => a.file_name);
    expect(await names()).toEqual(["01.jpg", "02.jpg", "03.jpg"]);
    await as(t.ainhoa, (q) => moveAsset(q, ids[2], -1));
    expect(await names()).toEqual(["01.jpg", "03.jpg", "02.jpg"]);
    await as(t.ainhoa, (q) => moveAsset(q, ids[0], -1)); // ya es el primero: no cambia nada
    await as(t.ainhoa, (q) => moveAsset(q, ids[0], 1));
    expect(await names()).toEqual(["03.jpg", "01.jpg", "02.jpg"]);
    await as(t.ainhoa, (q) => removeAsset(q, ids[0]));
    expect(await names()).toEqual(["03.jpg", "02.jpg"]);
    // Tras quitar uno, el siguiente archivo va al final.
    await as(t.ainhoa, (q) => addAsset(q, file(id, c.a, "04.jpg")));
    expect(await names()).toEqual(["03.jpg", "02.jpg", "04.jpg"]);
    expect((await as(t.sara, (q) => assetsByDeliverable(q, [id]))).get(id)).toHaveLength(3);
  });

  it("subir o quitar la creatividad final devuelve a revisión lo validado y lo registra; reordenar no", async () => {
    const id = await approved();
    const asset = await as(t.ainhoa, (q) => addAsset(q, file(id)));
    expect(await get(id)).toMatchObject({ status: "in_review", revision: 2 });
    await as(t.maite, (q) => transitionDeliverable(q, id, "approved"));
    const second = await as(t.ainhoa, (q) => addAsset(q, file(id, c.a, "b.jpg")));
    await as(t.maite, (q) => transitionDeliverable(q, id, "approved"));
    await as(t.ainhoa, (q) => moveAsset(q, second, -1));
    expect(await get(id)).toMatchObject({ status: "approved", revision: 3 });
    await as(t.ainhoa, (q) => removeAsset(q, asset));
    expect(await get(id)).toMatchObject({ status: "in_review", revision: 4 });
    const log = await as(t.sara, (q) => listActivity(q, "deliverable", id));
    expect(log.filter((a) => a.action === "creative_changed").map((a) => [a.detail.reason, a.detail.file]))
      .toEqual([["asset_removed", "final.jpg"], ["asset_added", "b.jpg"], ["asset_added", "final.jpg"]]);
  });

  it("la ruta tiene que ser la del cliente y el entregable: no se registra el fichero de otro", async () => {
    const id = await create();
    const other = await create();
    await expect(as(t.sara, (q) => addAsset(q, file(id, c.b)))).rejects.toThrow(/no corresponde/);
    await expect(as(t.sara, (q) => addAsset(q, { ...file(id), storage_path: file(other).storage_path }))).rejects.toThrow(/no corresponde/);
    const row = file(id);
    await as(t.sara, (q) => addAsset(q, row));
    await expect(as(t.sara, (q) => addAsset(q, row))).rejects.toMatchObject({ code: "23505" });
    await expect(as(t.sara, (q) => addAsset(q, { ...file(id), mime_type: "image/svg+xml" as never }))).rejects.toMatchObject({ code: "23514" });
  });

  it("como máximo 20 archivos por entregable", async () => {
    const id = await create();
    for (let i = 0; i < 20; i++) await as(t.sara, (q) => addAsset(q, file(id)));
    await expect(as(t.sara, (q) => addAsset(q, file(id)))).rejects.toThrow(/máximo 20/);
  });

  it("solo los miembros del cliente ven, suben, reordenan o quitan sus archivos", async () => {
    // Cliente B: ecommerce (propietaria) y elisa. Sara y ainhoa solo están en A.
    const inB = await as(t.ecommerce, (q) => createDeliverable(q, piece({ client_id: c.b })));
    const first = await as(t.elisa, (q) => addAsset(q, file(inB, c.b, "b1.jpg")));
    const second = await as(t.elisa, (q) => addAsset(q, file(inB, c.b, "b2.jpg")));

    for (const who of [t.sara, t.outsider, t.inactive, t.lonely]) {
      expect(await as(who, (q) => listAssets(q, inB))).toEqual([]);
      expect(await as(who, (q) => getAsset(q, first))).toBeNull();
      expect((await as(who, (q) => assetsByDeliverable(q, [inB]))).size).toBe(0);
      await expect(as(who, (q) => uploadTarget(q, inB))).rejects.toMatchObject({ code: "forbidden" });
      await expect(as(who, (q) => addAsset(q, file(inB, c.b)))).rejects.toMatchObject({ code: "42501" });
      await expect(as(who, (q) => removeAsset(q, first))).rejects.toMatchObject({ code: "not_found" });
      await expect(as(who, (q) => moveAsset(q, second, -1))).rejects.toMatchObject({ code: "not_found" });
    }
    expect((await as(t.elisa, (q) => listAssets(q, inB))).map((a) => a.file_name)).toEqual(["b1.jpg", "b2.jpg"]);
    expect(await as(t.elisa, (q) => uploadTarget(q, inB))).toEqual({ client_id: c.b, count: 2 });
  });

  it("en un cliente archivado los archivos se ven, pero no se suben ni se quitan", async () => {
    const clientId = await as(t.maite, (q) => createClient(q, { name: "Cliente que se archiva" }));
    const id = await as(t.maite, (q) => createDeliverable(q, piece({ client_id: clientId })));
    const asset = await as(t.maite, (q) => addAsset(q, file(id, clientId)));
    await as(t.maite, (q) => setClientArchived(q, clientId, true));
    expect(await as(t.maite, (q) => listAssets(q, id))).toHaveLength(1);
    await expect(as(t.maite, (q) => uploadTarget(q, id))).rejects.toMatchObject({ code: "forbidden" });
    await expect(as(t.maite, (q) => addAsset(q, file(id, clientId)))).rejects.toMatchObject({ code: "42501" });
    await expect(as(t.maite, (q) => removeAsset(q, asset))).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("reglas de archivos", () => {
  it("valida tipo y tamaño", () => {
    expect(assetProblem({ name: "a.jpg", type: "image/jpeg", size: 1000 })).toBeNull();
    expect(assetProblem({ name: "a.mp4", type: "video/mp4", size: 150 * 1024 * 1024 })).toBeNull();
    expect(assetProblem({ name: "a.svg", type: "image/svg+xml", size: 1000 })).toMatch(/formato no admitido/);
    expect(assetProblem({ name: "a.html", type: "text/html", size: 1000 })).toMatch(/formato no admitido/);
    expect(assetProblem({ name: "a.jpg", type: "image/jpeg", size: 21 * 1024 * 1024 })).toMatch(/pesa demasiado/);
    expect(assetProblem({ name: "a.jpg", type: "image/jpeg", size: 0 })).toMatch(/vacío/);
  });

  it("solo acepta rutas cliente/entregable/archivo generadas por el servidor", () => {
    const a = randomUUID(), b = randomUUID(), f = randomUUID();
    expect(parseAssetPath(`${a}/${b}/${f}.jpg`)).toEqual({ clientId: a, deliverableId: b });
    for (const bad of [`${a}/${b}/../x.jpg`, `../${a}/${b}/${f}.jpg`, `${a}/${b}/${f}.svg`, `${a}/${f}.jpg`, `/${a}/${b}/${f}.jpg`, `${a}/${b}/${f}.jpg/x`, ""]) {
      expect(parseAssetPath(bad)).toBeNull();
    }
  });
});
