import { Award, Clock3, Lightbulb, Move, PartyPopper, RotateCcw, Settings2 } from "lucide-react";
import type { Avatar, PuzzleResult } from "../types";
import { formatTime } from "../utils/format";

interface ResultsModalProps {
  kind: "completed" | "expired";
  result: PuzzleResult;
  avatar: Avatar;
  correctPieces: number;
  onReplay: () => void;
  onSettings: () => void;
}

export function ResultsModal({ kind, result, avatar, correctPieces, onReplay, onSettings }: ResultsModalProps) {
  const completed = kind === "completed";
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="result-modal" role="dialog" aria-modal="true" aria-labelledby="result-title">
        <div className={`result-hero ${completed ? "complete" : "expired"}`}>
          <img src={`/assets/avatar-${avatar}.png`} alt="" />
          <span>{completed ? <PartyPopper /> : <Clock3 />}</span>
        </div>
        <span className="result-kicker">{completed ? "Puzzle complete!" : "Time’s up"}</span>
        <h2 id="result-title">{completed ? "You pieced it together!" : "So close—great try!"}</h2>
        <p>{completed ? "Every piece found its perfect place." : `You completed ${Math.round((correctPieces / result.totalPieces) * 100)}% of the puzzle.`}</p>
        <div className="result-score">
          <Award size={22} />
          <span><small>{completed ? "Final score" : "Pieces placed"}</small><strong>{completed ? result.score.toLocaleString() : `${correctPieces} / ${result.totalPieces}`}</strong></span>
        </div>
        <div className="result-stats">
          <span><Clock3 /><small>Time</small><strong>{formatTime(result.elapsedSeconds)}</strong></span>
          <span><Move /><small>Moves</small><strong>{result.moves}</strong></span>
          <span><Lightbulb /><small>Hints</small><strong>{result.hintsUsed}</strong></span>
          <span><span className="mini-grid">▦</span><small>Grid</small><strong>{result.grid.rows} × {result.grid.columns}</strong></span>
        </div>
        <div className="result-actions">
          <button className="primary-button" onClick={onReplay}><RotateCcw size={18} /> {completed ? "Play again" : "Try again"}</button>
          <button className="secondary-button" onClick={onSettings}><Settings2 size={18} /> Change settings</button>
        </div>
      </section>
    </div>
  );
}
