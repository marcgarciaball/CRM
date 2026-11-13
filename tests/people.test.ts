import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { Driver } from "@/lib/db/types";
import { createCampaign } from "@/lib/services/campaigns";
import {
  addMemberByEmail, attachInvited, getClient, listClientPeople, listMyClients, recordInvitation, removeMember,
  setClientArchived, setMemberRole, updateClient,
} from "@/lib/services/clients";
import { deletePermanently, getProfile, listProfiles } from "@/lib/services/core";
import { createDeliverable, transitionDeliverable } from "@/lib/services/deliverables";
import { createResource, getResource } from "@/lib/services/resources";
import { createTask, listTasks, setTaskStatus } from "@/lib/services/tasks";
import { personName } from "@/lib/labels";
import { as, setupDb, type Clients, type Team } from "./helpers";

let driver: Driver;
let t: Team;
let c: Clients;
beforeAll(async () => ({ driver, team: t, c } = await setupDb()));
afterAll(() => driver.close());
// Cada alta por email consume el límite diario: se vacía el registro tras cada test.
afterEach(() => driver.transaction((q) => q("delete from invitation_log")));

const denied = { code: "42501" };
const LAST_OWNER = "El cliente debe conservar al menos una persona propietaria.";

/** Conexión privilegiada: solo para preparar y restaurar el estado compartido. */
const sys = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => driver.transaction((q) => q<T>(sql, params));
const membership = async (client: string, user: string) =>
  (await sys<{ role: string }>("select role from client_members where client_id = $1 and user_id = $2", [client, user]))[0]?.role ?? null;
const dropMember = (client: string, user: string) => sys("delete from client_members where client_id = $1 and user_id = $2", [client, user]);
const putMember = (client: string, user: string, role: "owner" | "member") =>
  sys("insert into client_members (client_id, user_id, role) values ($1, $2, $3) on conflict (client_id, user_id) do update set role = excluded.role", [client, user, role]);

