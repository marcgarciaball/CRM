import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto mt-16 max-w-md border-t-2 border-ink px-4 pt-4 sm:px-0">
      <p className="eyebrow mb-1">404</p>
      <h1 className="page-title">No encontrado</h1>
      <p className="mt-3 text-sm text-muted">Este registro no existe o ya no está disponible.</p>
      <Link href="/" className="btn btn-primary mt-4">Volver al inicio</Link>
    </div>
  );
}
