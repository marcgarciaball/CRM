-- Workspace · Resultados (panel de ventas e inversión por cliente)
-- Dos tablas que se rellenan importando CSV desde la pestaña «Resultados». Una cifra vacía (null) es «sin dato», nunca cero.
-- Leer: cualquier persona del cliente. Escribir: personas del cliente si no está archivado. Borrar: solo la Propiedad;
-- sustituir meses del informe de Meta pasa por delete_meta_months().

-- Histórico mensual (Shopify): una fila por mes. Las columnas coinciden con las del CSV.
create table public.client_metrics_monthly (
  client_id uuid not null references public.clients (id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  data_until date check (data_until is null or date_trunc('month', data_until)::date = month),
  ventas_brutas numeric,
  descuentos numeric,
  devoluciones numeric,
  ventas_netas numeric,
  envios numeric,
  ventas_totales numeric,
  pedidos numeric,
  pedido_medio_shopify numeric,
  articulos numeric,
  sesiones numeric,
  sesiones_carrito numeric,
  sesiones_checkout numeric,
  sesiones_compra numeric,
  conversion numeric,
  ventas_google_bing_org numeric,
  ventas_directo numeric,
  ventas_instagram_sin_pago numeric,
  ventas_meta_pago_utm numeric,
  ventas_email numeric,
  ventas_otros numeric,
  ventas_sin_atribuir numeric,
  clientes_nuevos numeric,
  clientes_recurrentes numeric,
  ventas_clientes_nuevos numeric,
  ventas_clientes_recurrentes numeric,
  imported_by uuid references public.profiles (id) default auth.uid(),
  imported_at timestamptz not null default now(),
  primary key (client_id, month)
);

-- Informe de Meta Ads: una fila por campaña, anuncio y mes.
create table public.client_meta_ads (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  campaign_name text not null check (char_length(campaign_name) between 1 and 300),
  ad_name text not null default '' check (char_length(ad_name) <= 300),
  reach numeric,
  impressions numeric,
  clicks numeric,
  spend numeric,
  purchases numeric,
  imported_by uuid references public.profiles (id) default auth.uid(),
  imported_at timestamptz not null default now(),
  unique (client_id, month, campaign_name, ad_name)
);
create index client_meta_ads_client_month_idx on public.client_meta_ads (client_id, month);

alter table public.client_metrics_monthly enable row level security;
alter table public.client_meta_ads enable row level security;
revoke all on public.client_metrics_monthly, public.client_meta_ads from public, anon, authenticated;
grant select, insert, update, delete on public.client_metrics_monthly, public.client_meta_ads to authenticated;

create policy client_metrics_monthly_select on public.client_metrics_monthly for select to authenticated
  using (public.is_client_member(client_id));
create policy client_metrics_monthly_insert on public.client_metrics_monthly for insert to authenticated
  with check (public.can_write_client(client_id));
create policy client_metrics_monthly_update on public.client_metrics_monthly for update to authenticated
  using (public.can_write_client(client_id)) with check (public.can_write_client(client_id));
create policy client_metrics_monthly_delete on public.client_metrics_monthly for delete to authenticated
  using (public.is_client_owner(client_id) and public.can_write_client(client_id));

create policy client_meta_ads_select on public.client_meta_ads for select to authenticated
  using (public.is_client_member(client_id));
create policy client_meta_ads_insert on public.client_meta_ads for insert to authenticated
  with check (public.can_write_client(client_id));
create policy client_meta_ads_update on public.client_meta_ads for update to authenticated
  using (public.can_write_client(client_id)) with check (public.can_write_client(client_id));
create policy client_meta_ads_delete on public.client_meta_ads for delete to authenticated
  using (public.is_client_owner(client_id) and public.can_write_client(client_id));

-- Volver a importar el informe de Meta sustituye los meses que trae: cualquier persona del cliente puede hacerlo.
create function public.delete_meta_months(p_client uuid, p_months date[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.can_write_client(p_client) then
    raise exception 'No puedes cambiar los resultados de este cliente.' using errcode = '42501';
  end if;
  delete from public.client_meta_ads where client_id = p_client and month = any (p_months);
end $$;
revoke all on function public.delete_meta_months(uuid, date[]) from public, anon, authenticated;
grant execute on function public.delete_meta_months(uuid, date[]) to authenticated;
