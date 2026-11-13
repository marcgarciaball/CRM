import { redirect } from "next/navigation";

/** Rutas antiguas sin cliente (`/trabajo`, `/campanas/…`) y cualquier otra ruta desconocida: al inicio. */
export default function LegacyPage() {
  redirect("/");
}
