import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { Driver } from "@/lib/db/types";
import { setupDb, type Team } from "./helpers";

// Supabase Auth se sustituye por mocks: se comprueba qué ruta toma `/auth/confirm`, no el servicio. La base de datos es real.
// `jar` imita el almacén de cookies de Next: el intercambio escribe ahí la sesión y un cierre de sesión correcto la borra.
const auth = vi.hoisted(() => ({ verifyOtp: vi.fn(), exchange: vi.fn(), signOut: vi.fn(), supabaseAuth: vi.fn(), jar: new Map<string, string>() }));
vi.mock("@/lib/supabase/server", () => ({ supabaseAuth: auth.supabaseAuth }));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [...auth.jar].map(([name, value]) => ({ name, value })) }) }));

const { GET } = await import("@/app/auth/confirm/route");

let driver: Driver;
let t: Team;
beforeAll(async () => {
  delete process.env.WORKSPACE_DEMO;
  ({ driver, team: t } = await setupDb());
});
afterAll(() => driver.close());
const SESSION = ["sb-ref-auth-token.0", "sb-ref-auth-token.1"];
beforeEach(() => {
  vi.resetAllMocks();
  auth.jar.clear();
  auth.supabaseAuth.mockResolvedValue({ auth: { verifyOtp: auth.verifyOtp, exchangeCodeForSession: auth.exchange, signOut: auth.signOut } });
  // Un cierre local correcto borra la sesión del almacén, como hace el cliente real.
  auth.signOut.mockImplementation(async () => { auth.jar.clear(); return { error: null }; });
});

/** Ejecuta la ruta y devuelve el destino (ruta y consulta) de la redirección. */
async function respond(query: string, cookie?: string) {
  const res = await GET(new NextRequest(`http://localhost:3000/auth/confirm${query}`, cookie ? { headers: { cookie } } : undefined));
  expect(res.status).toBe(307);
  const to = new URL(res.headers.get("location")!);
  expect(to.origin).toBe("http://localhost:3000");
  return { res, to: to.pathname + to.search };
}
const visit = async (query: string) => (await respond(query)).to;
/** El intercambio abre la sesión: el almacén de cookies recibe los `sb-*`. */
const signedInAs = (id: string) => auth.exchange.mockImplementation(async () => {
  for (const name of SESSION) auth.jar.set(name, "valor");
  return { data: { user: { id } }, error: null };
});
/** Cookies que la respuesta manda borrar (Max-Age=0). */
const cleared = (res: Response) =>
  res.headers.getSetCookie().filter((c) => /Max-Age=0/i.test(c)).map((c) => c.split("=")[0]).sort();

