import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Amapola Workspace", template: "%s · Amapola Workspace" },
  description: "Espacio de trabajo interno del equipo de Amapola Lab.",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#242833" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-ES" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
