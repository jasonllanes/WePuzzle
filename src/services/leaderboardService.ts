import type { Avatar, Difficulty, PuzzleResult } from "../types";
import { ensureAnonymousUser, getSupabase, isSupabaseConfigured } from "./supabaseClient";

export type LeaderboardMode = "solo" | "multiplayer";

export interface LeaderboardTeamMember {
  playerName: string;
  avatar: Avatar;
}

export interface LeaderboardEntry {
  id: string;
  playerName: string;
  avatar: Avatar;
  score: number;
  moves: number;
  elapsedSeconds: number;
  hintsUsed: number;
  difficulty: Difficulty;
  rows: number;
  columns: number;
  createdAt: string;
  source: "cloud" | "local";
  mode: LeaderboardMode;
  roomCode: string | null;
  teamMembers: LeaderboardTeamMember[];
}

export interface LeaderboardSubmissionContext {
  mode: LeaderboardMode;
  roomCode?: string;
  teamMembers?: LeaderboardTeamMember[];
}

const LOCAL_SCORES_KEY = "wepuzzle-local-leaderboard";

function readLocalScores(): LeaderboardEntry[] {
  try {
    const value = window.localStorage.getItem(LOCAL_SCORES_KEY);
    return value ? (JSON.parse(value) as LeaderboardEntry[]) : [];
  } catch {
    return [];
  }
}

function saveLocalScore(entry: LeaderboardEntry): void {
  const scores = [...readLocalScores(), entry]
    .sort((first, second) => second.score - first.score)
    .slice(0, 50);
  window.localStorage.setItem(LOCAL_SCORES_KEY, JSON.stringify(scores));
}

export async function submitLeaderboardScore(
  result: PuzzleResult,
  playerName: string,
  avatar: Avatar,
  context: LeaderboardSubmissionContext = { mode: "solo" },
): Promise<"cloud" | "local"> {
  const safeName = playerName.trim().slice(0, 24) || "Puzzle Pal";
  const teamMembers = context.mode === "multiplayer" && context.teamMembers?.length
    ? context.teamMembers.map((member) => ({
        playerName: member.playerName.trim().slice(0, 24) || "Puzzle Pal",
        avatar: member.avatar,
      }))
    : [{ playerName: safeName, avatar }];
  const localEntry: LeaderboardEntry = {
    id: crypto.randomUUID(),
    playerName: safeName,
    avatar,
    score: result.score,
    moves: result.moves,
    elapsedSeconds: result.elapsedSeconds,
    hintsUsed: result.hintsUsed,
    difficulty: result.difficulty,
    rows: result.grid.rows,
    columns: result.grid.columns,
    createdAt: new Date().toISOString(),
    source: "local",
    mode: context.mode,
    roomCode: context.roomCode ?? null,
    teamMembers,
  };

  if (!isSupabaseConfigured) {
    saveLocalScore(localEntry);
    return "local";
  }

  try {
    const client = getSupabase();
    const user = await ensureAnonymousUser();
    if (!client) throw new Error("Supabase is not configured.");
    const { error } = await client.from("leaderboard_scores").insert({
      user_id: user.id,
      player_name: safeName,
      avatar,
      score: result.score,
      moves: result.moves,
      elapsed_seconds: result.elapsedSeconds,
      hints_used: result.hintsUsed,
      difficulty: result.difficulty,
      rows: result.grid.rows,
      columns: result.grid.columns,
      mode: context.mode,
      room_code: context.roomCode ?? null,
      team_members: teamMembers,
    });
    if (error) throw error;
    return "cloud";
  } catch {
    saveLocalScore(localEntry);
    return "local";
  }
}

export async function getLeaderboard(leaderboardMode: LeaderboardMode, limit = 50): Promise<{
  entries: LeaderboardEntry[];
  mode: "cloud" | "local";
}> {
  if (isSupabaseConfigured) {
    try {
      const client = getSupabase();
      if (!client) throw new Error("Supabase is not configured.");
      const { data, error } = await client
        .from("leaderboard_scores")
        .select("id, player_name, avatar, score, moves, elapsed_seconds, hints_used, difficulty, rows, columns, created_at, mode, room_code, team_members")
        .eq("mode", leaderboardMode)
        .order("score", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return {
        mode: "cloud",
        entries: (data ?? []).map((row) => ({
          id: String(row.id),
          playerName: String(row.player_name),
          avatar: row.avatar as Avatar,
          score: Number(row.score),
          moves: Number(row.moves),
          elapsedSeconds: Number(row.elapsed_seconds),
          hintsUsed: Number(row.hints_used),
          difficulty: row.difficulty as Difficulty,
          rows: Number(row.rows),
          columns: Number(row.columns),
          createdAt: String(row.created_at),
          source: "cloud",
          mode: row.mode as LeaderboardMode,
          roomCode: row.room_code ? String(row.room_code) : null,
          teamMembers: Array.isArray(row.team_members)
            ? (row.team_members as Array<{ playerName?: unknown; avatar?: unknown }>).map((member) => ({
                playerName: String(member.playerName ?? "Puzzle Pal"),
                avatar: member.avatar === "dog" ? "dog" : "cat",
              }))
            : [{ playerName: String(row.player_name), avatar: row.avatar as Avatar }],
        })),
      };
    } catch {
      // A local board keeps the game useful if the cloud project is paused or offline.
    }
  }

  return {
    mode: "local",
    entries: readLocalScores()
      .map((entry) => ({
        ...entry,
        mode: entry.mode ?? "solo",
        roomCode: entry.roomCode ?? null,
        teamMembers: entry.teamMembers?.length
          ? entry.teamMembers
          : [{ playerName: entry.playerName, avatar: entry.avatar }],
      }))
      .filter((entry) => entry.mode === leaderboardMode)
      .sort((first, second) => second.score - first.score)
      .slice(0, limit),
  };
}
