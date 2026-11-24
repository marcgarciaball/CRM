"use server";

import { run, type ActionState } from "@/lib/action";
import { requireUser } from "@/lib/auth";
import type { Q } from "@/lib/db";
import { isYearMonth } from "@/lib/dates";
import { AppError, toAppError } from "@/lib/errors";
import { bool, oneOf, text, uuid } from "@/lib/form";
import { decimal, percent } from "@/lib/profit/form";
import { parseProfitCsv, type ParsedProfitFile } from "@/lib/profit/parse";
import { SETTINGS_FIELDS, type CostSettings } from "@/lib/profit/types";
import { getClient } from "@/lib/services/clients";
import {
  deleteExpense, deleteFixedCost, deleteProduct, importProductSales, replaceExpenses, replaceFixedCosts, replaceProducts,
  saveExpense, saveFixedCost, saveProduct, saveSettings,
} from "@/lib/services/profit";

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

const MAX_FILE = 512 * 1024;
const OWNER_COSTS = "Solo la Propiedad puede cambiar los costes fijos.";
const OWNER_EXPENSES = "Solo la Propiedad puede cambiar los gastos.";
const plural = (n: number, one: string, many: string) => `${n.toLocaleString("es-ES")} ${n === 1 ? one : many}`;

async function writableClient(q: Q, clientId: string) {
  const client = await getClient(q, clientId);
  if (!client) throw new AppError("No tienes acceso a este cliente.", "forbidden");
  if (client.archived_at) throw new AppError("Este cliente está archivado: solo lectura.");
  return client;
}
async function ownerClient(q: Q, clientId: string, message: string) {
  const client = await writableClient(q, clientId);
  if (client.my_role !== "owner") throw new AppError(message, "forbidden");
  return client;
}

const SETTING_LABELS: Record<keyof CostSettings, [string, "pct" | "num"]> = {
  iva: ["el IVA", "pct"], horas_productivas_anuales: ["las horas productivas", "num"], precio_tela_m2: ["el precio de la tela", "num"],
  tinta_m2: ["la tinta por m²", "num"], merma_tela: ["la merma", "pct"], reimpresion: ["las reimpresiones", "pct"],
  roturas: ["las roturas", "pct"], comision_pct: ["la comisión", "pct"], comision_fija_pedido: ["la comisión por pedido", "num"],
  envio_neto_pedido: ["el envío por pedido", "num"], unidades_por_pedido: ["las unidades por pedido", "num"],
};

/** Supuestos generales. Los porcentajes se escriben en % («21»). */
export const saveSettingsAction: Action = async (_prev, fd) =>
  run(async (q) => {
    const client = await writableClient(q, uuid(fd, "client_id"));
    const s = {} as CostSettings;
    for (const f of SETTINGS_FIELDS) {
      const [label, kind] = SETTING_LABELS[f];
      s[f] = kind === "pct" ? percent(fd, f, label) : decimal(fd, f, label);
    }
    await saveSettings(q, client.id, s);
    return { state: { ok: true, notice: "Supuestos guardados." } };
  });

export const saveFixedCostAction: Action = async (_prev, fd) =>
  run(async (q) => {
    const client = await ownerClient(q, uuid(fd, "client_id"), OWNER_COSTS);
    const id = text(fd, "id", "el identificador", { max: 36 }) || null;
    await saveFixedCost(q, client.id, id ? uuid(fd, "id") : null, {
      group: oneOf(fd, "group", ["personal", "estructura"] as const),
      concept: text(fd, "concept", "el concepto", { required: true, max: 160 }),
      monthly_amount: decimal(fd, "monthly_amount", "el importe"),
      note: text(fd, "note", "la nota", { max: 500 }),
    });
    return { state: { ok: true, notice: "Coste guardado." } };
  });

export const deleteFixedCostAction: Action = async (_prev, fd) =>
  run(async (q) => {
    const client = await ownerClient(q, uuid(fd, "client_id"), OWNER_COSTS);
    await deleteFixedCost(q, client.id, uuid(fd, "id"));
    return { state: { ok: true, notice: "Coste borrado." } };
  });

