"use client";

import { useState } from "react";

export type ViewerItem = { id: string; kind: "image" | "video"; name: string };
const src = (id: string) => `/media/${id}`;

/**
 * Creatividad final: una imagen, un vídeo que se reproduce aquí mismo, o un carrusel
 * que se recorre en el orden en que se publicará.
 */
export function AssetViewer({ items, label }: { items: ViewerItem[]; label: string }) {
  const [index, setIndex] = useState(0);
  if (items.length === 0) return null;
  const i = Math.min(index, items.length - 1);
  const current = items[i];
  const many = items.length > 1;
  const go = (n: number) => setIndex((n + items.length) % items.length);

  return (
    <figure
      className="m-0"
      aria-roledescription={many ? "carrusel" : undefined}
      aria-label={label}
      onKeyDown={(e) => {
        // Las flechas pasan de imagen, salvo dentro del vídeo, donde sirven para avanzar y retroceder.
        if (!many || (e.target as HTMLElement).tagName === "VIDEO") return;
        if (e.key === "ArrowLeft") go(i - 1);
        if (e.key === "ArrowRight") go(i + 1);
      }}
    >
      <div className="relative flex items-center justify-center overflow-hidden border border-ink bg-surface">
        {current.kind === "video" ? (
          <video key={current.id} src={src(current.id)} controls playsInline preload="metadata" className="max-h-[70vh] w-full bg-ink" aria-label={current.name} />
        ) : (
          // Fichero privado servido por la aplicación: no pasa por el optimizador de imágenes.
          // eslint-disable-next-line @next/next/no-img-element
          <img key={current.id} src={src(current.id)} alt={current.name} className="max-h-[70vh] w-full object-contain" />
        )}
        {many && (
          <>
            <button type="button" onClick={() => go(i - 1)} aria-label="Anterior"
              className="absolute top-1/2 left-2 flex size-10 -translate-y-1/2 cursor-pointer items-center justify-center border border-ink bg-surface text-lg hover:bg-ink hover:text-white">‹</button>
            <button type="button" onClick={() => go(i + 1)} aria-label="Siguiente"
              className="absolute top-1/2 right-2 flex size-10 -translate-y-1/2 cursor-pointer items-center justify-center border border-ink bg-surface text-lg hover:bg-ink hover:text-white">›</button>
          </>
        )}
      </div>
      <figcaption className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span className="min-w-0 truncate" aria-live="polite">
          {many && <span className="font-mono font-medium text-ink">{i + 1} de {items.length} · </span>}{current.name}
        </span>
        <a href={src(current.id)} target="_blank" rel="noopener noreferrer" className="link">Abrir a tamaño completo<span className="sr-only"> (se abre en una pestaña nueva)</span></a>
      </figcaption>
      {many && (
        <ol className="mt-2 flex gap-1.5 overflow-x-auto pb-1" aria-label="Orden del carrusel">
          {items.map((item, n) => (
            <li key={item.id} className="shrink-0">
              <button type="button" onClick={() => setIndex(n)} aria-label={`Ver ${n + 1} de ${items.length}: ${item.name}`} aria-current={n === i ? "true" : undefined}
                className={`relative block size-14 cursor-pointer overflow-hidden border-2 bg-surface ${n === i ? "border-accent" : "border-ink/20 opacity-70 hover:opacity-100"}`}>
                {item.kind === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={src(item.id)} alt="" loading="lazy" className="size-full object-cover" />
                ) : (
                  <span className="flex size-full items-center justify-center bg-ink text-xs text-white" aria-hidden>▶</span>
                )}
                <span className="absolute right-0 bottom-0 bg-ink px-1 font-mono text-[10px] font-medium text-white" aria-hidden>{n + 1}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </figure>
  );
}
