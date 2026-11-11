// Fechas locales como texto "YYYY-MM-DD" (sin zona) e instantes como Date.
// Zona de trabajo: Europe/Madrid. Nunca se usan desplazamientos UTC fijos.
export const TIME_ZONE = "Europe/Madrid";
export type LocalDate = string; // YYYY-MM-DD
export type YearMonth = string; // YYYY-MM

const DAY = 86_400_000;
const toUtc = (d: LocalDate) => {
  const [y, m, day] = d.split("-").map(Number);
  return Date.UTC(y, m - 1, day);
};
const fromUtc = (ms: number): LocalDate => new Date(ms).toISOString().slice(0, 10);

export function isLocalDate(v: unknown): v is LocalDate {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && fromUtc(toUtc(v)) === v;
}
export function isYearMonth(v: unknown): v is YearMonth {
  return typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}

/** Fecha local de hoy en Madrid para un instante dado. */
export function todayMadrid(now: Date = new Date()): LocalDate {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export const addDays = (d: LocalDate, n: number): LocalDate => fromUtc(toUtc(d) + n * DAY);
/** Lunes de la semana de `d`. */
export function startOfWeek(d: LocalDate): LocalDate {
  const dow = (new Date(toUtc(d)).getUTCDay() + 6) % 7; // lunes = 0
  return addDays(d, -dow);
}
export const monthOf = (d: LocalDate): YearMonth => d.slice(0, 7);
export function monthRange(ym: YearMonth): { first: LocalDate; last: LocalDate } {
  const [y, m] = ym.split("-").map(Number);
  return { first: `${ym}-01`, last: fromUtc(Date.UTC(y, m, 0)) };
}
export function addMonths(ym: YearMonth, n: number): YearMonth {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}
/** Semanas (lunes a domingo) que cubren el mes; incluye días de meses vecinos. */
export function monthGrid(ym: YearMonth): LocalDate[][] {
  const { first, last } = monthRange(ym);
  const weeks: LocalDate[][] = [];
  for (let start = startOfWeek(first); start <= last; start = addDays(start, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(start, i)));
  }
  return weeks;
}

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("es-ES", { timeZone: "UTC", ...opts });
const noon = (d: LocalDate) => new Date(toUtc(d) + DAY / 2);
/** "mar, 10 nov" (añade el año si no es el actual). */
export function formatDate(d: LocalDate | null | undefined, today: LocalDate = todayMadrid()): string {
  if (!d) return "Sin fecha";
  const sameYear = d.slice(0, 4) === today.slice(0, 4);
  return fmt({ weekday: "short", day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) }).format(noon(d));
}
export const formatDayLong = (d: LocalDate) => fmt({ weekday: "long", day: "numeric", month: "long" }).format(noon(d));
export const formatMonth = (ym: YearMonth) => fmt({ month: "long", year: "numeric" }).format(noon(`${ym}-01`));
export const formatRange = (a: LocalDate, b: LocalDate) =>
  `${fmt({ day: "numeric", month: "short" }).format(noon(a))} – ${fmt({ day: "numeric", month: "short" }).format(noon(b))}`;
/** Instante (timestamptz) mostrado en hora de Madrid. */
export function formatInstant(t: Date | string): string {
  return new Intl.DateTimeFormat("es-ES", { timeZone: TIME_ZONE, day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(t));
}
