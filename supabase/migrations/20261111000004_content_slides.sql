-- Amapola Workspace · 8 · Diapositiva de contenido
-- Cada entregable es una «diapositiva»: a la izquierda la información y el copy out; a la derecha la
-- propuesta creativa (inspo, copy in, estático/dinámico/carrusel) y, cuando existe, la creatividad final
-- (imágenes o vídeo subidos, en orden). Añade estados de espera, pausa y descarte, y canales de LinkedIn.

-- ── Estados y canales nuevos ───────────────────────────────────────────────
alter table public.deliverables drop constraint deliverables_status_check;
alter table public.deliverables add constraint deliverables_status_check check (status in
  ('idea', 'in_preparation', 'in_review', 'changes_requested', 'approved', 'scheduled', 'published',
   'on_hold', 'waiting_client', 'waiting_marketing', 'discarded'));

alter table public.deliverables drop constraint deliverables_channel_check;
alter table public.deliverables add constraint deliverables_channel_check check (channel in
  ('newsletter', 'meta_ad', 'google_ad', 'instagram', 'linkedin', 'linkedin_ad', 'landing', 'other'));

-- ── Campos de la diapositiva ───────────────────────────────────────────────
alter table public.deliverables
  add column formats text not null default '' check (char_length(formats) <= 300),
  add column creative_format text check (creative_format in ('static', 'dynamic', 'carousel')),
  add column inspo text not null default '' check (char_length(inspo) <= 20000),
  add column copy_in text not null default '' check (char_length(copy_in) <= 20000);

