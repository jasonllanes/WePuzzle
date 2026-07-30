import type { CustomDifficultySettings } from "../types";

export function validateCustomSettings(settings: CustomDifficultySettings): string | null {
  const { rows, columns } = settings.grid;
  if (!Number.isInteger(rows) || !Number.isInteger(columns) || rows < 2 || columns < 2) {
    return "Rows and columns must each be at least 2.";
  }
  if (rows > 12 || columns > 12 || rows * columns > 144) {
    return "Keep the puzzle at 12 × 12 pieces or fewer.";
  }
  if (settings.timer.mode === "countdown") {
    const total = settings.timer.minutes * 60 + settings.timer.seconds;
    if (total < 15 || total > 7200) return "Countdown time must be between 15 seconds and 2 hours.";
  }
  if (settings.assistance.maxHints < 0 || settings.assistance.maxHints > rows * columns) {
    return "Hint count must fit the selected puzzle.";
  }
  return null;
}
