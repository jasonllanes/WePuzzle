import type { Avatar, Difficulty, PuzzleResult } from "../types";
import { ensureAnonymousUser, getSupabase, isSupabaseConfigured } from "./supabaseClient";

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
): Promise<"cloud" | "local"> {
  const safeName = playerName.trim().slice(0, 24) || "Puzzle Pal";
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
    });
    if (error) throw error;
    return "cloud";
  } catch {
    saveLocalScore(localEntry);
    return "local";
  }
}

export async function getLeaderboard(limit = 50): Promise<{
  entries: LeaderboardEntry[];
  mode: "cloud" | "local";
}> {
  if (isSupabaseConfigured) {
    try {
      const client = getSupabase();
      if (!client) throw new Error("Supabase is not configured.");
      const { data, error } = await client
        .from("leaderboard_scores")
        .select("id, player_name, avatar, score, moves, elapsed_seconds, hints_used, difficulty, rows, columns, created_at")
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
        })),
      };
    } catch {
      // A local board keeps the game useful if the cloud project is paused or offline.
    }
  }

  return {
    mode: "local",
    entries: readLocalScores().sort((first, second) => second.score - first.score).slice(0, limit),
  };
}