-- ── Creatividad final: archivos subidos, en orden ──────────────────────────
-- El fichero vive en un almacén privado; aquí solo se guarda su ruta. Se sirve siempre a través
-- del servidor, que comprueba primero que la persona puede leer esta fila.
create table public.deliverable_assets (
  id uuid primary key default gen_random_uuid(),
  deliverable_id uuid not null references public.deliverables (id) on delete cascade,
  sort_order integer not null default 0,
  kind text not null check (kind in ('image', 'video')),
  storage_path text not null unique check (char_length(storage_path) between 1 and 500),
  file_name text not null check (char_length(file_name) between 1 and 200),
  mime_type text not null check (mime_type in
    ('image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime')),
  size_bytes integer not null check (size_bytes > 0),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create index deliverable_assets_deliverable_idx on public.deliverable_assets (deliverable_id, sort_order);

-- Un cambio en la creatividad final es un cambio de contenido: nueva revisión y, si estaba
-- validado, programado o publicado, vuelve a revisión (igual que un material con aprobación).
create function public.creative_changed(p_deliverable uuid, p_reason text, p_file text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.deliverables
     set revision = revision + 1,
         status = case when status in ('approved', 'scheduled', 'published') then 'in_review' else status end
   where id = p_deliverable;
  if found then
    perform public.log_activity('deliverable', p_deliverable, 'creative_changed',
      jsonb_build_object('reason', p_reason, 'file', coalesce(p_file, '')));
  end if;
end $$;

create function public.deliverable_assets_before() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_client uuid;
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
    select client_id into v_client from public.deliverables where id = new.deliverable_id;
    -- La ruta empieza por cliente/entregable: nadie registra aquí el fichero de otro cliente.
    if v_client is null or new.storage_path not like v_client::text || '/' || new.deliverable_id::text || '/%' then
      raise exception 'La ruta del archivo no corresponde a este entregable.';
    end if;
    if (select count(*) from public.deliverable_assets where deliverable_id = new.deliverable_id) >= 20 then
      raise exception 'Un entregable admite como máximo 20 archivos.';
    end if;
    select coalesce(max(sort_order), 0) + 1 into new.sort_order
      from public.deliverable_assets where deliverable_id = new.deliverable_id;
  else
    -- Después de subirlo solo cambia el orden.
    new.id := old.id;
    new.deliverable_id := old.deliverable_id;
    new.kind := old.kind;
    new.storage_path := old.storage_path;
    new.file_name := old.file_name;
    new.mime_type := old.mime_type;
    new.size_bytes := old.size_bytes;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  return new;
end $$;
create trigger deliverable_assets_before before insert or update on public.deliverable_assets
  for each row execute function public.deliverable_assets_before();

create function public.deliverable_assets_after() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.creative_changed(new.deliverable_id, 'asset_added', new.file_name);
  else
    perform public.creative_changed(old.deliverable_id, 'asset_removed', old.file_name);
  end if;
  return null;
end $$;
create trigger deliverable_assets_after after insert or delete on public.deliverable_assets
  for each row execute function public.deliverable_assets_after();

revoke all on function public.creative_changed(uuid, text, text), public.deliverable_assets_before(), public.deliverable_assets_after()
  from public, anon, authenticated;

alter table public.deliverable_assets enable row level security;
revoke all on public.deliverable_assets from public, anon, authenticated;
grant select, insert, update, delete on public.deliverable_assets to authenticated;

create policy deliverable_assets_select on public.deliverable_assets for select to authenticated
  using (public.is_client_member((select d.client_id from public.deliverables d where d.id = deliverable_id)));
create policy deliverable_assets_insert on public.deliverable_assets for insert to authenticated
  with check (public.can_write_client((select d.client_id from public.deliverables d where d.id = deliverable_id)));
create policy deliverable_assets_update on public.deliverable_assets for update to authenticated
  using (public.can_write_client((select d.client_id from public.deliverables d where d.id = deliverable_id)))
  with check (public.can_write_client((select d.client_id from public.deliverables d where d.id = deliverable_id)));
create policy deliverable_assets_delete on public.deliverable_assets for delete to authenticated
  using (public.can_write_client((select d.client_id from public.deliverables d where d.id = deliverable_id)));

-- ── Flujo editorial con espera, pausa y descarte ───────────────────────────
-- Desde cualquier estado anterior a «publicado» se puede aparcar (en pausa, esperando material del
-- cliente, esperando a marketing) o descartar. Al retomarlo se vuelve a preparación o a revisión;
-- solo vuelve a «validado» si la revisión actual sigue validada. El copy in cuenta como copy.
create or replace function public.deliverables_before_update() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  allowed text[];
  parking constant text[] := array['on_hold', 'waiting_client', 'waiting_marketing', 'discarded'];
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

  if new.copy is distinct from old.copy or new.copy_in is distinct from old.copy_in then
    if new.status is distinct from old.status then
      raise exception 'Guarda el cambio de copy antes de cambiar el estado.';
    end if;
    new.revision := old.revision + 1;
    -- El copy validado ha cambiado: vuelve a revisión (también si ya estaba publicado).
    if old.status in ('approved', 'scheduled', 'published') then
      new.status := 'in_review';
    end if;
  elsif new.status is distinct from old.status then
    allowed := case
      when old.status = 'idea' then array['in_preparation', 'in_review'] || parking
      when old.status = 'in_preparation' then array['idea', 'in_review'] || parking
      when old.status = 'in_review' then array['in_preparation', 'changes_requested', 'approved'] || parking
      when old.status = 'changes_requested' then array['in_preparation', 'in_review'] || parking
      when old.status = 'approved' then array['scheduled', 'published', 'changes_requested'] || parking
      when old.status = 'scheduled' then array['approved', 'published', 'changes_requested'] || parking
      when old.status in ('on_hold', 'waiting_client', 'waiting_marketing')
        then array['in_preparation', 'in_review', 'approved'] || parking
      when old.status = 'discarded' then array['in_preparation']
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

create or replace function public.deliverables_after_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.copy is distinct from old.copy or new.copy_in is distinct from old.copy_in then
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

-- ── Almacén privado para las creatividades (solo en Supabase; PGlite no tiene `storage`) ──
-- Sin políticas: nadie accede directamente. El servidor firma cada subida y cada lectura.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public) values ('creatives', 'creatives', false)
    on conflict (id) do nothing;
  end if;
end $$;
