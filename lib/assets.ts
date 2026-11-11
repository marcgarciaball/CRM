// Reglas de los archivos de creatividad. Se comparten entre el navegador (aviso inmediato)
// y el servidor (que es quien las hace cumplir).
export const ASSET_TYPES = {
  "image/jpeg": { kind: "image", ext: "jpg" },
  "image/png": { kind: "image", ext: "png" },
  "image/webp": { kind: "image", ext: "webp" },
  "image/gif": { kind: "image", ext: "gif" },
  "video/mp4": { kind: "video", ext: "mp4" },
  "video/webm": { kind: "video", ext: "webm" },
  "video/quicktime": { kind: "video", ext: "mov" },
} as const;
export type AssetMime = keyof typeof ASSET_TYPES;
export type AssetKind = "image" | "video";

export const ASSET_ACCEPT = Object.keys(ASSET_TYPES).join(",");
export const MAX_ASSETS = 20;
const MB = 1024 * 1024;
export const MAX_BYTES: Record<AssetKind, number> = { image: 20 * MB, video: 200 * MB };

export const isAssetMime = (v: string): v is AssetMime => v in ASSET_TYPES;

/** Mensaje de error si el archivo no se admite; null si es válido. */
export function assetProblem(file: { name: string; type: string; size: number }): string | null {
  if (!isAssetMime(file.type)) return `«${file.name}»: formato no admitido. Usa JPG, PNG, WebP, GIF, MP4, WebM o MOV.`;
  const { kind } = ASSET_TYPES[file.type];
  if (!Number.isInteger(file.size) || file.size <= 0) return `«${file.name}» está vacío.`;
  if (file.size > MAX_BYTES[kind]) {
    return `«${file.name}» pesa demasiado: máximo ${MAX_BYTES[kind] / MB} MB para ${kind === "image" ? "imágenes" : "vídeos"}.`;
  }
  return null;
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const PATH = new RegExp(`^(${UUID})/(${UUID})/${UUID}\\.(jpg|png|webp|gif|mp4|webm|mov)$`);

/** Ruta en el almacén: cliente/entregable/archivo.ext, solo con identificadores generados por el servidor. */
export function parseAssetPath(path: string): { clientId: string; deliverableId: string } | null {
  const m = PATH.exec(path);
  return m ? { clientId: m[1], deliverableId: m[2] } : null;
}

export const formatBytes = (n: number) => (n >= MB ? `${(n / MB).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
