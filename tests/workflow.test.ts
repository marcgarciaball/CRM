import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Driver } from "@/lib/db/types";
import { ConflictError, toAppError } from "@/lib/errors";
import { addComment, deletePermanently, listActivity, listComments, listProfiles } from "@/lib/services/core";
import { campaignsForRange, createCampaign, createNewsletterCampaign, getCampaign, listCampaigns, updateCampaign } from "@/lib/services/campaigns";
import { createDeliverable, getDeliverable, listDeliverables, listPublications, transitionDeliverable, updateDeliverable } from "@/lib/services/deliverables";
import {
  addNewLink, attachResource, bulkMaterials, findDuplicates, getContextualMaterials, listResources,
  markResourceUpdated, resourceImpact, unlink, updateLinkFlags, updateResource, getResource,
} from "@/lib/services/resources";
import { listNotices, markNoticesSeen, searchAll } from "@/lib/services/inbox";
import { createTask, getTask, listTasks, setTaskStatus, updateTask } from "@/lib/services/tasks";
import { as, setupDb, type Clients, type Team } from "./helpers";

let driver: Driver;
let t: Team;
let c: Clients;
beforeAll(async () => ({ driver, team: t, c } = await setupDb()));
afterAll(() => driver.close());

const newsletter = (campaign_id: string | null = null, extra = {}) => ({
  client_id: c.a, title: "Newsletter regalos de boda", channel: "newsletter" as const, campaign_id, owner_id: null, planned_date: "2026-11-20", ...extra,
});
/** Lleva un entregable nuevo hasta "aprobado" por el camino normal. */
async function approved(extra = {}) {
  const id = await as(t.sara, (q) => createDeliverable(q, newsletter(null, extra)));
  await as(t.sara, (q) => transitionDeliverable(q, id, "in_review"));
  await as(t.maite, (q) => transitionDeliverable(q, id, "approved"));
  return id;
}
const get = (id: string) => as(t.sara, (q) => getDeliverable(q, id)).then((d) => d!);

