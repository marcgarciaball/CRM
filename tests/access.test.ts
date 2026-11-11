import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Driver } from "@/lib/db/types";
import { addComment, deleteComment, deletePermanently } from "@/lib/services/core";
import { createCampaign, getCampaign, listCampaigns, updateCampaign } from "@/lib/services/campaigns";
import { createDeliverable, getDeliverable, listDeliverables, transitionDeliverable, updateDeliverable } from "@/lib/services/deliverables";
import { addNewLink, attachResource, createResource, listResources } from "@/lib/services/resources";
import { createTask, getTask, listTasks, updateTask } from "@/lib/services/tasks";
import { as, setupDb, type Clients, type Team } from "./helpers";

let driver: Driver;
let t: Team;
let c: Clients;

type Fixture = { campaign: string; deliverable: string; task: string; resource: string; link: string; comment: string };
const fx = {} as { a: Fixture; b: Fixture; publishedB: string };

/** Campaña, entregable (en revisión), tarea, recurso enlazado y comentario en un cliente. */
async function fixture(who: string, client: string): Promise<Fixture> {
  return as(who, async (q) => {
    const campaign = await createCampaign(q, { client_id: client, name: "Campaña", start_date: null, end_date: null, owner_id: who });
    const deliverable = await createDeliverable(q, { client_id: client, title: "Entregable", channel: "other", campaign_id: campaign, owner_id: who, planned_date: null });
    await transitionDeliverable(q, deliverable, "in_review");
    const task = await createTask(q, { client_id: client, title: "Tarea", assignee_id: who, due_date: null, priority: "low", campaign_id: null, deliverable_id: deliverable });
    const resource = await createResource(q, { client_id: client, title: "Recurso", url: "https://example.test/recurso" });
    const link = await attachResource(q, { type: "task", id: task }, resource);
    await addComment(q, "deliverable", deliverable, "Comentario");
    const [{ id: comment }] = await q<{ id: string }>("select id from comments where deliverable_id = $1", [deliverable]);
    return { campaign, deliverable, task, resource, link, comment };
  });
}

beforeAll(async () => {
  ({ driver, team: t, c } = await setupDb());
  fx.b = await fixture(t.ecommerce, c.b);
  fx.a = await fixture(t.maite, c.a);
  // Un entregable publicado en B, para que haya publicaciones que ocultar.
  fx.publishedB = await as(t.ecommerce, async (q) => {
    const id = await createDeliverable(q, { client_id: c.b, title: "Publicado B", channel: "other", campaign_id: null, owner_id: null, planned_date: null });
    await transitionDeliverable(q, id, "in_review");
    await transitionDeliverable(q, id, "approved");
    await transitionDeliverable(q, id, "published", { published_on: "2026-11-11" });
    return id;
  });
});
afterAll(() => driver.close());

const TABLES = ["campaigns", "deliverables", "tasks", "resources", "resource_links", "comments", "activity_log", "publications"] as const;

/** Identificadores de las filas de B en cada tabla, leídos con la conexión privilegiada. */
const B_ROWS: Record<(typeof TABLES)[number], string> = {
  campaigns: "select id::text from campaigns where client_id = $1",
  deliverables: "select id::text from deliverables where client_id = $1",
  tasks: "select id::text from tasks where client_id = $1",
  resources: "select id::text from resources where client_id = $1",
  resource_links: "select rl.id::text from resource_links rl join resources r on r.id = rl.resource_id where r.client_id = $1",
  comments: `select cm.id::text from comments cm left join deliverables d on d.id = cm.deliverable_id
              left join tasks tk on tk.id = cm.task_id where coalesce(d.client_id, tk.client_id) = $1`,
  activity_log: "select id::text from activity_log where client_id = $1",
  publications: "select pb.id::text from publications pb join deliverables d on d.id = pb.deliverable_id where d.client_id = $1",
};
const idsOfB = async (table: (typeof TABLES)[number]) =>
  (await driver.transaction((q) => q<{ id: string }>(B_ROWS[table], [c.b]))).map((r) => r.id);
const countAs = async (who: string, table: string, ids?: string[]) => {
  const [{ n }] = await as(who, (q) => ids
    ? q<{ n: number }>(`select count(*)::int as n from ${table} where id::text = any($1::text[])`, [ids])
    : q<{ n: number }>(`select count(*)::int as n from ${table}`));
  return n;
};

