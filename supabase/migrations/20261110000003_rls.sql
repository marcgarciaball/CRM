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
