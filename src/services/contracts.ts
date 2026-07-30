import type { GameAction, ImageSource, PuzzleResult } from "../types";

export interface ImageLibraryService {
  listSystemImages(): Promise<readonly ImageSource[]>;
  listBackendImages(userId: string): Promise<readonly ImageSource[]>;
}

export interface SavedPuzzleService {
  saveProgress(userId: string, puzzleId: string, actions: readonly GameAction[]): Promise<void>;
  saveResult(userId: string, result: PuzzleResult): Promise<void>;
}

export interface MultiplayerRoomService {
  createRoom(): Promise<{ roomCode: string }>;
  joinRoom(roomCode: string): Promise<void>;
  sendAction(action: GameAction): Promise<void>;
  leaveRoom(): Promise<void>;
}

// Contracts intentionally have no implementation in this browser-only release.
