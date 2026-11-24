-- Workspace · Rentabilidad (escandallo, gastos y márgenes por cliente)
-- Supuestos, productos y ventas por producto: los lee y edita el equipo del cliente; borra y sustituye la Propiedad.
-- Costes fijos: cada línea (salarios incluidos) solo la ve y edita la Propiedad; el equipo ve totales con fixed_cost_totals().
-- Gastos mensuales: los ve el equipo; los escribe la Propiedad. Un null es «sin dato», nunca cero.

create table public.client_cost_settings (
  client_id uuid primary key references public.clients (id) on delete cascade,
  iva numeric, horas_productivas_anuales numeric, precio_tela_m2 numeric, tinta_m2 numeric, merma_tela numeric,
  reimpresion numeric, roturas numeric, comision_pct numeric, comision_fija_pedido numeric, envio_neto_pedido numeric,
  unidades_por_pedido numeric,
  updated_by uuid references public.profiles (id) default auth.uid(),
  updated_at timestamptz not null default now()
);

create table public.client_fixed_costs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  grp text not null check (grp in ('personal', 'estructura')),
  concept text not null check (char_length(concept) between 1 and 160),
  monthly_amount numeric,
  note text not null default '' check (char_length(note) <= 500),
  position integer not null default 0
);
create index client_fixed_costs_client_idx on public.client_fixed_costs (client_id, position);

create table public.client_products (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  position integer not null default 0,
  family text not null check (char_length(family) between 1 and 160),
  format text not null default '' check (char_length(format) <= 160),
  price numeric, fabric_w_cm numeric, fabric_h_cm numeric, minutes numeric, support_cost numeric, packaging_cost numeric,
  shopify_title text check (char_length(shopify_title) <= 300),
  variant_match text check (char_length(variant_match) <= 160),
  active boolean not null default true,
  note text not null default '' check (char_length(note) <= 1000),
  version integer not null default 1
);
create index client_products_client_idx on public.client_products (client_id, position);

