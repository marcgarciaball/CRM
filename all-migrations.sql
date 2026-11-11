
-- ===== supabase/migrations/20261110000001_schema.sql =====
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

-- ===== supabase/migrations/20261110000002_logic.sql =====
-- Amapola Workspace · 2/3 · Reglas de negocio en el servidor (triggers)
-- Las transiciones editoriales, la aprobación y su invalidación se aplican aquí,
-- de modo que no pueden saltarse desde la interfaz ni desde la API.

create function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active);
$$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active and role = 'admin');
$$;

-- ── Autoría, versión (concurrencia optimista) y archivo ────────────────────
create function public.set_creator() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.created_by := coalesce(auth.uid(), new.created_by);
  return new;
end $$;

create function public.touch_row() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.version := old.version + 1;
  new.updated_at := now();
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  if tg_table_name <> 'resources' then
    if new.archived_at is null then
      new.archived_by := null;
    elsif old.archived_at is null then
      new.archived_by := auth.uid();
    else
      new.archived_at := old.archived_at;
      new.archived_by := old.archived_by;
    end if;
  end if;
  return new;
end $$;

create trigger campaigns_creator before insert on public.campaigns for each row execute function public.set_creator();
create trigger deliverables_creator before insert on public.deliverables for each row execute function public.set_creator();
create trigger tasks_creator before insert on public.tasks for each row execute function public.set_creator();
create trigger resources_creator before insert on public.resources for each row execute function public.set_creator();
create trigger resource_links_creator before insert on public.resource_links for each row execute function public.set_creator();
create trigger comments_creator before insert on public.comments for each row execute function public.set_creator();

create trigger a_campaigns_touch before update on public.campaigns for each row execute function public.touch_row();
create trigger a_deliverables_touch before update on public.deliverables for each row execute function public.touch_row();
create trigger a_tasks_touch before update on public.tasks for each row execute function public.touch_row();
create trigger a_resources_touch before update on public.resources for each row execute function public.touch_row();

-- ── Perfiles: nadie cambia su propio rol; siempre queda una administradora ──
create function public.profiles_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.id := old.id;
  new.created_at := old.created_at;
  new.updated_at := now();
  if new.role is distinct from old.role or new.active is distinct from old.active then
    if auth.uid() is not null and not public.is_admin() then
      raise exception 'Solo una persona administradora puede cambiar roles o accesos.' using errcode = '42501';
    end if;
    if old.role = 'admin' and old.active and not (new.role = 'admin' and new.active)
       and not exists (select 1 from public.profiles where role = 'admin' and active and id <> old.id) then
      raise exception 'Debe quedar al menos una persona administradora activa.';
    end if;
  end if;
  return new;
end $$;
create trigger profiles_guard before update on public.profiles for each row execute function public.profiles_guard();

