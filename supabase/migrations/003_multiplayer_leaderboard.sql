-- Separate solo and multiplayer rankings and preserve every room participant.

alter table public.leaderboard_scores
  add column if not exists mode text not null default 'solo',
  add column if not exists room_code text,
  add column if not exists team_members jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'leaderboard_scores_mode_check'
      and conrelid = 'public.leaderboard_scores'::regclass
  ) then
    alter table public.leaderboard_scores
      add constraint leaderboard_scores_mode_check
      check (mode in ('solo', 'multiplayer'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'leaderboard_scores_team_members_check'
      and conrelid = 'public.leaderboard_scores'::regclass
  ) then
    alter table public.leaderboard_scores
      add constraint leaderboard_scores_team_members_check
      check (jsonb_typeof(team_members) = 'array');
  end if;
end
$$;

update public.leaderboard_scores
set team_members = jsonb_build_array(
  jsonb_build_object('playerName', player_name, 'avatar', avatar)
)
where team_members = '[]'::jsonb;

create index if not exists leaderboard_scores_mode_score_idx
  on public.leaderboard_scores (mode, score desc, created_at asc);
