"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { confirmAssetUpload, prepareAssetUpload } from "@/app/actions/assets";
import { ASSET_ACCEPT, MAX_ASSETS, assetProblem } from "@/lib/assets";

/** Envía el fichero directamente al almacén (no pasa por la aplicación), informando del progreso. */
function put(url: string, headers: Record<string, string>, file: File, onProgress: (fraction: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(String(xhr.status))));
    xhr.onerror = () => reject(new Error("red"));
    xhr.send(file);
  });
}

/**
 * Sube una o varias imágenes o vídeos a un entregable. Los archivos se añaden al final,
 * en el orden en que se eligen (para un carrusel: selecciónalos ya ordenados o reordénalos después).
 */
export function AssetUploader({ deliverableId, count, label }: { deliverableId: string; count: number; label: string }) {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const busy = status !== null;
  const room = MAX_ASSETS - count;

  const upload = async (files: File[]) => {
    const failed: string[] = [];
    // Orden estable: tal como los lista el selector de archivos (normalmente, por nombre).
    const queue = files.slice(0, room);
    if (files.length > room) failed.push(`Solo caben ${room} archivos más (máximo ${MAX_ASSETS} por entregable). El resto no se ha subido.`);
    let done = 0;
    for (const file of queue) {
      const position = `${done + 1} de ${queue.length}`;
      done++;
      const problem = assetProblem(file);
      if (problem) { failed.push(problem); continue; }
      const info = { deliverableId, fileName: file.name, mimeType: file.type, size: file.size };
      setStatus(`Subiendo ${position}: ${file.name}…`);
      try {
        const prepared = await prepareAssetUpload(info);
        if ("error" in prepared) { failed.push(`«${file.name}»: ${prepared.error}`); continue; }
        const { path, url, headers } = prepared.ticket;
        await put(url, headers, file, (f) => setStatus(`Subiendo ${position}: ${file.name} (${Math.round(f * 100)} %)`));
        const confirmed = await confirmAssetUpload({ ...info, path });
        if ("error" in confirmed) failed.push(`«${file.name}»: ${confirmed.error}`);
      } catch (e) {
        const code = e instanceof Error ? e.message : "";
        failed.push(`«${file.name}»: no se ha podido subir${code === "413" ? " (el almacén no admite archivos de este tamaño)" : ""}. Inténtalo de nuevo.`);
      }
    }
    setErrors(failed);
    setStatus(null);
    if (input.current) input.current.value = "";
    router.refresh();
  };

  if (room <= 0) return <p className="text-xs text-muted">Has llegado al máximo de {MAX_ASSETS} archivos.</p>;
  return (
    <div>
      <input ref={input} type="file" multiple accept={ASSET_ACCEPT} className="sr-only" tabIndex={-1} aria-hidden
        onChange={(e) => { const files = [...(e.target.files ?? [])]; if (files.length > 0) void upload(files); }} />
      <button type="button" className="btn btn-secondary btn-sm" disabled={busy} aria-busy={busy} onClick={() => input.current?.click()}>
        {busy ? "Subiendo…" : label}
      </button>
      <p className="mt-1 text-xs text-muted">Imágenes (JPG, PNG, WebP, GIF; hasta 20 MB) o vídeo (MP4, WebM, MOV; hasta 200 MB). Puedes elegir varias a la vez.</p>
      <p role="status" className="text-xs text-muted">{status}</p>
      {errors.length > 0 && (
        <ul role="alert" className="mt-1 space-y-0.5 text-xs text-st-danger-fg">
          {errors.map((e) => <li key={e}>{e}</li>)}
        </ul>
      )}
    </div>
  );
}