create table public.client_product_sales (
  client_id uuid not null references public.clients (id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  product_title text not null check (char_length(product_title) between 1 and 300),
  variant_title text not null default '' check (char_length(variant_title) <= 300),
  net_sales numeric, quantity numeric, reversed_quantity numeric, orders numeric,
  imported_by uuid references public.profiles (id) default auth.uid(),
  imported_at timestamptz not null default now(),
  primary key (client_id, month, product_title, variant_title)
);

create table public.client_monthly_expenses (
  client_id uuid not null references public.clients (id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  amount numeric,
  comment text not null default '' check (char_length(comment) <= 300),
  primary key (client_id, month)
);

alter table public.client_cost_settings enable row level security;
alter table public.client_fixed_costs enable row level security;
alter table public.client_products enable row level security;
alter table public.client_product_sales enable row level security;
alter table public.client_monthly_expenses enable row level security;
revoke all on public.client_cost_settings, public.client_fixed_costs, public.client_products, public.client_product_sales,
  public.client_monthly_expenses from public, anon, authenticated;
grant select, insert, update, delete on public.client_cost_settings, public.client_fixed_costs, public.client_products,
  public.client_product_sales, public.client_monthly_expenses to authenticated;

-- Equipo: lee y escribe; Propiedad: borra.
create policy client_cost_settings_select on public.client_cost_settings for select to authenticated using (public.is_client_member(client_id));
create policy client_cost_settings_insert on public.client_cost_settings for insert to authenticated with check (public.can_write_client(client_id));
create policy client_cost_settings_update on public.client_cost_settings for update to authenticated
  using (public.can_write_client(client_id)) with check (public.can_write_client(client_id));

create policy client_products_select on public.client_products for select to authenticated using (public.is_client_member(client_id));
create policy client_products_insert on public.client_products for insert to authenticated with check (public.can_write_client(client_id));
create policy client_products_update on public.client_products for update to authenticated
  using (public.can_write_client(client_id)) with check (public.can_write_client(client_id));
create policy client_products_delete on public.client_products for delete to authenticated
  using (public.is_client_owner(client_id) and public.can_write_client(client_id));

create policy client_product_sales_select on public.client_product_sales for select to authenticated using (public.is_client_member(client_id));
create policy client_product_sales_delete on public.client_product_sales for delete to authenticated
  using (public.is_client_owner(client_id) and public.can_write_client(client_id));

-- Costes fijos: solo la Propiedad, para todo.
create policy client_fixed_costs_select on public.client_fixed_costs for select to authenticated using (public.is_client_owner(client_id));
create policy client_fixed_costs_insert on public.client_fixed_costs for insert to authenticated
  with check (public.is_client_owner(client_id) and public.can_write_client(client_id));
create policy client_fixed_costs_update on public.client_fixed_costs for update to authenticated
  using (public.is_client_owner(client_id) and public.can_write_client(client_id))
  with check (public.is_client_owner(client_id) and public.can_write_client(client_id));
create policy client_fixed_costs_delete on public.client_fixed_costs for delete to authenticated
  using (public.is_client_owner(client_id) and public.can_write_client(client_id));

-- Gastos mensuales: el equipo lee, la Propiedad escribe.
create policy client_monthly_expenses_select on public.client_monthly_expenses for select to authenticated using (public.is_client_member(client_id));
create policy client_monthly_expenses_insert on public.client_monthly_expenses for insert to authenticated
  with check (public.is_client_owner(client_id) and public.can_write_client(client_id));
create policy client_monthly_expenses_update on public.client_monthly_expenses for update to authenticated
  using (public.is_client_owner(client_id) and public.can_write_client(client_id))
  with check (public.is_client_owner(client_id) and public.can_write_client(client_id));
create policy client_monthly_expenses_delete on public.client_monthly_expenses for delete to authenticated
  using (public.is_client_owner(client_id) and public.can_write_client(client_id));

-- Totales de costes fijos por grupo para todo el equipo (sin el detalle de cada línea).
create function public.fixed_cost_totals(p_client uuid) returns table (grp text, monthly numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_client_member(p_client) then
    raise exception 'No tienes acceso a este cliente.' using errcode = '42501';
  end if;
  return query select f.grp, coalesce(sum(f.monthly_amount), 0) from public.client_fixed_costs f
    where f.client_id = p_client group by f.grp;
end $$;

-- Importar el export de ventas por producto: sustituye los meses que trae, en una sola llamada.
create function public.import_product_sales(p_client uuid, p_rows jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.can_write_client(p_client) then
    raise exception 'No puedes cambiar los datos de este cliente.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'El archivo no tiene filas.' using errcode = '22023';
  end if;
  delete from public.client_product_sales
   where client_id = p_client and month in (select distinct (r ->> 'month')::date from jsonb_array_elements(p_rows) r);
  insert into public.client_product_sales (client_id, month, product_title, variant_title, net_sales, quantity, reversed_quantity, orders, imported_by)
  select p_client, x.month, x.product_title, coalesce(x.variant_title, ''), x.net_sales, x.quantity, x.reversed_quantity, x.orders, auth.uid()
    from jsonb_to_recordset(p_rows) as x(month date, product_title text, variant_title text, net_sales numeric, quantity numeric,
                                         reversed_quantity numeric, orders numeric);
end $$;

-- Sustituir el escandallo entero (CSV): solo la Propiedad.
create function public.replace_products(p_client uuid, p_rows jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_client_owner(p_client) and public.can_write_client(p_client)) then
    raise exception 'Solo la Propiedad puede sustituir el escandallo.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'El archivo no tiene filas.' using errcode = '22023';
  end if;
  delete from public.client_products where client_id = p_client;
  insert into public.client_products (client_id, position, family, format, price, fabric_w_cm, fabric_h_cm, minutes, support_cost,
                                      packaging_cost, shopify_title, variant_match, active, note)
  select p_client, coalesce(x.position, 0), x.family, coalesce(x.format, ''), x.price, x.fabric_w_cm, x.fabric_h_cm, x.minutes,
         x.support_cost, x.packaging_cost, x.shopify_title, x.variant_match, coalesce(x.active, true), coalesce(x.note, '')
    from jsonb_to_recordset(p_rows) as x(position integer, family text, format text, price numeric, fabric_w_cm numeric,
                                         fabric_h_cm numeric, minutes numeric, support_cost numeric, packaging_cost numeric,
                                         shopify_title text, variant_match text, active boolean, note text);
end $$;

-- Sustituir los costes fijos (CSV): solo la Propiedad.
create function public.replace_fixed_costs(p_client uuid, p_rows jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_client_owner(p_client) and public.can_write_client(p_client)) then
    raise exception 'Solo la Propiedad puede sustituir los costes fijos.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'El archivo no tiene filas.' using errcode = '22023';
  end if;
  delete from public.client_fixed_costs where client_id = p_client;
  insert into public.client_fixed_costs (client_id, grp, concept, monthly_amount, note, position)
  select p_client, x.grp, x.concept, x.monthly_amount, coalesce(x.note, ''), coalesce(x.position, 0)
    from jsonb_to_recordset(p_rows) as x(grp text, concept text, monthly_amount numeric, note text, position integer);
end $$;

revoke all on function public.fixed_cost_totals(uuid), public.import_product_sales(uuid, jsonb), public.replace_products(uuid, jsonb),
  public.replace_fixed_costs(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.fixed_cost_totals(uuid), public.import_product_sales(uuid, jsonb), public.replace_products(uuid, jsonb),
  public.replace_fixed_costs(uuid, jsonb) to authenticated;
