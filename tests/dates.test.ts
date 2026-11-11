import { describe, expect, it } from "vitest";
import { addDays, addMonths, formatDate, formatInstant, formatMonth, isLocalDate, monthGrid, monthRange, startOfWeek, todayMadrid } from "@/lib/dates";
import { guessCategory } from "@/lib/labels";

describe("fechas en Europe/Madrid", () => {
  it("calcula «hoy» en Madrid, también alrededor de medianoche y con horario de verano", () => {
    expect(todayMadrid(new Date("2026-01-15T22:59:00Z"))).toBe("2026-01-15"); // invierno, UTC+1
    expect(todayMadrid(new Date("2026-01-15T23:00:00Z"))).toBe("2026-01-16");
    expect(todayMadrid(new Date("2026-07-15T21:59:00Z"))).toBe("2026-07-15"); // verano, UTC+2
    expect(todayMadrid(new Date("2026-07-15T22:00:00Z"))).toBe("2026-07-16");
    // Noches de cambio de hora (29 mar y 25 oct de 2026).
    expect(todayMadrid(new Date("2026-03-28T23:30:00Z"))).toBe("2026-03-29");
    expect(todayMadrid(new Date("2026-10-24T22:30:00Z"))).toBe("2026-10-25");
    expect(todayMadrid(new Date("2026-10-25T22:59:00Z"))).toBe("2026-10-25");
    expect(todayMadrid(new Date("2026-10-25T23:00:00Z"))).toBe("2026-10-26");
  });
  it("muestra instantes en hora de Madrid", () => {
    expect(formatInstant(new Date("2026-03-29T00:30:00Z"))).toMatch(/29 mar 2026, 1:30|29 mar 2026, 01:30/);
    expect(formatInstant(new Date("2026-03-29T01:30:00Z"))).toMatch(/29 mar 2026, 3:30|29 mar 2026, 03:30/);
  });
  it("aritmética de fechas locales sin saltos por cambio de hora", () => {
    expect(addDays("2026-03-28", 1)).toBe("2026-03-29");
    expect(addDays("2026-03-29", 1)).toBe("2026-03-30");
    expect(addDays("2026-10-25", 1)).toBe("2026-10-26");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(monthRange("2028-02")).toEqual({ first: "2028-02-01", last: "2028-02-29" });
  });
  it("la semana empieza en lunes", () => {
    expect(startOfWeek("2026-11-10")).toBe("2026-11-09"); // martes → lunes
    expect(startOfWeek("2026-11-15")).toBe("2026-11-09"); // domingo → lunes anterior
    expect(startOfWeek("2026-11-09")).toBe("2026-11-09");
    const grid = monthGrid("2026-11"); // 1 nov 2026 es domingo
    expect(grid[0][0]).toBe("2026-10-26");
    expect(grid[0][6]).toBe("2026-11-01");
    expect(grid.at(-1)![0]).toBe("2026-11-30");
    expect(grid.every((w) => w.length === 7)).toBe(true);
  });
  it("formato español y validación", () => {
    expect(formatDate("2026-11-10", "2026-11-01")).toBe("mar, 10 nov");
    expect(formatDate("2027-01-05", "2026-11-01")).toMatch(/5 ene 2027/);
    expect(formatDate(null)).toBe("Sin fecha");
    expect(formatMonth("2026-11")).toBe("noviembre de 2026");
    expect(isLocalDate("2026-02-30")).toBe(false);
    expect(isLocalDate("2026-02-28")).toBe(true);
  });
  it("sugiere categoría por dominio", () => {
    expect(guessCategory("https://www.figma.com/file/x")).toBe("figma");
    expect(guessCategory("https://docs.google.com/document/d/x")).toBe("document");
    expect(guessCategory("https://example.test")).toBe("other");
  });
});
