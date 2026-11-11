"use client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div role="alert" className="card mx-auto mt-10 max-w-md p-6 text-center">
      <h1 className="text-lg font-medium">No se ha podido cargar</h1>
      <p className="mt-2 text-sm text-muted">Puede ser un problema de conexión. Tus datos guardados no se han perdido.</p>
      <button type="button" className="btn btn-primary mt-4" onClick={() => reset()}>Reintentar</button>
    </div>
  );
}
