import { addDays, todayMadrid } from "../dates";
import type { Driver } from "../db/types";
import { runAsUser } from "../db/user";
import { createCampaign } from "../services/campaigns";
import { addComment } from "../services/core";
import { createDeliverable, transitionDeliverable, updateDeliverable } from "../services/deliverables";
import { addNewLink, attachResource, createResource } from "../services/resources";
import { createTask, setTaskStatus } from "../services/tasks";

/**
 * DATOS FICTICIOS para la demo local (PGlite). No se ejecuta nunca contra Supabase.
 * Personas con emails @demo.invalid, enlaces a example.com y ninguna cifra de negocio.
 * Las fechas son relativas a hoy para que la demo tenga contenido en el mes actual.
 */
export async function seedDemo(driver: Driver) {
  const people = [
    ["maite", "Maite", "admin"], ["ecommerce", "Responsable ecommerce", "admin"],
    ["ainhoa", "Ainhoa", "member"], ["sara", "Sara", "member"], ["elisa", "Elisa", "member"],
  ] as const;
  type Key = (typeof people)[number][0];
  // Dos clientes: Elisa está en los dos (ve el inicio con todos los clientes); Sara solo en el estudio.
  const clients: [string, [Key, "owner" | "member"][]][] = [
    ["Estudio Demo", [["maite", "owner"], ["ainhoa", "member"], ["sara", "member"], ["elisa", "member"]]],
    ["Tienda Demo", [["ecommerce", "owner"], ["elisa", "member"]]],
  ];
  const id = {} as Record<Key, string>;
  const clientIds: string[] = [];
  const fresh = await driver.transaction(async (q) => {
    if ((await q("select 1 from profiles limit 1")).length > 0) return false;
    for (const [key, name, role] of people) {
      // Ya han entrado alguna vez: no figuran como invitaciones pendientes.
      const [u] = await q<{ id: string }>("insert into auth.users (email, last_sign_in_at) values ($1, now()) returning id", [`${key}@demo.invalid`]);
      await q("insert into profiles (id, display_name, role) values ($1, $2, $3)", [u.id, name, role]);
      id[key] = u.id;
    }
    for (const [name, members] of clients) {
      const [cl] = await q<{ id: string }>("insert into clients (name) values ($1) returning id", [name]);
      for (const [key, role] of members) {
        await q("insert into client_members (client_id, user_id, role) values ($1, $2, $3)", [cl.id, id[key], role]);
      }
      clientIds.push(cl.id);
    }
    return true;
  });
  if (!fresh) return;
  const [client_id, tienda] = clientIds; // client_id = Estudio Demo

  const today = todayMadrid();
  const day = (n: number) => addDays(today, n);
  const demo = (slug: string) => `https://example.com/demo/${slug}`;
  const as = <T,>(who: Key, fn: Parameters<typeof runAsUser<T>>[2]) => runAsUser(driver, id[who], fn);

  // Campaña 1: regalos de boda
  const bodas = await as("maite", (q) => createCampaign(q, {
    client_id,
    name: "Regalos de boda en tela", objective: "Dar a conocer los packs para bodas antes de la temporada.",
    description: "Campaña de ejemplo con newsletter, anuncio y publicación en Instagram.",
    start_date: day(-10), end_date: day(25), owner_id: id.maite, status: "active",
  }));
  await as("maite", (q) => addNewLink(q, { type: "campaign", id: bodas },
    { title: "Carpeta de campaña (enlace de demo)", url: demo("carpeta-bodas"), category: "drive" }, { is_primary: true }));
  await as("elisa", (q) => addNewLink(q, { type: "campaign", id: bodas },
    { title: "Landing bodas y eventos (enlace de demo)", url: demo("landing-bodas"), category: "store" }));

  const newsletter = await as("maite", (q) => createDeliverable(q, {
    client_id,
    title: "Newsletter: regalos de boda", channel: "newsletter", campaign_id: bodas, owner_id: id.elisa, planned_date: day(6),
    brief: "Presentar los packs para bodas con fotos reveladas en tela. Tono cercano.",
  }));
  const tCopy = await as("maite", (q) => createTask(q, { client_id, title: "Redactar el copy de la newsletter", assignee_id: id.sara, due_date: day(-2), priority: "high", campaign_id: null, deliverable_id: newsletter }));
  await as("maite", (q) => createTask(q, { client_id, title: "Diseñar la newsletter en Figma", assignee_id: id.ainhoa, due_date: day(2), priority: "medium", campaign_id: null, deliverable_id: newsletter }));
  await as("maite", (q) => createTask(q, { client_id, title: "Revisar y aprobar la newsletter", assignee_id: id.maite, due_date: day(4), priority: "medium", campaign_id: null, deliverable_id: newsletter }));
  await as("maite", (q) => createTask(q, { client_id, title: "Preparar y programar el envío", assignee_id: id.elisa, due_date: day(5), priority: "medium", campaign_id: null, deliverable_id: newsletter }));
  await as("sara", (q) => updateDeliverable(q, newsletter, null, { copy: "Asunto: El regalo que se queda en casa\n\nTus fotos, reveladas en tela y hechas a mano. (Texto de ejemplo)" }));
  await as("sara", (q) => addNewLink(q, { type: "deliverable", id: newsletter }, { title: "Texto de Sara (enlace de demo)", url: demo("copy-newsletter-bodas"), category: "document" }, { is_primary: true }));
  await as("ainhoa", (q) => addNewLink(q, { type: "deliverable", id: newsletter }, { title: "Diseño de Ainhoa (enlace de demo)", url: demo("figma-newsletter-bodas"), category: "figma" }, { is_primary: true, requires_approval: true }));
  await as("sara", (q) => setTaskStatus(q, tCopy, "done"));
  await as("sara", (q) => addComment(q, "deliverable", newsletter, "Copy listo. Falta encajar el diseño final."));
  await as("sara", (q) => transitionDeliverable(q, newsletter, "in_review"));

  const anuncio = await as("elisa", (q) => createDeliverable(q, {
    client_id,
    title: "Anuncio Meta: revelados en tela para bodas", channel: "meta_ad", campaign_id: bodas, owner_id: id.elisa, planned_date: day(9),
    copy: "Tu historia, en tela. (Texto de ejemplo)",
    formats: "1080×1350 · Story 9:16", creative_format: "static",
    inspo: "Foto de detalle de la tela con luz natural, sin texto encima del producto.\nReferencia (enlace de demo): https://example.com/demo/inspo-anuncio-bodas",
    copy_in: "Tu historia, en tela.\nSubtítulo: Regalos de boda hechos a mano.",
  }));
  const creatividad = await as("ainhoa", (q) => addNewLink(q, { type: "deliverable", id: anuncio }, { title: "Creatividades Meta (enlace de demo)", url: demo("figma-anuncio-bodas"), category: "figma" }, { is_primary: true, requires_approval: true }));
  await as("elisa", (q) => addNewLink(q, { type: "deliverable", id: anuncio }, { title: "Campaña en Meta (enlace de demo)", url: demo("meta-ads-bodas"), category: "advertising" }));
  await as("elisa", (q) => transitionDeliverable(q, anuncio, "in_review"));
  await as("maite", (q) => transitionDeliverable(q, anuncio, "approved"));
  await as("elisa", (q) => transitionDeliverable(q, anuncio, "scheduled"));
  await as("elisa", (q) => createTask(q, { client_id, title: "Preparar la audiencia en Meta", assignee_id: id.elisa, due_date: day(-1), priority: "high", campaign_id: null, deliverable_id: anuncio }));

  const post = await as("sara", (q) => createDeliverable(q, {
    client_id,
    title: "Post Instagram: así se hace un revelado en tela", channel: "instagram", campaign_id: bodas, owner_id: id.sara, planned_date: day(-3),
    copy: "Hecho a mano, foto a foto. (Texto de ejemplo)",
  }));
  // El mismo recurso se reutiliza en dos entregables (no se copia).
  await as("ainhoa", (q) => attachResource(q, { type: "deliverable", id: post }, creatividad, { is_primary: true }));
  await as("sara", (q) => transitionDeliverable(q, post, "in_review"));
  await as("maite", (q) => transitionDeliverable(q, post, "approved"));
  await as("elisa", (q) => transitionDeliverable(q, post, "published", { published_on: day(-3) }));

  // Tienda Demo — campaña de ecommerce que entra en el mes siguiente (Elisa es miembro; Sara no).
  const ficha = await as("ecommerce", (q) => createCampaign(q, {
    client_id: tienda,
    name: "Mejorar la ficha de producto: marco de madera", objective: "Que la ficha explique mejor tamaños, materiales y personalización.",
    start_date: day(3), end_date: day(40), owner_id: id.ecommerce, status: "planned",
  }));
  const fichaActual = await as("ecommerce", (q) => addNewLink(q, { type: "campaign", id: ficha }, { title: "Ficha actual en la tienda (enlace de demo)", url: demo("ficha-marco-madera"), category: "store" }, { is_primary: true }));
  const tFicha = await as("ecommerce", (q) => createTask(q, { client_id: tienda, title: "Proponer nueva estructura de la ficha", assignee_id: id.ecommerce, due_date: day(8), priority: "medium", campaign_id: ficha, deliverable_id: null }));
  await as("ecommerce", (q) => addNewLink(q, { type: "task", id: tFicha }, { title: "Documento de propuesta (enlace de demo)", url: demo("propuesta-ficha"), category: "document" }));
  await as("ecommerce", (q) => attachResource(q, { type: "task", id: tFicha }, fichaActual));
  await as("ecommerce", (q) => createTask(q, { client_id: tienda, title: "Reescribir la descripción del producto", assignee_id: id.elisa, due_date: day(15), priority: "low", campaign_id: ficha, deliverable_id: null }));
  await as("ecommerce", (q) => createDeliverable(q, { client_id: tienda, title: "Landing: guía de tamaños", channel: "landing", campaign_id: ficha, owner_id: id.ecommerce, planned_date: null }));
  // Diapositiva de contenido también en la tienda: propuesta creativa completa, esperando la validación de su propiedad.
  const postMarco = await as("elisa", (q) => createDeliverable(q, {
    client_id: tienda,
    title: "Post Instagram: marco de madera personalizado", channel: "instagram", campaign_id: ficha, owner_id: id.elisa, planned_date: day(5),
    copy: "Tu foto favorita, enmarcada a mano. (Texto de ejemplo)",
    formats: "1080×1350", creative_format: "static",
    inspo: "Marco sobre una mesa de madera clara, luz de mañana, sin texto encima.",
    copy_in: "Marco de madera natural\nPersonalizado con tu foto",
  }));
  await as("elisa", (q) => transitionDeliverable(q, postMarco, "in_review"));
  await as("elisa", (q) => createTask(q, { client_id: tienda, title: "Fotografiar los tres tamaños del marco", assignee_id: id.elisa, due_date: day(-1), priority: "high", campaign_id: null, deliverable_id: postMarco }));
  const google = await as("ecommerce", (q) => createDeliverable(q, {
    client_id: tienda, title: "Anuncio Google: marcos para regalo", channel: "google_ad", campaign_id: ficha, owner_id: id.ecommerce, planned_date: day(20),
  }));
  await as("ecommerce", (q) => transitionDeliverable(q, google, "discarded"));
  await as("ecommerce", (q) => createTask(q, { client_id: tienda, title: "Revisar los textos de envío en el carrito", assignee_id: id.ecommerce, due_date: null, priority: "low", campaign_id: null, deliverable_id: null }));

  // Piezas a medias: propuesta creativa sin creatividad final, y estados de espera y pausa.
  const carrusel = await as("sara", (q) => createDeliverable(q, {
    client_id,
    title: "Carrusel LinkedIn: cómo preparamos un pedido de boda", channel: "linkedin", campaign_id: bodas, owner_id: id.sara, planned_date: day(12),
    copy: "¿Cuánto trabajo hay detrás de un regalo de boda? Te lo contamos paso a paso. (Texto de ejemplo)\n\n#Artesanía #RegalosDeBoda",
    formats: "Carrusel 1080×1350, 5 imágenes", creative_format: "carousel",
    inspo: "Una imagen por paso: elegir la foto, revelar en tela, enmarcar, empaquetar, entregar.",
    copy_in: "1. Eliges tu foto\n2. La revelamos en tela\n3. La enmarcamos a mano\n4. La preparamos para regalo\n5. Llega a casa",
  }));
  await as("sara", (q) => transitionDeliverable(q, carrusel, "waiting_client"));
  await as("sara", (q) => addComment(q, "deliverable", carrusel, "Faltan las fotos del taller. Las hemos pedido."));
  const video = await as("ainhoa", (q) => createDeliverable(q, {
    client_id,
    title: "Vídeo Meta: del móvil a la pared", channel: "meta_ad", campaign_id: bodas, owner_id: id.ainhoa, planned_date: day(16),
    formats: "Vídeo vertical 9:16, 15 s", creative_format: "dynamic",
    inspo: "Plano secuencia: una foto en el móvil que acaba colgada en el salón.",
  }));
  await as("ainhoa", (q) => transitionDeliverable(q, video, "on_hold"));

  // Trabajo suelto y sin fecha
  await as("maite", (q) => createDeliverable(q, { client_id, title: "Landing: packs de boda", channel: "landing", campaign_id: bodas, owner_id: id.maite, planned_date: null }));
  await as("maite", (q) => createResource(q, { client_id, title: "Guía de marca (enlace de demo)", url: demo("guia-de-marca"), category: "document", description: "Recurso general, sin asociar a ningún trabajo." }));
}
