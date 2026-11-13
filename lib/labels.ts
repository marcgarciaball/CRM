export const DELIVERABLE_STATUSES = [
  "idea", "in_preparation", "in_review", "changes_requested", "approved", "scheduled", "published",
  "waiting_client", "waiting_marketing", "on_hold", "discarded",
] as const;
export type DeliverableStatus = (typeof DELIVERABLE_STATUSES)[number];
export const DELIVERABLE_STATUS_LABEL: Record<DeliverableStatus, string> = {
  idea: "Idea",
  in_preparation: "En preparación",
  in_review: "En revisión",
  changes_requested: "Cambios solicitados",
  approved: "Validado",
  scheduled: "Programado",
  published: "Publicado",
  waiting_client: "Esperando material del cliente",
  waiting_marketing: "Esperando a marketing",
  on_hold: "En pausa",
  discarded: "Descartado",
};
/** Estados «aparcados»: el trabajo está parado, pero no descartado. */
export const PARKED_STATUSES: readonly DeliverableStatus[] = ["waiting_client", "waiting_marketing", "on_hold"];

export const TASK_STATUSES = ["todo", "in_progress", "blocked", "done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "Por hacer",
  in_progress: "En curso",
  blocked: "Bloqueada",
  done: "Hecha",
};

export const PRIORITIES = ["high", "medium", "low"] as const;
export type Priority = (typeof PRIORITIES)[number];
export const PRIORITY_LABEL: Record<Priority, string> = { high: "Alta", medium: "Media", low: "Baja" };

export const CHANNELS = ["newsletter", "meta_ad", "google_ad", "instagram", "linkedin", "linkedin_ad", "landing", "other"] as const;
export type Channel = (typeof CHANNELS)[number];
export const CHANNEL_LABEL: Record<Channel, string> = {
  newsletter: "Newsletter",
  meta_ad: "Anuncio Meta",
  google_ad: "Anuncio Google",
  instagram: "Post Instagram",
  linkedin: "Post LinkedIn",
  linkedin_ad: "Anuncio LinkedIn",
  landing: "Landing",
  other: "Otro",
};

/** ¿Estático o dinámico? Tipo de creatividad de un entregable. */
export const CREATIVE_FORMATS = ["static", "dynamic", "carousel"] as const;
export type CreativeFormat = (typeof CREATIVE_FORMATS)[number];
export const CREATIVE_FORMAT_LABEL: Record<CreativeFormat, string> = {
  static: "Estático (imagen)",
  dynamic: "Dinámico (vídeo)",
  carousel: "Carrusel",
};

export const CATEGORIES = ["figma", "drive", "document", "store", "advertising", "email", "other"] as const;
export type Category = (typeof CATEGORIES)[number];
export const CATEGORY_LABEL: Record<Category, string> = {
  figma: "Figma",
  drive: "Drive",
  document: "Documento",
  store: "Tienda",
  advertising: "Publicidad",
  email: "Email",
  other: "Otro",
};

export const CAMPAIGN_STATUSES = ["planned", "active", "completed"] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];
export const CAMPAIGN_STATUS_LABEL: Record<CampaignStatus, string> = {
  planned: "Planificada",
  active: "En marcha",
  completed: "Finalizada",
};

/** Rol en la plataforma (no confundir con el papel dentro de un cliente: `CLIENT_ROLE_LABEL`). */
export const ROLE_LABEL = { admin: "Administración de plataforma", member: "Persona" } as const;
export const CLIENT_ROLE_LABEL = { owner: "Propiedad", member: "Miembro" } as const;

/** Persona que ya no comparte ningún cliente con quien mira: su perfil no es visible y su nombre llega vacío. */
export const FORMER_MEMBER = "Antiguo miembro";
/** Nombre de quien figura en un registro: «Antiguo miembro» si hay persona pero no nombre; `none` si no hay nadie. */
export const personName = (id: string | null | undefined, name: string | null | undefined, none: string): string =>
  id ? name ?? FORMER_MEMBER : none;

type Transition = { to: DeliverableStatus; label: string; ownerOnly?: boolean; /** Solo si la revisión actual sigue validada. */ needsApproval?: boolean };
const PARK: Transition[] = [
  { to: "waiting_client", label: "Esperando material del cliente" },
  { to: "waiting_marketing", label: "Esperando a marketing" },
  { to: "on_hold", label: "Poner en pausa" },
  { to: "discarded", label: "Descartar" },
];
const RESUME: Transition[] = [
  { to: "in_preparation", label: "Retomar la preparación" },
  { to: "in_review", label: "Pedir revisión" },
  { to: "approved", label: "Volver a validado", needsApproval: true },
];
const parkExcept = (s: DeliverableStatus) => PARK.filter((t) => t.to !== s);

/** Transiciones que la interfaz ofrece; la base de datos es quien las hace cumplir. */
export const DELIVERABLE_TRANSITIONS: Record<DeliverableStatus, Transition[]> = {
  idea: [{ to: "in_preparation", label: "Empezar preparación" }, { to: "in_review", label: "Pedir revisión" }, ...PARK],
  in_preparation: [{ to: "in_review", label: "Pedir revisión" }, { to: "idea", label: "Volver a idea" }, ...PARK],
  in_review: [
    { to: "approved", label: "Validar", ownerOnly: true },
    { to: "changes_requested", label: "Solicitar cambios" },
    { to: "in_preparation", label: "Retirar de revisión" },
    ...PARK,
  ],
  changes_requested: [{ to: "in_review", label: "Pedir revisión de nuevo" }, { to: "in_preparation", label: "Volver a preparación" }, ...PARK],
  approved: [
    { to: "scheduled", label: "Registrar como programado" },
    { to: "published", label: "Registrar como publicado" },
    { to: "changes_requested", label: "Solicitar cambios" },
    ...PARK,
  ],
  scheduled: [
    { to: "published", label: "Registrar como publicado" },
    { to: "approved", label: "Quitar programación" },
    { to: "changes_requested", label: "Solicitar cambios" },
    ...PARK,
  ],
  published: [],
  waiting_client: [...RESUME, ...parkExcept("waiting_client")],
  waiting_marketing: [...RESUME, ...parkExcept("waiting_marketing")],
  on_hold: [...RESUME, ...parkExcept("on_hold")],
  discarded: [{ to: "in_preparation", label: "Recuperar" }],
};

/** Categoría sugerida a partir de la URL (sin descargar nada). */
export function guessCategory(url: string): Category {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return "other";
  }
  if (host.endsWith("figma.com")) return "figma";
  if (host === "drive.google.com") return "drive";
  if (host === "docs.google.com") return "document";
  if (host.endsWith("myshopify.com") || host === "admin.shopify.com") return "store";
  if (host.endsWith("facebook.com") || host.endsWith("meta.com") || host === "ads.google.com") return "advertising";
  if (host.endsWith("klaviyo.com") || host.endsWith("mailchimp.com")) return "email";
  return "other";
}
