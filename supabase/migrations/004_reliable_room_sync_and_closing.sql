-- Reliable database-backed room synchronization and host-owned room closing.

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'multiplayer_rooms'
  ) then
    alter publication supabase_realtime add table public.multiplayer_rooms;
  end if;
end
$$;

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

  if not found then
    raise exception 'Only the room host can close this room';
  end if;
end;
$$;

revoke all on function public.close_multiplayer_room(uuid) from public;
grant execute on function public.close_multiplayer_room(uuid) to authenticated;
