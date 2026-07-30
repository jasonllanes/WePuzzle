interface ScoreInput {
  pieceCount: number;
  elapsedSeconds: number;
  moves: number;
  hintsUsed: number;
  rotationEnabled: boolean;
}

export function calculateScore(input: ScoreInput): number {
  const base = input.pieceCount * 125;
  const efficiency = Math.max(0, input.pieceCount * 20 - Math.max(0, input.moves - input.pieceCount) * 8);
  const speed = Math.max(0, input.pieceCount * 25 - input.elapsedSeconds * 2);
  const rotationBonus = input.rotationEnabled ? input.pieceCount * 30 : 0;
  return Math.max(100, Math.round(base + efficiency + speed + rotationBonus - input.hintsUsed * 100));
}