describe("flujo editorial principal", () => {
  it("campaña → newsletter → copy, enlaces, comentario → revisión → aprobación → programado → publicado", async () => {
    const campaignId = await as(t.maite, (q) =>
      createCampaign(q, { client_id: c.a, name: "Bodas de primavera", start_date: "2026-11-10", end_date: "2026-12-05", owner_id: t.maite }));
    const id = await as(t.maite, (q) => createDeliverable(q, newsletter(campaignId, { owner_id: t.elisa })));
    const copyTask = await as(t.maite, (q) => createTask(q, {
      client_id: c.a, title: "Copy", assignee_id: t.sara, due_date: "2026-11-12", priority: "high", campaign_id: null, deliverable_id: id }));
    const designTask = await as(t.maite, (q) => createTask(q, {
      client_id: c.a, title: "Diseño", assignee_id: t.ainhoa, due_date: "2026-11-14", priority: "medium", campaign_id: null, deliverable_id: id }));
    expect((await as(t.sara, (q) => listTasks(q, { assignee: t.sara }))).map((x) => x.id)).toContain(copyTask);
    expect((await as(t.ainhoa, (q) => getTask(q, designTask)))!.effective_campaign_id).toBe(campaignId);

    const d0 = await get(id);
    await as(t.sara, (q) => updateDeliverable(q, id, d0.version, { copy: "Regala recuerdos en tela." }));
    await as(t.sara, (q) => addNewLink(q, { type: "deliverable", id }, { title: "Texto de Sara", url: "https://docs.example.test/copy" }));
    await as(t.ainhoa, (q) => addNewLink(q, { type: "deliverable", id },
      { title: "Diseño de Ainhoa", url: "https://figma.example.test/file/1" }, { is_primary: true, requires_approval: true }));
    await as(t.sara, (q) => addComment(q, "deliverable", id, "Listo para revisar"));
    await as(t.sara, (q) => setTaskStatus(q, copyTask, "done"));
    await as(t.sara, (q) => transitionDeliverable(q, id, "in_review"));

    // Completar la tarea no publica el entregable.
    expect((await get(id)).status).toBe("in_review");
    // Una miembro no puede aprobar.
    await expect(as(t.sara, (q) => transitionDeliverable(q, id, "approved"))).rejects.toMatchObject({ code: "42501" });

    await as(t.maite, (q) => transitionDeliverable(q, id, "approved"));
    const d1 = await get(id);
    expect(d1).toMatchObject({ status: "approved", approved_by_name: "Maite", approved_revision: d1.revision });
    expect(d1.approved_at).toBeInstanceOf(Date);

    await as(t.elisa, (q) => transitionDeliverable(q, id, "scheduled"));
    await expect(as(t.elisa, (q) => transitionDeliverable(q, id, "published"))).rejects.toThrow(/fecha real/);
    await as(t.elisa, (q) => transitionDeliverable(q, id, "published", { published_on: "2026-11-21" }));

    // Persistencia: se vuelve a leer todo desde la base de datos.
    const d2 = await get(id);
    expect(d2).toMatchObject({ status: "published", planned_date: "2026-11-20", published_on: "2026-11-21", campaign_id: campaignId });
    expect(await as(t.sara, (q) => listPublications(q, id))).toMatchObject([{ revision: d2.revision, published_on: "2026-11-21", recorded_by_name: "Elisa" }]);
    expect((await as(t.sara, (q) => listComments(q, "deliverable", id)))[0]).toMatchObject({ body: "Listo para revisar", author_name: "Sara" });
    const history = await as(t.sara, (q) => listActivity(q, "deliverable", id));
    expect(history.filter((h) => h.action === "status").map((h) => h.detail.to)).toEqual(["published", "scheduled", "approved", "in_review"]);
    const nov = await as(t.sara, (q) => listDeliverables(q, { from: "2026-11-01", to: "2026-11-30" }));
    expect(nov.map((x) => x.id)).toContain(id);
  });

  it("programar exige fecha prevista", async () => {
    const id = await approved({ planned_date: null });
    await expect(as(t.elisa, (q) => transitionDeliverable(q, id, "scheduled"))).rejects.toThrow(/fecha prevista/);
    await as(t.elisa, (q) => transitionDeliverable(q, id, "scheduled", { planned_date: "2026-12-01" }));
    expect((await get(id)).status).toBe("scheduled");
  });

  it("no se puede saltar la revisión ni manipular los campos de aprobación", async () => {
    const id = await as(t.sara, (q) => createDeliverable(q, newsletter()));
    for (const to of ["approved", "scheduled", "published"] as const) {
      await expect(as(t.sara, (q) => transitionDeliverable(q, id, to, { published_on: "2026-11-21" }))).rejects.toThrow();
      await expect(as(t.maite, (q) => transitionDeliverable(q, id, to, { published_on: "2026-11-21" }))).rejects.toThrow();
    }
    // Ni creando el registro ya aprobado, ni escribiendo directamente las columnas protegidas.
    await expect(as(t.sara, (q) => q("insert into deliverables (client_id, title, channel, status) values ($1, 'x', 'other', 'approved')", [c.a]))).rejects.toThrow();
    await as(t.sara, (q) => q("update deliverables set approved_revision = revision, approved_by = $2, revision = 99 where id = $1", [id, t.sara]));
    expect(await get(id)).toMatchObject({ approved_revision: null, approved_by_name: null, revision: 1, status: "idea" });
    await as(t.sara, (q) => transitionDeliverable(q, id, "in_review"));
    await expect(as(t.sara, (q) => transitionDeliverable(q, id, "scheduled"))).rejects.toThrow();
    // El historial y las publicaciones no admiten escritura directa.
    await expect(as(t.sara, (q) => q("insert into publications (deliverable_id, revision, published_on) values ($1, 1, '2026-01-01')", [id]))).rejects.toThrow();
    await expect(as(t.sara, (q) => q("delete from activity_log"))).rejects.toThrow();
  });

  it("cambiar el copy aprobado exige una nueva revisión", async () => {
    const id = await approved();
    const before = await get(id);
    await as(t.sara, (q) => updateDeliverable(q, id, before.version, { copy: "Texto nuevo" }));
    const after = await get(id);
    expect(after).toMatchObject({ status: "in_review", revision: before.revision + 1, approved_revision: before.revision });
    await expect(as(t.elisa, (q) => transitionDeliverable(q, id, "scheduled"))).rejects.toThrow();
    await as(t.maite, (q) => transitionDeliverable(q, id, "approved"));
    expect((await get(id)).approved_revision).toBe(after.revision);
  });

  it("comentarios y cambios de fecha no invalidan la aprobación", async () => {
    const id = await approved();
    const d = await get(id);
    await as(t.elisa, (q) => addComment(q, "deliverable", id, "Lo muevo una semana"));
    await as(t.elisa, (q) => updateDeliverable(q, id, d.version, { planned_date: "2026-11-27" }));
    expect(await get(id)).toMatchObject({ status: "approved", revision: d.revision, planned_date: "2026-11-27" });
  });

  it("revisar un entregable publicado conserva su historial de publicación", async () => {
    const id = await approved();
    await as(t.elisa, (q) => transitionDeliverable(q, id, "published", { published_on: "2026-11-20" }));
    await expect(as(t.maite, (q) => transitionDeliverable(q, id, "in_preparation"))).rejects.toThrow(/nueva revisión/);
    const d = await get(id);
    await as(t.sara, (q) => updateDeliverable(q, id, d.version, { copy: "Versión corregida" }));
    expect(await get(id)).toMatchObject({ status: "in_review", published_on: "2026-11-20" });
    expect(await as(t.sara, (q) => listPublications(q, id))).toHaveLength(1);
    await as(t.maite, (q) => transitionDeliverable(q, id, "approved"));
    await as(t.elisa, (q) => transitionDeliverable(q, id, "published", { published_on: "2026-11-25" }));
    const pubs = await as(t.sara, (q) => listPublications(q, id));
    expect(pubs.map((p) => [p.revision, p.published_on])).toEqual([[d.revision + 1, "2026-11-25"], [d.revision, "2026-11-20"]]);
  });
});