export const saveProductAction: Action = async (_prev, fd) =>
  run(async (q) => {
    const client = await writableClient(q, uuid(fd, "client_id"));
    const id = text(fd, "id", "el identificador", { max: 36 }) ? uuid(fd, "id") : null;
    await saveProduct(q, client.id, id, {
      family: text(fd, "family", "la familia", { required: true, max: 160 }),
      format: text(fd, "format", "el formato", { max: 160 }),
      price: decimal(fd, "price", "el precio"),
      fabric_w_cm: decimal(fd, "fabric_w_cm", "el ancho de tela"),
      fabric_h_cm: decimal(fd, "fabric_h_cm", "el alto de tela"),
      minutes: decimal(fd, "minutes", "los minutos"),
      support_cost: decimal(fd, "support_cost", "el coste de soporte"),
      packaging_cost: decimal(fd, "packaging_cost", "el coste de embalaje"),
      shopify_title: text(fd, "shopify_title", "el producto de Shopify", { max: 300 }) || null,
      variant_match: text(fd, "variant_match", "el texto de variante", { max: 160 }) || null,
      active: bool(fd, "active"),
      note: text(fd, "note", "la nota", { max: 1000 }),
    });
    return { state: { ok: true, notice: "Producto guardado." } };
  });

export const deleteProductAction: Action = async (_prev, fd) =>
  run(async (q) => {
    const client = await ownerClient(q, uuid(fd, "client_id"), "Solo la Propiedad puede borrar productos.");
    await deleteProduct(q, client.id, uuid(fd, "id"));
    return { state: { ok: true, notice: "Producto borrado." } };
  });

function month(fd: FormData): string {
  const m = text(fd, "month", "el mes", { required: true, max: 7 });
  if (!isYearMonth(m)) throw new AppError("El mes no es válido (AAAA-MM).");
  return m;
}

export const saveExpenseAction: Action = async (_prev, fd) =>
  run(async (q) => {
    const client = await ownerClient(q, uuid(fd, "client_id"), OWNER_EXPENSES);
    await saveExpense(q, client.id, { month: month(fd), amount: decimal(fd, "amount", "los gastos"), comment: text(fd, "comment", "el comentario", { max: 300 }) });
    return { state: { ok: true, notice: "Gastos guardados." } };
  });

export const deleteExpenseAction: Action = async (_prev, fd) =>
  run(async (q) => {
    const client = await ownerClient(q, uuid(fd, "client_id"), OWNER_EXPENSES);
    await deleteExpense(q, client.id, month(fd));
    return { state: { ok: true, notice: "Mes borrado." } };
  });

async function readFile(fd: FormData): Promise<ParsedProfitFile> {
  const file = fd.get("file");
  if (!(file instanceof File) || !file.name) throw new AppError("Elige un archivo.");
  if (!file.name.toLowerCase().endsWith(".csv")) throw new AppError("Sube un archivo .csv.");
  if (file.size > MAX_FILE) throw new AppError("El archivo pesa más de 512 KB.");
  if (file.size === 0) throw new AppError("El archivo está vacío.");
  const parsed = parseProfitCsv(await file.text());
  if (!parsed) {
    throw new AppError("No reconozco el archivo. Sube el export de Shopify de ventas por producto y variante, el escandallo de productos, los costes fijos o los gastos mensuales.");
  }
  return parsed;
}

/** Importa uno de los cuatro archivos. Escandallo y costes fijos sustituyen la lista entera (Propiedad, «SUSTITUIR»). */
export const importProfitAction: Action = async (_prev, fd) => {
  await requireUser();
  let clientId: string;
  let parsed: ParsedProfitFile;
  try {
    clientId = uuid(fd, "client_id");
    parsed = await readFile(fd);
  } catch (e) {
    return { error: toAppError(e).message };
  }
  return run(async (q) => {
    const replaceList = parsed.kind === "products" || parsed.kind === "fixed_costs";
    if (replaceList) {
      await ownerClient(q, clientId, parsed.kind === "products" ? "Solo la Propiedad puede sustituir el escandallo." : OWNER_COSTS);
      if (text(fd, "confirm", "la confirmación") !== "SUSTITUIR") throw new AppError("Escribe SUSTITUIR para confirmar: se borra la lista actual.");
    }
    switch (parsed.kind) {
      case "products":
        return { state: { ok: true, notice: `Escandallo: ${plural(await replaceProducts(q, clientId, parsed.rows), "producto", "productos")}.` } };
      case "fixed_costs":
        return { state: { ok: true, notice: `Costes fijos: ${plural(await replaceFixedCosts(q, clientId, parsed.rows), "línea", "líneas")}.` } };
      case "expenses":
        await ownerClient(q, clientId, OWNER_EXPENSES);
        return { state: { ok: true, notice: `Gastos: ${plural(await replaceExpenses(q, clientId, parsed.rows), "mes", "meses")}.` } };
      case "product_sales": {
        await writableClient(q, clientId);
        const r = await importProductSales(q, clientId, parsed.rows);
        return { state: { ok: true, notice: `Ventas por producto: ${plural(r.rows, "fila", "filas")} en ${plural(r.months, "mes", "meses")}.` } };
      }
    }
  });
};
