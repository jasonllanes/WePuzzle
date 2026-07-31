import type { Avatar } from "../types";
import { ensureAnonymousUser, getSupabase } from "./supabaseClient";

export interface SyncedPieceGroup {
  id: string;
  pieceIds: string[];
  originX: number;
  originY: number;
  zIndex: number;
}

export interface MultiplayerActiveDrag {
  groupId: string;
  userId: string;
  playerName: string;
  avatar: Avatar;
}

export interface MultiplayerComboEvent {
  id: string;
  label: string;
  count: number;
  multiplier: number;
  matches: number;
  x: number;
  y: number;
  triggeredAt: number;
  userId: string;
  playerName: string;
}

export interface MultiplayerSnapshot {
  version: 1;
  groups: SyncedPieceGroup[];
  trayIds: string[];
  rotations: Record<string, number>;
  moves: number;
  updatedAt: number;
  updatedBy: string;
  status: "playing" | "paused" | "completed";
  activeDrag?: MultiplayerActiveDrag | null;
  comboEvent?: MultiplayerComboEvent | null;
}

export interface MultiplayerPlayer {
  userId: string;
  playerName: string;
  avatar: Avatar;
  onlineAt: string;
}

export interface MultiplayerRoomSession {
  id: string;
  code: string;
  hostId: string;
  userId: string;
  playerName: string;
  avatar: Avatar;
  initialState: MultiplayerSnapshot | null;
}

interface RoomRpcRow {
  room_id: string;
  room_code: string;
  host_id: string;
  game_state: MultiplayerSnapshot | null;
}

function createRoomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}

function firstRpcRow(data: unknown): RoomRpcRow {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") throw new Error("The room could not be loaded.");
  return row as RoomRpcRow;
}

export async function createMultiplayerRoom(
  playerName: string,
  avatar: Avatar,
): Promise<MultiplayerRoomSession> {
  const client = getSupabase();
  const user = await ensureAnonymousUser();
  if (!client) throw new Error("Supabase is not configured.");

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { data, error } = await client.rpc("create_multiplayer_room", {
      requested_code: createRoomCode(),
      requested_name: playerName.trim().slice(0, 24) || "Puzzle Pal",
      requested_avatar: avatar,
    });
    if (!error) {
      const room = firstRpcRow(data);
      return {
        id: room.room_id,
        code: room.room_code,
        hostId: room.host_id,
        userId: user.id,
        playerName: playerName.trim().slice(0, 24) || "Puzzle Pal",
        avatar,
        initialState: room.game_state,
      };
    }
    lastError = new Error(error.message);
  }
  throw lastError ?? new Error("The room could not be created.");
}

export async function joinMultiplayerRoom(
  roomCode: string,
  playerName: string,
  avatar: Avatar,
): Promise<MultiplayerRoomSession> {
  const client = getSupabase();
  const user = await ensureAnonymousUser();
  if (!client) throw new Error("Supabase is not configured.");
  const { data, error } = await client.rpc("join_multiplayer_room", {
    requested_code: roomCode.trim().toUpperCase(),
    requested_name: playerName.trim().slice(0, 24) || "Puzzle Pal",
    requested_avatar: avatar,
  });
  if (error) throw new Error(error.message);
  const room = firstRpcRow(data);
  return {
    id: room.room_id,
    code: room.room_code,
    hostId: room.host_id,
    userId: user.id,
    playerName: playerName.trim().slice(0, 24) || "Puzzle Pal",
    avatar,
    initialState: room.game_state,
  };
}

export async function persistRoomSnapshot(
  roomId: string,
  snapshot: MultiplayerSnapshot,
): Promise<void> {
  const client = getSupabase();
  if (!client) return;
  const { error } = await client
    .from("multiplayer_rooms")
    .update({ game_state: snapshot, status: snapshot.status, updated_at: new Date().toISOString() })
    .eq("id", roomId);
  if (error) throw error;
}