describe("enlaces y materiales", () => {
  it("una referencia no invalida la aprobación; un diseño final sí", async () => {
    const id = await approved();
    const rev = (await get(id)).revision;
    await as(t.sara, (q) => addNewLink(q, { type: "deliverable", id }, { title: "Referencia", url: "https://example.test/ref" }));
    expect(await get(id)).toMatchObject({ status: "approved", revision: rev });
    await as(t.ainhoa, (q) => addNewLink(q, { type: "deliverable", id },
      { title: "Diseño final", url: "https://figma.example.test/final" }, { is_primary: true, requires_approval: true }));
    expect(await get(id)).toMatchObject({ status: "in_review", revision: rev + 1 });
    const log = await as(t.sara, (q) => listActivity(q, "deliverable", id));
    expect(log.find((l) => l.action === "material_changed")).toMatchObject({ actor_name: "Ainhoa", detail: { resource: "Diseño final" } });
  });

  it("cambiar o marcar como actualizado un material compartido invalida todos los entregables afectados", async () => {
    const a = await approved();
    const b = await approved();
    const ref = await approved(); // lo usa solo como referencia
    const resourceId = await as(t.ainhoa, (q) => addNewLink(q, { type: "deliverable", id: a },
      { title: "Diseño compartido", url: "https://figma.example.test/shared" }, { requires_approval: true }));
    await as(t.ainhoa, (q) => attachResource(q, { type: "deliverable", id: b }, resourceId, { requires_approval: true }));
    await as(t.ainhoa, (q) => attachResource(q, { type: "deliverable", id: ref }, resourceId));
    for (const id of [a, b]) await as(t.maite, (q) => transitionDeliverable(q, id, "approved"));
    await as(t.elisa, (q) => transitionDeliverable(q, b, "published", { published_on: "2026-11-20" }));

    const impact = await as(t.sara, (q) => resourceImpact(q, resourceId));
    expect(impact.uses).toBe(3);
    expect(impact.approvals.map((x) => x.id).sort()).toEqual([a, b].sort());

    await as(t.ainhoa, (q) => markResourceUpdated(q, resourceId));
    expect((await get(a)).status).toBe("in_review");
    expect((await get(b)).status).toBe("in_review");
    expect((await get(ref)).status).toBe("approved");
    expect(await as(t.sara, (q) => listPublications(q, b))).toHaveLength(1);

    await as(t.maite, (q) => transitionDeliverable(q, a, "approved"));
    const r = (await as(t.sara, (q) => getResource(q, resourceId)))!;
    await as(t.ainhoa, (q) => updateResource(q, resourceId, r.version, { title: r.title, url: "https://figma.example.test/shared-v2" }));
    expect((await get(a)).status).toBe("in_review");
    // Cambiar solo el título no invalida nada.
    await as(t.maite, (q) => transitionDeliverable(q, a, "approved"));
    await as(t.ainhoa, (q) => updateResource(q, resourceId, null, { title: "Otro título", url: "https://figma.example.test/shared-v2" }));
    expect((await get(a)).status).toBe("approved");
    // Fijar como principal tampoco; cambiar la marca de aprobación sí.
    const links = await as(t.sara, (q) => bulkMaterials(q, { deliverables: [a] }));
    await as(t.sara, (q) => updateLinkFlags(q, links[0].link_id, { is_primary: true }));
    expect((await get(a)).status).toBe("approved");
    await as(t.sara, (q) => updateLinkFlags(q, links[0].link_id, { requires_approval: false }));
    expect((await get(a)).status).toBe("in_review");
  });

  it("varios enlaces por registro, contexto heredado sin duplicados y reutilización sin copias", async () => {
    const campaignId = await as(t.maite, (q) => createCampaign(q, { client_id: c.a, name: "Marcos de madera", start_date: null, end_date: null, owner_id: null }));
    const deliverableId = await as(t.sara, (q) => createDeliverable(q, newsletter(campaignId)));
    const taskId = await as(t.sara, (q) => createTask(q, {
      client_id: c.a, title: "Maquetar", assignee_id: t.ainhoa, due_date: null, priority: "low", campaign_id: null, deliverable_id: deliverableId }));

    const folder = await as(t.maite, (q) => addNewLink(q, { type: "campaign", id: campaignId }, { title: "Carpeta de campaña", url: "https://drive.example.test/folder" }, { is_primary: true }));
    await as(t.maite, (q) => addNewLink(q, { type: "campaign", id: campaignId }, { title: "Landing", url: "https://demo.myshopify.com/pages/demo" }));
    const design = await as(t.ainhoa, (q) => addNewLink(q, { type: "deliverable", id: deliverableId }, { title: "Diseño de Ainhoa", url: "https://figma.example.test/d" }, { is_primary: true }));
    await as(t.sara, (q) => addNewLink(q, { type: "deliverable", id: deliverableId }, { title: "Texto de Sara", url: "https://docs.example.test/t" }));
    await as(t.ainhoa, (q) => addNewLink(q, { type: "task", id: taskId }, { title: "Exportables", url: "https://drive.example.test/export" }));
    await as(t.ainhoa, (q) => addNewLink(q, { type: "task", id: taskId }, { title: "Guía de estilo", url: "https://example.test/guide" }));
    // El mismo recurso enlazado también en la tarea: no se duplica al mostrar el contexto.
    await as(t.ainhoa, (q) => attachResource(q, { type: "task", id: taskId }, design));

    const ctx = await as(t.elisa, (q) => getContextualMaterials(q, { type: "task", id: taskId }));
    expect(ctx.own.map((m) => m.title).sort()).toEqual(["Diseño de Ainhoa", "Exportables", "Guía de estilo"]);
    expect(ctx.fromDeliverable.map((m) => m.title)).toEqual(["Texto de Sara"]);
    expect(ctx.fromCampaign.map((m) => m.title)).toEqual(["Carpeta de campaña", "Landing"]); // principal primero
    expect(ctx.deliverable?.id).toBe(deliverableId);
    expect(ctx.campaign?.id).toBe(campaignId);
    expect(ctx.usages.filter((u) => u.resource_id === design).map((u) => u.type).sort()).toEqual(["deliverable", "task"]);

    const dctx = await as(t.elisa, (q) => getContextualMaterials(q, { type: "deliverable", id: deliverableId }));
    expect(dctx.own.map((m) => m.title)).toEqual(["Diseño de Ainhoa", "Texto de Sara"]);
    expect(dctx.fromCampaign).toHaveLength(2);
    const cctx = await as(t.elisa, (q) => getContextualMaterials(q, { type: "campaign", id: campaignId }));
    expect(cctx.own).toHaveLength(2);

    // Un único registro de recurso con dos usos; desvincular uno no afecta al otro.
    const before = await as(t.sara, (q) => listResources(q, { search: "figma.example.test/d" }));
    expect(before).toHaveLength(1);
    const taskLink = ctx.own.find((m) => m.resource_id === design)!;
    await as(t.sara, (q) => unlink(q, taskLink.link_id));
    const after = await as(t.elisa, (q) => getContextualMaterials(q, { type: "task", id: taskId }));
    expect(after.own.map((m) => m.title).sort()).toEqual(["Exportables", "Guía de estilo"]);
    expect(after.fromDeliverable.map((m) => m.title)).toEqual(["Diseño de Ainhoa", "Texto de Sara"]);
    expect(await as(t.sara, (q) => listResources(q, { search: "figma.example.test/d" }))).toHaveLength(1);

    // Biblioteca: mismos registros, con filtro por campaña (incluye entregables y tareas de la campaña).
    const lib = await as(t.sara, (q) => listResources(q, { campaign: campaignId }));
    expect(lib).toHaveLength(6);
    expect(lib.find((r) => r.id === folder)?.created_by_name).toBe("Maite");
    expect(await as(t.sara, (q) => listResources(q, { campaign: campaignId, category: "store" }))).toHaveLength(1);
    // Enlazar dos veces lo mismo en el mismo registro no está permitido.
    await expect(as(t.sara, (q) => attachResource(q, { type: "campaign", id: campaignId }, folder))).rejects.toMatchObject({ code: "23505" });
  });

  it("valida URL http/https y detecta duplicados", async () => {
    const target = { type: "campaign" as const, id: await as(t.maite, (q) => createCampaign(q, { client_id: c.a, name: "X", start_date: null, end_date: null, owner_id: null })) };
    for (const url of ["javascript:alert(1)", "ftp://example.test/a", "no es una url", "https://user:pass@example.test"]) {
      await expect(as(t.sara, (q) => addNewLink(q, target, { title: "Malo", url }))).rejects.toThrow(/URL|enlaces/);
    }
    await expect(as(t.sara, (q) => q("insert into resources (client_id, title, url) values ($1, 'x', 'javascript:alert(1)')", [c.a]))).rejects.toThrow();
    await as(t.sara, (q) => addNewLink(q, target, { title: "Uno", url: "https://example.test/Dup/" }));
    expect(await as(t.sara, (q) => findDuplicates(q, c.a, "https://EXAMPLE.test/dup"))).toHaveLength(1);
    expect(await as(t.sara, (q) => findDuplicates(q, c.a, "https://example.test/otro"))).toHaveLength(0);
  });
});

