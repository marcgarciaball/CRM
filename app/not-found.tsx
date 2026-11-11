import Link from "next/link";

export default function NotFound() {
  return (
    <div className="card mx-auto mt-16 max-w-md p-6 text-center">
      <h1 className="text-lg font-medium">No encontrado</h1>
      <p className="mt-2 text-sm text-muted">Este registro no existe o ya no está disponible.</p>
      <Link href="/" className="btn btn-primary mt-4">Volver al inicio</Link>
    </div>
  );
}
