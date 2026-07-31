-- WePuzzle online features
-- Run this migration in a new Supabase project, then enable Anonymous Sign-Ins.

create extension if not exists pgcrypto;

create table if not exists public.leaderboard_scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  player_name text not null check (char_length(player_name) between 1 and 24),
  avatar text not null check (avatar in ('cat', 'dog')),
  score integer not null check (score >= 0),
  moves integer not null check (moves >= 0),
  elapsed_seconds integer not null check (elapsed_seconds >= 0),
  hints_used integer not null check (hints_used >= 0),
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard', 'expert', 'custom')),
  rows smallint not null check (rows between 2 and 12),
  columns smallint not null check (columns between 2 and 12),
  mode text not null default 'solo' check (mode in ('solo', 'multiplayer')),
  room_code text,
  team_members jsonb not null default '[]'::jsonb check (jsonb_typeof(team_members) = 'array'),
  created_at timestamptz not null default now()
);

create index if not exists leaderboard_scores_score_idx
  on public.leaderboard_scores (score desc, created_at asc);

alter table public.leaderboard_scores enable row level security;

create policy "leaderboard is publicly readable"
  on public.leaderboard_scores for select
  to anon, authenticated
  using (true);

create policy "players can submit their own score"
  on public.leaderboard_scores for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create table if not exists public.multiplayer_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z2-9]{6}$'),
  host_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'playing' check (status in ('playing', 'paused', 'completed')),
  game_state jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.room_members (
  room_id uuid not null references public.multiplayer_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  player_name text not null check (char_length(player_name) between 1 and 24),
  avatar text not null check (avatar in ('cat', 'dog')),
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

alter table public.multiplayer_rooms enable row level security;
alter table public.room_members enable row level security;

create or replace function public.is_room_member(requested_room_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.room_members
    where room_id = requested_room_id and user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_room_member(uuid) from public;
grant execute on function public.is_room_member(uuid) to authenticated;

create policy "members can read their rooms"
  on public.multiplayer_rooms for select
  to authenticated
  using (public.is_room_member(id));

create policy "members can update shared room state"
  on public.multiplayer_rooms for update
  to authenticated
  using (public.is_room_member(id))
  with check (public.is_room_member(id));

create policy "members can see each other"
  on public.room_members for select
  to authenticated
  using (public.is_room_member(room_id));

create policy "players can leave rooms"
  on public.room_members for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.create_multiplayer_room(
  requested_code text,
  requested_name text,
  requested_avatar text
)
returns table (room_id uuid, room_code text, host_id uuid, game_state jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare
  new_room public.multiplayer_rooms;
begin
  if auth.uid() is null then raise exception 'Sign in before creating a room'; end if;
  if requested_code !~ '^[A-Z2-9]{6}$' then raise exception 'Invalid room code'; end if;
  if char_length(trim(requested_name)) not between 1 and 24 then raise exception 'Invalid player name'; end if;
  if requested_avatar not in ('cat', 'dog') then raise exception 'Invalid avatar'; end if;

  insert into public.multiplayer_rooms (code, host_id)
  values (requested_code, auth.uid())
  returning * into new_room;

  insert into public.room_members (room_id, user_id, player_name, avatar)
  values (new_room.id, auth.uid(), trim(requested_name), requested_avatar);

  return query select new_room.id, new_room.code, new_room.host_id, new_room.game_state;
end;
$$;

create or replace function public.join_multiplayer_room(
  requested_code text,
  requested_name text,
  requested_avatar text
)
returns table (room_id uuid, room_code text, host_id uuid, game_state jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare
  found_room public.multiplayer_rooms;
begin
  if auth.uid() is null then raise exception 'Sign in before joining a room'; end if;
  if char_length(trim(requested_name)) not between 1 and 24 then raise exception 'Invalid player name'; end if;
  if requested_avatar not in ('cat', 'dog') then raise exception 'Invalid avatar'; end if;

  select * into found_room
  from public.multiplayer_rooms
  where code = upper(trim(requested_code))
  and created_at > now() - interval '24 hours';

  if found_room.id is null then raise exception 'Room not found or expired'; end if;

  insert into public.room_members (room_id, user_id, player_name, avatar)
  values (found_room.id, auth.uid(), trim(requested_name), requested_avatar)
  on conflict on constraint room_members_pkey
  do update set player_name = excluded.player_name, avatar = excluded.avatar;

  return query select found_room.id, found_room.code, found_room.host_id, found_room.game_state;
end;
$$;

revoke all on function public.create_multiplayer_room(text, text, text) from public;
revoke all on function public.join_multiplayer_room(text, text, text) from public;
grant execute on function public.create_multiplayer_room(text, text, text) to authenticated;
grant execute on function public.join_multiplayer_room(text, text, text) to authenticated;

create or replace function public.close_multiplayer_room(requested_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Sign in before closing a room'; end if;

  delete from public.multiplayer_rooms
  where id = requested_room_id
    and host_id = auth.uid();

  if not found then raise exception 'Only the room host can close this room'; end if;
end;
$$;

revoke all on function public.close_multiplayer_room(uuid) from public;
grant execute on function public.close_multiplayer_room(uuid) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'multiplayer_rooms'
  ) then
    alter publication supabase_realtime add table public.multiplayer_rooms;
  end if;
end
$$;

-- Private Broadcast and Presence channels are authorized against room membership.
create or replace function public.is_room_topic_member(requested_topic text)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  room_text text;
begin
  if split_part(requested_topic, ':', 1) <> 'room' then return false; end if;
  room_text := split_part(requested_topic, ':', 2);
  if room_text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then return false; end if;
  return public.is_room_member(room_text::uuid);
end;
$$;

revoke all on function public.is_room_topic_member(text) from public;
grant execute on function public.is_room_topic_member(text) to authenticated;

create policy "room members can receive realtime events"
  on realtime.messages for select
  to authenticated
  using (
    extension in ('broadcast', 'presence')
    and public.is_room_topic_member(realtime.topic())
  );

create policy "room members can send realtime events"
  on realtime.messages for insert
  to authenticated
  with check (
    extension in ('broadcast', 'presence')
    and public.is_room_topic_member(realtime.topic())
  );