describe("planificación mensual", () => {
  it("mover una publicación al mes siguiente conserva enlaces, comentarios, tareas e historial", async () => {
    const id = await as(t.sara, (q) => createDeliverable(q, newsletter(null, { title: "Post tela", channel: "instagram", planned_date: "2026-03-28" })));
    await as(t.sara, (q) => addNewLink(q, { type: "deliverable", id }, { title: "Foto", url: "https://drive.example.test/foto" }));
    await as(t.sara, (q) => addComment(q, "deliverable", id, "Pendiente de foto"));
    const taskId = await as(t.sara, (q) => createTask(q, { client_id: c.a, title: "Elegir foto", assignee_id: t.ainhoa, due_date: "2026-03-20", priority: "medium", campaign_id: null, deliverable_id: id }));
    const march = { from: "2026-03-01", to: "2026-03-31" }, april = { from: "2026-04-01", to: "2026-04-30" };
    expect((await as(t.sara, (q) => listDeliverables(q, march))).map((d) => d.id)).toContain(id);

    const current = await get(id);
    await as(t.elisa, (q) => updateDeliverable(q, id, current.version, { planned_date: "2026-04-02" }));

    expect((await as(t.sara, (q) => listDeliverables(q, march))).map((d) => d.id)).not.toContain(id);
    expect((await as(t.sara, (q) => listDeliverables(q, april))).map((d) => d.id)).toContain(id);
    expect((await as(t.sara, (q) => getContextualMaterials(q, { type: "deliverable", id }))).own).toHaveLength(1);
    expect(await as(t.sara, (q) => listComments(q, "deliverable", id))).toHaveLength(1);
    // La tarea mantiene su propia fecha límite y su relación.
    expect(await as(t.sara, (q) => getTask(q, taskId))).toMatchObject({ deliverable_id: id, due_date: "2026-03-20" });
    const log = await as(t.sara, (q) => listActivity(q, "deliverable", id));
    expect(log.find((l) => l.action === "planned_date")?.detail).toEqual({ from: "2026-03-28", to: "2026-04-02" });
    expect(log.some((l) => l.action === "created")).toBe(true);
  });

  it("una campaña que abarca dos meses aparece en ambos; lo no fechado va a «Sin planificar»", async () => {
    const spanning = await as(t.maite, (q) => createCampaign(q, { client_id: c.a, name: "San Valentín", start_date: "2027-01-25", end_date: "2027-02-14", owner_id: null }));
    const byContent = await as(t.maite, (q) => createCampaign(q, { client_id: c.a, name: "Sin fechas propias", start_date: null, end_date: null, owner_id: null }));
    await as(t.sara, (q) => createDeliverable(q, newsletter(byContent, { planned_date: "2027-02-10" })));
    const ids = async (a: string, b: string) => (await as(t.sara, (q) => campaignsForRange(q, c.a, a, b))).map((c) => c.id);
    expect(await ids("2027-01-01", "2027-01-31")).toEqual([spanning]);
    expect((await ids("2027-02-01", "2027-02-28")).sort()).toEqual([spanning, byContent].sort());
    expect(await ids("2027-03-01", "2027-03-31")).toEqual([]);
    expect((await as(t.sara, (q) => listCampaigns(q))).filter((c) => c.id === spanning)).toHaveLength(1);

    const undated = await as(t.sara, (q) => createDeliverable(q, newsletter(null, { title: "Idea suelta", planned_date: null })));
    const undatedTask = await as(t.sara, (q) => createTask(q, { client_id: c.a, title: "Mejorar ficha de producto", assignee_id: t.ecommerce, due_date: null, priority: "low", campaign_id: null, deliverable_id: null }));
    expect((await as(t.sara, (q) => listDeliverables(q, { unplanned: true }))).map((d) => d.id)).toContain(undated);
    expect((await as(t.sara, (q) => listDeliverables(q, { from: "2026-11-01", to: "2026-11-30" }))).map((d) => d.id)).not.toContain(undated);
    expect((await as(t.sara, (q) => listTasks(q, { unplanned: true }))).map((x) => x.id)).toContain(undatedTask);
  });

  it("filtros por persona, canal, campaña y estado", async () => {
    const camp = await as(t.maite, (q) => createCampaign(q, { client_id: c.a, name: "Filtros", start_date: null, end_date: null, owner_id: null }));
    const d1 = await as(t.sara, (q) => createDeliverable(q, newsletter(camp, { channel: "meta_ad", owner_id: t.ainhoa })));
    const d2 = await as(t.sara, (q) => createDeliverable(q, newsletter(camp, { channel: "google_ad", owner_id: t.elisa })));
    await as(t.sara, (q) => transitionDeliverable(q, d2, "in_review"));
    const t1 = await as(t.sara, (q) => createTask(q, { client_id: c.a, title: "A", assignee_id: t.ainhoa, due_date: "2026-11-11", priority: "high", campaign_id: camp, deliverable_id: null }));
    const t2 = await as(t.sara, (q) => createTask(q, { client_id: c.a, title: "B", assignee_id: t.elisa, due_date: "2026-11-12", priority: "low", campaign_id: null, deliverable_id: d2 }));
    await as(t.elisa, (q) => setTaskStatus(q, t2, "blocked"));
    const dl = (f: object) => as(t.sara, (q) => listDeliverables(q, { campaign: camp, ...f })).then((r) => r.map((x) => x.id));
    const tl = (f: object) => as(t.sara, (q) => listTasks(q, { campaign: camp, ...f })).then((r) => r.map((x) => x.id));
    expect((await dl({})).sort()).toEqual([d1, d2].sort());
    expect(await dl({ channel: "meta_ad" })).toEqual([d1]);
    expect(await dl({ owner: t.elisa })).toEqual([d2]);
    expect(await dl({ status: "in_review" })).toEqual([d2]);
    expect(await tl({})).toEqual([t1, t2]); // por urgencia; incluye la tarea que hereda la campaña del entregable
    expect(await tl({ assignee: t.ainhoa })).toEqual([t1]);
    expect(await tl({ status: "blocked" })).toEqual([t2]);
    expect(await tl({ priority: "high" })).toEqual([t1]);
  });
});

