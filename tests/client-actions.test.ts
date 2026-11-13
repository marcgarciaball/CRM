import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Driver } from "@/lib/db/types";
import type { ActionState } from "@/lib/action";
import { as, setupDb, type Clients, type Team } from "./helpers";

// Las acciones se ejecutan fuera de Next: la sesión es la persona de `session.user`; redirect lanza como en Next.
const session = vi.hoisted(() => ({ user: "" }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => { throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;replace;${url};307;` }); },
  notFound: () => { throw Object.assign(new Error("NEXT_NOT_FOUND"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" }); },
}));
// Supabase (solo fuera de la demo): se comprueba qué se le pide; ninguna llamada sale de aquí.
const supa = vi.hoisted(() => ({ admin: vi.fn(), invite: vi.fn(), reset: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => { supa.admin(); return { auth: { admin: { inviteUserByEmail: supa.invite } } }; },
  supabaseAuth: async () => ({ auth: { resetPasswordForEmail: supa.reset } }),
}));
vi.mock("@/lib/auth", async () => {
  const { withUser } = await import("@/lib/db");
  const { getProfile } = await import("@/lib/services/core");
  return { requireUser: async () => (await withUser(session.user, (q) => getProfile(q, session.user)))! };
});

const {
  addMemberAction, archiveClientAction, createClientAction, removeMemberAction, resendInvitationAction,
  setMemberRoleAction, updateClientAction,
} = await import("@/app/actions/clients");
const { getClient, listClientPeople } = await import("@/lib/services/clients");
const { passwordLinkTarget } = await import("@/lib/site");

let driver: Driver;
let t: Team;
let c: Clients;
beforeAll(async () => {
  process.env.WORKSPACE_DEMO = "1"; // invitaciones de la demo: sin Supabase ni emails
  ({ driver, team: t, c } = await setupDb());
});
afterAll(async () => {
  delete process.env.WORKSPACE_DEMO;
  await driver.close();
});
beforeEach(() => { session.user = t.maite; });
afterEach(() => driver.transaction((q) => q("delete from invitation_log")));

const sys = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => driver.transaction((q) => q<T>(sql, params));
const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};
const call = (action: (p: ActionState, fd: FormData) => Promise<ActionState>, fields: Record<string, string>) => action(null, form(fields));
/** Destino de un redirect() lanzado por la acción. */
const redirectOf = async (p: Promise<unknown>) => {
  const e = await p.then(() => null, (err: { digest?: string }) => err);
  return e?.digest?.split(";")[2] ?? null;
};
const members = (client: string, user: string) =>
  sys<{ role: string }>("select role from client_members where client_id = $1 and user_id = $2", [client, user]);

describe("acciones de clientes", () => {
  it("un email con mayúsculas y espacios es la misma persona; añadirla dos veces avisa y no duplica", async () => {
    try {
      expect(await call(addMemberAction, { client_id: c.a, email: "  Lonely@TEST.invalid ", role: "member" }))
        .toEqual({ ok: true, notice: "Acceso concedido." });
      expect(await members(c.a, t.lonely)).toEqual([{ role: "member" }]);
      expect(await call(addMemberAction, { client_id: c.a, email: "LONELY@test.invalid", role: "owner" }))
        .toEqual({ ok: true, notice: "lonely@test.invalid ya tiene acceso." });
      expect(await members(c.a, t.lonely)).toEqual([{ role: "member" }]);
    } finally {
      await sys("delete from client_members where client_id = $1 and user_id = $2", [c.a, t.lonely]);
    }
  });

  it("email sin cuenta: exige nombre y, en la demo, crea la persona pendiente con acceso", async () => {
    expect(await call(addMemberAction, { client_id: c.a, email: "Nueva@Test.invalid", role: "member" }))
      .toEqual({ error: "Falta el nombre.", conflict: false });
    expect(await sys("select 1 from auth.users where email = 'nueva@test.invalid'")).toEqual([]);

    expect(await call(addMemberAction, { client_id: c.a, email: " Nueva@Test.invalid", display_name: "Nueva", role: "member" }))
      .toEqual({ ok: true, notice: "Persona creada en la demo (no se envía email)." });
    const [{ id }] = await sys<{ id: string }>("select id from auth.users where email = 'nueva@test.invalid'");
    expect(await members(c.a, id)).toEqual([{ role: "member" }]);
    expect((await as(t.maite, (q) => listClientPeople(q, c.a))).find((p) => p.user_id === id))
      .toMatchObject({ display_name: "Nueva", email: "nueva@test.invalid", pending: true });

    // Reenviar: en la demo no hay emails; a quien ya entró, no.
    expect(await call(resendInvitationAction, { client_id: c.a, user_id: id })).toEqual({ error: "No disponible en la demo.", conflict: false });
    await sys("update auth.users set last_sign_in_at = now() where id = $1", [t.sara]);
    expect((await call(resendInvitationAction, { client_id: c.a, user_id: t.sara }))?.error).toMatch(/ya ha entrado/);
    expect(await call(addMemberAction, { client_id: c.a, email: "nueva@test.invalid", role: "member" }))
      .toEqual({ ok: true, notice: "nueva@test.invalid ya tiene acceso." });
  });

  it("una miembro que llama a una acción de la propiedad recibe una negativa clara", async () => {
    session.user = t.elisa; // miembro de A
    const refusals = await Promise.all([
      call(addMemberAction, { client_id: c.a, email: "lonely@test.invalid", role: "member" }),
      call(setMemberRoleAction, { client_id: c.a, user_id: t.sara, role: "owner" }),
      call(removeMemberAction, { client_id: c.a, user_id: t.sara }),
      call(resendInvitationAction, { client_id: c.a, user_id: t.sara }),
    ]);
    for (const r of refusals) expect(r).toEqual({ error: "Solo una persona propietaria del cliente puede gestionar sus personas.", conflict: false });
    expect(await call(updateClientAction, { client_id: c.a, version: "1", name: "Intrusa" }))
      .toEqual({ error: "Solo una persona propietaria del cliente puede cambiarlo.", conflict: false });
    expect(await call(archiveClientAction, { client_id: c.a, archived: "1" }))
      .toEqual({ error: "Solo una persona propietaria del cliente puede cambiarlo.", conflict: false });
    expect(await members(c.a, t.sara)).toEqual([{ role: "member" }]);
    expect(await members(c.a, t.lonely)).toEqual([]);
    expect((await as(t.elisa, (q) => getClient(q, c.a)))).toMatchObject({ name: "Cliente A", archived_at: null });
  });

  it("crear un cliente lleva a él, con quien lo crea como propietaria; editar, archivar y recuperar", async () => {
    session.user = t.lonely;
    const to = await redirectOf(call(createClientAction, { name: "  Cliente nuevo ", description: "Notas" }));
    const id = /^\/c\/([0-9a-f-]{36})$/.exec(to ?? "")?.[1];
    expect(id).toBeDefined();
    expect(await as(t.lonely, (q) => getClient(q, id!))).toMatchObject({ name: "Cliente nuevo", description: "Notas", my_role: "owner" });
    expect(await call(createClientAction, { name: " " })).toEqual({ error: "Falta el nombre del cliente.", conflict: false });

    expect(await call(updateClientAction, { client_id: id!, version: "1", name: "Renombrado", description: "" }))
      .toEqual({ ok: true, notice: "Cliente guardado." });
    expect(await call(archiveClientAction, { client_id: id!, archived: "1" })).toEqual({ ok: true, notice: "Cliente archivado." });
    expect(await call(archiveClientAction, { client_id: id!, archived: "" })).toEqual({ ok: true, notice: "Cliente recuperado." });
    expect(await as(t.lonely, (q) => getClient(q, id!))).toMatchObject({ name: "Renombrado", archived_at: null });
  });

  it("la última propietaria no puede irse; al salir una misma, al inicio", async () => {
    session.user = t.ecommerce;
    expect(await call(removeMemberAction, { client_id: c.b, user_id: t.ecommerce }))
      .toEqual({ error: "El cliente debe conservar al menos una persona propietaria.", conflict: false });
    session.user = t.elisa;
    try {
      expect(await redirectOf(call(removeMemberAction, { client_id: c.b, user_id: t.elisa }))).toBe("/");
      expect(await members(c.b, t.elisa)).toEqual([]);
    } finally {
      await sys("insert into client_members (client_id, user_id, role) values ($1, $2, 'member') on conflict do nothing", [c.b, t.elisa]);
    }
  });
});

describe("acciones de clientes con Supabase real (simulado)", () => {
  const OWNER_ONLY = { error: "Solo una persona propietaria del cliente puede gestionar sus personas.", conflict: false };
  const link = () => ({ redirectTo: passwordLinkTarget() });
  /** Supabase crea la cuenta invitada; `then` simula lo que pase después (p. ej. que archiven el cliente). */
  const inviteCreates = (then?: () => Promise<unknown>) => supa.invite.mockImplementation(async (address: string) => {
    const [{ id }] = await sys<{ id: string }>("insert into auth.users (email) values ($1) returning id", [address]);
    await then?.();
    return { data: { user: { id } }, error: null };
  });
  const dropAccount = (address: string) => sys("delete from auth.users where email = $1", [address]);
  beforeEach(() => {
    delete process.env.WORKSPACE_DEMO;
    supa.admin.mockReset();
    supa.invite.mockReset();
    supa.reset.mockReset().mockResolvedValue({ error: null });
  });
  afterEach(() => { process.env.WORKSPACE_DEMO = "1"; });

  it("invita con el email normalizado y el enlace para elegir contraseña, y da acceso", async () => {
    inviteCreates();
    try {
      expect(await call(addMemberAction, { client_id: c.a, email: " Real@Test.invalid ", display_name: "Real", role: "member" }))
        .toEqual({ ok: true, notice: "Invitación enviada a real@test.invalid." });
      expect(supa.invite).toHaveBeenCalledExactlyOnceWith("real@test.invalid", link());
      const [{ id }] = await sys<{ id: string }>("select id from auth.users where email = 'real@test.invalid'");
      expect(await members(c.a, id)).toEqual([{ role: "member" }]);
    } finally {
      await sys("delete from client_members where user_id in (select id from auth.users where email = 'real@test.invalid')");
      await sys("delete from profiles where id in (select id from auth.users where email = 'real@test.invalid')");
      await dropAccount("real@test.invalid");
    }
  });

  it("una miembro o un cliente archivado no llegan a Supabase", async () => {
    session.user = t.elisa;
    expect(await call(addMemberAction, { client_id: c.a, email: "nadie@test.invalid", display_name: "Nadie", role: "member" })).toEqual(OWNER_ONLY);
    session.user = t.ecommerce;
    await sys("update clients set archived_at = now() where id = $1", [c.b]);
    try {
      expect((await call(addMemberAction, { client_id: c.b, email: "nadie@test.invalid", display_name: "Nadie", role: "member" }))?.error)
        .toMatch(/archivado/);
      expect((await call(resendInvitationAction, { client_id: c.b, user_id: t.elisa }))?.error).toMatch(/archivado/);
    } finally {
      await sys("update clients set archived_at = null where id = $1", [c.b]);
    }
    expect(supa.admin).not.toHaveBeenCalled();
    expect(supa.invite).not.toHaveBeenCalled();
    expect(supa.reset).not.toHaveBeenCalled();
  });

  it("si Supabase rechaza la invitación, se dice y no se da acceso", async () => {
    supa.invite.mockResolvedValue({ data: { user: null }, error: { message: "límite de envíos" } });
    const before = (await as(t.maite, (q) => listClientPeople(q, c.a))).length;
    expect(await call(addMemberAction, { client_id: c.a, email: "rechazo@test.invalid", display_name: "Rechazo", role: "member" }))
      .toEqual({ error: "No se ha podido enviar la invitación: límite de envíos" });
    expect(await sys("select 1 from auth.users where email = 'rechazo@test.invalid'")).toEqual([]);
    expect((await as(t.maite, (q) => listClientPeople(q, c.a))).length).toBe(before);
  });

  it("si la invitación salió pero no se pudo dar acceso, el error lo dice y que repetir es seguro", async () => {
    inviteCreates(() => sys("update clients set archived_at = now() where id = $1", [c.a]));
    try {
      const r = await call(addMemberAction, { client_id: c.a, email: "tarde@test.invalid", display_name: "Tarde", role: "member" });
      expect(r?.error).toMatch(/^Invitación enviada a tarde@test\.invalid, pero no se ha podido dar acceso al cliente: .*archivado.* Puedes intentarlo de nuevo sin riesgo\.$/);
      const [{ id }] = await sys<{ id: string }>("select id from auth.users where email = 'tarde@test.invalid'");
      expect(await members(c.a, id)).toEqual([]);
    } finally {
      await sys("update clients set archived_at = null where id = $1", [c.a]);
      await dropAccount("tarde@test.invalid");
    }
  });

  it("añadir a alguien que aún no ha entrado le reenvía la invitación; si el reenvío falla, el acceso queda y se avisa", async () => {
    try {
      expect(await call(addMemberAction, { client_id: c.a, email: "Lonely@test.invalid", role: "member" })).toEqual({ ok: true, notice: "Acceso concedido." });
      expect(supa.reset).toHaveBeenCalledExactlyOnceWith("lonely@test.invalid", link());
      expect(supa.admin).not.toHaveBeenCalled();
      await sys("delete from client_members where client_id = $1 and user_id = $2", [c.a, t.lonely]);

      supa.reset.mockResolvedValue({ error: { message: "demasiados emails" } });
      expect(await call(addMemberAction, { client_id: c.a, email: "lonely@test.invalid", role: "member" }))
        .toEqual({ ok: true, notice: "Acceso concedido.", warning: "No se ha podido reenviar la invitación: demasiados emails" });
      expect(await members(c.a, t.lonely)).toEqual([{ role: "member" }]);
    } finally {
      await sys("delete from client_members where client_id = $1 and user_id = $2", [c.a, t.lonely]);
    }
  });

  it("reenviar: solo la propiedad, solo a quien está pendiente, al email guardado", async () => {
    await sys("update auth.users set last_sign_in_at = now() where id = $1", [t.sara]);
    expect((await call(resendInvitationAction, { client_id: c.a, user_id: t.sara }))?.error).toMatch(/ya ha entrado/);
    session.user = t.elisa;
    expect(await call(resendInvitationAction, { client_id: c.a, user_id: t.ainhoa })).toEqual(OWNER_ONLY);
    expect(supa.reset).not.toHaveBeenCalled();

    session.user = t.maite;
    expect(await call(resendInvitationAction, { client_id: c.a, user_id: t.ainhoa })).toEqual({ ok: true, notice: "Invitación reenviada a ainhoa@test.invalid." });
    expect(supa.reset).toHaveBeenCalledExactlyOnceWith("ainhoa@test.invalid", link());
    expect(supa.admin).not.toHaveBeenCalled();
  });
});