describe("aislamiento entre clientes", () => {
  it.each(TABLES)("sara (solo A) no ve filas de B en %s", async (table) => {
    const ids = await idsOfB(table);
    expect(ids.length).toBeGreaterThan(0);
    expect(await countAs(t.elisa, table, ids)).toBe(ids.length); // un miembro de B sí las ve
    expect(await countAs(t.sara, table, ids)).toBe(0);
  });

  it.each(TABLES)("lonely y outsider no ven nada en %s", async (table) => {
    const [{ n: total }] = await driver.transaction((q) => q<{ n: number }>(`select count(*)::int as n from ${table}`));
    expect(total).toBeGreaterThan(0);
    expect(await countAs(t.lonely, table)).toBe(0);
    expect(await countAs(t.outsider, table)).toBe(0);
  });

  it("los clientes y sus miembros solo los ven quienes pertenecen a ellos", async () => {
    expect((await as(t.sara, (q) => q<{ id: string }>("select id from clients"))).map((r) => r.id)).toEqual([c.a]);
    expect(await as(t.sara, (q) => q("select 1 from client_members where client_id = $1", [c.b]))).toHaveLength(0);
    expect(await as(t.elisa, (q) => q("select 1 from client_members where client_id = $1", [c.b]))).toHaveLength(2);
    expect(await as(t.lonely, (q) => q("select 1 from clients"))).toHaveLength(0);
    // Nadie se añade a un cliente por su cuenta.
    await expect(as(t.sara, (q) => q("insert into client_members (client_id, user_id, role) values ($1, $2, 'owner')", [c.b, t.sara])))
      .rejects.toMatchObject({ code: "42501" });
    await expect(as(t.elisa, (q) => q("update client_members set role = 'owner' where client_id = $1 and user_id = $2", [c.b, t.elisa])))
      .rejects.toMatchObject({ code: "42501" });
    await expect(as(t.ecommerce, (q) => q("delete from clients where id = $1", [c.b]))).rejects.toMatchObject({ code: "42501" });
  });

  it("sara no puede crear, editar ni borrar en B", async () => {
    const denied = { code: "42501" };
    await expect(as(t.sara, (q) => createCampaign(q, { client_id: c.b, name: "Intrusa", start_date: null, end_date: null, owner_id: null }))).rejects.toMatchObject(denied);
    await expect(as(t.sara, (q) => createDeliverable(q, { client_id: c.b, title: "Intrusa", channel: "other", campaign_id: null, owner_id: null, planned_date: null }))).rejects.toMatchObject(denied);
    await expect(as(t.sara, (q) => createTask(q, { client_id: c.b, title: "Intrusa", assignee_id: null, due_date: null, priority: "low", campaign_id: null, deliverable_id: null }))).rejects.toMatchObject(denied);
    await expect(as(t.sara, (q) => createResource(q, { client_id: c.b, title: "Intrusa", url: "https://example.test/intrusa" }))).rejects.toMatchObject(denied);
    await expect(as(t.sara, (q) => attachResource(q, { type: "campaign", id: fx.b.campaign }, fx.b.resource))).rejects.toMatchObject(denied);
    await expect(as(t.sara, (q) => addComment(q, "deliverable", fx.b.deliverable, "Hola"))).rejects.toMatchObject(denied);
    await expect(as(t.sara, (q) => addComment(q, "task", fx.b.task, "Hola"))).rejects.toMatchObject(denied);

    for (const table of ["campaigns", "deliverables", "tasks", "resources"]) {
      const col = table === "campaigns" ? "name" : "title";
      const id = { campaigns: fx.b.campaign, deliverables: fx.b.deliverable, tasks: fx.b.task, resources: fx.b.resource }[table];
      expect(await as(t.sara, (q) => q(`update ${table} set ${col} = 'hackeada' where id = $1 returning id`, [id]))).toHaveLength(0);
      expect(await as(t.sara, (q) => q(`delete from ${table} where id = $1 returning id`, [id]))).toHaveLength(0);
      // Tampoco una propietaria de otro cliente.
      expect(await as(t.maite, (q) => q(`delete from ${table} where id = $1 returning id`, [id]))).toHaveLength(0);
    }
    expect(await as(t.sara, (q) => q("update resource_links set is_primary = true where id = $1 returning id", [fx.b.link]))).toHaveLength(0);
    expect(await as(t.sara, (q) => q("delete from resource_links where id = $1 returning id", [fx.b.link]))).toHaveLength(0);
    expect(await as(t.sara, (q) => q("delete from comments where id = $1 returning id", [fx.b.comment]))).toHaveLength(0);
    // Todo sigue en su sitio.
    expect(await idsOfB("campaigns")).toContain(fx.b.campaign);
    expect(await idsOfB("resource_links")).toContain(fx.b.link);
    expect(await idsOfB("comments")).toContain(fx.b.comment);
    expect((await as(t.ecommerce, (q) => getCampaign(q, fx.b.campaign)))!.name).toBe("Campaña");
  });

  it("elisa (miembro de B) trabaja en B pero no aprueba ni borra", async () => {
    const campaign = await as(t.elisa, (q) => createCampaign(q, { client_id: c.b, name: "De Elisa", start_date: null, end_date: null, owner_id: t.elisa }));
    const deliverable = await as(t.elisa, (q) => createDeliverable(q, { client_id: c.b, title: "De Elisa", channel: "other", campaign_id: campaign, owner_id: t.ecommerce, planned_date: null }));
    const task = await as(t.elisa, (q) => createTask(q, { client_id: c.b, title: "De Elisa", assignee_id: t.ecommerce, due_date: null, priority: "low", campaign_id: null, deliverable_id: deliverable }));
    await as(t.elisa, (q) => addNewLink(q, { type: "task", id: task }, { title: "Material", url: "https://example.test/elisa" }));
    await as(t.elisa, (q) => updateDeliverable(q, deliverable, null, { copy: "Texto" }));
    await as(t.elisa, (q) => transitionDeliverable(q, deliverable, "in_review"));
    await as(t.elisa, (q) => addComment(q, "task", task, "Hecho"));

    const approve = as(t.elisa, (q) => transitionDeliverable(q, deliverable, "approved"));
    await expect(approve).rejects.toMatchObject({ code: "42501" });
    await expect(approve).rejects.toThrow("Solo una persona propietaria del cliente puede aprobar un entregable.");
    expect((await as(t.elisa, (q) => getDeliverable(q, deliverable)))!.status).toBe("in_review");

    for (const [table, id] of [["campaigns", campaign], ["deliverables", deliverable], ["tasks", task]] as const) {
      await expect(as(t.elisa, (q) => deletePermanently(q, table, id))).rejects.toMatchObject({ code: "forbidden" });
    }
    expect(await as(t.elisa, (q) => getCampaign(q, campaign))).not.toBeNull();

    // Comentarios: borra los suyos, no los de otras personas.
    const [own] = await as(t.elisa, (q) => q<{ id: string }>("select id from comments where task_id = $1", [task]));
    await expect(as(t.elisa, (q) => deleteComment(q, fx.b.comment))).rejects.toMatchObject({ code: "forbidden" });
    await as(t.elisa, (q) => deleteComment(q, own.id));
    expect(await as(t.elisa, (q) => q("select 1 from comments where id = $1", [own.id]))).toHaveLength(0);
  });

  it("ecommerce (propietaria de B) aprueba y borra en B", async () => {
    const deliverable = await as(t.elisa, (q) => createDeliverable(q, { client_id: c.b, title: "Para aprobar", channel: "other", campaign_id: null, owner_id: null, planned_date: null }));
    await as(t.elisa, (q) => transitionDeliverable(q, deliverable, "in_review"));
    await as(t.elisa, (q) => addComment(q, "deliverable", deliverable, "Comentario de Elisa"));
    await as(t.ecommerce, (q) => transitionDeliverable(q, deliverable, "approved"));
    expect(await as(t.elisa, (q) => getDeliverable(q, deliverable))).toMatchObject({ status: "approved", approved_by_name: "Responsable ecommerce" });

    // Modera comentarios ajenos de su cliente.
    const [comment] = await as(t.ecommerce, (q) => q<{ id: string }>("select id from comments where deliverable_id = $1", [deliverable]));
    await as(t.ecommerce, (q) => deleteComment(q, comment.id));
    expect(await as(t.elisa, (q) => q("select 1 from comments where id = $1", [comment.id]))).toHaveLength(0);

    const campaign = await as(t.elisa, (q) => createCampaign(q, { client_id: c.b, name: "Para borrar", start_date: null, end_date: null, owner_id: null }));
    await as(t.ecommerce, (q) => deletePermanently(q, "deliverables", deliverable));
    await as(t.ecommerce, (q) => deletePermanently(q, "campaigns", campaign));
    expect(await as(t.ecommerce, (q) => getDeliverable(q, deliverable))).toBeNull();
    expect(await as(t.ecommerce, (q) => getCampaign(q, campaign))).toBeNull();
  });

  it("maite (propietaria de A) no aprueba en B", async () => {
    const deliverable = await as(t.ecommerce, (q) => createDeliverable(q, { client_id: c.b, title: "Revisión B", channel: "other", campaign_id: null, owner_id: null, planned_date: null }));
    await as(t.ecommerce, (q) => transitionDeliverable(q, deliverable, "in_review"));
    // Sin acceso a B, ni siquiera encuentra el entregable.
    await expect(as(t.maite, (q) => transitionDeliverable(q, deliverable, "approved"))).rejects.toMatchObject({ code: "not_found" });
    // Como miembro de B (no propietaria), su papel en A y su rol de administración no bastan.
    await driver.transaction((q) => q("insert into client_members (client_id, user_id, role) values ($1, $2, 'member')", [c.b, t.maite]));
    try {
      await expect(as(t.maite, (q) => transitionDeliverable(q, deliverable, "approved"))).rejects.toMatchObject({ code: "42501" });
    } finally {
      await driver.transaction((q) => q("delete from client_members where client_id = $1 and user_id = $2", [c.b, t.maite]));
    }
    expect((await as(t.ecommerce, (q) => getDeliverable(q, deliverable)))!.status).toBe("in_review");
  });

  it("no se puede enlazar un entregable de A con una campaña de B", async () => {
    const other = /otro cliente/;
    await expect(as(t.ecommerce, (q) => createDeliverable(q, { client_id: c.a, title: "Cruzado", channel: "other", campaign_id: fx.b.campaign, owner_id: null, planned_date: null })))
      .rejects.toMatchObject({ code: "42501", message: "Ese elemento pertenece a otro cliente." });
    await expect(as(t.ecommerce, (q) => updateDeliverable(q, fx.a.deliverable, null, { campaign_id: fx.b.campaign }))).rejects.toThrow(other);
    // Tampoco una tarea de un cliente bajo un entregable o una campaña de otro.
    await expect(as(t.ecommerce, (q) => createTask(q, { client_id: c.b, title: "Cruzada", assignee_id: null, due_date: null, priority: "low", campaign_id: null, deliverable_id: fx.a.deliverable }))).rejects.toThrow(other);
    await expect(as(t.ecommerce, (q) => createTask(q, { client_id: c.b, title: "Cruzada", assignee_id: null, due_date: null, priority: "low", campaign_id: fx.a.campaign, deliverable_id: null }))).rejects.toThrow(other);
    await expect(as(t.ecommerce, (q) => updateTask(q, fx.b.task, null, { deliverable_id: fx.a.deliverable }))).rejects.toThrow(other);
    expect((await as(t.ecommerce, (q) => getDeliverable(q, fx.a.deliverable)))!.campaign_id).toBe(fx.a.campaign);
  });

  it("no se puede asignar una tarea de B a sara", async () => {
    const noAccess = { code: "42501", message: "Esa persona no tiene acceso a este cliente." };
    await expect(as(t.ecommerce, (q) => createTask(q, { client_id: c.b, title: "Para Sara", assignee_id: t.sara, due_date: null, priority: "low", campaign_id: null, deliverable_id: null })))
      .rejects.toMatchObject(noAccess);
    await expect(as(t.ecommerce, (q) => updateTask(q, fx.b.task, null, { assignee_id: t.sara }))).rejects.toMatchObject(noAccess);
    await expect(as(t.ecommerce, (q) => updateDeliverable(q, fx.b.deliverable, null, { owner_id: t.sara }))).rejects.toMatchObject(noAccess);
    await expect(as(t.ecommerce, (q) => updateCampaign(q, fx.b.campaign, null, { owner_id: t.lonely }))).rejects.toMatchObject(noAccess);
    expect((await as(t.ecommerce, (q) => getTask(q, fx.b.task)))!.assignee_id).toBe(t.ecommerce);
    // A elisa, miembro de B, sí.
    await as(t.ecommerce, (q) => updateTask(q, fx.b.task, null, { assignee_id: t.elisa }));
    expect((await as(t.ecommerce, (q) => getTask(q, fx.b.task)))!.assignee_id).toBe(t.elisa);
  });

  it("un recurso de A no se puede adjuntar a una tarea de B", async () => {
    await expect(as(t.ecommerce, (q) => attachResource(q, { type: "task", id: fx.b.task }, fx.a.resource)))
      .rejects.toMatchObject({ code: "42501", message: "Ese elemento pertenece a otro cliente." });
    await expect(as(t.ecommerce, (q) => attachResource(q, { type: "campaign", id: fx.a.campaign }, fx.b.resource))).rejects.toThrow(/otro cliente/);
    await expect(as(t.ecommerce, (q) => attachResource(q, { type: "deliverable", id: fx.b.deliverable }, fx.a.resource))).rejects.toThrow(/otro cliente/);
    // Con un recurso del mismo cliente, sí.
    await as(t.ecommerce, (q) => attachResource(q, { type: "campaign", id: fx.b.campaign }, fx.b.resource));
  });

  it("client_id no se puede cambiar", async () => {
    for (const [table, id] of [["campaigns", fx.b.campaign], ["deliverables", fx.b.deliverable], ["tasks", fx.b.task], ["resources", fx.b.resource]] as const) {
      await expect(as(t.ecommerce, (q) => q(`update ${table} set client_id = $2 where id = $1`, [id, c.a])))
        .rejects.toMatchObject({ code: "42501", message: "Ese elemento pertenece a otro cliente." });
      expect(await idsOfB(table)).toContain(id);
    }
  });

  it("cliente archivado: se lee, no se escribe", async () => {
    // Una miembro no puede archivar el cliente; la propietaria sí.
    expect(await as(t.elisa, (q) => q("update clients set archived_at = now() where id = $1 returning id", [c.b]))).toHaveLength(0);
    expect(await as(t.ecommerce, (q) => q("update clients set archived_at = now() where id = $1 returning id", [c.b]))).toHaveLength(1);
    try {
      for (const who of [t.elisa, t.ecommerce]) {
        expect(await as(who, (q) => getCampaign(q, fx.b.campaign))).not.toBeNull();
        expect(await countAs(who, "comments", await idsOfB("comments"))).toBeGreaterThan(0);
        await expect(as(who, (q) => createCampaign(q, { client_id: c.b, name: "Archivada", start_date: null, end_date: null, owner_id: null }))).rejects.toMatchObject({ code: "42501" });
        await expect(as(who, (q) => createResource(q, { client_id: c.b, title: "Archivada", url: "https://example.test/archivada" }))).rejects.toMatchObject({ code: "42501" });
        await expect(as(who, (q) => attachResource(q, { type: "deliverable", id: fx.b.deliverable }, fx.b.resource))).rejects.toMatchObject({ code: "42501" });
        await expect(as(who, (q) => addComment(q, "task", fx.b.task, "Archivada"))).rejects.toMatchObject({ code: "42501" });
        expect(await as(who, (q) => q("update tasks set title = 'cambiada' where id = $1 returning id", [fx.b.task]))).toHaveLength(0);
        expect(await as(who, (q) => q("delete from resource_links where id = $1 returning id", [fx.b.link]))).toHaveLength(0);
        expect(await as(who, (q) => q("delete from comments where id = $1 returning id", [fx.b.comment]))).toHaveLength(0);
      }
      await expect(as(t.ecommerce, (q) => deletePermanently(q, "campaigns", fx.b.campaign))).rejects.toMatchObject({ code: "forbidden" });
      // El resto de clientes sigue con normalidad.
      await as(t.elisa, (q) => createCampaign(q, { client_id: c.a, name: "En A", start_date: null, end_date: null, owner_id: null }));
    } finally {
      await as(t.ecommerce, (q) => q("update clients set archived_at = null where id = $1", [c.b]));
    }
    await as(t.elisa, (q) => addComment(q, "task", fx.b.task, "Reactivado"));
  });

  it("listar sin filtro de cliente devuelve solo lo de mis clientes", async () => {
    const clientsOf = async (who: string) => {
      const rows = await as(who, async (q) => [
        ...(await listCampaigns(q)), ...(await listDeliverables(q)), ...(await listTasks(q)), ...(await listResources(q)),
      ]);
      return [...new Set(rows.map((r) => r.client_id))].sort();
    };
    expect(await clientsOf(t.elisa)).toEqual([c.a, c.b].sort());
    expect(await clientsOf(t.sara)).toEqual([c.a]);
    expect(await clientsOf(t.lonely)).toEqual([]);
  });
});
