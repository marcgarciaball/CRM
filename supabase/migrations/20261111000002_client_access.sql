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
