-- Amapola Workspace · 9 · Orden manual de las tareas
-- Cada tarea tiene una posición dentro de su cliente; la lista de «Trabajo» se ordena por ella y se cambia
-- arrastrando filas. Las tareas con la misma posición (p. ej. las existentes, a 0) mantienen el orden por
-- urgencia de siempre: fecha límite, prioridad y creación.

alter table public.tasks add column position double precision not null default 0;

create index tasks_client_position_idx on public.tasks (client_id, position);
