import type { GridSettings, PieceRotation, PuzzlePiece } from "../types";
import { loadImage } from "./imageProcessor";

const rotations: readonly PieceRotation[] = [0, 90, 180, 270];

function shuffle<T>(input: readonly T[]): T[] {
  const output = [...input];
  for (let index = output.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [output[index], output[target]] = [output[target]!, output[index]!];
  }
  return output;
}

export async function generatePuzzlePieces(
  imageUrl: string,
  grid: GridSettings,
  rotatePieces: boolean,
): Promise<PuzzlePiece[]> {
  const image = await loadImage(imageUrl);
  const pieceWidth = image.naturalWidth / grid.columns;
  const pieceHeight = image.naturalHeight / grid.rows;
  const pieces: PuzzlePiece[] = [];

  for (let row = 0; row < grid.rows; row += 1) {
    for (let column = 0; column < grid.columns; column += 1) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(pieceWidth));
      canvas.height = Math.max(1, Math.round(pieceHeight));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas is not supported by this browser.");
      context.drawImage(
        image,
        column * pieceWidth,
        row * pieceHeight,
        pieceWidth,
        pieceHeight,
        0,
        0,
        canvas.width,
        canvas.height,
      );
      const correctIndex = row * grid.columns + column;
      pieces.push({
        id: `piece-${correctIndex}`,
        correctIndex,
        row,
        column,
        imageUrl: canvas.toDataURL("image/webp", 0.9),
        rotation: rotatePieces ? rotations[Math.floor(Math.random() * rotations.length)]! : 0,
      });
      canvas.width = 0;
      canvas.height = 0;
    }
  }

  return shuffle(pieces);
}