describe("autorización", () => {
  it("sin perfil activo no se lee ni se escribe nada", async () => {
    await as(t.maite, (q) => createCampaign(q, { client_id: c.a, name: "Privada", start_date: null, end_date: null, owner_id: null }));
    for (const who of [t.outsider, t.inactive]) {
      for (const table of ["campaigns", "deliverables", "tasks", "resources", "resource_links", "comments", "activity_log", "publications"]) {
        expect(await as(who, (q) => q(`select 1 from ${table}`))).toHaveLength(0);
      }
      expect(await as(who, (q) => q("select id from profiles"))).toEqual(who === t.inactive ? [{ id: who }] : []); // solo el propio
      await expect(as(who, (q) => createCampaign(q, { client_id: c.a, name: "Intruso", start_date: null, end_date: null, owner_id: null }))).rejects.toMatchObject({ code: "42501" });
      await expect(as(who, (q) => q("insert into profiles (id, display_name, role) values ($1, 'Yo', 'admin')", [who]))).rejects.toThrow();
      expect(await as(who, (q) => q("update campaigns set name = 'hackeada' returning id"))).toHaveLength(0);
    }
  });

  it("sin sesión (rol anon) no hay acceso", async () => {
    await expect(driver.transaction(async (q) => {
      await q("select set_config('role', 'anon', true)");
      return q("select 1 from campaigns");
    })).rejects.toMatchObject({ code: "42501" });
  });

  it("una miembro no puede cambiar su rol ni gestionar usuarios; siempre queda una administradora", async () => {
    await expect(as(t.sara, (q) => q("update profiles set role = 'admin' where id = $1", [t.sara]))).rejects.toMatchObject({ code: "42501" });
    await expect(as(t.sara, (q) => q("update profiles set active = false where id = $1", [t.maite]))).resolves.toHaveLength(0);
    await expect(as(t.sara, (q) => q("select public.bootstrap_admin('sara@test.invalid', 'Sara')"))).rejects.toMatchObject({ code: "42501" });
    await as(t.sara, (q) => q("update profiles set display_name = 'Sara G.' where id = $1", [t.sara]));
    const profiles = await as(t.sara, (q) => listProfiles(q, c.a));
    expect(profiles.find((p) => p.id === t.sara)).toMatchObject({ display_name: "Sara G.", role: "member" });

    await as(t.maite, (q) => q("update profiles set role = 'member' where id = $1", [t.ecommerce]));
    await expect(as(t.maite, (q) => q("update profiles set role = 'member' where id = $1", [t.maite]))).rejects.toThrow(/al menos una/);
    await as(t.maite, (q) => q("update profiles set role = 'admin' where id = $1", [t.ecommerce]));
  });

  it("solo la propiedad del cliente elimina definitivamente; la autoría no se puede falsificar", async () => {
    const id = await as(t.sara, (q) => createCampaign(q, { client_id: c.a, name: "Para borrar", start_date: null, end_date: null, owner_id: null }));
    await expect(as(t.sara, (q) => deletePermanently(q, "campaigns", id))).rejects.toThrow(/propietaria del cliente/);
    expect(await as(t.sara, (q) => getCampaign(q, id))).not.toBeNull();
    await as(t.sara, (q) => q("update campaigns set archived_at = now() where id = $1", [id]));
    expect((await as(t.sara, (q) => getCampaign(q, id)))!.archived_by_name).toBe("Sara G.");
    await as(t.maite, (q) => deletePermanently(q, "campaigns", id));
    expect(await as(t.sara, (q) => getCampaign(q, id))).toBeNull();

    const [row] = await as(t.sara, (q) => q<{ created_by: string }>("insert into resources (client_id, title, url, created_by) values ($2, 'x', 'https://example.test/x', $1) returning created_by", [t.maite, c.a]));
    expect(row.created_by).toBe(t.sara);
  });
});

