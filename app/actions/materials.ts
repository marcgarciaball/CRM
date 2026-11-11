"use server";

import { run, type ActionState } from "@/lib/action";
import { requireFirstClientId } from "@/lib/load";
import { bool, oneOf, optUuid, text, uuid, version } from "@/lib/form";
import { CATEGORIES } from "@/lib/labels";
import {
  attachResource, createResource, findDuplicates, markResourceUpdated, parseHttpUrl, unlink, updateLinkFlags, updateResource,
  type Target,
} from "@/lib/services/resources";

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;
const TARGETS = ["campaign", "deliverable", "task"] as const;

const resourceInput = (fd: FormData) => ({
  title: text(fd, "title", "el título", { required: true }),
  url: parseHttpUrl(text(fd, "url", "la URL", { required: true, max: 2048 })),
  category: fd.get("category") ? oneOf(fd, "category", CATEGORIES) : null,
  description: text(fd, "description", "la descripción", { max: 1000 }),
});

/**
 * Añade un enlace desde cualquier registro o desde la biblioteca.
 * - `resource_id`: enlaza un recurso que ya existe (sin copiarlo).
 * - título + URL: crea el recurso; si la URL ya existe, avisa antes de crear otro.
 */
export const addLinkAction: Action = async (_prev, fd) =>
  run(async (q) => {
    const targetType = fd.get("target_type") ? oneOf(fd, "target_type", TARGETS) : null;
    const target: Target | null = targetType ? { type: targetType, id: uuid(fd, "target_id") } : null;
    const flags = { is_primary: bool(fd, "is_primary"), requires_approval: bool(fd, "requires_approval") };

    let resourceId = optUuid(fd, "resource_id");
    if (!resourceId) {
      const input = { ...resourceInput(fd), client_id: await requireFirstClientId(q) }; // TODO(Task 5)
      if (!bool(fd, "allow_duplicate")) {
        const duplicates = await findDuplicates(q, input.client_id, input.url);
        if (duplicates.length > 0) return { state: { duplicates: duplicates.map((d) => ({ id: d.id, title: d.title })) } };
      }
      resourceId = await createResource(q, input);
    }
    if (target) await attachResource(q, target, resourceId, flags);
    return { state: { ok: true, notice: "Enlace añadido." } };
  });

export const unlinkAction: Action = async (_prev, fd) => run(async (q) => unlink(q, uuid(fd, "link_id")));

export const setLinkFlagAction: Action = async (_prev, fd) =>
  run(async (q) => {
    const flag = oneOf(fd, "flag", ["is_primary", "requires_approval"] as const);
    await updateLinkFlags(q, uuid(fd, "link_id"), { [flag]: bool(fd, "value") });
  });

export const markUpdatedAction: Action = async (_prev, fd) =>
  run(async (q) => {
    await markResourceUpdated(q, uuid(fd, "resource_id"));
    return { state: { ok: true, notice: "Material marcado como actualizado." } };
  });

export const updateResourceAction: Action = async (_prev, fd) =>
  run(async (q) => {
    const input = resourceInput(fd);
    await updateResource(q, uuid(fd, "id"), version(fd), { ...input, category: input.category ?? "other" });
    return { state: { ok: true, notice: "Recurso guardado." } };
  });
