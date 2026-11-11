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
