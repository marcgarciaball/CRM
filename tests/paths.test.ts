import { describe, expect, it } from "vitest";
import {
  QUICK_CREATE_PARAM, campaignPath, clientPath, deliverablePath, newClientPath, quickCreatePath, resourcePath, swapClient, taskPath,
} from "@/lib/paths";

describe("rutas por cliente", () => {
  it("construye las rutas de un cliente y de sus registros", () => {
    expect(clientPath("C")).toBe("/c/C");
    expect(clientPath("C", "trabajo")).toBe("/c/C/trabajo");
    expect(clientPath("C", "trabajo", "tareas", "nueva")).toBe("/c/C/trabajo/tareas/nueva");
    expect(taskPath({ client_id: "C", id: "T" })).toBe("/c/C/trabajo/tareas/T");
    expect(deliverablePath({ client_id: "C", id: "D" })).toBe("/c/C/trabajo/entregables/D");
    expect(campaignPath({ client_id: "C", id: "K" })).toBe("/c/C/campanas/K");
    expect(resourcePath({ client_id: "C", id: "R" })).toBe("/c/C/recursos/R");
  });

  it("cambia de cliente manteniendo la sección y sin los identificadores de detalle", () => {
    expect(swapClient("/c/A/trabajo/tareas/T", "B")).toBe("/c/B/trabajo");
    expect(swapClient("/c/A/calendario", "B")).toBe("/c/B/calendario");
    expect(swapClient("/c/A/campanas/K", "B")).toBe("/c/B/campanas");
    expect(swapClient("/c/A/recursos", "B")).toBe("/c/B/recursos");
    expect(swapClient("/c/A/ajustes", "B")).toBe("/c/B/ajustes");
    expect(swapClient("/c/A", "B")).toBe("/c/B");
    expect(swapClient("/c/A/otra-cosa", "B")).toBe("/c/B");
    expect(swapClient("/novedades", "B")).toBe("/c/B");
    expect(swapClient("/", "B")).toBe("/c/B");
  });

  it("crear un cliente y abrir «Crear» al llegar a un cliente", () => {
    expect(newClientPath()).toBe("/clientes#nuevo");
    expect(quickCreatePath("C")).toBe("/c/C?crear=1");
    expect(new URL(quickCreatePath("C"), "http://x").searchParams.get(QUICK_CREATE_PARAM)).toBe("1");
  });
});
