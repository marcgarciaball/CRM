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
