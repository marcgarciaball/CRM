"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { run, type ActionState } from "@/lib/action";
import { ASSET_TYPES, MAX_ASSETS, MAX_BYTES, assetProblem, parseAssetPath } from "@/lib/assets";
import { requireUser } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { AppError, toAppError } from "@/lib/errors";
import { isUuid, oneOf, text, uuid, version } from "@/lib/form";
import { CREATIVE_FORMATS } from "@/lib/labels";
import { addAsset, moveAsset, removeAsset, uploadTarget } from "@/lib/services/assets";
import { updateDeliverable } from "@/lib/services/deliverables";
import { createUpload, removeObjects, uploadedSize, type UploadTicket } from "@/lib/storage";

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;
type FileInfo = { deliverableId: string; fileName: string; mimeType: string; size: number };

function checkFile(f: FileInfo) {
  if (!isUuid(f.deliverableId)) throw new AppError("Falta el identificador del registro.");
  const fileName = String(f.fileName ?? "").trim().slice(0, 200) || "archivo";
  const problem = assetProblem({ name: fileName, type: String(f.mimeType), size: Number(f.size) });
  if (problem) throw new AppError(problem);
  return { fileName, mimeType: f.mimeType as keyof typeof ASSET_TYPES };
}

/**
 * Subida, paso 1: comprueba que la persona puede subir a este entregable y que el archivo se admite,
 * y devuelve una dirección de un solo uso a la que el navegador envía el fichero directamente.
 */
export async function prepareAssetUpload(f: FileInfo): Promise<{ ticket: UploadTicket & { path: string } } | { error: string }> {
  const user = await requireUser();
  try {
    const { mimeType } = checkFile(f);
    const target = await withUser(user.id, (q) => uploadTarget(q, f.deliverableId));
    if (target.count >= MAX_ASSETS) throw new AppError(`Un entregable admite como máximo ${MAX_ASSETS} archivos.`);
    const path = `${target.client_id}/${f.deliverableId}/${randomUUID()}.${ASSET_TYPES[mimeType].ext}`;
    return { ticket: { path, ...(await createUpload(path, mimeType)) } };
  } catch (e) {
    return { error: toAppError(e).message };
  }
}

/** Subida, paso 2: el fichero ya está en el almacén; se registra en el entregable (al final del orden). */
export async function confirmAssetUpload(f: FileInfo & { path: string }): Promise<{ ok: true } | { error: string }> {
  const user = await requireUser();
  try {
    const { fileName, mimeType } = checkFile(f);
    const parsed = parseAssetPath(String(f.path));
    if (!parsed || parsed.deliverableId !== f.deliverableId) throw new AppError("La ruta del archivo no corresponde a este entregable.");
    // El acceso se comprueba antes de mirar el almacén, y el tamaño que cuenta es el real, no el declarado.
    await withUser(user.id, (q) => uploadTarget(q, f.deliverableId));
    const { kind } = ASSET_TYPES[mimeType];
    const size = await uploadedSize(f.path);
    if (size === null) throw new AppError("El archivo no ha llegado a subirse. Inténtalo de nuevo.");
    if (size > MAX_BYTES[kind]) {
      await removeObjects([f.path]);
      throw new AppError(assetProblem({ name: fileName, type: mimeType, size }) ?? "El archivo pesa demasiado.");
    }
    await withUser(user.id, (q) =>
      addAsset(q, { deliverable_id: f.deliverableId, kind, storage_path: f.path, file_name: fileName, mime_type: mimeType, size_bytes: size }));
  } catch (e) {
    return { error: toAppError(e).message };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

export const removeAssetAction: Action = async (_prev, fd) => {
  const removed: string[] = [];
  const state = await run(async (q) => {
    removed.push(await removeAsset(q, uuid(fd, "id")));
  });
  // El fichero se borra cuando la fila ya no existe: nunca queda una fila apuntando a nada.
  await removeObjects(removed);
  return state;
};

export const moveAssetAction: Action = async (_prev, fd) =>
  run(async (q) => moveAsset(q, uuid(fd, "id"), oneOf(fd, "direction", ["up", "down"] as const) === "up" ? -1 : 1));

/** Propuesta creativa: ¿estático o dinámico?, inspo y copy in. */
export const updateCreativeAction: Action = async (_prev, fd) =>
  run(async (q) => {
    await updateDeliverable(q, uuid(fd, "id"), version(fd), {
      creative_format: fd.get("creative_format") ? oneOf(fd, "creative_format", CREATIVE_FORMATS) : null,
      inspo: text(fd, "inspo", "la inspiración", { max: 20000 }),
      copy_in: text(fd, "copy_in", "el copy in", { max: 20000 }),
    });
    return { state: { ok: true, notice: "Propuesta guardada." } };
  });
