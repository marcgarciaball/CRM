-- Workspace · Resultados · Importar el informe de Meta de una vez
-- delete_meta_months() dejaba que cualquier persona del cliente borrara meses sin poner nada en su lugar (por ejemplo,
-- llamándola directamente con todos los meses), saltándose que solo la Propiedad borra. La sustituye import_meta_ads():
-- borra los meses que trae el archivo e inserta sus filas en la misma llamada, y no admite un archivo sin filas.

drop function public.delete_meta_months(uuid, date[]);

create function public.import_meta_ads(p_client uuid, p_rows jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.can_write_client(p_client) then
    raise exception 'No puedes cambiar los resultados de este cliente.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'El informe de Meta no tiene filas.' using errcode = '22023';
  end if;
  delete from public.client_meta_ads
   where client_id = p_client
     and month in (select distinct (r ->> 'month')::date from jsonb_array_elements(p_rows) r);
  insert into public.client_meta_ads (client_id, month, campaign_name, ad_name, reach, impressions, clicks, spend, purchases, imported_by)
  select p_client, x.month, x.campaign_name, coalesce(x.ad_name, ''), x.reach, x.impressions, x.clicks, x.spend, x.purchases, auth.uid()
    from jsonb_to_recordset(p_rows) as x(month date, campaign_name text, ad_name text, reach numeric, impressions numeric,
                                         clicks numeric, spend numeric, purchases numeric);
end $$;
revoke all on function public.import_meta_ads(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.import_meta_ads(uuid, jsonb) to authenticated;
