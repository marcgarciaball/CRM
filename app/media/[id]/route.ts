import { createReadStream, existsSync, statSync } from "node:fs";
import { Readable } from "node:stream";
import { NextResponse, type NextRequest } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { isDemo, withUser } from "@/lib/db";
import { isUuid } from "@/lib/form";
import { getAsset } from "@/lib/services/assets";
import { demoFile, signedViewUrl } from "@/lib/storage";

const SIGNED_SECONDS = 600;

/**
 * Entrega un archivo de creatividad. La persona tiene que poder leer su fila (miembro del cliente);
 * si no, la respuesta es la misma que si no existiera.
 * - Supabase: redirige a un enlace firmado de pocos minutos.
 * - Demo local: sirve el fichero del disco, con soporte de rangos para que el vídeo se pueda recorrer.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const notFound = () => new NextResponse("No encontrado", { status: 404 });
  const userId = await getSessionUserId();
  if (!userId) return new NextResponse("Sin sesión", { status: 401 });
  if (!isUuid(id)) return notFound();
  const asset = await withUser(userId, (q) => getAsset(q, id));
  if (!asset) return notFound();

  if (!isDemo()) {
    const url = await signedViewUrl(asset.storage_path, SIGNED_SECONDS);
    // El navegador puede reutilizar la redirección mientras el enlace firmado siga vivo.
    return NextResponse.redirect(url, { status: 307, headers: { "Cache-Control": `private, max-age=${SIGNED_SECONDS - 120}` } });
  }

  const file = demoFile(asset.storage_path);
  if (!existsSync(file)) return notFound();
  const size = statSync(file).size;
  const headers: Record<string, string> = {
    "Content-Type": asset.mime_type,
    "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(asset.file_name)}`,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
  };
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") ?? "");
  if (range && (range[1] || range[2])) {
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start > end || start >= size) return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    const body = Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream;
    return new NextResponse(body, { status: 206, headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) } });
  }
  return new NextResponse(Readable.toWeb(createReadStream(file)) as ReadableStream, { headers: { ...headers, "Content-Length": String(size) } });
}
