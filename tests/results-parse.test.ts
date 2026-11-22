import { describe, expect, it } from "vitest";
import { MONTHLY_FIELDS } from "@/lib/results/columns";
import { parseCsv } from "@/lib/results/csv";
import { parseResultsCsv } from "@/lib/results/parse";

// Cifras inventadas: nunca datos reales de un cliente.
const META_HEADER = `"Nombre de la campaña","Nombre del anuncio",Mes,Alcance,Divisa,"CPC (Coste por clic en el enlace)","Clics (todos)",Impresiones,Frecuencia,"Importe gastado (EUR)",Compras,"Coste por compra","Inicio del informe","Fin del informe"`;
const metaRow = (camp: string, ad: string, month: string, spend: string, purchases: string) =>
  `"${camp}","${ad}","${month}-01 - ${month}-28",100,EUR,0.1,20,1000,1.5,${spend},${purchases},,${month}-01,${month}-28`;

describe("parseCsv", () => {
  it("lee comillas, comillas dobladas, comas dentro y CRLF", () => {
    expect(parseCsv(`"a, b","c""d"\r\n1,2`)).toEqual([["a, b", 'c"d'], ["1", "2"]]);
  });
  it("quita el BOM y las líneas vacías", () => {
    expect(parseCsv("﻿x,y\n\n1,2\n")).toEqual([["x", "y"], ["1", "2"]]);
  });
  it("admite saltos de línea dentro de comillas", () => {
    expect(parseCsv(`"a\nb",c`)).toEqual([["a\nb", "c"]]);
  });
});

describe("histórico mensual", () => {
  it("convierte números, deja sin dato lo que falta e ignora las columnas de Meta", () => {
    const r = parseResultsCsv("mes,ventas_brutas,descuentos,conversion,meta_gasto\n2026-01,1000.5,-20,0.031,99");
    expect(r.kind).toBe("monthly");
    if (r.kind !== "monthly") return;
    const row = r.rows[0];
    expect(row).toMatchObject({ month: "2026-01", ventas_brutas: 1000.5, descuentos: -20, conversion: 0.031, data_until: null });
    for (const f of MONTHLY_FIELDS) if (!["ventas_brutas", "descuentos", "conversion"].includes(f)) expect(row[f]).toBeNull();
    expect(row).not.toHaveProperty("meta_gasto");
    expect(r.warnings.join(" ")).toMatch(/Faltan columnas/);
  });

  it("una celda vacía es sin dato, no cero; lee datos_hasta", () => {
    const r = parseResultsCsv("mes,ventas_brutas,datos_hasta\n2026-11,,2026-11-02");
    if (r.kind !== "monthly") throw new Error("tipo");
    expect(r.rows[0].ventas_brutas).toBeNull();
    expect(r.rows[0].data_until).toBe("2026-11-02");
  });

  it.each([
    ["mes,foo\n2026-01,1", "Columnas desconocidas: foo"],
    ["mes,ventas_brutas\n2026-13,1", "Fila 2: mes no válido"],
    ["mes,ventas_brutas\n2026-01,\"1.234,5\"", "Fila 2: ventas_brutas no es un número"],
    ["mes,ventas_brutas\n2026-01,1\n2026-01,2", "El mes 2026-01 aparece dos veces"],
    ["mes,datos_hasta\n2026-01,2026-02-01", "Fila 2: datos_hasta no es de 2026-01"],
    ["mes,ventas_brutas", "El archivo no tiene filas"],
  ])("rechaza %j", (csv, message) => {
    expect(() => parseResultsCsv(csv)).toThrow(message);
  });
});

describe("informe de Meta", () => {
  it("salta la fila de totales y lee campaña, anuncio y mes", () => {
    const csv = [
      META_HEADER,
      `,,,475852,EUR,0.12,68128,1920722,4.03,5532.07,735,7.52,2025-11-01,2026-10-31`,
      metaRow("Camp, A", "Ad 1", "2026-03", "12.5", "3"),
      metaRow("Camp B", "Ad 2", "2026-03", "7", ""),
    ].join("\n");
    const r = parseResultsCsv(`﻿${csv}`);
    expect(r.kind).toBe("meta");
    if (r.kind !== "meta") return;
    expect(r.rows).toEqual([
      { month: "2026-03", campaign_name: "Camp, A", ad_name: "Ad 1", reach: 100, impressions: 1000, clicks: 20, spend: 12.5, purchases: 3 },
      { month: "2026-03", campaign_name: "Camp B", ad_name: "Ad 2", reach: 100, impressions: 1000, clicks: 20, spend: 7, purchases: null },
    ]);
  });

  it("suma las filas repetidas de la misma campaña, anuncio y mes", () => {
    const r = parseResultsCsv([META_HEADER, metaRow("C", "A", "2026-04", "1.5", "1"), metaRow("C", "A", "2026-04", "2", "")].join("\n"));
    if (r.kind !== "meta") throw new Error("tipo");
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ spend: 3.5, purchases: 1, clicks: 40 });
  });
});

describe("archivo no reconocido", () => {
  it("pide uno de los dos formatos", () => {
    expect(() => parseResultsCsv("Order,Total\n1,2")).toThrow("No reconozco el archivo");
  });
  it("avisa si viene separado por punto y coma", () => {
    expect(() => parseResultsCsv("mes;ventas_brutas\n2026-01;1")).toThrow("punto y coma");
  });
  it("rechaza un archivo vacío", () => {
    expect(() => parseResultsCsv("")).toThrow("vacío");
  });
});
