export type Difficulty = "easy" | "medium" | "hard" | "expert" | "custom";
export type Avatar = "cat" | "dog";
export type PieceRotation = 0 | 90 | 180 | 270;
export type GameStatus =
  | { type: "playing" }
  | { type: "paused" }
  | { type: "completed" }
  | { type: "expired" };

export interface GridSettings {
  rows: number;
  columns: number;
}

export type TimerSettings =
  | { mode: "stopwatch" }
  | { mode: "countdown"; minutes: number; seconds: number };

export interface AssistanceSettings {
  reference: "always" | "toggle" | "disabled";
  hintsEnabled: boolean;
  maxHints: number;
  highlightCorrect: boolean;
  lockCorrect: boolean;
  showGridLines: boolean;
}

export interface PuzzleBehaviorSettings {
  shuffle: "light" | "normal" | "strong";
  snap: "strict" | "normal" | "forgiving";
  rotation: boolean;
  allowIncorrect: boolean;
}

export interface CustomDifficultySettings {
  grid: GridSettings;
  timer: TimerSettings;
  assistance: AssistanceSettings;
  behavior: PuzzleBehaviorSettings;
}

export interface DifficultyPreset {
  id: Exclude<Difficulty, "custom">;
  label: string;
  description: string;
  rows: number;
  columns: number;
}

export type ImageSource =
  | { kind: "system"; id: string; name: string; url: string }
  | { kind: "upload"; id: string; name: string; url: string; file: File }
  | { kind: "backend"; id: string; name: string; url: string };

export interface PuzzlePiece {
  id: string;
  correctIndex: number;
  row: number;
  column: number;
  imageUrl: string;
  rotation: PieceRotation;
}

export interface PuzzleResult {
  difficulty: Difficulty;
  grid: GridSettings;
  totalPieces: number;
  elapsedSeconds: number;
  moves: number;
  hintsUsed: number;
  score: number;
}

export interface GameAction {
  type: "place" | "return" | "rotate" | "hint" | "pause" | "resume";
  pieceId?: string;
  targetIndex?: number;
  occurredAt: number;
}
