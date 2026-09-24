-- Server-authoritative room storage for Vercel Functions.
create table if not exists public.game_rooms (
  id text primary key,
  state jsonb not null,
  version bigint not null default 1,
  status text not null default 'LOBBY',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- This table contains no gameplay/private state. Clients subscribe only to its version signal.
create table if not exists public.room_signals (
  room_id text primary key references public.game_rooms(id) on delete cascade,
  version bigint not null,
  updated_at timestamptz not null default now()
);

alter table public.game_rooms enable row level security;
alter table public.room_signals enable row level security;

-- game_rooms intentionally has no client policy. Only the server-side service role may read it.
create policy "room signals are publicly readable"
on public.room_signals for select
to anon, authenticated
using (true);

create or replace function public.signal_room_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.room_signals(room_id, version, updated_at)
  values (new.id, new.version, now())
  on conflict (room_id) do update
  set version = excluded.version, updated_at = excluded.updated_at;
  return new;
end;
$$;

drop trigger if exists game_room_signal on public.game_rooms;
create trigger game_room_signal
after insert or update on public.game_rooms
for each row execute function public.signal_room_change();

-- Compare-and-swap prevents two simultaneous player actions from overwriting each other.
create or replace function public.cas_game_room(
  p_room_id text,
  p_expected_version bigint,
  p_state jsonb,
  p_status text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed integer;
begin
  update public.game_rooms
  set state = p_state,
      status = p_status,
      version = version + 1,
      updated_at = now()
  where id = p_room_id and version = p_expected_version;
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

revoke all on function public.cas_game_room(text, bigint, jsonb, text) from public, anon, authenticated;
grant execute on function public.cas_game_room(text, bigint, jsonb, text) to service_role;

do $$
begin
  alter publication supabase_realtime add table public.room_signals;
exception when duplicate_object then null;
end $$;
