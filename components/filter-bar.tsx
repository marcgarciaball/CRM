"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

export type FilterDef = { name: string; label: string; options: { id: string; label: string }[] };

/** Filtros en la URL (se pueden compartir y sobreviven a la recarga). */
export function FilterBar({ filters, search }: { filters: FilterDef[]; search?: { name: string; label: string } }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const set = (name: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value);
    else next.delete(name);
    start(() => router.replace(`${pathname}?${next}`, { scroll: false }));
  };
  const active = filters.some((f) => params.get(f.name)) || (search && params.get(search.name));
  return (
    <div className="mb-4 flex flex-wrap items-end gap-2" aria-busy={pending}>
      {search && (
        <form className="min-w-48 flex-1 sm:max-w-xs" role="search" onSubmit={(e) => { e.preventDefault(); set(search.name, String(new FormData(e.currentTarget).get("q") ?? "").trim()); }}>
          <label className="label" htmlFor="filter-q">{search.label}</label>
          <input key={params.get(search.name) ?? ""} id="filter-q" name="q" type="search" defaultValue={params.get(search.name) ?? ""} className="field" placeholder="Escribe y pulsa Intro" />
        </form>
      )}
      {filters.map((f) => (
        <div key={f.name} className="min-w-32">
          <label className="label" htmlFor={`filter-${f.name}`}>{f.label}</label>
          <select id={`filter-${f.name}`} className="field" value={params.get(f.name) ?? ""} onChange={(e) => set(f.name, e.target.value)}>
            <option value="">Todos</option>
            {f.options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </div>
      ))}
      {active && (
        <button type="button" className="btn btn-ghost" onClick={() => {
          const next = new URLSearchParams(params);
          filters.forEach((f) => next.delete(f.name));
          if (search) next.delete(search.name);
          start(() => router.replace(`${pathname}?${next}`, { scroll: false }));
        }}>
          Quitar filtros
        </button>
      )}
      <span role="status" className="pb-2 text-sm text-muted">{pending ? "Cargando…" : ""}</span>
    </div>
  );
}