describe("personas de un cliente", () => {
  it("añadir por email a alguien con cuenta: aparece al instante", async () => {
    try {
      expect(await as(t.maite, (q) => addMemberByEmail(q, c.a, "lonely@test.invalid", "member"))).toBe("added");
      expect((await as(t.lonely, (q) => listMyClients(q))).map((x) => x.id)).toEqual([c.a]);
      expect(await membership(c.a, t.lonely)).toBe("member");
    } finally {
      await dropMember(c.a, t.lonely);
    }
  });

  it("email con mayúsculas y espacios se reconoce", async () => {
    try {
      expect(await as(t.maite, (q) => addMemberByEmail(q, c.a, " Lonely@TEST.invalid ", "owner"))).toBe("added");
      expect(await membership(c.a, t.lonely)).toBe("owner");
    } finally {
      await dropMember(c.a, t.lonely);
    }
  });

  it("añadir dos veces no duplica", async () => {
    try {
      expect(await as(t.maite, (q) => addMemberByEmail(q, c.a, "lonely@test.invalid", "member"))).toBe("added");
      expect(await as(t.maite, (q) => addMemberByEmail(q, c.a, "lonely@test.invalid", "owner"))).toBe("already_member");
      const rows = await sys<{ role: string }>("select role from client_members where client_id = $1 and user_id = $2", [c.a, t.lonely]);
      expect(rows).toEqual([{ role: "member" }]); // tampoco cambia el rol
    } finally {
      await dropMember(c.a, t.lonely);
    }
  });

  it("email sin cuenta → needs_invitation, y attachInvited crea perfil y acceso", async () => {
    // Sin usuario de autenticación y con usuario pero sin perfil: la misma respuesta.
    expect(await as(t.maite, (q) => addMemberByEmail(q, c.a, "nueva@test.invalid", "member"))).toBe("needs_invitation");
    expect(await as(t.maite, (q) => addMemberByEmail(q, c.a, "outsider@test.invalid", "member"))).toBe("needs_invitation");
    expect(await membership(c.a, t.outsider)).toBeNull();

    // La invitación crea el usuario de autenticación; después se adjunta al cliente.
    const id = randomUUID();
    await sys("insert into auth.users (id, email) values ($1, 'nueva@test.invalid')", [id]);
    try {
      await as(t.maite, (q) => attachInvited(q, c.a, id, "Nueva", "member"));
      expect(await sys("select display_name, role, active from profiles where id = $1", [id]))
        .toEqual([{ display_name: "Nueva", role: "member", active: true }]);
      expect(await membership(c.a, id)).toBe("member");
      expect((await as(id, (q) => listMyClients(q))).map((x) => x.id)).toEqual([c.a]);
      // Repetirlo no falla ni duplica.
      await as(t.maite, (q) => attachInvited(q, c.a, id, "Otro nombre", "member"));
      expect(await sys("select count(*)::int as n from client_members where user_id = $1", [id])).toEqual([{ n: 1 }]);

      // Con un perfil ya existente: no se toca el nombre ni el rol de plataforma, solo se añade el acceso.
      await as(t.maite, (q) => attachInvited(q, c.a, t.lonely, "Nombre nuevo", "owner"));
      expect(await sys("select display_name, role from profiles where id = $1", [t.lonely])).toEqual([{ display_name: "Sola", role: "member" }]);
      expect(await membership(c.a, t.lonely)).toBe("owner");
    } finally {
      await dropMember(c.a, t.lonely);
      await sys("delete from client_members where user_id = $1", [id]);
      await sys("delete from profiles where id = $1", [id]);
      await sys("delete from auth.users where id = $1", [id]);
    }
  });

  it("una miembro no puede añadir, cambiar roles ni quitar a otra", async () => {
    await expect(as(t.sara, (q) => addMemberByEmail(q, c.a, "lonely@test.invalid", "member"))).rejects.toMatchObject(denied);
    await expect(as(t.sara, (q) => attachInvited(q, c.a, t.lonely, "Sola", "member"))).rejects.toMatchObject(denied);
    await expect(as(t.sara, (q) => setMemberRole(q, c.a, t.ainhoa, "owner"))).rejects.toMatchObject(denied);
    await expect(as(t.sara, (q) => setMemberRole(q, c.a, t.sara, "owner"))).rejects.toMatchObject(denied);
    await expect(as(t.sara, (q) => removeMember(q, c.a, t.ainhoa))).rejects.toMatchObject(denied);
    // Y no hay otro camino: la tabla no admite escrituras directas.
    await expect(as(t.sara, (q) => q("insert into client_members (client_id, user_id) values ($1, $2)", [c.a, t.lonely]))).rejects.toMatchObject(denied);
    await expect(as(t.maite, (q) => q("update client_members set role = 'owner' where client_id = $1", [c.a]))).rejects.toMatchObject(denied);
    expect(await membership(c.a, t.lonely)).toBeNull();
    expect(await membership(c.a, t.ainhoa)).toBe("member");
    expect(await membership(c.a, t.sara)).toBe("member");
  });

  it("una propietaria de A no puede añadir a nadie a B", async () => {
    await expect(as(t.maite, (q) => addMemberByEmail(q, c.b, "lonely@test.invalid", "member"))).rejects.toMatchObject(denied);
    await expect(as(t.maite, (q) => addMemberByEmail(q, c.b, "nadie@test.invalid", "member"))).rejects.toMatchObject(denied);
    await expect(as(t.maite, (q) => attachInvited(q, c.b, t.lonely, "Sola", "member"))).rejects.toMatchObject(denied);
    await expect(as(t.maite, (q) => setMemberRole(q, c.b, t.elisa, "owner"))).rejects.toMatchObject(denied);
    await expect(as(t.maite, (q) => removeMember(q, c.b, t.elisa))).rejects.toMatchObject(denied);
    // Una miembro de B que es propietaria de otro cliente tampoco.
    await expect(as(t.elisa, (q) => addMemberByEmail(q, c.b, "lonely@test.invalid", "member"))).rejects.toMatchObject(denied);
    expect(await membership(c.b, t.lonely)).toBeNull();
    expect(await membership(c.b, t.elisa)).toBe("member");
  });

  it("no se puede quitar ni degradar a la última propietaria", async () => {
    await expect(as(t.ecommerce, (q) => setMemberRole(q, c.b, t.ecommerce, "member"))).rejects.toThrow(LAST_OWNER);
    await expect(as(t.ecommerce, (q) => removeMember(q, c.b, t.ecommerce))).rejects.toThrow(LAST_OWNER);
    expect(await membership(c.b, t.ecommerce)).toBe("owner");
  });

  it("con dos propietarias, una puede degradar a la otra", async () => {
    try {
      await as(t.maite, (q) => setMemberRole(q, c.a, t.ecommerce, "member"));
      expect(await membership(c.a, t.ecommerce)).toBe("member");
      // Ahora maite es la única: no puede degradarse ni salir.
      await expect(as(t.maite, (q) => setMemberRole(q, c.a, t.maite, "member"))).rejects.toThrow(LAST_OWNER);
      await expect(as(t.maite, (q) => removeMember(q, c.a, t.maite))).rejects.toThrow(LAST_OWNER);
      await as(t.maite, (q) => setMemberRole(q, c.a, t.ecommerce, "owner"));
      expect(await membership(c.a, t.ecommerce)).toBe("owner");
    } finally {
      await putMember(c.a, t.ecommerce, "owner");
    }
  });

  it("quien ya no comparte cliente queda como «Antiguo miembro»: su id se conserva, su nombre no se ve", async () => {
    const id = await as(t.sara, (q) => createResource(q, { client_id: c.a, title: "Recurso de Sara", url: "https://example.com/sara-antigua" }));
    try {
      // Quien mira es miembro (la administración de la plataforma ve todos los perfiles).
      const before = (await as(t.ainhoa, (q) => getResource(q, id)))!;
      expect(before).toMatchObject({ created_by: t.sara, created_by_name: "Sara" });
      await dropMember(c.a, t.sara);
      const after = (await as(t.ainhoa, (q) => getResource(q, id)))!;
      expect(after).toMatchObject({ created_by: t.sara, created_by_name: null });
      expect(personName(after.created_by, after.created_by_name, "alguien")).toBe("Antiguo miembro");
      expect(personName(null, null, "alguien")).toBe("alguien");
    } finally {
      await putMember(c.a, t.sara, "member");
      await as(t.maite, (q) => deletePermanently(q, "resources", id));
    }
  });

  it("cualquiera puede salir; al salir pierde el acceso al momento", async () => {
    const task = await as(t.maite, (q) => createTask(q, {
      client_id: c.a, title: "Tarea de A", assignee_id: null, due_date: null, priority: "low", campaign_id: null, deliverable_id: null }));
    try {
      expect((await as(t.ainhoa, (q) => listTasks(q))).map((x) => x.id)).toContain(task);
      await as(t.ainhoa, (q) => removeMember(q, c.a, t.ainhoa));
      expect(await membership(c.a, t.ainhoa)).toBeNull();
      expect(await as(t.ainhoa, (q) => listTasks(q))).toEqual([]);
      expect(await as(t.ainhoa, (q) => listMyClients(q))).toEqual([]);
      // Una miembro no puede quitar a otra, pero sí a sí misma (ya comprobado); una vez fuera no puede volver a salir.
      await expect(as(t.ainhoa, (q) => removeMember(q, c.a, t.ainhoa))).rejects.toMatchObject(denied);
    } finally {
      await putMember(c.a, t.ainhoa, "member");
      await as(t.maite, (q) => deletePermanently(q, "tasks", task));
    }
  });

  it("al salir con trabajo asignado, lo abierto queda sin responsable y lo hecho se conserva", async () => {
    const ids = await as(t.maite, async (q) => {
      const task = (title: string) => createTask(q, {
        client_id: c.a, title, assignee_id: t.ainhoa, due_date: null, priority: "low", campaign_id: null, deliverable_id: null });
      const openTask = await task("Abierta de Ainhoa");
      const doneTask = await task("Hecha por Ainhoa");
      await setTaskStatus(q, doneTask, "done");
      const deliverable = await createDeliverable(q, {
        client_id: c.a, title: "Entregable de Ainhoa", channel: "other", campaign_id: null, owner_id: t.ainhoa, planned_date: null });
      const campaign = await createCampaign(q, {
        client_id: c.a, name: "Campaña de Ainhoa", start_date: null, end_date: null, owner_id: t.ainhoa });
      return { openTask, doneTask, deliverable, campaign };
    });
    try {
      await as(t.ainhoa, (q) => removeMember(q, c.a, t.ainhoa));
      expect(await membership(c.a, t.ainhoa)).toBeNull();
      const person = async (table: string, column: string, id: string) =>
        (await sys<{ p: string | null }>(`select ${column} as p from ${table} where id = $1`, [id]))[0].p;
      expect(await person("tasks", "assignee_id", ids.openTask)).toBeNull();
      expect(await person("tasks", "assignee_id", ids.doneTask)).toBe(t.ainhoa);
      expect(await person("deliverables", "owner_id", ids.deliverable)).toBeNull();
      expect(await person("campaigns", "owner_id", ids.campaign)).toBeNull();
      expect(await as(t.ainhoa, (q) => listTasks(q))).toEqual([]);
    } finally {
      await putMember(c.a, t.ainhoa, "member");
      await as(t.maite, async (q) => {
        for (const id of [ids.openTask, ids.doneTask]) await deletePermanently(q, "tasks", id);
        await deletePermanently(q, "deliverables", ids.deliverable);
        await deletePermanently(q, "campaigns", ids.campaign);
      });
    }
  });

  it("al quitar a alguien, sus tareas abiertas quedan sin asignar y las hechas conservan el historial", async () => {
    const ids = await as(t.maite, async (q) => {
      const task = (title: string) => createTask(q, {
        client_id: c.a, title, assignee_id: t.sara, due_date: null, priority: "low", campaign_id: null, deliverable_id: null });
      const deliverable = (title: string) => createDeliverable(q, {
        client_id: c.a, title, channel: "other", campaign_id: null, owner_id: t.sara, planned_date: null });
      const campaign = (name: string, status: "planned" | "completed") => createCampaign(q, {
        client_id: c.a, name, start_date: null, end_date: null, owner_id: t.sara, status });
      const openTask = await task("Abierta");
      const doneTask = await task("Hecha");
      await setTaskStatus(q, doneTask, "done");
      const openDeliverable = await deliverable("En preparación");
      const publishedDeliverable = await deliverable("Publicado");
      await transitionDeliverable(q, publishedDeliverable, "in_review");
      await transitionDeliverable(q, publishedDeliverable, "approved");
      await transitionDeliverable(q, publishedDeliverable, "published", { published_on: "2026-11-11" });
      return {
        openTask, doneTask, openDeliverable, publishedDeliverable,
        openCampaign: await campaign("Planificada", "planned"), completedCampaign: await campaign("Finalizada", "completed"),
        // Lo de otra persona del mismo cliente no se toca.
        otherPersonTask: await createTask(q, {
          client_id: c.a, title: "De Ainhoa", assignee_id: t.ainhoa, due_date: null, priority: "low", campaign_id: null, deliverable_id: null }),
      };
    });
    // Lo de sara en otro cliente (B) tampoco.
    await putMember(c.b, t.sara, "member");
    const taskInB = await as(t.ecommerce, (q) => createTask(q, {
      client_id: c.b, title: "De Sara en B", assignee_id: t.sara, due_date: null, priority: "low", campaign_id: null, deliverable_id: null }));
    try {
      await as(t.maite, (q) => removeMember(q, c.a, t.sara));
      expect(await membership(c.a, t.sara)).toBeNull();
      const person = async (table: string, column: string, id: string) =>
        (await sys<{ p: string | null }>(`select ${column} as p from ${table} where id = $1`, [id]))[0].p;
      expect(await person("tasks", "assignee_id", ids.openTask)).toBeNull();
      expect(await person("tasks", "assignee_id", ids.doneTask)).toBe(t.sara);
      expect(await person("deliverables", "owner_id", ids.openDeliverable)).toBeNull();
      expect(await person("deliverables", "owner_id", ids.publishedDeliverable)).toBe(t.sara);
      expect(await person("campaigns", "owner_id", ids.openCampaign)).toBeNull();
      expect(await person("campaigns", "owner_id", ids.completedCampaign)).toBe(t.sara);
      expect(await person("tasks", "assignee_id", ids.otherPersonTask)).toBe(t.ainhoa);
      expect(await person("tasks", "assignee_id", taskInB)).toBe(t.sara);
      expect(await membership(c.b, t.sara)).toBe("member");
    } finally {
      await putMember(c.a, t.sara, "member");
      await as(t.ecommerce, (q) => deletePermanently(q, "tasks", taskInB));
      await dropMember(c.b, t.sara);
      await as(t.maite, (q) => deletePermanently(q, "tasks", ids.otherPersonTask));
      await as(t.maite, async (q) => {
        for (const id of [ids.openTask, ids.doneTask]) await deletePermanently(q, "tasks", id);
        for (const id of [ids.openDeliverable, ids.publishedDeliverable]) await deletePermanently(q, "deliverables", id);
        for (const id of [ids.openCampaign, ids.completedCampaign]) await deletePermanently(q, "campaigns", id);
      });
    }
  });

  it("las miembros ven nombres y roles pero no emails; las propietarias ven emails y «pendiente»", async () => {
    await putMember(c.a, t.inactive, "member");
    await sys("update auth.users set last_sign_in_at = now() where id = $1", [t.maite]);
    try {
      const asMember = await as(t.sara, (q) => listClientPeople(q, c.a));
      expect(asMember.map((p) => p.display_name).sort()).toEqual(["Ainhoa", "Antigua", "Elisa", "Maite", "Responsable ecommerce", "Sara"]);
      expect(asMember.find((p) => p.user_id === t.maite)).toMatchObject({ role: "owner", email: null });
      expect(asMember.find((p) => p.user_id === t.sara)).toMatchObject({ role: "member", email: null });
      expect(asMember.every((p) => p.email === null)).toBe(true);

      const asOwner = await as(t.maite, (q) => listClientPeople(q, c.a));
      expect(asOwner.find((p) => p.user_id === t.sara)).toEqual({
        user_id: t.sara, display_name: "Sara", role: "member", email: "sara@test.invalid", pending: true, active: true });
      expect(asOwner.find((p) => p.user_id === t.maite)).toMatchObject({ email: "maite@test.invalid", pending: false });
      // Las personas desactivadas aparecen, marcadas, para poder retirarlas.
      expect(asOwner.find((p) => p.user_id === t.inactive)).toMatchObject({ display_name: "Antigua", active: false });

      // listProfiles: por defecto solo las activas del cliente.
      expect((await as(t.sara, (q) => listProfiles(q, c.a))).map((p) => p.display_name))
        .toEqual(["Ainhoa", "Elisa", "Maite", "Responsable ecommerce", "Sara"]);
      expect((await as(t.sara, (q) => listProfiles(q, c.a, false))).map((p) => p.id)).toContain(t.inactive);
      expect((await as(t.sara, (q) => listProfiles(q, c.b))).length).toBe(0);
      expect((await as(t.elisa, (q) => listProfiles(q, c.b))).map((p) => p.display_name)).toEqual(["Elisa", "Responsable ecommerce"]);

      // Quien no es miembro no obtiene la lista.
      await expect(as(t.lonely, (q) => listClientPeople(q, c.a))).rejects.toMatchObject(denied);
      await expect(as(t.maite, (q) => listClientPeople(q, c.b))).rejects.toMatchObject(denied);
    } finally {
      await dropMember(c.a, t.inactive);
      await sys("update auth.users set last_sign_in_at = null where id = $1", [t.maite]);
    }
  });

  it("no veo perfiles de personas con las que no comparto cliente", async () => {
    expect(await as(t.sara, (q) => getProfile(q, t.lonely))).toBeNull();
    expect(await as(t.sara, (q) => getProfile(q, t.inactive))).toBeNull();
    expect((await as(t.elisa, (q) => getProfile(q, t.ecommerce)))?.display_name).toBe("Responsable ecommerce");
    // Sin cliente solo se ve el perfil propio; administración de plataforma ve todos.
    expect((await as(t.lonely, (q) => q<{ id: string }>("select id from profiles"))).map((p) => p.id)).toEqual([t.lonely]);
    expect((await as(t.maite, (q) => getProfile(q, t.lonely)))?.display_name).toBe("Sola");
    // Una persona desactivada solo ve su propio perfil, aunque siga en algún cliente.
    await putMember(c.a, t.inactive, "member");
    try {
      expect((await as(t.inactive, (q) => q<{ id: string }>("select id from profiles"))).map((p) => p.id)).toEqual([t.inactive]);
    } finally {
      await dropMember(c.a, t.inactive);
    }
    // Al dejar de compartir cliente, el perfil deja de verse.
    await dropMember(c.a, t.sara);
    try {
      expect(await as(t.ainhoa, (q) => getProfile(q, t.sara))).toBeNull();
    } finally {
      await putMember(c.a, t.sara, "member");
    }
    // Los perfiles solo se crean desde el servidor.
    await expect(as(t.maite, (q) => q("insert into profiles (id, display_name) values ($1, 'X')", [t.outsider]))).rejects.toMatchObject(denied);
  });

  it("la invitación 21 del día se rechaza", async () => {
    try {
      // Las invitaciones de hace más de 24 horas no cuentan.
      for (let i = 0; i < 20; i++) {
        await sys("insert into invitation_log (invited_by, email, created_at) values ($1, $2, now() - interval '25 hours')", [t.sara, `vieja${i}@test.invalid`]);
      }
      for (let i = 0; i < 20; i++) await as(t.sara, (q) => recordInvitation(q, ` Persona${i}@TEST.invalid `));
      await expect(as(t.sara, (q) => recordInvitation(q, "otra@test.invalid"))).rejects.toThrow("Has alcanzado el límite de 20 invitaciones al día.");
      expect(await sys("select count(*)::int as n from invitation_log where invited_by = $1 and created_at > now() - interval '24 hours'", [t.sara]))
        .toEqual([{ n: 20 }]);
      expect(await sys("select email from invitation_log where invited_by = $1 and email like 'persona0%'", [t.sara])).toEqual([{ email: "persona0@test.invalid" }]);
      // El límite es por persona.
      await as(t.ainhoa, (q) => recordInvitation(q, "otra@test.invalid"));
      // Sin perfil activo no se registra nada.
      await expect(as(t.inactive, (q) => recordInvitation(q, "otra@test.invalid"))).rejects.toMatchObject(denied);
      await expect(as(t.outsider, (q) => recordInvitation(q, "otra@test.invalid"))).rejects.toMatchObject(denied);
      // Nadie lee el registro directamente.
      await expect(as(t.sara, (q) => q("select * from invitation_log"))).rejects.toMatchObject(denied);
    } finally {
      await sys("delete from invitation_log");
    }
  });

  it("añadir por email cuenta para el límite diario, junto con las invitaciones", async () => {
    // 10 altas (con resultados distintos) + 10 invitaciones = 20 registros.
    for (let i = 0; i < 10; i++) {
      const email = i === 0 ? "lonely@test.invalid" : i === 1 ? "sara@test.invalid" : `prueba${i}@test.invalid`;
      await as(t.maite, (q) => addMemberByEmail(q, c.a, email, "member"));
    }
    for (let i = 0; i < 10; i++) await as(t.maite, (q) => recordInvitation(q, `invitada${i}@test.invalid`));
    try {
      expect(await sys("select count(*)::int as n from invitation_log where invited_by = $1", [t.maite])).toEqual([{ n: 20 }]);
      // La 21.ª se rechaza antes de buscar: tampoco se añade a alguien con cuenta.
      await expect(as(t.maite, (q) => addMemberByEmail(q, c.a, "inactive@test.invalid", "member")))
        .rejects.toThrow("Has alcanzado el límite de 20 invitaciones al día.");
      expect(await membership(c.a, t.inactive)).toBeNull();
      await expect(as(t.maite, (q) => recordInvitation(q, "otra@test.invalid"))).rejects.toThrow("Has alcanzado el límite de 20 invitaciones al día.");
      expect(await sys("select email from invitation_log where invited_by = $1 and email = 'lonely@test.invalid'", [t.maite]))
        .toEqual([{ email: "lonely@test.invalid" }]);
      // Las llamadas sin permiso no consumen el límite de otra persona ni se registran.
      await expect(as(t.sara, (q) => addMemberByEmail(q, c.a, "x@test.invalid", "member"))).rejects.toMatchObject(denied);
      expect(await sys("select count(*)::int as n from invitation_log where invited_by = $1", [t.sara])).toEqual([{ n: 0 }]);
    } finally {
      await dropMember(c.a, t.lonely);
    }
  });

  it("el límite cuenta emails distintos: añadir e invitar al mismo email cuenta una vez", async () => {
    const LIMIT = "Has alcanzado el límite de 20 invitaciones al día.";
    // Alta sin cuenta seguida de su invitación (el flujo real), y reintentos: un solo email contado.
    expect(await as(t.maite, (q) => addMemberByEmail(q, c.a, "nueva0@test.invalid", "member"))).toBe("needs_invitation");
    await as(t.maite, (q) => recordInvitation(q, " Nueva0@TEST.invalid "));
    await as(t.maite, (q) => recordInvitation(q, "nueva0@test.invalid"));
    for (let i = 1; i < 20; i++) {
      await as(t.maite, (q) => addMemberByEmail(q, c.a, `nueva${i}@test.invalid`, "member"));
      await as(t.maite, (q) => recordInvitation(q, `nueva${i}@test.invalid`));
    }
    // Se registra cada llamada (41), pero solo hay 20 emails distintos.
    expect(await sys("select count(*)::int as n, count(distinct email)::int as d from invitation_log where invited_by = $1", [t.maite]))
      .toEqual([{ n: 41, d: 20 }]);
    // El 21.º email distinto se rechaza, por cualquiera de los dos caminos.
    await expect(as(t.maite, (q) => recordInvitation(q, "nueva20@test.invalid"))).rejects.toThrow(LIMIT);
    await expect(as(t.maite, (q) => addMemberByEmail(q, c.a, "lonely@test.invalid", "member"))).rejects.toThrow(LIMIT);
    expect(await membership(c.a, t.lonely)).toBeNull();
    // Repetir un email ya contado, estando en el límite, se admite.
    await as(t.maite, (q) => recordInvitation(q, "NUEVA5@test.invalid"));
    expect(await as(t.maite, (q) => addMemberByEmail(q, c.a, "nueva7@test.invalid", "member"))).toBe("needs_invitation");
    expect(await sys("select count(*)::int as n from invitation_log where invited_by = $1", [t.maite])).toEqual([{ n: 43 }]);
  });

  it("email o nombre vacíos se rechazan con un mensaje claro", async () => {
    for (const email of ["", "   "]) {
      await expect(as(t.maite, (q) => addMemberByEmail(q, c.a, email, "member"))).rejects.toThrow("Indica un email.");
    }
    await expect(as(t.maite, (q) => q("select add_client_member($1, null, 'member')", [c.a]))).rejects.toThrow("Indica un email.");
    const id = randomUUID();
    await sys("insert into auth.users (id, email) values ($1, 'sinnombre@test.invalid')", [id]);
    try {
      for (const name of ["", "  "]) {
        await expect(as(t.maite, (q) => attachInvited(q, c.a, id, name, "member"))).rejects.toThrow("Indica el nombre de la persona.");
      }
      await expect(as(t.maite, (q) => q("select attach_invited_member($1, $2, null, 'member')", [c.a, id]))).rejects.toThrow("Indica el nombre de la persona.");
      expect(await sys("select 1 from profiles where id = $1", [id])).toEqual([]);
      expect(await membership(c.a, id)).toBeNull();
    } finally {
      await sys("delete from auth.users where id = $1", [id]);
    }
  });

  it("no se puede desactivar a la única propietaria de un cliente activo", async () => {
    await expect(as(t.maite, (q) => q("update profiles set active = false where id = $1", [t.ecommerce])))
      .rejects.toThrow("Esta persona es la única propietaria de: Cliente B. Nombra a otra propietaria o archiva el cliente antes.");
    // Tampoco desde la conexión privilegiada.
    await expect(sys("update profiles set active = false where id = $1", [t.ecommerce])).rejects.toThrow("Cliente B");
    expect(await sys("select active from profiles where id = $1", [t.ecommerce])).toEqual([{ active: true }]);
  });

  it("sí se puede tras archivar el cliente o nombrar otra propietaria", async () => {
    const deactivate = () => as(t.maite, (q) => q("update profiles set active = false where id = $1", [t.ecommerce]));
    const reactivate = () => as(t.maite, (q) => q("update profiles set active = true where id = $1", [t.ecommerce]));
    try {
      await as(t.ecommerce, (q) => setClientArchived(q, c.b, true));
      await deactivate();
      expect(await sys("select active from profiles where id = $1", [t.ecommerce])).toEqual([{ active: false }]);
      await reactivate();
      await as(t.ecommerce, (q) => setClientArchived(q, c.b, false));

      await as(t.ecommerce, (q) => setMemberRole(q, c.b, t.elisa, "owner"));
      await deactivate();
      expect(await sys("select active from profiles where id = $1", [t.ecommerce])).toEqual([{ active: false }]);
      await reactivate();
      // Con ecommerce activa de nuevo, elisa puede volver a ser miembro.
      await as(t.elisa, (q) => setMemberRole(q, c.b, t.elisa, "member"));
    } finally {
      await sys("update profiles set active = true where id = $1", [t.ecommerce]);
      await sys("update clients set archived_at = null where id = $1", [c.b]);
      await putMember(c.b, t.elisa, "member");
    }
  });

  it("en un cliente archivado no se gestionan personas", async () => {
    try {
      await as(t.ecommerce, (q) => setClientArchived(q, c.b, true));
      await expect(as(t.ecommerce, (q) => addMemberByEmail(q, c.b, "lonely@test.invalid", "member"))).rejects.toMatchObject(denied);
      await expect(as(t.ecommerce, (q) => setMemberRole(q, c.b, t.elisa, "owner"))).rejects.toMatchObject(denied);
      await expect(as(t.ecommerce, (q) => removeMember(q, c.b, t.elisa))).rejects.toMatchObject(denied);
      // La lista se sigue pudiendo leer.
      expect((await as(t.elisa, (q) => listClientPeople(q, c.b))).length).toBe(2);
    } finally {
      await sys("update clients set archived_at = null where id = $1", [c.b]);
    }
  });

  it("la propiedad renombra y archiva el cliente; una miembro no", async () => {
    try {
      const before = (await as(t.ecommerce, (q) => getClient(q, c.b)))!;
      await as(t.ecommerce, (q) => updateClient(q, c.b, before.version, { name: "Cliente B renombrado", description: "Notas" }));
      expect(await as(t.elisa, (q) => getClient(q, c.b))).toMatchObject({ name: "Cliente B renombrado", description: "Notas" });
      await expect(as(t.ecommerce, (q) => updateClient(q, c.b, before.version, { name: "Otra vez" }))).rejects.toMatchObject({ code: "conflict" });
      await expect(as(t.elisa, (q) => updateClient(q, c.b, null, { name: "Intrusa" }))).rejects.toMatchObject({ code: "forbidden" });
      await expect(as(t.maite, (q) => updateClient(q, c.b, null, { name: "Intrusa" }))).rejects.toMatchObject({ code: "not_found" });
      await expect(as(t.elisa, (q) => setClientArchived(q, c.b, true))).rejects.toMatchObject({ code: "forbidden" });
      await as(t.ecommerce, (q) => setClientArchived(q, c.b, true));
      expect((await as(t.elisa, (q) => getClient(q, c.b)))?.archived_at).toBeInstanceOf(Date);
    } finally {
      await sys("update clients set name = 'Cliente B', description = '', archived_at = null where id = $1", [c.b]);
    }
  });

  it("no se puede asignar trabajo a una persona desactivada", async () => {
    await putMember(c.a, t.inactive, "member");
    try {
      await expect(as(t.maite, (q) => createTask(q, {
        client_id: c.a, title: "Para Antigua", assignee_id: t.inactive, due_date: null, priority: "low", campaign_id: null, deliverable_id: null,
      }))).rejects.toMatchObject(denied);
    } finally {
      await dropMember(c.a, t.inactive);
    }
  });

  it("archivar: una miembro no puede; la propiedad lo pasa a archivados y al recuperarlo vuelve", async () => {
    const ids = async (who: string, archived?: boolean) =>
      (await as(who, (q) => listMyClients(q, archived ? { archived: true } : {}))).map((x) => x.id);
    try {
      await expect(as(t.elisa, (q) => setClientArchived(q, c.b, true))).rejects.toMatchObject({ code: "forbidden" });
      expect(await ids(t.elisa)).toContain(c.b);

      await as(t.ecommerce, (q) => setClientArchived(q, c.b, true));
      for (const who of [t.ecommerce, t.elisa]) {
        expect(await ids(who)).not.toContain(c.b);
        expect(await ids(who, true)).toEqual([c.b]);
      }

      await as(t.ecommerce, (q) => setClientArchived(q, c.b, false));
      expect(await ids(t.ecommerce)).toContain(c.b);
      expect(await ids(t.ecommerce, true)).toEqual([]);
    } finally {
      await sys("update clients set archived_at = null where id = $1", [c.b]);
    }
  });

  it("administración de plataforma no ve datos de clientes ajenos", async () => {
    const task = await as(t.ecommerce, (q) => createTask(q, {
      client_id: c.b, title: "Tarea de B", assignee_id: t.elisa, due_date: null, priority: "low", campaign_id: null, deliverable_id: null }));
    try {
      const count = async (sql: string) => (await as(t.maite, (q) => q<{ n: number }>(sql, [c.b])))[0].n;
      for (const table of ["clients where id = $1", "client_members where client_id = $1", "tasks where client_id = $1",
        "deliverables where client_id = $1", "campaigns where client_id = $1", "resources where client_id = $1", "activity_log where client_id = $1"]) {
        expect(await count(`select count(*)::int as n from ${table}`)).toBe(0);
      }
      expect(await sys("select count(*)::int as n from tasks where client_id = $1", [c.b])).toEqual([{ n: 1 }]);
      await expect(as(t.maite, (q) => listClientPeople(q, c.b))).rejects.toMatchObject(denied);
      expect(await as(t.maite, (q) => listProfiles(q, c.b))).toEqual([]);
    } finally {
      await as(t.ecommerce, (q) => deletePermanently(q, "tasks", task));
    }
  });
});

describe("perfiles de la plataforma", () => {
  it("quien no es administración no puede cambiar el acceso de otra persona", async () => {
    // Elisa ve a Ainhoa (comparten el cliente A), pero la política de actualización no le deja tocar su perfil:
    // la fila queda fuera de alcance (0 filas, sin error; la guarda 42501 de `profiles_guard` cubre el caso de cambiar el propio perfil, abajo).
    expect(await as(t.elisa, (q) => q("update profiles set active = false where id = $1 returning id", [t.ainhoa]))).toEqual([]);
    expect((await sys<{ active: boolean }>("select active from profiles where id = $1", [t.ainhoa]))[0].active).toBe(true);
  });

  it("nadie sin administración puede cambiar su propio rol ni su acceso (profiles_guard)", async () => {
    await expect(as(t.elisa, (q) => q("update profiles set role = 'admin' where id = $1", [t.elisa]))).rejects.toMatchObject(denied);
    await expect(as(t.elisa, (q) => q("update profiles set active = false where id = $1", [t.elisa]))).rejects.toMatchObject(denied);
    expect((await sys<{ role: string; active: boolean }>("select role, active from profiles where id = $1", [t.elisa]))[0]).toEqual({ role: "member", active: true });
  });
});