describe("concurrencia y relaciones", () => {
  it("avisa si otra persona guardó antes y permite sobrescribir de forma explícita", async () => {
    const id = await as(t.sara, (q) => createTask(q, { client_id: c.a, title: "Tarea", assignee_id: null, due_date: null, priority: "medium", campaign_id: null, deliverable_id: null }));
    const v = (await as(t.sara, (q) => getTask(q, id)))!.version;
    await as(t.elisa, (q) => updateTask(q, id, v, { title: "Editada por Elisa" }));
    await expect(as(t.sara, (q) => updateTask(q, id, v, { title: "Editada por Sara" }))).rejects.toBeInstanceOf(ConflictError);
    expect((await as(t.sara, (q) => getTask(q, id)))!.title).toBe("Editada por Elisa");
    await as(t.sara, (q) => updateTask(q, id, null, { title: "Editada por Sara" }));
    expect((await as(t.sara, (q) => getTask(q, id)))!.title).toBe("Editada por Sara");

    const camp = await as(t.sara, (q) => createCampaign(q, { client_id: c.a, name: "C", start_date: null, end_date: null, owner_id: null }));
    await as(t.sara, (q) => updateCampaign(q, camp, 1, { name: "C2" }));
    await expect(as(t.elisa, (q) => updateCampaign(q, camp, 1, { name: "C3" }))).rejects.toBeInstanceOf(ConflictError);
  });

  it("una tarea no puede tener dos campañas contradictorias", async () => {
    const c1 = await as(t.sara, (q) => createCampaign(q, { client_id: c.a, name: "Uno", start_date: null, end_date: null, owner_id: null }));
    const c2 = await as(t.sara, (q) => createCampaign(q, { client_id: c.a, name: "Dos", start_date: null, end_date: null, owner_id: null }));
    const d = await as(t.sara, (q) => createDeliverable(q, newsletter(c1)));
    const id = await as(t.sara, (q) => createTask(q, { client_id: c.a, title: "T", assignee_id: null, due_date: null, priority: "medium", campaign_id: c2, deliverable_id: d }));
    expect(await as(t.sara, (q) => getTask(q, id))).toMatchObject({ campaign_id: null, effective_campaign_id: c1, campaign_name: "Uno" });
    await expect(as(t.sara, (q) => q("update tasks set campaign_id = $2 where id = $1", [id, c2]))).rejects.toMatchObject({ code: "23514" });
    expect(toAppError({ code: "23514" }).message).toMatch(/no son válidos/);
  });

  it("plantilla de newsletter: crea campaña, entregable y tareas con lo que confirma la persona", async () => {
    const id = await as(t.maite, (q) => createNewsletterCampaign(q, {
      campaign: { client_id: c.a, name: "Newsletter Navidad", start_date: "2026-12-01", end_date: "2026-12-20", owner_id: t.maite },
      deliverable: { title: "Newsletter Navidad", planned_date: null, owner_id: t.elisa },
      tasks: [
        { title: "Redactar el copy", assignee_id: t.sara, due_date: null },
        { title: "Diseñar", assignee_id: t.ainhoa, due_date: "2026-12-05" },
      ],
    }));
    const camp = (await as(t.sara, (q) => getCampaign(q, id)))!;
    expect(camp).toMatchObject({ deliverables_total: 1, tasks_total: 2, tasks_done: 0 });
    const tasks = await as(t.sara, (q) => listTasks(q, { campaign: id }));
    expect(tasks.map((x) => [x.assignee_name, x.due_date])).toEqual([["Ainhoa", "2026-12-05"], ["Sara G.", null]]);
  });
});

