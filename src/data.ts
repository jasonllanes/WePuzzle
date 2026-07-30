import type { CustomDifficultySettings, DifficultyPreset } from "./types";

export const DIFFICULTIES: readonly DifficultyPreset[] = [
  { id: "easy", label: "Easy", description: "A quick, cozy warm-up", rows: 3, columns: 3 },
  { id: "medium", label: "Medium", description: "A playful challenge", rows: 4, columns: 4 },
  { id: "hard", label: "Hard", description: "For puzzle pros", rows: 6, columns: 6 },
  { id: "expert", label: "Expert", description: "The ultimate test", rows: 8, columns: 8 },
];

export const DEFAULT_CUSTOM_SETTINGS: CustomDifficultySettings = {
  grid: { rows: 4, columns: 5 },
  timer: { mode: "stopwatch" },
  assistance: {
    reference: "toggle",
    hintsEnabled: true,
    maxHints: 3,
    highlightCorrect: true,
    lockCorrect: true,
    showGridLines: true,
  },
  behavior: {
    shuffle: "normal",
    snap: "normal",
    rotation: false,
    allowIncorrect: false,
  },
};
