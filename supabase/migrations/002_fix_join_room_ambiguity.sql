-- Fix PostgreSQL interpreting the join function's `room_id` output variable
-- as ambiguous with public.room_members.room_id in ON CONFLICT.

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

  select multiplayer_rooms.*
  into found_room
  from public.multiplayer_rooms
  where multiplayer_rooms.code = upper(trim(requested_code))
    and multiplayer_rooms.created_at > now() - interval '24 hours';

  if found_room.id is null then raise exception 'Room not found or expired'; end if;

  insert into public.room_members (room_id, user_id, player_name, avatar)
  values (found_room.id, auth.uid(), trim(requested_name), requested_avatar)
  on conflict on constraint room_members_pkey
  do update set
    player_name = excluded.player_name,
    avatar = excluded.avatar;

  return query
  select found_room.id, found_room.code, found_room.host_id, found_room.game_state;
end;
$$;

revoke all on function public.join_multiplayer_room(text, text, text) from public;
grant execute on function public.join_multiplayer_room(text, text, text) to authenticated;
