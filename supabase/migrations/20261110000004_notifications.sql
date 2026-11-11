-- Amapola Workspace · 4 · Novedades: cuándo miró cada persona sus avisos por última vez.
alter table public.profiles add column notifications_seen_at timestamptz not null default now();
