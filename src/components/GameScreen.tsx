import {
  ArrowLeft,
  Eye,
  EyeOff,
  Lightbulb,
  Move,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Timer,
  Undo2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AssistanceSettings,
  Avatar,
  Difficulty,
  GameStatus,
  GridSettings,
  ImageSource,
  PieceRotation,
  PuzzleBehaviorSettings,
  PuzzlePiece,
  PuzzleResult,
  TimerSettings,
} from "../types";
import { calculateScore } from "../utils/scoreCalculator";
import { formatTime } from "../utils/format";
import { generatePuzzlePieces } from "../utils/puzzleGenerator";
import { ResultsModal } from "./ResultsModal";

interface GameScreenProps {
  avatar: Avatar;
  difficulty: Difficulty;
  grid: GridSettings;
  timer: TimerSettings;
  assistance: AssistanceSettings;
  behavior: PuzzleBehaviorSettings;
  image: ImageSource;
  onChangeSettings: () => void;
}

const nextRotation: Record<PieceRotation, PieceRotation> = { 0: 90, 90: 180, 180: 270, 270: 0 };

export function GameScreen(props: GameScreenProps) {
  const [generation, setGeneration] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tray, setTray] = useState<PuzzlePiece[]>([]);
  const [board, setBoard] = useState<Array<PuzzlePiece | null>>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState<GameStatus>({ type: "playing" });
  const [moves, setMoves] = useState(0);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [hintIndex, setHintIndex] = useState<number | null>(null);
  const [invalidIndex, setInvalidIndex] = useState<number | null>(null);
  const [referenceVisible, setReferenceVisible] = useState(props.assistance.reference === "always");
  const initialCountdown = props.timer.mode === "countdown" ? props.timer.minutes * 60 + props.timer.seconds : 0;
  const [clock, setClock] = useState(props.timer.mode === "countdown" ? initialCountdown : 0);
  const completionHandled = useRef(false);
  const totalPieces = props.grid.rows * props.grid.columns;

  const isCorrect = useCallback(
    (piece: PuzzlePiece | null, index: number) => Boolean(piece && piece.correctIndex === index && piece.rotation === 0),
    [],
  );
  const correctCount = useMemo(
    () => board.reduce((count, piece, index) => count + (isCorrect(piece, index) ? 1 : 0), 0),
    [board, isCorrect],
  );
  const progress = totalPieces ? Math.round((correctCount / totalPieces) * 100) : 0;
  const elapsedSeconds = props.timer.mode === "countdown" ? initialCountdown - clock : clock;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    completionHandled.current = false;
    void generatePuzzlePieces(props.image.url, props.grid, props.behavior.rotation)
      .then((pieces) => {
        if (cancelled) return;
        setTray(pieces);
        setBoard(Array.from({ length: totalPieces }, () => null));
        setSelectedId(null);
        setMoves(0);
        setHintsUsed(0);
        setClock(props.timer.mode === "countdown" ? initialCountdown : 0);
        setStatus({ type: "playing" });
        setLoading(false);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "The puzzle could not be created.");
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [generation, initialCountdown, props.behavior.rotation, props.grid, props.image.url, props.timer.mode, totalPieces]);

  useEffect(() => {
    if (loading || status.type !== "playing") return;
    const interval = window.setInterval(() => {
      setClock((current) => {
        if (props.timer.mode === "stopwatch") return current + 1;
        if (current <= 1) {
          window.clearInterval(interval);
          setStatus({ type: "expired" });
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [loading, props.timer.mode, status.type]);

  useEffect(() => {
    if (correctCount === totalPieces && totalPieces > 0 && !loading && !completionHandled.current) {
      completionHandled.current = true;
      setStatus({ type: "completed" });
    }
  }, [correctCount, loading, totalPieces]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (status.type === "playing" && correctCount < totalPieces) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [correctCount, status.type, totalPieces]);

  const findPiece = (pieceId: string) =>
    tray.find((piece) => piece.id === pieceId) ?? board.find((piece) => piece?.id === pieceId) ?? null;

  const placePiece = (pieceId: string, targetIndex: number) => {
    if (status.type !== "playing") return;
    const piece = findPiece(pieceId);
    if (!piece) return;
    const correct = piece.correctIndex === targetIndex && piece.rotation === 0;
    if (!correct && !props.behavior.allowIncorrect) {
      setInvalidIndex(targetIndex);
      setMoves((value) => value + 1);
      window.setTimeout(() => setInvalidIndex(null), 650);
      return;
    }

    const currentIndex = board.findIndex((entry) => entry?.id === pieceId);
    const occupant = board[targetIndex];
    if (occupant && isCorrect(occupant, targetIndex) && props.assistance.lockCorrect) return;

    setTray((current) => {
      const withoutPiece = current.filter((entry) => entry.id !== pieceId);
      return occupant ? [...withoutPiece, occupant] : withoutPiece;
    });
    setBoard((current) => {
      const next = [...current];
      if (currentIndex >= 0) next[currentIndex] = null;
      next[targetIndex] = piece;
      return next;
    });
    setMoves((value) => value + 1);
    setSelectedId(null);
  };

  const rotatePiece = (pieceId: string) => {
    if (!props.behavior.rotation || status.type !== "playing") return;
    const update = (piece: PuzzlePiece) => piece.id === pieceId ? { ...piece, rotation: nextRotation[piece.rotation] } : piece;
    setTray((current) => current.map(update));
    setBoard((current) => current.map((piece, index) => {
      if (!piece || piece.id !== pieceId || (isCorrect(piece, index) && props.assistance.lockCorrect)) return piece;
      return update(piece);
    }));
    setSelectedId(pieceId);
    setMoves((value) => value + 1);
  };

  const rotateSelected = () => {
    if (selectedId) rotatePiece(selectedId);
  };

  const returnSelected = () => {
    if (!selectedId || status.type !== "playing") return;
    const index = board.findIndex((piece) => piece?.id === selectedId);
    if (index < 0) return;
    const piece = board[index];
    if (!piece || (isCorrect(piece, index) && props.assistance.lockCorrect)) return;
    setBoard((current) => current.map((entry, entryIndex) => entryIndex === index ? null : entry));
    setTray((current) => [...current, piece]);
    setSelectedId(null);
    setMoves((value) => value + 1);
  };

  const useHint = () => {
    if (!props.assistance.hintsEnabled || hintsUsed >= props.assistance.maxHints || status.type !== "playing") return;
    const target = board.findIndex((piece, index) => !isCorrect(piece, index));
    if (target < 0) return;
    const wantedId = `piece-${target}`;
    setSelectedId(wantedId);
    setHintIndex(target);
    setHintsUsed((value) => value + 1);
    window.setTimeout(() => setHintIndex(null), 1400);
  };

  const confirmChangeSettings = () => {
    if (correctCount > 0 && correctCount < totalPieces && !window.confirm("Leave this unfinished puzzle and change settings?")) return;
    props.onChangeSettings();
  };

  const restart = () => {
    if (correctCount > 0 && correctCount < totalPieces && !window.confirm("Restart this puzzle from the beginning?")) return;
    setGeneration((value) => value + 1);
  };

  const result: PuzzleResult = {
    difficulty: props.difficulty,
    grid: props.grid,
    totalPieces,
    elapsedSeconds,
    moves,
    hintsUsed,
    score: calculateScore({ pieceCount: totalPieces, elapsedSeconds, moves, hintsUsed, rotationEnabled: props.behavior.rotation }),
  };
  const lowTime = props.timer.mode === "countdown" && clock <= Math.min(30, Math.ceil(initialCountdown * 0.15));

  return (
    <main className="game-page">
      <header className="game-header">
        <button className="icon-button" onClick={confirmChangeSettings} aria-label="Back to puzzle settings"><ArrowLeft /></button>
        <img className="game-logo" src="/assets/wepuzzle-logo.png" alt="WePuzzle" />
        <div className="game-meta"><strong>{props.difficulty === "custom" ? "Custom" : `${props.difficulty[0]?.toUpperCase()}${props.difficulty.slice(1)}`}</strong><span>{props.grid.rows} × {props.grid.columns} · {totalPieces} pieces</span></div>
        <div className="game-stats">
          <span className={lowTime ? "warning" : ""}><Timer /><small>{props.timer.mode === "countdown" ? "Time left" : "Time"}</small><strong>{formatTime(clock)}</strong></span>
          <span><Move /><small>Moves</small><strong>{moves}</strong></span>
          <span><span className="progress-ring" style={{ "--progress": `${progress * 3.6}deg` } as React.CSSProperties}>{progress}</span><small>Complete</small><strong>{progress}%</strong></span>
        </div>
        <img className="game-avatar" src={`/assets/avatar-${props.avatar}.png`} alt={`${props.avatar === "cat" ? "Milo" : "Poppy"}, your puzzle pal`} />
      </header>

      <div className="game-toolbar">
        {props.assistance.reference !== "disabled" && (
          <button onClick={() => setReferenceVisible((value) => !value)} disabled={props.assistance.reference === "always"}>
            {referenceVisible ? <EyeOff /> : <Eye />} {referenceVisible ? "Hide reference" : "Show reference"}
          </button>
        )}
        {props.assistance.hintsEnabled && <button onClick={useHint} disabled={hintsUsed >= props.assistance.maxHints}><Lightbulb /> Hint <span>{props.assistance.maxHints - hintsUsed}</span></button>}
        {props.behavior.rotation && <button onClick={rotateSelected} disabled={!selectedId}><RotateCw /> Rotate</button>}
        <button onClick={returnSelected} disabled={!selectedId}><Undo2 /> Return piece</button>
        <span className="toolbar-spacer" />
        <button onClick={() => setStatus(status.type === "paused" ? { type: "playing" } : { type: "paused" })}>{status.type === "paused" ? <Play /> : <Pause />} {status.type === "paused" ? "Resume" : "Pause"}</button>
        <button onClick={restart}><RotateCcw /> Restart</button>
      </div>

      <section className={`play-area ${status.type === "paused" ? "paused" : ""}`}>
        <div className="board-column">
          <div className="board-heading"><div><span className="section-kicker">Puzzle board</span><h1>Find every perfect spot</h1></div><span>{correctCount} of {totalPieces} placed</span></div>
          <div
            className={`puzzle-board ${props.assistance.showGridLines ? "grid-lines" : ""}`}
            style={{ gridTemplateColumns: `repeat(${props.grid.columns}, 1fr)`, aspectRatio: `${props.grid.columns} / ${props.grid.rows}` }}
            aria-label={`Puzzle board with ${totalPieces} positions`}
          >
            {board.map((piece, index) => {
              const correct = isCorrect(piece, index);
              const locked = correct && props.assistance.lockCorrect;
              return (
                <button
                  key={index}
                  className={`board-slot ${piece ? "filled" : ""} ${correct && props.assistance.highlightCorrect ? "correct" : ""} ${hintIndex === index ? "hinted" : ""} ${invalidIndex === index ? "invalid" : ""} ${piece?.id === selectedId ? "selected" : ""}`}
                  onClick={() => piece ? setSelectedId(piece.id) : selectedId && placePiece(selectedId, index)}
                  onDoubleClick={() => { if (piece) rotatePiece(piece.id); }}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => { event.preventDefault(); placePiece(event.dataTransfer.getData("text/piece-id"), index); }}
                  aria-label={piece ? `Position ${index + 1}, occupied${correct ? ", correct" : ""}` : `Empty position ${index + 1}`}
                  disabled={status.type !== "playing" || locked}
                >
                  {piece && <img src={piece.imageUrl} alt="" draggable={!locked} onDragStart={(event) => event.dataTransfer.setData("text/piece-id", piece.id)} style={{ transform: `rotate(${piece.rotation}deg)` }} />}
                  {correct && props.assistance.highlightCorrect && <i aria-hidden="true">✓</i>}
                  {hintIndex === index && <span className="hint-label">Place here</span>}
                </button>
              );
            })}
          </div>
          <p className="board-help">Tap a piece, then tap its spot. You can also drag pieces or use Enter with the keyboard.</p>
        </div>

        <aside className="game-sidebar">
          {referenceVisible && props.assistance.reference !== "disabled" && <div className="reference-card"><div><span>Reference</span><button onClick={() => props.assistance.reference !== "always" && setReferenceVisible(false)} aria-label="Hide reference"><EyeOff size={16} /></button></div><img src={props.image.url} alt="Reference for the completed puzzle" /></div>}
          <div className="pal-card"><img src={`/assets/avatar-${props.avatar}.png`} alt="" /><div><strong>{correctCount === 0 ? "Let’s start!" : progress < 75 ? "You’ve got this!" : "Almost there!"}</strong><span>{selectedId ? "Now tap a spot on the board." : "Pick a piece from the tray."}</span></div></div>
        </aside>

        {status.type === "paused" && <div className="pause-overlay"><span><Pause /></span><h2>Puzzle paused</h2><p>Your timer is taking a break, too.</p><button className="primary-button" onClick={() => setStatus({ type: "playing" })}><Play size={18} /> Keep puzzling</button></div>}
      </section>

      <section className="tray-section">
        <div className="tray-heading"><div><span className="section-kicker">Piece tray</span><h2>Choose your next piece</h2></div><span>{tray.length} remaining</span></div>
        <div className="piece-tray" aria-label={`${tray.length} puzzle pieces remaining`}>
          {tray.map((piece) => (
            <button
              key={piece.id}
              className={`tray-piece ${piece.id === selectedId ? "selected" : ""}`}
              onClick={() => setSelectedId(piece.id === selectedId ? null : piece.id)}
              onDoubleClick={() => rotatePiece(piece.id)}
              draggable
              onDragStart={(event) => event.dataTransfer.setData("text/piece-id", piece.id)}
              aria-label={`Puzzle piece ${piece.correctIndex + 1}${piece.id === selectedId ? ", selected" : ""}`}
            >
              <img src={piece.imageUrl} alt="" style={{ transform: `rotate(${piece.rotation}deg)` }} />
            </button>
          ))}
          {!loading && tray.length === 0 && <p>All pieces are on the board!</p>}
        </div>
      </section>

      {loading && <div className="loading-overlay"><div className="loading-piece">✚</div><h2>Cutting your puzzle…</h2><p>One tiny piece at a time.</p></div>}
      {loadError && <div className="loading-overlay"><h2>We couldn’t make this puzzle</h2><p>{loadError}</p><button className="primary-button" onClick={props.onChangeSettings}>Choose another image</button></div>}
      {(status.type === "completed" || status.type === "expired") && <ResultsModal kind={status.type} result={result} avatar={props.avatar} correctPieces={correctCount} onReplay={() => setGeneration((value) => value + 1)} onSettings={props.onChangeSettings} />}
    </main>
  );
}