-- Alta de la primera administradora desde el editor SQL (no accesible para usuarios de la app).
create function public.bootstrap_admin(p_email text, p_display_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from auth.users where lower(email) = lower(p_email);
  if v_id is null then
    raise exception 'No existe ningún usuario de autenticación con el email %', p_email;
  end if;
  insert into public.profiles (id, display_name, role, active)
  values (v_id, p_display_name, 'admin', true)
  on conflict (id) do update set role = 'admin', active = true, display_name = excluded.display_name;
  return v_id;
end $$;

-- ── Historial ──────────────────────────────────────────────────────────────
create function public.log_activity(p_type text, p_id uuid, p_action text, p_detail jsonb) returns void
language sql security definer set search_path = public as $$
  insert into public.activity_log (entity_type, entity_id, actor_id, action, detail)
  values (p_type, p_id, auth.uid(), p_action, coalesce(p_detail, '{}'::jsonb));
$$;

-- ── Entregables: flujo editorial ───────────────────────────────────────────
create function public.deliverables_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    if new.status not in ('idea', 'in_preparation') then
      raise exception 'Un entregable nuevo empieza como idea o en preparación.';
    end if;
    new.revision := 1;
    new.approved_revision := null;
    new.approved_by := null;
    new.approved_at := null;
    new.published_on := null;
    new.archived_at := null;
    new.archived_by := null;
  end if;
  return new;
end $$;
create trigger deliverables_before_insert before insert on public.deliverables
  for each row execute function public.deliverables_before_insert();

create function public.deliverables_before_update() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  allowed text[];
begin
  -- Cambios internos (invalidación desde otro trigger): no se revalidan.
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  -- Campos que solo gestiona el servidor.
  new.revision := old.revision;
  new.approved_revision := old.approved_revision;
  new.approved_by := old.approved_by;
  new.approved_at := old.approved_at;

  if new.copy is distinct from old.copy then
    if new.status is distinct from old.status then
      raise exception 'Guarda el cambio de copy antes de cambiar el estado.';
    end if;
    new.revision := old.revision + 1;
    -- El copy aprobado ha cambiado: vuelve a revisión (también si ya estaba publicado).
    if old.status in ('approved', 'scheduled', 'published') then
      new.status := 'in_review';
    end if;
  elsif new.status is distinct from old.status then
    allowed := case old.status
      when 'idea' then array['in_preparation', 'in_review']
      when 'in_preparation' then array['idea', 'in_review']
      when 'in_review' then array['in_preparation', 'changes_requested', 'approved']
      when 'changes_requested' then array['in_preparation', 'in_review']
      when 'approved' then array['scheduled', 'published', 'changes_requested']
      when 'scheduled' then array['approved', 'published', 'changes_requested']
      else array[]::text[]
    end;
    if not (new.status = any (allowed)) then
      if old.status = 'published' then
        raise exception 'Un entregable publicado no cambia de estado: edita su contenido para crear una nueva revisión.';
      end if;
      raise exception 'Cambio de estado no permitido (% → %).', old.status, new.status;
    end if;
    if new.status = 'approved' and old.status = 'in_review' then
      if not public.is_admin() then
        raise exception 'Solo una persona administradora puede aprobar un entregable.' using errcode = '42501';
      end if;
      new.approved_revision := new.revision;
      new.approved_by := auth.uid();
      new.approved_at := now();
    end if;
    if new.status in ('approved', 'scheduled', 'published')
       and new.approved_revision is distinct from new.revision then
      raise exception 'La revisión actual no está aprobada.';
    end if;
    if new.status = 'published' and new.published_on is null then
      raise exception 'Indica la fecha real de publicación.';
    end if;
  end if;

  if new.status = 'scheduled' and new.planned_date is null then
    raise exception 'Un entregable programado necesita fecha prevista de publicación.';
  end if;
  -- La fecha real solo se registra al marcar como publicado.
  if new.published_on is distinct from old.published_on
     and not (new.status = 'published' and old.status is distinct from 'published') then
    new.published_on := old.published_on;
  end if;
  return new;
end $$;
create trigger b_deliverables_before_update before update on public.deliverables
  for each row execute function public.deliverables_before_update();

create function public.deliverables_after_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.copy is distinct from old.copy then
    perform public.log_activity('deliverable', new.id, 'copy_changed',
      jsonb_build_object('revision', new.revision));
  end if;
  if new.status is distinct from old.status then
    perform public.log_activity('deliverable', new.id, 'status',
      jsonb_build_object('from', old.status, 'to', new.status, 'revision', new.revision));
    if new.status = 'published' then
      insert into public.publications (deliverable_id, revision, published_on, recorded_by)
      values (new.id, new.revision, new.published_on, auth.uid());
    end if;
  end if;
  if new.planned_date is distinct from old.planned_date then
    perform public.log_activity('deliverable', new.id, 'planned_date',
      jsonb_build_object('from', old.planned_date, 'to', new.planned_date));
  end if;
  if new.owner_id is distinct from old.owner_id then
    perform public.log_activity('deliverable', new.id, 'owner',
      jsonb_build_object('from', old.owner_id, 'to', new.owner_id));
  end if;
  if new.campaign_id is distinct from old.campaign_id then
    perform public.log_activity('deliverable', new.id, 'campaign',
      jsonb_build_object('from', old.campaign_id, 'to', new.campaign_id));
  end if;
  if (new.archived_at is null) <> (old.archived_at is null) then
    perform public.log_activity('deliverable', new.id,
      case when new.archived_at is null then 'restored' else 'archived' end, null);
  end if;
  return null;
end $$;
create trigger deliverables_after_update after update on public.deliverables
  for each row execute function public.deliverables_after_update();

create function public.deliverables_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.log_activity('deliverable', new.id, 'created', null);
  return null;
end $$;
create trigger deliverables_after_insert after insert on public.deliverables
  for each row execute function public.deliverables_after_insert();

-- Invalida la aprobación de un entregable porque ha cambiado un material aprobable.
create function public.invalidate_deliverable_approval(p_deliverable uuid, p_reason text, p_resource uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_title text;
begin
  update public.deliverables
     set revision = revision + 1,
         status = case when status in ('approved', 'scheduled', 'published') then 'in_review' else status end
   where id = p_deliverable;
  if found then
    select title into v_title from public.resources where id = p_resource;
    perform public.log_activity('deliverable', p_deliverable, 'material_changed',
      jsonb_build_object('reason', p_reason, 'resource', coalesce(v_title, '')));
  end if;
end $$;

-- ── Enlaces recurso ↔ registro ─────────────────────────────────────────────
create function public.resource_links_before() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    new.resource_id := old.resource_id;
    new.campaign_id := old.campaign_id;
    new.deliverable_id := old.deliverable_id;
    new.task_id := old.task_id;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  if new.deliverable_id is null then
    new.requires_approval := false;
  end if;
  return new;
end $$;
create trigger b_resource_links_before before insert or update on public.resource_links
  for each row execute function public.resource_links_before();

create function public.resource_links_after() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.requires_approval then
      perform public.invalidate_deliverable_approval(new.deliverable_id, 'material_added', new.resource_id);
    end if;
  elsif tg_op = 'DELETE' then
    if old.requires_approval then
      perform public.invalidate_deliverable_approval(old.deliverable_id, 'material_removed', old.resource_id);
    end if;
  elsif new.requires_approval is distinct from old.requires_approval then
    perform public.invalidate_deliverable_approval(new.deliverable_id, 'material_approval_flag', new.resource_id);
  end if;
  return null;
end $$;
create trigger resource_links_after after insert or update or delete on public.resource_links
  for each row execute function public.resource_links_after();

-- Un recurso compartido cambia (URL nueva o "material actualizado"):
-- se invalida la aprobación de TODOS los entregables que lo usan como material aprobable.
create function public.resources_after_update() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if new.url is distinct from old.url or new.content_updated_at is distinct from old.content_updated_at then
    for r in select deliverable_id from public.resource_links
              where resource_id = new.id and deliverable_id is not null and requires_approval
    loop
      perform public.invalidate_deliverable_approval(r.deliverable_id,
        case when new.url is distinct from old.url then 'material_url_changed' else 'material_marked_updated' end,
        new.id);
    end loop;
  end if;
  return null;
end $$;
create trigger resources_after_update after update on public.resources
  for each row execute function public.resources_after_update();

-- ── Tareas ─────────────────────────────────────────────────────────────────
create function public.tasks_before() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'done' then
    if tg_op = 'INSERT' or old.status is distinct from 'done' then
      new.completed_at := now();
    else
      new.completed_at := old.completed_at;
    end if;
  else
    new.completed_at := null;
  end if;
  return new;
end $$;
create trigger b_tasks_before before insert or update on public.tasks
  for each row execute function public.tasks_before();

create function public.tasks_after() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_activity('task', new.id, 'created', null);
    return null;
  end if;
  if new.status is distinct from old.status then
    perform public.log_activity('task', new.id, 'status', jsonb_build_object('from', old.status, 'to', new.status));
  end if;
  if new.assignee_id is distinct from old.assignee_id then
    perform public.log_activity('task', new.id, 'assignee', jsonb_build_object('from', old.assignee_id, 'to', new.assignee_id));
  end if;
  if new.due_date is distinct from old.due_date then
    perform public.log_activity('task', new.id, 'due_date', jsonb_build_object('from', old.due_date, 'to', new.due_date));
  end if;
  if (new.archived_at is null) <> (old.archived_at is null) then
    perform public.log_activity('task', new.id,
      case when new.archived_at is null then 'restored' else 'archived' end, null);
  end if;
  return null;
end $$;
create trigger tasks_after after insert or update on public.tasks
  for each row execute function public.tasks_after();

-- ===== supabase/migrations/20261110000003_rls.sql =====
-- Amapola Workspace · 3/3 · Seguridad a nivel de fila y permisos
-- Sin perfil activo en `profiles` no se ve ni se modifica nada, aunque exista sesión.

alter table public.profiles enable row level security;
alter table public.campaigns enable row level security;
alter table public.deliverables enable row level security;
alter table public.tasks enable row level security;
alter table public.resources enable row level security;
alter table public.resource_links enable row level security;
alter table public.comments enable row level security;
alter table public.activity_log enable row level security;
alter table public.publications enable row level security;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
grant execute on function public.is_member(), public.is_admin() to authenticated;

grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on
  public.campaigns, public.deliverables, public.tasks, public.resources, public.resource_links
  to authenticated;
grant select, insert, delete on public.comments to authenticated;
grant select on public.activity_log, public.publications to authenticated;

-- Perfiles
create policy profiles_select on public.profiles for select to authenticated
  using (public.is_member() or id = auth.uid());
create policy profiles_insert on public.profiles for insert to authenticated
  with check (public.is_admin());
create policy profiles_update on public.profiles for update to authenticated
  using (public.is_admin() or (public.is_member() and id = auth.uid()))
  with check (public.is_admin() or (public.is_member() and id = auth.uid()));

-- Trabajo compartido: cualquier miembro lee, crea y edita; solo administración elimina.
create policy campaigns_select on public.campaigns for select to authenticated using (public.is_member());
create policy campaigns_insert on public.campaigns for insert to authenticated with check (public.is_member());
create policy campaigns_update on public.campaigns for update to authenticated using (public.is_member()) with check (public.is_member());
create policy campaigns_delete on public.campaigns for delete to authenticated using (public.is_admin());

create policy deliverables_select on public.deliverables for select to authenticated using (public.is_member());
create policy deliverables_insert on public.deliverables for insert to authenticated with check (public.is_member());
create policy deliverables_update on public.deliverables for update to authenticated using (public.is_member()) with check (public.is_member());
create policy deliverables_delete on public.deliverables for delete to authenticated using (public.is_admin());

create policy tasks_select on public.tasks for select to authenticated using (public.is_member());
create policy tasks_insert on public.tasks for insert to authenticated with check (public.is_member());
create policy tasks_update on public.tasks for update to authenticated using (public.is_member()) with check (public.is_member());
create policy tasks_delete on public.tasks for delete to authenticated using (public.is_admin());

create policy resources_select on public.resources for select to authenticated using (public.is_member());
create policy resources_insert on public.resources for insert to authenticated with check (public.is_member());
create policy resources_update on public.resources for update to authenticated using (public.is_member()) with check (public.is_member());
create policy resources_delete on public.resources for delete to authenticated using (public.is_admin());

-- Desvincular un enlace de un registro está al alcance de cualquier miembro.
create policy resource_links_select on public.resource_links for select to authenticated using (public.is_member());
create policy resource_links_insert on public.resource_links for insert to authenticated with check (public.is_member());
create policy resource_links_update on public.resource_links for update to authenticated using (public.is_member()) with check (public.is_member());
create policy resource_links_delete on public.resource_links for delete to authenticated using (public.is_member());

create policy comments_select on public.comments for select to authenticated using (public.is_member());
create policy comments_insert on public.comments for insert to authenticated with check (public.is_member());
create policy comments_delete on public.comments for delete to authenticated
  using (public.is_admin() or (public.is_member() and created_by = auth.uid()));

-- Historial: solo lectura (lo escriben los triggers).
create policy activity_select on public.activity_log for select to authenticated using (public.is_member());
create policy publications_select on public.publications for select to authenticated using (public.is_member());

-- ===== supabase/migrations/20261110000004_notifications.sql =====
-- Amapola Workspace · 4 · Novedades: cuándo miró cada persona sus avisos por última vez.
alter table public.profiles add column notifications_seen_at timestamptz not null default now();

-- ===== supabase/migrations/20261111000001_clients.sql =====
-- Amapola Workspace · 5 · Clientes
-- Cada campaña, entregable, tarea y recurso pertenece a un cliente.
-- Los datos existentes (si los hay) pasan a un único cliente «Amapola».
-- La seguridad por cliente llega en la migración siguiente; aquí las reglas siguen siendo `is_member()`.

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  archived_at timestamptz,
  archived_by uuid references public.profiles (id),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1
);

create table public.client_members (
  client_id uuid not null references public.clients (id) on delete cascade,
  user_id uuid not null references public.profiles (id),
  role text not null default 'member' check (role in ('owner', 'member')),
  added_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  primary key (client_id, user_id)
);
create index client_members_user_idx on public.client_members (user_id);

-- Registro de invitaciones enviadas (límite diario por persona). Lo escriben funciones del servidor.
create table public.invitation_log (
  id uuid primary key default gen_random_uuid(),
  invited_by uuid not null references public.profiles (id),
  email text not null,
  created_at timestamptz not null default now()
);
create index invitation_log_inviter_idx on public.invitation_log (invited_by, created_at desc);

-- ── Autoría y versión; quien crea el cliente es su propietaria ─────────────
create trigger clients_creator before insert on public.clients for each row execute function public.set_creator();
create trigger a_clients_touch before update on public.clients for each row execute function public.touch_row();

create function public.clients_add_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Sin identidad (conexión privilegiada: migraciones, preparación de tests) no se añade nadie.
  if auth.uid() is not null then
    insert into public.client_members (client_id, user_id, role, added_by)
    values (new.id, auth.uid(), 'owner', auth.uid());
  end if;
  return null;
end $$;
revoke all on function public.clients_add_owner() from public, anon, authenticated;
create trigger clients_add_owner after insert on public.clients for each row execute function public.clients_add_owner();

-- ── client_id en el trabajo ────────────────────────────────────────────────
alter table public.campaigns add column client_id uuid references public.clients (id);
alter table public.deliverables add column client_id uuid references public.clients (id);
alter table public.tasks add column client_id uuid references public.clients (id);
alter table public.resources add column client_id uuid references public.clients (id);
alter table public.activity_log add column client_id uuid;

-- Traslado de los datos existentes al cliente «Amapola» (solo si ya había un equipo).
do $$
declare v_client uuid;
begin
  if exists (select 1 from public.profiles) then
    insert into public.clients (name) values ('Amapola') returning id into v_client;
    insert into public.client_members (client_id, user_id, role)
      select v_client, id, case when role = 'admin' then 'owner' else 'member' end
        from public.profiles where active;
    update public.campaigns set client_id = v_client;
    update public.deliverables set client_id = v_client;
    update public.tasks set client_id = v_client;
    update public.resources set client_id = v_client;
    update public.activity_log set client_id = v_client;
  end if;
end $$;

alter table public.campaigns alter column client_id set not null;
alter table public.deliverables alter column client_id set not null;
alter table public.tasks alter column client_id set not null;
alter table public.resources alter column client_id set not null;

create index campaigns_client_idx on public.campaigns (client_id);
create index deliverables_client_idx on public.deliverables (client_id);
create index tasks_client_idx on public.tasks (client_id);
create index resources_client_idx on public.resources (client_id);
create index activity_client_idx on public.activity_log (client_id, created_at desc);

-- ── Historial: cada entrada guarda el cliente de su entregable o tarea ─────
create or replace function public.log_activity(p_type text, p_id uuid, p_action text, p_detail jsonb) returns void
language sql security definer set search_path = public as $$
  insert into public.activity_log (entity_type, entity_id, client_id, actor_id, action, detail)
  values (p_type, p_id,
          case p_type
            when 'deliverable' then (select client_id from public.deliverables where id = p_id)
            when 'task' then (select client_id from public.tasks where id = p_id)
          end,
          auth.uid(), p_action, coalesce(p_detail, '{}'::jsonb));
$$;

-- ── Permisos provisionales (los sustituye la migración de acceso por cliente) ──
alter table public.clients enable row level security;
alter table public.client_members enable row level security;
alter table public.invitation_log enable row level security;

-- La migración 3 revocó los permisos de las tablas existentes entonces; las nuevas parten de los permisos por defecto.
revoke all on public.clients, public.client_members, public.invitation_log from public, anon, authenticated;

grant select, insert, update on public.clients to authenticated;
grant select on public.client_members to authenticated;

create policy clients_select on public.clients for select to authenticated using (public.is_member());
create policy clients_insert on public.clients for insert to authenticated with check (public.is_member());
create policy clients_update on public.clients for update to authenticated using (public.is_member()) with check (public.is_member());
create policy client_members_select on public.client_members for select to authenticated using (public.is_member());

-- ===== supabase/migrations/20261111000002_client_access.sql =====
-- Amapola Workspace · 6 · Acceso por cliente
-- Cada persona ve y edita solo el trabajo de los clientes de los que es miembro.
-- Un cliente archivado se puede leer, pero no modificar. Solo la propiedad del cliente
-- aprueba entregables y elimina definitivamente. Sustituye las reglas `is_member()` del trabajo.

-- ── Funciones de acceso ────────────────────────────────────────────────────
create function public.is_client_member(p_client uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.client_members m join public.profiles p on p.id = m.user_id
     where m.client_id = p_client and m.user_id = auth.uid() and p.active);
$$;

create function public.is_client_owner(p_client uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.client_members m join public.profiles p on p.id = m.user_id
     where m.client_id = p_client and m.user_id = auth.uid() and m.role = 'owner' and p.active);
$$;

create function public.can_write_client(p_client uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_client_member(p_client)
     and exists (select 1 from public.clients where id = p_client and archived_at is null);
$$;

-- Las funciones nuevas parten con permiso de ejecución para todos: se restringe explícitamente.
revoke all on function public.is_client_member(uuid), public.is_client_owner(uuid), public.can_write_client(uuid)
  from public, anon, authenticated;
grant execute on function public.is_client_member(uuid), public.is_client_owner(uuid), public.can_write_client(uuid)
  to authenticated;

-- ── Coherencia entre clientes ──────────────────────────────────────────────
-- Un registro no cambia de cliente, solo se relaciona con registros de su mismo cliente
-- y solo se asigna a personas con acceso a ese cliente. Aplica también a la conexión privilegiada.
create function public.client_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_person uuid;
begin
  -- Enlaces: el recurso y el registro enlazado deben ser del mismo cliente (no cambian al editar).
  if tg_table_name = 'resource_links' then
    if tg_op = 'INSERT' and (select client_id from public.resources where id = new.resource_id) is distinct from coalesce(
         (select client_id from public.campaigns where id = new.campaign_id),
         (select client_id from public.deliverables where id = new.deliverable_id),
         (select client_id from public.tasks where id = new.task_id)) then
      raise exception 'Ese elemento pertenece a otro cliente.' using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.client_id is distinct from old.client_id then
      raise exception 'Ese elemento pertenece a otro cliente.' using errcode = '42501';
    end if;
  end if;

  -- Registros relacionados y persona responsable: solo se comprueban al fijarlos o cambiarlos,
  -- para que retirar a alguien de un cliente no bloquee la edición de lo que tenía asignado.
  if tg_table_name = 'campaigns' then
    v_person := new.owner_id;
    if tg_op = 'UPDATE' then
      if v_person is not distinct from old.owner_id then v_person := null; end if;
    end if;
  elsif tg_table_name = 'deliverables' then
    if new.campaign_id is not null then
      if tg_op = 'INSERT' or new.campaign_id is distinct from old.campaign_id then
        if (select client_id from public.campaigns where id = new.campaign_id) is distinct from new.client_id then
          raise exception 'Ese elemento pertenece a otro cliente.' using errcode = '42501';
        end if;
      end if;
    end if;
    v_person := new.owner_id;
    if tg_op = 'UPDATE' then
      if v_person is not distinct from old.owner_id then v_person := null; end if;
    end if;
  elsif tg_table_name = 'tasks' then
    if new.campaign_id is not null then
      if tg_op = 'INSERT' or new.campaign_id is distinct from old.campaign_id then
        if (select client_id from public.campaigns where id = new.campaign_id) is distinct from new.client_id then
          raise exception 'Ese elemento pertenece a otro cliente.' using errcode = '42501';
        end if;
      end if;
    end if;
    if new.deliverable_id is not null then
      if tg_op = 'INSERT' or new.deliverable_id is distinct from old.deliverable_id then
        if (select client_id from public.deliverables where id = new.deliverable_id) is distinct from new.client_id then
          raise exception 'Ese elemento pertenece a otro cliente.' using errcode = '42501';
        end if;
      end if;
    end if;
    v_person := new.assignee_id;
    if tg_op = 'UPDATE' then
      if v_person is not distinct from old.assignee_id then v_person := null; end if;
    end if;
  end if;

  if v_person is not null then
    if not exists (select 1 from public.client_members where client_id = new.client_id and user_id = v_person) then
      raise exception 'Esa persona no tiene acceso a este cliente.' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.client_guard() from public, anon, authenticated;

create trigger campaigns_client_guard before insert or update on public.campaigns
  for each row execute function public.client_guard();
create trigger deliverables_client_guard before insert or update on public.deliverables
  for each row execute function public.client_guard();
create trigger tasks_client_guard before insert or update on public.tasks
  for each row execute function public.client_guard();
create trigger resources_client_guard before insert or update on public.resources
  for each row execute function public.client_guard();
create trigger resource_links_client_guard before insert or update on public.resource_links
  for each row execute function public.client_guard();

-- ── Aprobación: solo la propiedad del cliente del entregable ───────────────
-- `create or replace` conserva los permisos revocados en la migración 3.
create or replace function public.deliverables_before_update() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  allowed text[];
begin
  -- Cambios internos (invalidación desde otro trigger): no se revalidan.
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  -- Campos que solo gestiona el servidor.
  new.revision := old.revision;
  new.approved_revision := old.approved_revision;
  new.approved_by := old.approved_by;
  new.approved_at := old.approved_at;

  if new.copy is distinct from old.copy then
    if new.status is distinct from old.status then
      raise exception 'Guarda el cambio de copy antes de cambiar el estado.';
    end if;
    new.revision := old.revision + 1;
    -- El copy aprobado ha cambiado: vuelve a revisión (también si ya estaba publicado).
    if old.status in ('approved', 'scheduled', 'published') then
      new.status := 'in_review';
    end if;
  elsif new.status is distinct from old.status then
    allowed := case old.status
      when 'idea' then array['in_preparation', 'in_review']
      when 'in_preparation' then array['idea', 'in_review']
      when 'in_review' then array['in_preparation', 'changes_requested', 'approved']
      when 'changes_requested' then array['in_preparation', 'in_review']
      when 'approved' then array['scheduled', 'published', 'changes_requested']
      when 'scheduled' then array['approved', 'published', 'changes_requested']
      else array[]::text[]
    end;
    if not (new.status = any (allowed)) then
      if old.status = 'published' then
        raise exception 'Un entregable publicado no cambia de estado: edita su contenido para crear una nueva revisión.';
      end if;
      raise exception 'Cambio de estado no permitido (% → %).', old.status, new.status;
    end if;
    if new.status = 'approved' and old.status = 'in_review' then
      if not public.is_client_owner(new.client_id) then
        raise exception 'Solo una persona propietaria del cliente puede aprobar un entregable.' using errcode = '42501';
      end if;
      new.approved_revision := new.revision;
      new.approved_by := auth.uid();
      new.approved_at := now();
    end if;
    if new.status in ('approved', 'scheduled', 'published')
       and new.approved_revision is distinct from new.revision then
      raise exception 'La revisión actual no está aprobada.';
    end if;
    if new.status = 'published' and new.published_on is null then
      raise exception 'Indica la fecha real de publicación.';
    end if;
  end if;

  if new.status = 'scheduled' and new.planned_date is null then
    raise exception 'Un entregable programado necesita fecha prevista de publicación.';
  end if;
  -- La fecha real solo se registra al marcar como publicado.
  if new.published_on is distinct from old.published_on
     and not (new.status = 'published' and old.status is distinct from 'published') then
    new.published_on := old.published_on;
  end if;
  return new;
end $$;

-- ── Clientes y miembros ────────────────────────────────────────────────────
drop policy clients_select on public.clients;
drop policy clients_insert on public.clients;
drop policy clients_update on public.clients;
drop policy client_members_select on public.client_members;

-- Los clientes no se eliminan (se archivan). Los miembros solo se gestionan con funciones del servidor.
revoke all on public.clients, public.client_members from public, anon, authenticated;
grant select, insert, update on public.clients to authenticated;
grant select on public.client_members to authenticated;

create policy clients_select on public.clients for select to authenticated using (public.is_client_member(id));
create policy clients_insert on public.clients for insert to authenticated with check (public.is_member());
create policy clients_update on public.clients for update to authenticated
  using (public.is_client_owner(id)) with check (public.is_client_owner(id));
create policy client_members_select on public.client_members for select to authenticated
  using (public.is_client_member(client_id));

-- ── Trabajo: se lee siendo miembro; se escribe si además el cliente no está archivado ──
drop policy campaigns_select on public.campaigns;
drop policy campaigns_insert on public.campaigns;
drop policy campaigns_update on public.campaigns;
drop policy campaigns_delete on public.campaigns;
drop policy deliverables_select on public.deliverables;
drop policy deliverables_insert on public.deliverables;
drop policy deliverables_update on public.deliverables;
drop policy deliverables_delete on public.deliverables;
drop policy tasks_select on public.tasks;
drop policy tasks_insert on public.tasks;
drop policy tasks_update on public.tasks;
drop policy tasks_delete on public.tasks;
drop policy resources_select on public.resources;
drop policy resources_insert on public.resources;
drop policy resources_update on public.resources;
drop policy resources_delete on public.resources;
drop policy resource_links_select on public.resource_links;
drop policy resource_links_insert on public.resource_links;
drop policy resource_links_update on public.resource_links;
drop policy resource_links_delete on public.resource_links;
drop policy comments_select on public.comments;
drop policy comments_insert on public.comments;
drop policy comments_delete on public.comments;
drop policy activity_select on public.activity_log;
drop policy publications_select on public.publications;

create policy campaigns_select on public.campaigns for select to authenticated using (public.is_client_member(client_id));
create policy campaigns_insert on public.campaigns for insert to authenticated with check (public.can_write_client(client_id));
create policy campaigns_update on public.campaigns for update to authenticated
  using (public.can_write_client(client_id)) with check (public.can_write_client(client_id));
create policy campaigns_delete on public.campaigns for delete to authenticated
  using (public.is_client_owner(client_id) and public.can_write_client(client_id));

create policy deliverables_select on public.deliverables for select to authenticated using (public.is_client_member(client_id));
create policy deliverables_insert on public.deliverables for insert to authenticated with check (public.can_write_client(client_id));
create policy deliverables_update on public.deliverables for update to authenticated
  using (public.can_write_client(client_id)) with check (public.can_write_client(client_id));
create policy deliverables_delete on public.deliverables for delete to authenticated
  using (public.is_client_owner(client_id) and public.can_write_client(client_id));

create policy tasks_select on public.tasks for select to authenticated using (public.is_client_member(client_id));
create policy tasks_insert on public.tasks for insert to authenticated with check (public.can_write_client(client_id));
create policy tasks_update on public.tasks for update to authenticated
  using (public.can_write_client(client_id)) with check (public.can_write_client(client_id));
create policy tasks_delete on public.tasks for delete to authenticated
  using (public.is_client_owner(client_id) and public.can_write_client(client_id));

create policy resources_select on public.resources for select to authenticated using (public.is_client_member(client_id));
create policy resources_insert on public.resources for insert to authenticated with check (public.can_write_client(client_id));
create policy resources_update on public.resources for update to authenticated
  using (public.can_write_client(client_id)) with check (public.can_write_client(client_id));
create policy resources_delete on public.resources for delete to authenticated
  using (public.is_client_owner(client_id) and public.can_write_client(client_id));

-- Enlaces: el cliente es el de su recurso (el trigger garantiza que coincide con el del registro).
-- Desvincular está al alcance de cualquier miembro mientras el cliente no esté archivado.
create policy resource_links_select on public.resource_links for select to authenticated
  using (public.is_client_member((select r.client_id from public.resources r where r.id = resource_id)));
create policy resource_links_insert on public.resource_links for insert to authenticated
  with check (public.can_write_client((select r.client_id from public.resources r where r.id = resource_id)));
create policy resource_links_update on public.resource_links for update to authenticated
  using (public.can_write_client((select r.client_id from public.resources r where r.id = resource_id)))
  with check (public.can_write_client((select r.client_id from public.resources r where r.id = resource_id)));
create policy resource_links_delete on public.resource_links for delete to authenticated
  using (public.can_write_client((select r.client_id from public.resources r where r.id = resource_id)));

-- Comentarios: el cliente es el de su entregable o tarea. Borra quien lo escribió o la propiedad del cliente.
create policy comments_select on public.comments for select to authenticated
  using (public.is_client_member(coalesce(
    (select d.client_id from public.deliverables d where d.id = deliverable_id),
    (select t.client_id from public.tasks t where t.id = task_id))));
create policy comments_insert on public.comments for insert to authenticated
  with check (public.can_write_client(coalesce(
    (select d.client_id from public.deliverables d where d.id = deliverable_id),
    (select t.client_id from public.tasks t where t.id = task_id))));
create policy comments_delete on public.comments for delete to authenticated
  using (
    public.can_write_client(coalesce(
      (select d.client_id from public.deliverables d where d.id = deliverable_id),
      (select t.client_id from public.tasks t where t.id = task_id)))
    and (created_by = auth.uid() or public.is_client_owner(coalesce(
      (select d.client_id from public.deliverables d where d.id = deliverable_id),
      (select t.client_id from public.tasks t where t.id = task_id)))));

-- Historial y publicaciones: solo lectura (los escriben los triggers).
create policy activity_select on public.activity_log for select to authenticated using (public.is_client_member(client_id));
create policy publications_select on public.publications for select to authenticated
  using (public.is_client_member((select d.client_id from public.deliverables d where d.id = deliverable_id)));

-- ===== supabase/migrations/20261111000003_client_people.sql =====
-- Amapola Workspace · 7 · Personas de cada cliente
-- Los miembros de un cliente solo cambian mediante las funciones de este fichero.
-- La propiedad del cliente gestiona su gente; cualquiera puede salir; siempre queda una propietaria.
-- Un perfil solo es visible para su dueña, para administración de plataforma y para quien comparte cliente.

-- ── Comprobaciones internas ────────────────────────────────────────────────
-- Propiedad de un cliente no archivado (quien gestiona a sus personas).
create function public.require_client_manager(p_client uuid) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_client_owner(p_client) then
    raise exception 'Solo una persona propietaria del cliente puede gestionar sus personas.' using errcode = '42501';
  end if;
  if exists (select 1 from public.clients where id = p_client and archived_at is not null) then
    raise exception 'Solo se gestionan las personas de un cliente activo: este cliente está archivado.' using errcode = '42501';
  end if;
end $$;

-- Bloquea los miembros del cliente hasta el final de la transacción: dos cambios simultáneos
-- no pueden dejar el cliente sin propietaria (el segundo espera y recuenta).
create function public.lock_client_members(p_client uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform 1 from public.client_members where client_id = p_client for update;
end $$;

-- ¿Queda otra propietaria activa además de `p_user`?
create function public.has_other_owner(p_client uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.client_members m join public.profiles p on p.id = m.user_id
     where m.client_id = p_client and m.role = 'owner' and m.user_id <> p_user and p.active);
$$;

-- ¿Comparte la persona que consulta (activa) algún cliente con `p_person`?
create function public.shares_client_with(p_person uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_member() and exists (
    select 1 from public.client_members mine
      join public.client_members theirs on theirs.client_id = mine.client_id
     where mine.user_id = auth.uid() and theirs.user_id = p_person);
$$;

-- ── Añadir por email ───────────────────────────────────────────────────────
-- Solo se añade a quien ya tiene perfil. Sin perfil (o sin cuenta) la respuesta es la misma,
-- para no revelar qué emails existen.
create function public.add_client_member(p_client uuid, p_email text, p_role text) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid;
begin
  perform public.require_client_manager(p_client);
  if p_role is null or p_role not in ('owner', 'member') then
    raise exception 'Rol no válido.';
  end if;
  select u.id into v_user
    from auth.users u join public.profiles p on p.id = u.id
   where lower(trim(u.email)) = lower(trim(p_email))
   limit 1;
  if v_user is null then
    return 'needs_invitation';
  end if;
  insert into public.client_members (client_id, user_id, role, added_by)
  values (p_client, v_user, p_role, auth.uid())
  on conflict (client_id, user_id) do nothing;
  if not found then
    return 'already_member';
  end if;
  return 'added';
end $$;

-- ── Tras enviar una invitación: perfil (si falta) y acceso al cliente ──────
-- Un perfil existente no se modifica (ni nombre ni rol de plataforma).
create function public.attach_invited_member(p_client uuid, p_user uuid, p_display_name text, p_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_client_manager(p_client);
  if p_role is null or p_role not in ('owner', 'member') then
    raise exception 'Rol no válido.';
  end if;
  if not exists (select 1 from auth.users where id = p_user) then
    raise exception 'No se ha encontrado la cuenta invitada.';
  end if;
  insert into public.profiles (id, display_name, role)
  values (p_user, trim(p_display_name), 'member')
  on conflict (id) do nothing;
  insert into public.client_members (client_id, user_id, role, added_by)
  values (p_client, p_user, p_role, auth.uid())
  on conflict (client_id, user_id) do nothing;
end $$;

-- ── Cambiar el rol dentro del cliente ──────────────────────────────────────
create function public.set_client_member_role(p_client uuid, p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_current text;
begin
  if p_role is null or p_role not in ('owner', 'member') then
    raise exception 'Rol no válido.';
  end if;
  perform public.require_client_manager(p_client);
  perform public.lock_client_members(p_client);
  select role into v_current from public.client_members where client_id = p_client and user_id = p_user;
  if v_current is null then
    raise exception 'Esa persona no es miembro de este cliente.';
  end if;
  if v_current = 'owner' and p_role <> 'owner' and not public.has_other_owner(p_client, p_user) then
    raise exception 'El cliente debe conservar al menos una persona propietaria.';
  end if;
  update public.client_members set role = p_role where client_id = p_client and user_id = p_user;
end $$;

-- ── Quitar a alguien (o salir) ─────────────────────────────────────────────
-- Su trabajo abierto en el cliente queda sin responsable; el terminado conserva el historial.
create function public.remove_client_member(p_client uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_current text;
begin
  if p_user = auth.uid() then
    if not public.can_write_client(p_client) then
      raise exception 'Solo puedes salir de un cliente activo del que eres miembro.' using errcode = '42501';
    end if;
  else
    perform public.require_client_manager(p_client);
  end if;
  -- Tras bloquear, el recuento de propietarias ya ve cualquier cambio simultáneo confirmado.
  perform public.lock_client_members(p_client);
  select role into v_current from public.client_members where client_id = p_client and user_id = p_user;
  if v_current is null then
    raise exception 'Esa persona no es miembro de este cliente.';
  end if;
  if v_current = 'owner' and not public.has_other_owner(p_client, p_user) then
    raise exception 'El cliente debe conservar al menos una persona propietaria.';
  end if;
  delete from public.client_members where client_id = p_client and user_id = p_user;
  update public.tasks set assignee_id = null
   where client_id = p_client and assignee_id = p_user and status <> 'done';
  update public.deliverables set owner_id = null
   where client_id = p_client and owner_id = p_user and status <> 'published';
  update public.campaigns set owner_id = null
   where client_id = p_client and owner_id = p_user and status <> 'completed';
end $$;

-- ── Personas del cliente ───────────────────────────────────────────────────
-- Cualquier miembro ve nombres y roles; el email solo lo ve la propiedad del cliente.
-- Incluye a las personas desactivadas (active = false) para poder retirarlas.
create function public.client_people(p_client uuid)
returns table (user_id uuid, display_name text, role text, email text, pending boolean, active boolean)
language plpgsql stable security definer set search_path = public as $$
declare
  v_owner boolean := public.is_client_owner(p_client);
begin
  if not public.is_client_member(p_client) then
    raise exception 'Solo las personas del cliente pueden ver quién forma parte de él.' using errcode = '42501';
  end if;
  return query
    select m.user_id, p.display_name, m.role,
           case when v_owner then u.email::text end,
           u.last_sign_in_at is null,
           p.active
      from public.client_members m
      join public.profiles p on p.id = m.user_id
      left join auth.users u on u.id = m.user_id
     where m.client_id = p_client
     order by p.display_name, m.user_id;
end $$;

-- ── Límite de invitaciones: 20 por persona cada 24 horas ───────────────────
create function public.record_invitation(p_email text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_member() then
    raise exception 'Solo las personas con acceso pueden invitar.' using errcode = '42501';
  end if;
  -- Serializa las invitaciones de una misma persona para que el recuento sea exacto.
  perform 1 from public.profiles where id = auth.uid() for update;
  if (select count(*) from public.invitation_log
       where invited_by = auth.uid() and created_at > now() - interval '24 hours') >= 20 then
    raise exception 'Has alcanzado el límite de 20 invitaciones al día.';
  end if;
  insert into public.invitation_log (invited_by, email) values (auth.uid(), lower(trim(p_email)));
end $$;

-- Las funciones nuevas parten con permiso de ejecución para todos: se restringe explícitamente.
revoke all on function
  public.require_client_manager(uuid), public.lock_client_members(uuid), public.has_other_owner(uuid, uuid),
  public.shares_client_with(uuid),
  public.add_client_member(uuid, text, text), public.attach_invited_member(uuid, uuid, text, text),
  public.set_client_member_role(uuid, uuid, text), public.remove_client_member(uuid, uuid),
  public.client_people(uuid), public.record_invitation(text)
  from public, anon, authenticated;
grant execute on function
  public.shares_client_with(uuid),
  public.add_client_member(uuid, text, text), public.attach_invited_member(uuid, uuid, text, text),
  public.set_client_member_role(uuid, uuid, text), public.remove_client_member(uuid, uuid),
  public.client_people(uuid), public.record_invitation(text)
  to authenticated;

-- ── Perfiles: visibilidad por cliente compartido; altas solo desde el servidor ──
drop policy profiles_select on public.profiles;
drop policy profiles_insert on public.profiles;
revoke insert on public.profiles from authenticated;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin() or public.shares_client_with(id));

-- No se desactiva a la única propietaria de un cliente activo.
-- `create or replace` conserva los permisos revocados en la migración 3.
create or replace function public.profiles_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_clients text;
begin
  new.id := old.id;
  new.created_at := old.created_at;
  new.updated_at := now();
  if new.role is distinct from old.role or new.active is distinct from old.active then
    if auth.uid() is not null and not public.is_admin() then
      raise exception 'Solo una persona administradora puede cambiar roles o accesos.' using errcode = '42501';
    end if;
    if old.role = 'admin' and old.active and not (new.role = 'admin' and new.active)
       and not exists (select 1 from public.profiles where role = 'admin' and active and id <> old.id) then
      raise exception 'Debe quedar al menos una persona administradora activa.';
    end if;
  end if;
  if old.active and not new.active then
    select string_agg(c.name, ', ' order by c.name) into v_clients
      from public.client_members m join public.clients c on c.id = m.client_id
     where m.user_id = old.id and m.role = 'owner' and c.archived_at is null
       and not public.has_other_owner(c.id, old.id);
    if v_clients is not null then
      raise exception 'Esta persona es la única propietaria de: %. Nombra a otra propietaria o archiva el cliente antes.', v_clients;
    end if;
  end if;
  return new;
end $$;

-- ── Asignar solo a personas activas con acceso al cliente ──────────────────
-- Idéntica a la de la migración 6 salvo la comprobación final, que exige además un perfil activo.
create or replace function public.client_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_person uuid;
begin
  -- Enlaces: el recurso y el registro enlazado deben ser del mismo cliente (no cambian al editar).
  if tg_table_name = 'resource_links' then
    if tg_op = 'INSERT' and (select client_id from public.resources where id = new.resource_id) is distinct from coalesce(
         (select client_id from public.campaigns where id = new.campaign_id),
         (select client_id from public.deliverables where id = new.deliverable_id),
         (select client_id from public.tasks where id = new.task_id)) then
      raise exception 'Ese elemento pertenece a otro cliente.' using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.client_id is distinct from old.client_id then
      raise exception 'Ese elemento pertenece a otro cliente.' using errcode = '42501';
    end if;
  end if;

  -- Registros relacionados y persona responsable: solo se comprueban al fijarlos o cambiarlos,
  -- para que retirar a alguien de un cliente no bloquee la edición de lo que tenía asignado.
  if tg_table_name = 'campaigns' then
    v_person := new.owner_id;
    if tg_op = 'UPDATE' then
      if v_person is not distinct from old.owner_id then v_person := null; end if;
    end if;
  elsif tg_table_name = 'deliverables' then
    if new.campaign_id is not null then
      if tg_op = 'INSERT' or new.campaign_id is distinct from old.campaign_id then
        if (select client_id from public.campaigns where id = new.campaign_id) is distinct from new.client_id then
          raise exception 'Ese elemento pertenece a otro cliente.' using errcode = '42501';
        end if;
      end if;
    end if;
    v_person := new.owner_id;
    if tg_op = 'UPDATE' then
      if v_person is not distinct from old.owner_id then v_person := null; end if;
    end if;
  elsif tg_table_name = 'tasks' then
    if new.campaign_id is not null then
      if tg_op = 'INSERT' or new.campaign_id is distinct from old.campaign_id then
        if (select client_id from public.campaigns where id = new.campaign_id) is distinct from new.client_id then
          raise exception 'Ese elemento pertenece a otro cliente.' using errcode = '42501';
        end if;
      end if;
    end if;
    if new.deliverable_id is not null then
      if tg_op = 'INSERT' or new.deliverable_id is distinct from old.deliverable_id then
        if (select client_id from public.deliverables where id = new.deliverable_id) is distinct from new.client_id then
          raise exception 'Ese elemento pertenece a otro cliente.' using errcode = '42501';
        end if;
      end if;
    end if;
    v_person := new.assignee_id;
    if tg_op = 'UPDATE' then
      if v_person is not distinct from old.assignee_id then v_person := null; end if;
    end if;
  end if;

  if v_person is not null then
    if not exists (
      select 1 from public.client_members m join public.profiles p on p.id = m.user_id
       where m.client_id = new.client_id and m.user_id = v_person and p.active) then
      raise exception 'Esa persona no tiene acceso a este cliente.' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
