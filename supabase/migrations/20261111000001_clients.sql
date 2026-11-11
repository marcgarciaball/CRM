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
