import {
  ArrowLeft,
  Eye,
  EyeOff,
  Hand,
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
import { formatTime } from "../utils/format";
import { generatePuzzlePieces } from "../utils/puzzleGenerator";
import { calculateScore } from "../utils/scoreCalculator";
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

interface PieceGroup {
  id: string;
  pieceIds: string[];
  originX: number;
  originY: number;
  zIndex: number;
}

interface SurfaceSize {
  width: number;
  height: number;
}

interface SolutionMetrics {
  width: number;
  height: number;
  cellWidth: number;
  cellHeight: number;
  overlap: number;
}

interface DragState {
  pointerId: number;
  groupId: string;
  startClientX: number;
  startClientY: number;
  startOriginX: number;
  startOriginY: number;
  moved: boolean;
}

const nextRotation: Record<PieceRotation, PieceRotation> = { 0: 90, 90: 180, 180: 270, 270: 0 };

function areAdjacent(first: PuzzlePiece, second: PuzzlePiece): boolean {
  return Math.abs(first.row - second.row) + Math.abs(first.column - second.column) === 1;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function clampGroup(
  group: PieceGroup,
  pieceMap: ReadonlyMap<string, PuzzlePiece>,
  surface: SurfaceSize,
  metrics: SolutionMetrics,
): PieceGroup {
  const members = group.pieceIds
    .map((pieceId) => pieceMap.get(pieceId))
    .filter((piece): piece is PuzzlePiece => Boolean(piece));
  if (members.length === 0 || surface.width <= 0 || surface.height <= 0) return group;

  const minimumColumn = Math.min(...members.map((piece) => piece.column));
  const maximumColumn = Math.max(...members.map((piece) => piece.column));
  const minimumRow = Math.min(...members.map((piece) => piece.row));
  const maximumRow = Math.max(...members.map((piece) => piece.row));
  const minimumOriginX = metrics.overlap - minimumColumn * metrics.cellWidth;
  const maximumOriginX = surface.width - (maximumColumn + 1) * metrics.cellWidth - metrics.overlap;
  const minimumOriginY = metrics.overlap - minimumRow * metrics.cellHeight;
  const maximumOriginY = surface.height - (maximumRow + 1) * metrics.cellHeight - metrics.overlap;
  const originPixelsX = group.originX * surface.width;
  const originPixelsY = group.originY * surface.height;

  return {
    ...group,
    originX: clamp(originPixelsX, minimumOriginX, Math.max(minimumOriginX, maximumOriginX)) / surface.width,
    originY: clamp(originPixelsY, minimumOriginY, Math.max(minimumOriginY, maximumOriginY)) / surface.height,
  };
}

export function GameScreen(props: GameScreenProps) {
  const [generation, setGeneration] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pieces, setPieces] = useState<PuzzlePiece[]>([]);
  const [trayIds, setTrayIds] = useState<string[]>([]);
  const [groups, setGroups] = useState<PieceGroup[]>([]);
  const [selectedPieceId, setSelectedPieceId] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [imageAspectRatio, setImageAspectRatio] = useState(1);
  const [connectorRatio, setConnectorRatio] = useState(0.22);
  const [surfaceSize, setSurfaceSize] = useState<SurfaceSize>({ width: 960, height: 620 });
  const [status, setStatus] = useState<GameStatus>({ type: "playing" });
  const [moves, setMoves] = useState(0);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [referenceVisible, setReferenceVisible] = useState(props.assistance.reference === "always");
  const initialCountdown = props.timer.mode === "countdown" ? props.timer.minutes * 60 + props.timer.seconds : 0;
  const [clock, setClock] = useState(props.timer.mode === "countdown" ? initialCountdown : 0);
  const completionHandled = useRef(false);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const nextZIndex = useRef(1);
  const totalPieces = props.grid.rows * props.grid.columns;

  const pieceMap = useMemo(
    () => new Map(pieces.map((piece) => [piece.id, piece])),
    [pieces],
  );

  const metrics = useMemo<SolutionMetrics>(() => {
    const maximumWidth = surfaceSize.width * 0.76;
    const maximumHeight = surfaceSize.height * 0.76;
    let width = maximumWidth;
    let height = width / imageAspectRatio;
    if (height > maximumHeight) {
      height = maximumHeight;
      width = height * imageAspectRatio;
    }
    const cellWidth = width / props.grid.columns;
    const cellHeight = height / props.grid.rows;
    return {
      width,
      height,
      cellWidth,
      cellHeight,
      overlap: Math.min(cellWidth, cellHeight) * connectorRatio,
    };
  }, [connectorRatio, imageAspectRatio, props.grid.columns, props.grid.rows, surfaceSize]);

  const largestGroupSize = useMemo(
    () => groups.reduce((largest, group) => Math.max(largest, group.pieceIds.length), 0),
    [groups],
  );
  const connectedCount = largestGroupSize > 1 ? largestGroupSize : 0;
  const progress = totalPieces ? Math.round((connectedCount / totalPieces) * 100) : 0;
  const elapsedSeconds = props.timer.mode === "countdown" ? initialCountdown - clock : clock;
  const selectedPiece = selectedPieceId ? pieceMap.get(selectedPieceId) ?? null : null;
  const selectedGroup = selectedGroupId ? groups.find((group) => group.id === selectedGroupId) ?? null : null;
  const canRotateSelected = Boolean(
    selectedPiece
    && props.behavior.rotation
    && (!selectedGroup || selectedGroup.pieceIds.length === 1),
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    completionHandled.current = false;
    void generatePuzzlePieces(props.image.url, props.grid, props.behavior.rotation)
      .then((generated) => {
        if (cancelled) return;
        setPieces(generated.pieces);
        setTrayIds(generated.pieces.map((piece) => piece.id));
        setGroups([]);
        setSelectedPieceId(null);
        setSelectedGroupId(null);
        setImageAspectRatio(generated.aspectRatio);
        setConnectorRatio(generated.connectorRatio);
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
  }, [generation, initialCountdown, props.behavior.rotation, props.grid, props.image.url, props.timer.mode]);

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const measure = () => {
      setSurfaceSize({
        width: Math.max(1, surface.clientWidth),
        height: Math.max(1, surface.clientHeight),
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(surface);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [loading]);

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
    const completeGroup = groups.find((group) => group.pieceIds.length === totalPieces);
    if (completeGroup && trayIds.length === 0 && !loading && !completionHandled.current) {
      completionHandled.current = true;
      setStatus({ type: "completed" });
    }
  }, [groups, loading, totalPieces, trayIds.length]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (status.type === "playing" && (groups.length > 0 || trayIds.length < totalPieces)) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [groups.length, status.type, totalPieces, trayIds.length]);

  const groupsCanConnect = useCallback((first: PieceGroup, second: PieceGroup): boolean => {
    return first.pieceIds.some((firstId) => {
      const firstPiece = pieceMap.get(firstId);
      if (!firstPiece || firstPiece.rotation !== 0) return false;
      return second.pieceIds.some((secondId) => {
        const secondPiece = pieceMap.get(secondId);
        return Boolean(secondPiece && secondPiece.rotation === 0 && areAdjacent(firstPiece, secondPiece));
      });
    });
  }, [pieceMap]);

  const snapGroupList = useCallback((currentGroups: PieceGroup[], activeGroupId: string): PieceGroup[] => {
    let working = [...currentGroups];
    let active = working.find((group) => group.id === activeGroupId);
    if (!active) return working;
    const toleranceMultiplier = { strict: 0.18, normal: 0.32, forgiving: 0.5 }[props.behavior.snap];
    const tolerance = Math.min(metrics.cellWidth, metrics.cellHeight) * toleranceMultiplier;

    while (active) {
      const activeX = active.originX * surfaceSize.width;
      const activeY = active.originY * surfaceSize.height;
      const candidate = working.find((group) => {
        if (group.id === active!.id || !groupsCanConnect(active!, group)) return false;
        const distance = Math.hypot(
          activeX - group.originX * surfaceSize.width,
          activeY - group.originY * surfaceSize.height,
        );
        return distance <= tolerance;
      });
      if (!candidate) break;

      active = {
        ...active,
        pieceIds: [...new Set([...active.pieceIds, ...candidate.pieceIds])],
        originX: candidate.originX,
        originY: candidate.originY,
        zIndex: Math.max(active.zIndex, candidate.zIndex) + 1,
      };
      working = working.filter((group) => group.id !== active!.id && group.id !== candidate.id);
      working.push(active);
    }
    return working;
  }, [groupsCanConnect, metrics.cellHeight, metrics.cellWidth, props.behavior.snap, surfaceSize.height, surfaceSize.width]);

  const placePieceAt = (pieceId: string, clientX: number, clientY: number) => {
    if (status.type !== "playing" || !trayIds.includes(pieceId)) return;
    const piece = pieceMap.get(pieceId);
    const surface = surfaceRef.current;
    if (!piece || !surface) return;
    const bounds = surface.getBoundingClientRect();
    const localX = clamp(clientX - bounds.left, 0, bounds.width);
    const localY = clamp(clientY - bounds.top, 0, bounds.height);
    const groupId = `group-${crypto.randomUUID()}`;
    const group = clampGroup({
      id: groupId,
      pieceIds: [pieceId],
      originX: (localX - piece.column * metrics.cellWidth - metrics.cellWidth / 2) / surfaceSize.width,
      originY: (localY - piece.row * metrics.cellHeight - metrics.cellHeight / 2) / surfaceSize.height,
      zIndex: ++nextZIndex.current,
    }, pieceMap, surfaceSize, metrics);

    setTrayIds((current) => current.filter((id) => id !== pieceId));
    setGroups((current) => snapGroupList([...current, group], groupId));
    setSelectedPieceId(pieceId);
    setSelectedGroupId(groupId);
    setMoves((value) => value + 1);
  };

  const startGroupDrag = (
    event: React.PointerEvent<HTMLButtonElement>,
    pieceId: string,
    group: PieceGroup,
  ) => {
    if (status.type !== "playing") return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const zIndex = ++nextZIndex.current;
    setGroups((current) => current.map((entry) => entry.id === group.id ? { ...entry, zIndex } : entry));
    setSelectedPieceId(pieceId);
    setSelectedGroupId(group.id);
    dragRef.current = {
      pointerId: event.pointerId,
      groupId: group.id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startOriginX: group.originX,
      startOriginY: group.originY,
      moved: false,
    };
  };

  const moveGroup = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || status.type !== "playing") return;
    const deltaX = event.clientX - drag.startClientX;
    const deltaY = event.clientY - drag.startClientY;
    if (Math.abs(deltaX) + Math.abs(deltaY) > 3) drag.moved = true;
    setGroups((current) => current.map((group) => {
      if (group.id !== drag.groupId) return group;
      return clampGroup({
        ...group,
        originX: drag.startOriginX + deltaX / surfaceSize.width,
        originY: drag.startOriginY + deltaY / surfaceSize.height,
      }, pieceMap, surfaceSize, metrics);
    }));
  };

  const endGroupDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setGroups((current) => snapGroupList(current, drag.groupId));
    if (drag.moved) setMoves((value) => value + 1);
    dragRef.current = null;
  };

  const nudgeGroup = (groupId: string, deltaX: number, deltaY: number) => {
    if (status.type !== "playing") return;
    setGroups((current) => {
      const moved = current.map((group) => group.id === groupId
        ? clampGroup({
          ...group,
          originX: group.originX + deltaX / surfaceSize.width,
          originY: group.originY + deltaY / surfaceSize.height,
        }, pieceMap, surfaceSize, metrics)
        : group);
      return snapGroupList(moved, groupId);
    });
    setMoves((value) => value + 1);
  };

  const handlePieceKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, groupId: string) => {
    const distance = event.shiftKey ? 2 : 12;
    const movement = {
      ArrowLeft: [-distance, 0],
      ArrowRight: [distance, 0],
      ArrowUp: [0, -distance],
      ArrowDown: [0, distance],
    }[event.key];
    if (!movement) return;
    event.preventDefault();
    nudgeGroup(groupId, movement[0]!, movement[1]!);
  };

  const rotateSelected = () => {
    if (!selectedPieceId || !canRotateSelected || status.type !== "playing") return;
    setPieces((current) => current.map((piece) => piece.id === selectedPieceId
      ? { ...piece, rotation: nextRotation[piece.rotation] }
      : piece));
    setMoves((value) => value + 1);
  };

  const returnSelected = () => {
    if (!selectedGroup || status.type !== "playing") return;
    setGroups((current) => current.filter((group) => group.id !== selectedGroup.id));
    setTrayIds((current) => [...current, ...selectedGroup.pieceIds.filter((id) => !current.includes(id))]);
    setSelectedPieceId(null);
    setSelectedGroupId(null);
    setMoves((value) => value + 1);
  };

  const useHint = () => {
    if (!props.assistance.hintsEnabled || hintsUsed >= props.assistance.maxHints || status.type !== "playing") return;
    setHintsUsed((value) => value + 1);
    setPieces((current) => current.map((piece) => selectedPieceId === piece.id ? { ...piece, rotation: 0 } : piece));

    const targetGroup = groups.reduce<PieceGroup | null>(
      (largest, group) => !largest || group.pieceIds.length > largest.pieceIds.length ? group : largest,
      null,
    );
    if (targetGroup) {
      const matchingGroup = groups.find((group) => (
        group.id !== targetGroup.id
        && group.pieceIds.some((groupId) => {
          const groupPiece = pieceMap.get(groupId);
          return Boolean(groupPiece && targetGroup.pieceIds.some((targetId) => {
            const targetPiece = pieceMap.get(targetId);
            return Boolean(targetPiece && areAdjacent(groupPiece, targetPiece));
          }));
        })
      ));
      if (matchingGroup) {
        const connectedIds = [...targetGroup.pieceIds, ...matchingGroup.pieceIds];
        setPieces((current) => current.map((piece) => connectedIds.includes(piece.id) ? { ...piece, rotation: 0 } : piece));
        setGroups((current) => [
          ...current.filter((group) => group.id !== targetGroup.id && group.id !== matchingGroup.id),
          {
            ...targetGroup,
            pieceIds: connectedIds,
            zIndex: ++nextZIndex.current,
          },
        ]);
        setSelectedPieceId(connectedIds[0] ?? null);
        setSelectedGroupId(targetGroup.id);
        return;
      }

      const matchingTrayId = trayIds.find((trayId) => {
        const trayPiece = pieceMap.get(trayId);
        return Boolean(trayPiece && targetGroup.pieceIds.some((groupId) => {
          const groupPiece = pieceMap.get(groupId);
          return Boolean(groupPiece && areAdjacent(trayPiece, groupPiece));
        }));
      });
      if (matchingTrayId) {
        setPieces((current) => current.map((piece) => piece.id === matchingTrayId ? { ...piece, rotation: 0 } : piece));
        setTrayIds((current) => current.filter((id) => id !== matchingTrayId));
        setGroups((current) => current.map((group) => group.id === targetGroup.id
          ? { ...group, pieceIds: [...group.pieceIds, matchingTrayId], zIndex: ++nextZIndex.current }
          : group));
        setSelectedPieceId(matchingTrayId);
        setSelectedGroupId(targetGroup.id);
      }
    } else {
      const firstPieceId = trayIds[0];
      const surface = surfaceRef.current;
      if (firstPieceId && surface) {
        const bounds = surface.getBoundingClientRect();
        placePieceAt(firstPieceId, bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
      }
    }
  };

  const confirmChangeSettings = () => {
    if ((groups.length > 0 || trayIds.length < totalPieces) && !window.confirm("Leave this unfinished puzzle and change settings?")) return;
    props.onChangeSettings();
  };

  const restart = () => {
    if ((groups.length > 0 || trayIds.length < totalPieces) && !window.confirm("Restart this puzzle from the beginning?")) return;
    setGeneration((value) => value + 1);
  };

  const result: PuzzleResult = {
    difficulty: props.difficulty,
    grid: props.grid,
    totalPieces,
    elapsedSeconds,
    moves,
    hintsUsed,
    score: calculateScore({
      pieceCount: totalPieces,
      elapsedSeconds,
      moves,
      hintsUsed,
      rotationEnabled: props.behavior.rotation,
    }),
  };
  const lowTime = props.timer.mode === "countdown" && clock <= Math.min(30, Math.ceil(initialCountdown * 0.15));

  return (
    <main className="game-page freeform-game">
      <header className="game-header">
        <button className="icon-button" onClick={confirmChangeSettings} aria-label="Back to puzzle settings"><ArrowLeft /></button>
        <img className="game-logo" src="/assets/wepuzzle-logo.png" alt="WePuzzle" />
        <div className="game-meta"><strong>{props.difficulty === "custom" ? "Custom" : `${props.difficulty[0]?.toUpperCase()}${props.difficulty.slice(1)}`}</strong><span>{props.grid.rows} × {props.grid.columns} · {totalPieces} pieces</span></div>
        <div className="game-stats">
          <span className={lowTime ? "warning" : ""}><Timer /><small>{props.timer.mode === "countdown" ? "Time left" : "Time"}</small><strong>{formatTime(clock)}</strong></span>
          <span><Move /><small>Moves</small><strong>{moves}</strong></span>
          <span><span className="progress-ring" style={{ "--progress": `${progress * 3.6}deg` } as React.CSSProperties}>{progress}</span><small>Connected</small><strong>{progress}%</strong></span>
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
        {props.behavior.rotation && <button onClick={rotateSelected} disabled={!canRotateSelected}><RotateCw /> Rotate</button>}
        <button onClick={returnSelected} disabled={!selectedGroup}><Undo2 /> {selectedGroup && selectedGroup.pieceIds.length > 1 ? "Return group" : "Return piece"}</button>
        <span className="toolbar-spacer" />
        <button onClick={() => setStatus(status.type === "paused" ? { type: "playing" } : { type: "paused" })}>{status.type === "paused" ? <Play /> : <Pause />} {status.type === "paused" ? "Resume" : "Pause"}</button>
        <button onClick={restart}><RotateCcw /> Restart</button>
      </div>

      <section className={`freeform-layout ${status.type === "paused" ? "paused" : ""}`}>
        <div className="freeform-main">
          <div className="board-heading">
            <div><span className="section-kicker">Open puzzle space</span><h1>Build it anywhere</h1></div>
            <span>{connectedCount} of {totalPieces} connected</span>
          </div>
          <div
            className={`free-puzzle-surface ${selectedPieceId && trayIds.includes(selectedPieceId) ? "ready-to-place" : ""}`}
            ref={surfaceRef}
            role="application"
            tabIndex={0}
            aria-label="Open puzzle surface. Drop pieces anywhere and connect matching edges."
            onClick={(event) => {
              if (!selectedPieceId || !trayIds.includes(selectedPieceId)) return;
              if ((event.target as HTMLElement).closest(".free-piece-group")) return;
              placePieceAt(selectedPieceId, event.clientX, event.clientY);
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || !selectedPieceId || !trayIds.includes(selectedPieceId)) return;
              event.preventDefault();
              const bounds = event.currentTarget.getBoundingClientRect();
              placePieceAt(selectedPieceId, bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const pieceId = event.dataTransfer.getData("text/piece-id");
              if (pieceId) placePieceAt(pieceId, event.clientX, event.clientY);
            }}
          >
            <div className="surface-message" aria-hidden="true">
              <Hand />
              <span><strong>Drop pieces anywhere</strong><small>Matching edges snap together</small></span>
            </div>
            {groups.map((group) => (
              <div className={`free-piece-group ${group.id === selectedGroupId ? "selected" : ""} ${group.pieceIds.length > 1 ? "connected" : ""}`} key={group.id} style={{ zIndex: group.zIndex }}>
                {group.pieceIds.map((pieceId) => {
                  const piece = pieceMap.get(pieceId);
                  if (!piece) return null;
                  return (
                    <button
                      className="free-piece"
                      key={piece.id}
                      style={{
                        left: group.originX * surfaceSize.width + piece.column * metrics.cellWidth - metrics.overlap,
                        top: group.originY * surfaceSize.height + piece.row * metrics.cellHeight - metrics.overlap,
                        width: metrics.cellWidth + metrics.overlap * 2,
                        height: metrics.cellHeight + metrics.overlap * 2,
                      }}
                      onPointerDown={(event) => startGroupDrag(event, piece.id, group)}
                      onPointerMove={moveGroup}
                      onPointerUp={endGroupDrag}
                      onPointerCancel={endGroupDrag}
                      onKeyDown={(event) => handlePieceKeyDown(event, group.id)}
                      aria-label={`Puzzle piece ${piece.correctIndex + 1}${group.pieceIds.length > 1 ? `, connected group of ${group.pieceIds.length}` : ""}`}
                    >
                      <img src={piece.imageUrl} alt="" draggable={false} style={{ transform: `rotate(${piece.rotation}deg)` }} />
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          <p className="freeform-help" aria-live="polite">
            {selectedPieceId && trayIds.includes(selectedPieceId)
              ? "Piece selected — tap anywhere on the open space to place it."
              : selectedGroup
                ? `Move this ${selectedGroup.pieceIds.length > 1 ? `${selectedGroup.pieceIds.length}-piece group` : "piece"} close to a matching edge and it will snap.`
                : "Drag a piece from the tray, or tap it and then tap the open space."}
          </p>
        </div>

        <aside className="freeform-sidebar">
          <div className="pal-card"><img src={`/assets/avatar-${props.avatar}.png`} alt="" /><div><strong>{connectedCount === 0 ? "Find a match!" : progress < 75 ? "Great connection!" : "Almost there!"}</strong><span>Connected pieces move together as one.</span></div></div>
          <section className="tray-card" aria-labelledby="tray-title">
            <div className="tray-heading">
              <div><span className="section-kicker">Loose pieces</span><h2 id="tray-title">Pick a piece</h2></div>
              <span>{trayIds.length} left</span>
            </div>
            {selectedPiece && (
              <div className="selected-piece-status">
                <img src={selectedPiece.imageUrl} alt="" style={{ transform: `rotate(${selectedPiece.rotation}deg)` }} />
                <span><strong>{selectedGroup?.pieceIds.length && selectedGroup.pieceIds.length > 1 ? `${selectedGroup.pieceIds.length} pieces connected` : "Piece selected"}</strong><small>{trayIds.includes(selectedPiece.id) ? "Tap the open space to place it" : "Drag it near a matching edge"}</small></span>
              </div>
            )}
            <div className="piece-tray jigsaw-tray" aria-label={`${trayIds.length} loose puzzle pieces`}>
              {trayIds.map((pieceId) => {
                const piece = pieceMap.get(pieceId);
                if (!piece) return null;
                return (
                  <button
                    key={piece.id}
                    className={`tray-piece jigsaw-tray-piece ${piece.id === selectedPieceId ? "selected" : ""}`}
                    onClick={() => {
                      setSelectedPieceId(piece.id === selectedPieceId ? null : piece.id);
                      setSelectedGroupId(null);
                    }}
                    onDoubleClick={() => {
                      setSelectedPieceId(piece.id);
                      if (props.behavior.rotation) {
                        setPieces((current) => current.map((entry) => entry.id === piece.id ? { ...entry, rotation: nextRotation[entry.rotation] } : entry));
                        setMoves((value) => value + 1);
                      }
                    }}
                    draggable
                    onDragStart={(event) => event.dataTransfer.setData("text/piece-id", piece.id)}
                    aria-label={`Loose puzzle piece ${piece.correctIndex + 1}${piece.id === selectedPieceId ? ", selected" : ""}`}
                  >
                    <img src={piece.imageUrl} alt="" style={{ transform: `rotate(${piece.rotation}deg)` }} />
                  </button>
                );
              })}
              {!loading && trayIds.length === 0 && <p>Every piece is on the table.</p>}
            </div>
          </section>
          {referenceVisible && props.assistance.reference !== "disabled" && <div className="reference-card"><div><span>Reference</span><button onClick={() => props.assistance.reference !== "always" && setReferenceVisible(false)} aria-label="Hide reference"><EyeOff size={16} /></button></div><img src={props.image.url} alt="Reference for the completed puzzle" /></div>}
        </aside>

        {status.type === "paused" && <div className="pause-overlay"><span><Pause /></span><h2>Puzzle paused</h2><p>Your timer is taking a break, too.</p><button className="primary-button" onClick={() => setStatus({ type: "playing" })}><Play size={18} /> Keep puzzling</button></div>}
      </section>

      {loading && <div className="loading-overlay"><div className="loading-piece">✚</div><h2>Cutting real puzzle pieces…</h2><p>Shaping every tab and curve.</p></div>}
      {loadError && <div className="loading-overlay"><h2>We couldn’t make this puzzle</h2><p>{loadError}</p><button className="primary-button" onClick={props.onChangeSettings}>Choose another image</button></div>}
      {(status.type === "completed" || status.type === "expired") && <ResultsModal kind={status.type} result={result} avatar={props.avatar} correctPieces={connectedCount} onReplay={() => setGeneration((value) => value + 1)} onSettings={props.onChangeSettings} />}
    </main>
  );
}
