"use server";

import { run, type ActionState } from "@/lib/action";
import { AppError } from "@/lib/errors";
import { bool, oneOf, optDate, optUuid, text, uuid, version } from "@/lib/form";
import { CAMPAIGN_STATUSES, CHANNELS, DELIVERABLE_STATUSES, PRIORITIES, TASK_STATUSES } from "@/lib/labels";
import { campaignPath, clientPath, deliverablePath, taskPath } from "@/lib/paths";
import { assetPaths } from "@/lib/services/assets";
import { removeObjects } from "@/lib/storage";
import { createCampaign, createNewsletterCampaign, getCampaign, updateCampaign, type CampaignInput } from "@/lib/services/campaigns";
import { addComment, deleteComment, deletePermanently, setArchived } from "@/lib/services/core";
import { createDeliverable, getDeliverable, transitionDeliverable, updateDeliverable } from "@/lib/services/deliverables";
import { markNoticesSeen } from "@/lib/services/inbox";
import { getResource } from "@/lib/services/resources";
import { createTask, getTask, setTaskStatus, updateTask } from "@/lib/services/tasks";

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

// ── Campañas ───────────────────────────────────────────────────────────────
function campaignInput(fd: FormData): Omit<CampaignInput, "client_id"> {
  const start_date = optDate(fd, "start_date");
  const end_date = optDate(fd, "end_date");
  if (start_date && end_date && end_date < start_date) throw new AppError("La fecha de fin no puede ser anterior a la de inicio.");
  return {
    name: text(fd, "name", "el nombre", { required: true, max: 160 }),
    objective: text(fd, "objective", "el objetivo", { max: 2000 }),
    description: text(fd, "description", "la descripción", { max: 10000 }),
    start_date, end_date,
    owner_id: optUuid(fd, "owner_id"),
    status: oneOf(fd, "status", CAMPAIGN_STATUSES, "planned"),
  };
}

export const createCampaignAction: Action = async (_prev, fd) =>
  run(async (q) => {
    const campaign = { ...campaignInput(fd), client_id: uuid(fd, "client_id") };
    if (!bool(fd, "use_template")) return { redirect: campaignPath({ client_id: campaign.client_id, id: await createCampaign(q, campaign) }) };
    // Plantilla de newsletter: solo se crean las tareas marcadas, con las personas y fechas confirmadas.
    const tasks = fd.getAll("task_key").map(String).filter((k) => bool(fd, `task_on_${k}`)).map((k) => ({
      title: text(fd, `task_title_${k}`, "el título de la tarea", { required: true }),
      assignee_id: optUuid(fd, `task_assignee_${k}`),
      due_date: optDate(fd, `task_due_${k}`),
    }));
    const id = await createNewsletterCampaign(q, {
      campaign,
      deliverable: {
        title: text(fd, "deliverable_title", "el título de la newsletter", { max: 200 }) || campaign.name,
        planned_date: optDate(fd, "deliverable_date"),
        owner_id: optUuid(fd, "deliverable_owner"),
      },
      tasks,
    });
    return { redirect: campaignPath({ client_id: campaign.client_id, id }) };
  });

export const updateCampaignAction: Action = async (_prev, fd) =>
  run(async (q) => {
    await updateCampaign(q, uuid(fd, "id"), version(fd), campaignInput(fd));
    return { state: { ok: true, notice: "Campaña guardada." } };
  });

// ── Entregables ────────────────────────────────────────────────────────────
const deliverableInput = (fd: FormData) => ({
  title: text(fd, "title", "el título", { required: true }),
  channel: oneOf(fd, "channel", CHANNELS),
  campaign_id: optUuid(fd, "campaign_id"),
  owner_id: optUuid(fd, "owner_id"),
  planned_date: optDate(fd, "planned_date"),
  formats: text(fd, "formats", "los formatos", { max: 300 }),
});

export const createDeliverableAction: Action = async (_prev, fd) =>
  run(async (q) => {
    const client_id = uuid(fd, "client_id");
    const href = deliverablePath({ client_id, id: await createDeliverable(q, { ...deliverableInput(fd), client_id }) });
    return bool(fd, "stay") ? { state: { ok: true, notice: "Entregable creado.", href } } : { redirect: href };
  });

/** Edición rápida desde listas, calendario y arrastrar y soltar: fecha prevista o responsable. */
export const quickDeliverableAction: Action = async (_prev, fd) =>
  run(async (q) => {
    const field = oneOf(fd, "field", ["planned_date", "owner_id"] as const);
    await updateDeliverable(q, uuid(fd, "id"), null, { [field]: field === "planned_date" ? optDate(fd, "value") : optUuid(fd, "value") });
  });

export const updateDeliverableAction: Action = async (_prev, fd) =>
  run(async (q) => {
    await updateDeliverable(q, uuid(fd, "id"), version(fd), {
      ...deliverableInput(fd),
      brief: text(fd, "brief", "el brief", { max: 20000 }),
      copy: text(fd, "copy", "el copy", { max: 50000 }),
    });
    return { state: { ok: true, notice: "Entregable guardado." } };
  });

