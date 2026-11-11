-- Amapola Workspace · 1/3 · Tablas, relaciones e índices
-- Requiere el esquema `auth` de Supabase (auth.users, auth.uid()).

create table public.profiles (
  id uuid primary key references auth.users (id),
  display_name text not null check (char_length(display_name) between 1 and 80),
  role text not null default 'member' check (role in ('admin', 'member')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 160),
  objective text not null default '' check (char_length(objective) <= 2000),
  description text not null default '' check (char_length(description) <= 10000),
  start_date date,
  end_date date,
  owner_id uuid references public.profiles (id),
  status text not null default 'planned' check (status in ('planned', 'active', 'completed')),
  archived_at timestamptz,
  archived_by uuid references public.profiles (id),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  check (start_date is null or end_date is null or end_date >= start_date)
);

create table public.deliverables (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 200),
  campaign_id uuid references public.campaigns (id) on delete set null,
  channel text not null check (channel in ('newsletter', 'meta_ad', 'google_ad', 'instagram', 'landing', 'other')),
  owner_id uuid references public.profiles (id),
  brief text not null default '' check (char_length(brief) <= 20000),
  copy text not null default '' check (char_length(copy) <= 50000),
  planned_date date,          -- fecha prevista de publicación (fecha local, Europe/Madrid)
  published_on date,          -- última fecha real de publicación registrada
  status text not null default 'idea' check (status in
    ('idea', 'in_preparation', 'in_review', 'changes_requested', 'approved', 'scheduled', 'published')),
  revision integer not null default 1,
  approved_revision integer,
  approved_by uuid references public.profiles (id),
  approved_at timestamptz,
  archived_at timestamptz,
  archived_by uuid references public.profiles (id),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 200),
  description text not null default '' check (char_length(description) <= 10000),
  assignee_id uuid references public.profiles (id),
  due_date date,              -- fecha límite; independiente de la fecha de publicación
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'blocked', 'done')),
  campaign_id uuid references public.campaigns (id) on delete set null,
  deliverable_id uuid references public.deliverables (id) on delete set null,
  completed_at timestamptz,
  archived_at timestamptz,
  archived_by uuid references public.profiles (id),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  -- Una tarea de un entregable hereda la campaña de ese entregable: nunca dos campañas distintas.
  constraint tasks_single_parent check (campaign_id is null or deliverable_id is null)
);

create table public.resources (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 200),
  url text not null check (char_length(url) <= 2048 and url ~* '^https?://'),
  category text not null default 'other' check (category in
    ('figma', 'drive', 'document', 'store', 'advertising', 'email', 'other')),
  description text not null default '' check (char_length(description) <= 1000),
  content_updated_at timestamptz,   -- "Marcar material actualizado"
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1
);

-- Asociación recurso ↔ campaña | entregable | tarea. El recurso nunca se copia.
create table public.resource_links (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.resources (id) on delete cascade,
  campaign_id uuid references public.campaigns (id) on delete cascade,
  deliverable_id uuid references public.deliverables (id) on delete cascade,
  task_id uuid references public.tasks (id) on delete cascade,
  is_primary boolean not null default false,
  requires_approval boolean not null default false,  -- solo aplica a entregables
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  constraint resource_links_one_target check (num_nonnulls(campaign_id, deliverable_id, task_id) = 1)
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  deliverable_id uuid references public.deliverables (id) on delete cascade,
  task_id uuid references public.tasks (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 5000),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  constraint comments_one_target check (num_nonnulls(deliverable_id, task_id) = 1)
);

-- Historial básico de cambios (lo escriben los triggers, no los usuarios).
create table public.activity_log (
  id bigint generated always as identity primary key,
  entity_type text not null check (entity_type in ('deliverable', 'task')),
  entity_id uuid not null,
  actor_id uuid references public.profiles (id),
  action text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Historial de publicaciones: una fila por cada vez que se registró "Publicado".
create table public.publications (
  id uuid primary key default gen_random_uuid(),
  deliverable_id uuid not null references public.deliverables (id) on delete cascade,
  revision integer not null,
  published_on date not null,
  recorded_by uuid references public.profiles (id),
  recorded_at timestamptz not null default now()
);

create index deliverables_planned_date_idx on public.deliverables (planned_date);
create index deliverables_campaign_idx on public.deliverables (campaign_id);
create index deliverables_status_idx on public.deliverables (status);
create index deliverables_owner_idx on public.deliverables (owner_id);
create index tasks_due_date_idx on public.tasks (due_date);
create index tasks_assignee_status_idx on public.tasks (assignee_id, status);
create index tasks_campaign_idx on public.tasks (campaign_id);
create index tasks_deliverable_idx on public.tasks (deliverable_id);
create index campaigns_dates_idx on public.campaigns (start_date, end_date);
create index resources_url_idx on public.resources (lower(url));
create index resources_created_idx on public.resources (created_at desc);
create index resource_links_resource_idx on public.resource_links (resource_id);
create unique index resource_links_campaign_uq on public.resource_links (campaign_id, resource_id) where campaign_id is not null;
create unique index resource_links_deliverable_uq on public.resource_links (deliverable_id, resource_id) where deliverable_id is not null;
create unique index resource_links_task_uq on public.resource_links (task_id, resource_id) where task_id is not null;
create index comments_deliverable_idx on public.comments (deliverable_id, created_at) where deliverable_id is not null;
create index comments_task_idx on public.comments (task_id, created_at) where task_id is not null;
create index activity_entity_idx on public.activity_log (entity_type, entity_id, created_at desc);
create index publications_deliverable_idx on public.publications (deliverable_id, recorded_at desc);