describe("novedades y búsqueda", () => {
  it("avisa de asignaciones, comentarios y revisiones pendientes; no de lo que hace una misma", async () => {
    await as(t.ainhoa, (q) => markNoticesSeen(q, t.ainhoa));
    await as(t.maite, (q) => markNoticesSeen(q, t.maite));
    const taskId = await as(t.maite, (q) => createTask(q, { client_id: c.a, title: "Banner Zafiro", assignee_id: t.ainhoa, due_date: null, priority: "medium", campaign_id: null, deliverable_id: null }));
    await as(t.maite, (q) => addComment(q, "task", taskId, "¿Puedes tenerlo el jueves?"));
    await as(t.ainhoa, (q) => addComment(q, "task", taskId, "Sí"));
    const d = await as(t.ainhoa, (q) => createDeliverable(q, newsletter(null, { title: "Anuncio Zafiro" })));
    await as(t.ainhoa, (q) => transitionDeliverable(q, d, "in_review"));

    const mine = await as(t.ainhoa, (q) => listNotices(q, t.ainhoa));
    expect(mine.filter((n) => n.unread).map((n) => [n.action, n.actor]).sort()).toEqual([["comment", "Maite"], ["created", "Maite"]]);
    const owner = await as(t.maite, (q) => listNotices(q, t.maite));
    const unread = owner.filter((n) => n.unread);
    expect(unread.some((n) => n.action === "status" && n.id === d && n.detail.to === "in_review")).toBe(true);
    expect(unread.some((n) => n.action === "comment" && n.actor === "Ainhoa")).toBe(true);
    // Una miembro no recibe las revisiones pendientes de otras personas.
    expect((await as(t.elisa, (q) => listNotices(q, t.elisa))).some((n) => n.id === d)).toBe(false);

    await as(t.ainhoa, (q) => markNoticesSeen(q, t.ainhoa));
    expect((await as(t.ainhoa, (q) => listNotices(q, t.ainhoa))).filter((n) => n.unread)).toHaveLength(0);

    const hits = await as(t.sara, (q) => searchAll(q, "zafiro"));
    expect(hits.map((h) => h.type).sort()).toEqual(["deliverable", "task"]);
    expect(await as(t.outsider, (q) => searchAll(q, "zafiro"))).toHaveLength(0);
  });
});