export const transitionDeliverableAction: Action = async (_prev, fd) =>
  run(async (q) => {
    const to = oneOf(fd, "to", DELIVERABLE_STATUSES);
    const planned_date = optDate(fd, "planned_date");
    const published_on = optDate(fd, "published_on");
    if (to === "published" && !published_on) throw new AppError("Indica la fecha real de publicación.");
    await transitionDeliverable(q, uuid(fd, "id"), to, { planned_date, published_on });
  });

// ── Tareas ─────────────────────────────────────────────────────────────────
const taskInput = (fd: FormData) => ({
  title: text(fd, "title", "el título", { required: true }),
  description: text(fd, "description", "la descripción", { max: 10000 }),
  assignee_id: optUuid(fd, "assignee_id"),
  due_date: optDate(fd, "due_date"),
  priority: oneOf(fd, "priority", PRIORITIES, "medium"),
  campaign_id: optUuid(fd, "campaign_id"),
  deliverable_id: optUuid(fd, "deliverable_id"),
});

export const createTaskAction: Action = async (_prev, fd) =>
  run(async (q) => {
    const client_id = uuid(fd, "client_id");
    const href = taskPath({ client_id, id: await createTask(q, { ...taskInput(fd), client_id }) });
    return bool(fd, "stay") ? { state: { ok: true, notice: "Tarea creada.", href } } : { redirect: href };
  });

/** Edición rápida de una tarea: estado, persona o fecha límite. */
export const quickTaskAction: Action = async (_prev, fd) =>
  run(async (q) => {
    const field = oneOf(fd, "field", ["status", "assignee_id", "due_date"] as const);
    const value = field === "status" ? oneOf(fd, "value", TASK_STATUSES) : field === "due_date" ? optDate(fd, "value") : optUuid(fd, "value");
    await updateTask(q, uuid(fd, "id"), null, { [field]: value });
  });

export const markNoticesSeenAction: Action = async () => run(async (q, user) => markNoticesSeen(q, user.id));

export const updateTaskAction: Action = async (_prev, fd) =>
  run(async (q) => {
    await updateTask(q, uuid(fd, "id"), version(fd), { ...taskInput(fd), status: oneOf(fd, "status", TASK_STATUSES) });
    return { state: { ok: true, notice: "Tarea guardada." } };
  });

export const setTaskStatusAction: Action = async (_prev, fd) =>
  run(async (q) => setTaskStatus(q, uuid(fd, "id"), oneOf(fd, "status", TASK_STATUSES)));

// ── Comentarios ────────────────────────────────────────────────────────────
export const addCommentAction: Action = async (_prev, fd) =>
  run(async (q) => {
    await addComment(q, oneOf(fd, "type", ["deliverable", "task"] as const), uuid(fd, "id"),
      text(fd, "body", "el comentario", { required: true, max: 5000 }));
  });

export const deleteCommentAction: Action = async (_prev, fd) => run(async (q) => deleteComment(q, uuid(fd, "id")));

// ── Archivar y eliminar ────────────────────────────────────────────────────
const TABLES = { campaign: "campaigns", deliverable: "deliverables", task: "tasks" } as const;
const LIST_PATH = { campaign: "campanas", deliverable: "trabajo", task: "trabajo", resource: "recursos" } as const;
const LIST_QUERY = { campaign: "", deliverable: "?tab=entregables", task: "", resource: "" } as const;
const GET = { campaign: getCampaign, deliverable: getDeliverable, task: getTask, resource: getResource } as const;

export const archiveAction: Action = async (_prev, fd) =>
  run(async (q) => {
    const type = oneOf(fd, "type", ["campaign", "deliverable", "task"] as const);
    await setArchived(q, TABLES[type], uuid(fd, "id"), bool(fd, "archived"));
  });

/** Eliminación definitiva: solo la propiedad del cliente (lo hace cumplir RLS). Después vuelve a la lista del cliente. */
export const deleteAction: Action = async (_prev, fd) =>
  run(async (q) => {
    const type = oneOf(fd, "type", ["campaign", "deliverable", "task", "resource"] as const);
    const id = uuid(fd, "id");
    // El cliente al que volver es el del registro, leído antes de borrarlo (no el que diga el formulario).
    const record = await GET[type](q, id);
    if (!record) throw new AppError("No se ha encontrado el registro.", "not_found");
    // Los ficheros de la creatividad no se borran solos al eliminar el entregable: se recogen antes.
    const files = type === "deliverable" ? await assetPaths(q, id) : [];
    await deletePermanently(q, type === "resource" ? "resources" : TABLES[type], id);
    await removeObjects(files);
    return { redirect: clientPath(record.client_id, LIST_PATH[type]) + LIST_QUERY[type] };
  });
