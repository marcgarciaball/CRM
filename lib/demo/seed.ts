import { addDays, addMonths, monthOf, monthRange, todayMadrid } from "../dates";
import type { Driver, Q } from "../db/types";
import { runAsUser } from "../db/user";
import { createCampaign } from "../services/campaigns";
import { addComment } from "../services/core";
import { createDeliverable, transitionDeliverable, updateDeliverable } from "../services/deliverables";
import { addNewLink, attachResource, createResource } from "../services/resources";
import { replaceMetaAds, upsertMonthly } from "../services/results";
import { MONTHLY_FIELDS, type MetaAdRow, type MonthlyRow } from "../results/columns";
import { createTask, setTaskStatus } from "../services/tasks";
import { importProductSales, replaceFixedCosts, replaceProducts, saveExpense, saveSettings } from "../services/profit";
import type { ProductInput } from "../profit/parse";
import type { ProductSale } from "../profit/types";

/**
 * DATOS FICTICIOS para la demo local (PGlite). No se ejecuta nunca contra Supabase.
 * Personas con emails @demo.invalid, enlaces a example.com y cifras de ventas inventadas (solo en «Tienda Demo»).
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

  await seedResults(tienda, today, (fn) => as("ecommerce", fn));
  await seedProfit(tienda, today, (fn) => as("ecommerce", fn));
}

/**
 * Resultados INVENTADOS de «Tienda Demo»: histórico desde enero del año pasado hasta el mes actual (parcial),
 * gasto de Meta en los últimos 8 meses y una campaña pasada para verla sobre la gráfica. «Estudio Demo» queda vacío.
 */
async function seedResults(clientId: string, today: string, as: <T>(fn: (q: Q) => Promise<T>) => Promise<T>) {
  const current = monthOf(today);
  const first = `${Number(today.slice(0, 4)) - 1}-01`;
  const months: string[] = [];
  for (let m = first; m <= current; m = addMonths(m, 1)) months.push(m);
  const blank = Object.fromEntries(MONTHLY_FIELDS.map((f) => [f, null])) as Record<(typeof MONTHLY_FIELDS)[number], null>;
  const monthly: MonthlyRow[] = months.map((month, i) => {
    const season = [0.8, 0.7, 0.9, 1, 1.1, 1.2, 1.4, 1.2, 1, 0.9, 1.3, 1.6][Number(month.slice(5)) - 1];
    const partial = month === current ? Math.min(1, Number(today.slice(8)) / 30) : 1;
    const pedidos = Math.round((20 + i * 6) * season * partial);
    const totales = pedidos * (42 + (i % 5) * 2);
    const sesiones = Math.round(pedidos * 32);
    const nuevos = Math.round(pedidos * 0.8);
    return {
      ...blank, month, data_until: month === current ? today : null,
      ventas_brutas: Math.round(totales * 1.04), descuentos: -Math.round(totales * (i % 4 === 0 ? 0.09 : 0.03)), devoluciones: -Math.round(totales * 0.01),
      ventas_netas: totales - Math.round(totales * 0.05), envios: pedidos * 4, ventas_totales: totales, pedidos,
      pedido_medio_shopify: Math.round((totales / Math.max(1, pedidos)) * 100) / 100, articulos: pedidos * 2,
      sesiones, sesiones_carrito: Math.round(sesiones * 0.08), sesiones_checkout: Math.round(sesiones * 0.05), sesiones_compra: pedidos,
      conversion: Math.round((pedidos / Math.max(1, sesiones)) * 10000) / 10000,
      ventas_google_bing_org: Math.round(totales * 0.3), ventas_directo: Math.round(totales * 0.3), ventas_instagram_sin_pago: Math.round(totales * 0.15),
      ventas_meta_pago_utm: Math.round(totales * 0.05), ventas_email: Math.round(totales * 0.05), ventas_otros: Math.round(totales * 0.03),
      ventas_sin_atribuir: Math.round(totales * 0.12), clientes_nuevos: nuevos, clientes_recurrentes: pedidos - nuevos,
      ventas_clientes_nuevos: Math.round(totales * 0.78), ventas_clientes_recurrentes: Math.round(totales * 0.22),
    };
  });
  const campaigns = ["Ventas | Novedades (demo)", "Remarketing | Genérico (demo)"];
  const meta: MetaAdRow[] = months.slice(-9, -1).flatMap((month, i) => campaigns.map((campaign_name, k) => ({
    month, campaign_name, ad_name: "Anuncio (demo)",
    reach: 4000 + i * 500, impressions: 9000 + i * 1200, clicks: 200 + i * 30,
    spend: 60 + i * 15 + k * 25, purchases: k === 0 && i > 2 ? 10 + i : null,
  })));
  await as((q) => upsertMonthly(q, clientId, monthly));
  await as((q) => replaceMetaAds(q, clientId, meta));
  const past = addMonths(current, -4);
  await as((q) => createCampaign(q, {
    client_id: clientId, name: "Rebajas de temporada (demo)", objective: "Campaña pasada para ver su efecto en Resultados.",
    start_date: `${past}-05`, end_date: monthRange(addMonths(past, 1)).last, owner_id: null, status: "completed",
  }));
}