describe("GET /auth/confirm", () => {
  it("con `error` va a /login?error=google sin tocar Supabase", async () => {
    expect(await visit("?error=access_denied&error_description=x")).toBe("/login?error=google");
    expect(await visit("?error=access_denied&code=abc")).toBe("/login?error=google");
    expect(auth.exchange).not.toHaveBeenCalled();
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  });

  it("sin `code` ni `token_hash` va a /login?error=google", async () => {
    expect(await visit("")).toBe("/login?error=google");
    expect(await visit("?next=/")).toBe("/login?error=google");
  });

  it("`token_hash` válido lleva a elegir contraseña; uno rechazado o de tipo desconocido, a /login", async () => {
    auth.verifyOtp.mockResolvedValue({ error: null });
    expect(await visit("?token_hash=h&type=invite&next=//evil.example")).toBe("/cuenta/contrasena");
    expect(auth.verifyOtp).toHaveBeenCalledWith({ token_hash: "h", type: "invite" });
    auth.verifyOtp.mockResolvedValue({ error: new Error("caducado") });
    expect(await visit("?token_hash=h&type=recovery")).toBe("/login");
    auth.verifyOtp.mockClear();
    expect(await visit("?token_hash=h&type=otro")).toBe("/login");
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  });

  it("si el intercambio del código falla va a /login?error=google", async () => {
    auth.exchange.mockResolvedValue({ data: { user: null }, error: new Error("código no válido") });
    expect(await visit("?code=abc&next=/")).toBe("/login?error=google");
  });

  it("código válido sin perfil: cierra la sesión y va a /sin-acceso", async () => {
    signedInAs(t.outsider);
    const { res, to } = await respond("?code=abc&next=/c/otro");
    expect(to).toBe("/sin-acceso");
    expect(auth.signOut).toHaveBeenCalledOnce();
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(cleared(res)).toEqual([]); // el cierre local ya vació el almacén: nada que borrar a mano
  });

  it("código válido con perfil desactivado: cierra la sesión y va a /sin-acceso", async () => {
    signedInAs(t.inactive);
    expect(await visit("?code=abc&next=/")).toBe("/sin-acceso");
    expect(auth.signOut).toHaveBeenCalledOnce();
  });

  it("código válido con perfil activo: respeta un `next` interno y no cierra la sesión", async () => {
    signedInAs(t.elisa);
    expect(await visit("?code=abc&next=/cuenta/contrasena")).toBe("/cuenta/contrasena");
    expect(await visit("?code=abc")).toBe("/");
    expect(auth.exchange).toHaveBeenCalledWith("abc");
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("código válido con perfil activo y `next` manipulado: va a /", async () => {
    signedInAs(t.elisa);
    for (const next of ["//evil.example", "https://evil.example", "/\\evil.example", "/a//b", "javascript:alert(1)"]) {
      expect(await visit(`?code=abc&next=${encodeURIComponent(next)}`)).toBe("/");
    }
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("si no se puede comprobar el perfil, cierra la sesión y va a /login?error=google", async () => {
    signedInAs("no-es-un-uuid"); // la consulta falla en la base de datos
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await visit("?code=abc")).toBe("/login?error=google");
    expect(auth.signOut).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it.each([
    ["responde con error", () => auth.signOut.mockResolvedValue({ error: new Error("red caída") })],
    ["lanza", () => auth.signOut.mockRejectedValue(new Error("red caída"))],
  ])("si el cierre de sesión %s, igualmente va a /sin-acceso y la respuesta borra las cookies de sesión", async (_name, fail) => {
    signedInAs(t.outsider);
    fail();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    // También se borra la cookie del verificador PKCE que ya traía la petición; las ajenas a Supabase se respetan.
    const { res, to } = await respond("?code=abc", "sb-ref-auth-token-code-verifier=v; otra=1");
    log.mockRestore();
    expect(to).toBe("/sin-acceso");
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(cleared(res)).toEqual(["sb-ref-auth-token-code-verifier", ...SESSION].sort());
  });

  it("si falla el cierre de sesión tras no poder comprobar el perfil, va a /login?error=google con las cookies borradas", async () => {
    signedInAs("no-es-un-uuid");
    auth.signOut.mockRejectedValue(new Error("red caída"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const { res, to } = await respond("?code=abc");
    log.mockRestore();
    expect(to).toBe("/login?error=google");
    expect(cleared(res)).toEqual([...SESSION].sort());
  });

  it("si Supabase lanza, siempre hay redirección y nunca un 500", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      auth.exchange.mockRejectedValue(new Error("red caída"));
      expect(await visit("?code=abc")).toBe("/login?error=google");
      auth.verifyOtp.mockRejectedValue(new Error("red caída"));
      expect(await visit("?token_hash=h&type=invite")).toBe("/login");
      auth.supabaseAuth.mockRejectedValue(new Error("faltan variables"));
      expect(await visit("?code=abc")).toBe("/login?error=google");
      expect(await visit("?token_hash=h&type=invite")).toBe("/login");
    } finally {
      log.mockRestore();
    }
  });

  it("en la demo siempre va a /login", async () => {
    process.env.WORKSPACE_DEMO = "1";
    try {
      signedInAs(t.elisa);
      expect(await visit("?code=abc")).toBe("/login");
      expect(auth.exchange).not.toHaveBeenCalled();
    } finally {
      delete process.env.WORKSPACE_DEMO;
    }
  });
});
