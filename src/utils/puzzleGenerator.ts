import type { GridSettings, PieceRotation, PuzzlePiece } from "../types";
import { loadImage } from "./imageProcessor";

const rotations: readonly PieceRotation[] = [0, 90, 180, 270];

export interface GeneratedPuzzle {
  pieces: PuzzlePiece[];
  aspectRatio: number;
  connectorRatio: number;
}

type EdgeDirection = -1 | 0 | 1;

interface PieceEdges {
  top: EdgeDirection;
  right: EdgeDirection;
  bottom: EdgeDirection;
  left: EdgeDirection;
}

function shuffle<T>(input: readonly T[]): T[] {
  const output = [...input];
  for (let index = output.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [output[index], output[target]] = [output[target]!, output[index]!];
  }
  return output;
}

function edgeDirection(row: number, column: number, salt: number): EdgeDirection {
  const value = Math.sin((row + 1) * 91.7 + (column + 1) * 47.3 + salt * 31.1) * 10_000;
  return value - Math.floor(value) > 0.5 ? 1 : -1;
}

function createPieceEdges(grid: GridSettings): PieceEdges[][] {
  const edges: PieceEdges[][] = [];
  for (let row = 0; row < grid.rows; row += 1) {
    const rowEdges: PieceEdges[] = [];
    for (let column = 0; column < grid.columns; column += 1) {
      rowEdges.push({
        top: row === 0 ? 0 : (-edges[row - 1]![column]!.bottom as EdgeDirection),
        right: column === grid.columns - 1 ? 0 : edgeDirection(row, column, 1),
        bottom: row === grid.rows - 1 ? 0 : edgeDirection(row, column, 2),
        left: column === 0 ? 0 : (-rowEdges[column - 1]!.right as EdgeDirection),
      });
    }
    edges.push(rowEdges);
  }
  return edges;
}

function drawEdge(
  context: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  normalX: number,
  normalY: number,
  direction: EdgeDirection,
  depth: number,
) {
  if (direction === 0) {
    context.lineTo(endX, endY);
    return;
  }

  const tangentX = endX - startX;
  const tangentY = endY - startY;
  const offset = depth * direction;
  const point = (progress: number, normalScale = 0) => ({
    x: startX + tangentX * progress + normalX * offset * normalScale,
    y: startY + tangentY * progress + normalY * offset * normalScale,
  });
  const p32 = point(0.32);
  const p42 = point(0.42, 0.72);
  const p58 = point(0.58, 0.72);
  const p68 = point(0.68);
  const c36 = point(0.36);
  const c39 = point(0.39, 0.72);
  const c44 = point(0.44, 1.32);
  const c56 = point(0.56, 1.32);
  const c61 = point(0.61, 0.72);
  const c64 = point(0.64);

  context.lineTo(p32.x, p32.y);
  context.bezierCurveTo(c36.x, c36.y, c39.x, c39.y, p42.x, p42.y);
  context.bezierCurveTo(c44.x, c44.y, c56.x, c56.y, p58.x, p58.y);
  context.bezierCurveTo(c61.x, c61.y, c64.x, c64.y, p68.x, p68.y);
  context.lineTo(endX, endY);
}

function tracePiece(
  context: CanvasRenderingContext2D,
  margin: number,
  pieceWidth: number,
  pieceHeight: number,
  edges: PieceEdges,
  tabDepth: number,
) {
  const left = margin;
  const top = margin;
  const right = margin + pieceWidth;
  const bottom = margin + pieceHeight;
  context.beginPath();
  context.moveTo(left, top);
  drawEdge(context, left, top, right, top, 0, -1, edges.top, tabDepth);
  drawEdge(context, right, top, right, bottom, 1, 0, edges.right, tabDepth);
  drawEdge(context, right, bottom, left, bottom, 0, 1, edges.bottom, tabDepth);
  drawEdge(context, left, bottom, left, top, -1, 0, edges.left, tabDepth);
  context.closePath();
}

export async function generatePuzzlePieces(
  imageUrl: string,
  grid: GridSettings,
  rotatePieces: boolean,
): Promise<GeneratedPuzzle> {
  const image = await loadImage(imageUrl);
  const pieceWidth = image.naturalWidth / grid.columns;
  const pieceHeight = image.naturalHeight / grid.rows;
  const tabDepth = Math.min(pieceWidth, pieceHeight) * 0.18;
  const margin = tabDepth * 1.45;
  const connectorRatio = margin / Math.min(pieceWidth, pieceHeight);
  const pieceEdges = createPieceEdges(grid);
  const pieces: PuzzlePiece[] = [];

  for (let row = 0; row < grid.rows; row += 1) {
    for (let column = 0; column < grid.columns; column += 1) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(pieceWidth + margin * 2));
      canvas.height = Math.max(1, Math.round(pieceHeight + margin * 2));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas is not supported by this browser.");
      const scaleX = canvas.width / (pieceWidth + margin * 2);
      const scaleY = canvas.height / (pieceHeight + margin * 2);
      context.scale(scaleX, scaleY);
      tracePiece(context, margin, pieceWidth, pieceHeight, pieceEdges[row]![column]!, tabDepth);
      context.save();
      context.clip();
      context.drawImage(
        image,
        margin - column * pieceWidth,
        margin - row * pieceHeight,
        image.naturalWidth,
        image.naturalHeight,
      );
      context.restore();
      tracePiece(context, margin, pieceWidth, pieceHeight, pieceEdges[row]![column]!, tabDepth);
      context.lineWidth = Math.max(1, Math.min(pieceWidth, pieceHeight) * 0.014);
      context.strokeStyle = "rgba(42, 25, 70, 0.42)";
      context.stroke();
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

  return {
    pieces: shuffle(pieces),
    aspectRatio: image.naturalWidth / image.naturalHeight,
    connectorRatio,
  };
}
