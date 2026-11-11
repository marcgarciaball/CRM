import { createWriteStream, unlinkSync } from "node:fs";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { NextResponse, type NextRequest } from "next/server";
import { MAX_BYTES, parseAssetPath } from "@/lib/assets";
import { getSessionUserId } from "@/lib/auth";
import { isDemo, withUser } from "@/lib/db";
import { uploadTarget } from "@/lib/services/assets";
import { demoFile } from "@/lib/storage";

/**
 * SOLO demo local: recibe el fichero que en producción se envía directamente a Supabase Storage.
 * Fuera de la demo esta ruta no existe.
 */
export async function PUT(request: NextRequest) {
  if (!isDemo()) return new NextResponse("No encontrado", { status: 404 });
  const userId = await getSessionUserId();
  if (!userId) return new NextResponse("Sin sesión", { status: 401 });
  const path = request.nextUrl.searchParams.get("ruta") ?? "";
  const parsed = parseAssetPath(path);
  if (!parsed || !request.body) return new NextResponse("Petición no válida", { status: 400 });
  try {
    const target = await withUser(userId, (q) => uploadTarget(q, parsed.deliverableId));
    if (target.client_id !== parsed.clientId) throw new Error("otro cliente");
  } catch {
    return new NextResponse("Sin permiso", { status: 403 });
  }

  const file = demoFile(path);
  const limit = Math.max(MAX_BYTES.image, MAX_BYTES.video);
  let received = 0;
  const cap = new Transform({
    transform(chunk: Buffer, _enc, done) {
      received += chunk.length;
      done(received > limit ? new Error("demasiado grande") : null, chunk);
    },
  });
  try {
    // `wx`: una ruta se escribe una sola vez, como una subida firmada.
    await pipeline(Readable.fromWeb(request.body as Parameters<typeof Readable.fromWeb>[0]), cap, createWriteStream(file, { flags: "wx" }));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "EEXIST") return new NextResponse("Ya existe", { status: 409 });
    try { unlinkSync(file); } catch { /* no llegó a crearse */ }
    return new NextResponse(received > limit ? "Demasiado grande" : "No se ha podido guardar", { status: received > limit ? 413 : 500 });
  }
  return NextResponse.json({ ok: true });
}
