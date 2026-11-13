"use client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div role="alert" className="mx-auto mt-10 max-w-md border-t-2 border-ink pt-4">
      <p className="eyebrow mb-1">Error</p>
      <h1 className="page-title">No se ha podido cargar</h1>
      <p className="mt-3 text-sm text-muted">Puede ser un problema de conexión. Tus datos guardados no se han perdido.</p>
      <button type="button" className="btn btn-primary mt-4" onClick={() => reset()}>Reintentar</button>
    </div>
  );
}
