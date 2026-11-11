import "server-only";
import { existsSync, mkdirSync, statSync, unlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseAssetPath } from "./assets";
import { isDemo } from "./db";

/**
 * Almacén de las creatividades. Es privado: el navegador nunca lo lee ni escribe por su cuenta.
 * El servidor comprueba el acceso en la base de datos y solo entonces firma una subida o una lectura.
 * - Supabase: bucket privado `creatives`, con la clave secret.
 * - Demo local: carpeta en disco (los ficheros no se comparten con nadie).
 */
const BUCKET = "creatives";

async function bucket() {
  const { supabaseAdmin } = await import("./supabase/server");
  return supabaseAdmin().storage.from(BUCKET);
}

function safe(p: string): string {
  if (!parseAssetPath(p)) throw new Error("Ruta de archivo no válida.");
  return p;
}

// ── Demo local ───────────────────────────────────────────────────────────────
const demoRoot = () =>
  process.env.AMAPOLA_DEMO_DIR ? `${path.resolve(process.env.AMAPOLA_DEMO_DIR)}-uploads` : path.join(os.tmpdir(), "amapola-demo-uploads");

/** Fichero local de la demo para una ruta del almacén (crea la carpeta si hace falta). */
export function demoFile(p: string): string {
  const file = path.join(demoRoot(), ...safe(p).split("/"));
  mkdirSync(path.dirname(file), { recursive: true });
  return file;
}

// ── Operaciones ──────────────────────────────────────────────────────────────
export type UploadTicket = { url: string; headers: Record<string, string> };

/** Dirección a la que el navegador envía el fichero (PUT), válida para esa ruta y poco tiempo. */
export async function createUpload(p: string, mimeType: string): Promise<UploadTicket> {
  safe(p);
  if (isDemo()) return { url: `/media/subida?ruta=${encodeURIComponent(p)}`, headers: { "content-type": mimeType } };
  const { data, error } = await (await bucket()).createSignedUploadUrl(p);
  if (error || !data) throw new Error(`No se ha podido preparar la subida: ${error?.message ?? "sin respuesta"}`);
  return { url: data.signedUrl, headers: { "content-type": mimeType, "cache-control": "max-age=3600", "x-upsert": "false" } };
}

/** Tamaño real del fichero subido, o null si no está en el almacén. */
export async function uploadedSize(p: string): Promise<number | null> {
  safe(p);
  if (isDemo()) {
    const file = demoFile(p);
    return existsSync(file) ? statSync(file).size : null;
  }
  const { data, error } = await (await bucket()).info(p);
  if (error || !data) return null;
  return typeof data.size === "number" ? data.size : null;
}

/** Enlace temporal de lectura (solo Supabase; en la demo el servidor entrega el fichero). */
export async function signedViewUrl(p: string, seconds: number): Promise<string> {
  const { data, error } = await (await bucket()).createSignedUrl(safe(p), seconds);
  if (error || !data) throw new Error(`No se ha podido abrir el archivo: ${error?.message ?? "sin respuesta"}`);
  return data.signedUrl;
}

/** Borra ficheros del almacén. No falla si alguno ya no existe: la fila de la base de datos manda. */
export async function removeObjects(paths: string[]): Promise<void> {
  const valid = paths.filter((p) => parseAssetPath(p));
  if (valid.length === 0) return;
  try {
    if (isDemo()) {
      for (const p of valid) {
        const file = demoFile(p);
        if (existsSync(file)) unlinkSync(file);
      }
      return;
    }
    const { error } = await (await bucket()).remove(valid);
    if (error) console.error("No se han podido borrar ficheros del almacén:", error.message);
  } catch (e) {
    console.error("No se han podido borrar ficheros del almacén:", e);
  }
}