/**
 * Rentabilidad INVENTADA de «Tienda Demo»: supuestos, costes fijos, escandallo de 9 productos (uno sin precio,
 * uno con pérdidas), ventas por producto de los últimos 8 meses (con una «Botella (demo)» sin escandallo) y gastos.
 */
async function seedProfit(clientId: string, today: string, as: <T>(fn: (q: Q) => Promise<T>) => Promise<T>) {
  const current = monthOf(today);
  await as((q) => saveSettings(q, clientId, {
    iva: 0.21, horas_productivas_anuales: 3000, precio_tela_m2: 6, tinta_m2: null, merma_tela: 0.3, reimpresion: 0.1,
    roturas: 0.05, comision_pct: null, comision_fija_pedido: 0.3, envio_neto_pedido: null, unidades_por_pedido: 3,
  }));
  await as((q) => replaceFixedCosts(q, clientId, [
    { group: "personal", concept: "Sueldos (demo)", monthly_amount: 3000, note: "", position: 0 },
    { group: "personal", concept: "Seguridad Social (demo)", monthly_amount: 900, note: "", position: 1 },
    { group: "estructura", concept: "Alquiler del taller (demo)", monthly_amount: 700, note: "", position: 2 },
    { group: "estructura", concept: "Tinta (demo)", monthly_amount: 80, note: "Fija al mes", position: 3 },
    { group: "estructura", concept: "Software y suscripciones (demo)", monthly_amount: 60, note: "", position: 4 },
  ]));
  const p = (position: number, family: string, format: string, price: number | null, fabric: [number, number] | null, minutes: number,
    support: number, packaging: number, shopify: string, variant: string | null): ProductInput => ({
    position, family, format, price, fabric_w_cm: fabric?.[0] ?? null, fabric_h_cm: fabric?.[1] ?? null, minutes,
    support_cost: support, packaging_cost: packaging, shopify_title: shopify, variant_match: variant, active: true, note: "",
  });
  await as((q) => replaceProducts(q, clientId, [
    p(0, "Lámina con clip (demo)", "A6", 14, [10.5, 14.8], 3, 0.8, 0.5, "Lámina con clip (demo)", "10x15cm"),
    p(1, "Lámina con clip (demo)", "A5", 19, [14.8, 21], 3, 1.1, 0.5, "Lámina con clip (demo)", "15x21cm"),
    p(2, "Lámina con clip (demo)", "A4", 28, [21, 29.7], 4, 1.5, 0.5, "Lámina con clip (demo)", "21x30cm"),
    p(3, "Foto en tela (demo)", "A6", 9, [10.5, 14.8], 3, 0, 0.5, "Foto en tela (demo)", "10x15cm"),
    p(4, "Foto en tela (demo)", "A5", 14, [14.8, 21], 3, 0, 0.5, "Foto en tela (demo)", "15x21cm"),
    p(5, "Marco de madera (demo)", "20x26", 40, [20, 26], 15, 7, 3, "Marco de madera (demo)", "20x26"),
    p(6, "Marco de madera (demo)", "42x50", 30, [42, 50], 25, 14, 6, "Marco de madera (demo)", "42x50"),
    p(7, "Marco de cristal (demo)", "A5", 70, [14.8, 21], 10, 26, 4, "Marco de cristal (demo)", null),
    p(8, "Ramo bordado (demo)", "", null, null, 60, 9, 1, "Ramo bordado (demo)", null),
  ]));
  const variants: [string, string, number, number][] = [
    ["Lámina con clip (demo)", "10x15cm / Vertical", 14, 60], ["Lámina con clip (demo)", "15*21cm / Vertical", 19, 45],
    ["Lámina con clip (demo)", "21x30cm", 28, 12], ["Foto en tela (demo)", "10x15cm", 9, 70], ["Foto en tela (demo)", "15x21cm", 14, 30],
    ["Marco de madera (demo)", "20x26", 40, 8], ["Marco de madera (demo)", "42x50", 30, 3], ["Marco de cristal (demo)", "A5 foto", 70, 2],
    ["Botella (demo)", "Vertical", 8, 25],
  ];
  const months = Array.from({ length: 8 }, (_, i) => addMonths(current, i - 8));
  const sales: ProductSale[] = months.flatMap((month, i) => variants.map(([title, variant, price, base]) => {
    const quantity = Math.round(base * (0.8 + (i % 4) * 0.1));
    return { month, product_title: title, variant_title: variant, quantity, reversed_quantity: i % 3 === 0 ? -1 : 0,
      net_sales: Math.round(quantity * price * 0.95 * 100) / 100, orders: Math.max(1, Math.round(quantity / 2)) };
  }));
  await as((q) => importProductSales(q, clientId, sales));
  const comments = ["", "Compra de stock (demo)", "", "", "Pago trimestral (demo)", "", "", ""];
  for (const [i, month] of months.entries()) {
    await as((q) => saveExpense(q, clientId, { month, amount: 4500 + (i % 4) * 600 + (comments[i] ? 2500 : 0), comment: comments[i] }));
  }
}
