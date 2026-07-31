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
  Share2,
  LogOut,
  Timer,
  Undo2,
  Volume2,
  VolumeX,
  Wifi,
  ZoomIn,
  ZoomOut,
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
import { useGameAudio } from "../hooks/useGameAudio";
import { useRealtimeRoom } from "../hooks/useRealtimeRoom";
import { submitLeaderboardScore } from "../services/leaderboardService";
import {
  persistRoomSnapshot,
  getRoomTeamMembers,
  closeMultiplayerRoom,
  leaveMultiplayerRoom,
  prepareHostRoomExitRequest,
  type MultiplayerActiveDrag,
  type MultiplayerComboEvent,
  type MultiplayerRoomSession,
  type MultiplayerSnapshot,
} from "../services/multiplayerService";
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
  playerName: string;
  multiplayerRoom?: MultiplayerRoomSession | null;
  onLeaderboard?: () => void;
  onRoomEnded: () => void;
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

interface SnapOutcome {
  groups: PieceGroup[];
  matches: number;
}

interface ComboEffect {
  id: string;
  x: number;
  y: number;
  label: string;
  multiplier: number;
  playerName?: string;
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
  const [viewportSize, setViewportSize] = useState<SurfaceSize>({ width: 960, height: 620 });
  const [zoom, setZoom] = useState(1);
  const [status, setStatus] = useState<GameStatus>({ type: "playing" });
  const [moves, setMoves] = useState(0);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [combo, setCombo] = useState(0);
  const [multiplier, setMultiplier] = useState(1);
  const [comboBonus, setComboBonus] = useState(0);
  const [comboEffects, setComboEffects] = useState<ComboEffect[]>([]);
  const [draggingTrayPieceId, setDraggingTrayPieceId] = useState<string | null>(null);
  const [remoteDrag, setRemoteDrag] = useState<MultiplayerActiveDrag | null>(null);
  const [roomEnded, setRoomEnded] = useState(false);
  const [inviteShared, setInviteShared] = useState(false);
  const [referenceVisible, setReferenceVisible] = useState(props.assistance.reference === "always");
  const initialCountdown = props.timer.mode === "countdown" ? props.timer.minutes * 60 + props.timer.seconds : 0;
  const [clock, setClock] = useState(props.timer.mode === "countdown" ? initialCountdown : 0);
  const completionHandled = useRef(false);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const nextZIndex = useRef(1);
  const groupsRef = useRef<PieceGroup[]>([]);
  const comboRef = useRef(0);
  const lastSnapAtRef = useRef(0);
  const comboResetRef = useRef<number | null>(null);
  const applyingRemoteRef = useRef(false);
  const pendingSnapshotRef = useRef<MultiplayerSnapshot | null>(null);
  const realtimeSyncTimerRef = useRef<number | null>(null);
  const persistSyncTimerRef = useRef<number | null>(null);
  const lastRealtimeSyncAtRef = useRef(0);
  const lastPersistSyncAtRef = useRef(0);
  const latestLocalSnapshotRef = useRef<MultiplayerSnapshot | null>(null);
  const latestSnapshotToPersistRef = useRef<MultiplayerSnapshot | null>(null);
  const latestComboEventRef = useRef<MultiplayerComboEvent | null>(null);
  const seenComboEventsRef = useRef(new Set<string>());
  const hostSeenRef = useRef(false);
  const hostMissingTimerRef = useRef<number | null>(null);
  const audio = useGameAudio();
  const totalPieces = props.grid.rows * props.grid.columns;

  const applyRemoteSnapshot = useCallback((snapshot: MultiplayerSnapshot) => {
    if (pieces.length !== totalPieces) {
      pendingSnapshotRef.current = snapshot;
      return;
    }
    if (realtimeSyncTimerRef.current !== null) {
      window.clearTimeout(realtimeSyncTimerRef.current);
      realtimeSyncTimerRef.current = null;
    }
    if (persistSyncTimerRef.current !== null) {
      window.clearTimeout(persistSyncTimerRef.current);
      persistSyncTimerRef.current = null;
    }
    latestLocalSnapshotRef.current = null;
    latestSnapshotToPersistRef.current = null;
    applyingRemoteRef.current = true;
    const remoteGroups = snapshot.groups.map((group) => ({ ...group, pieceIds: [...group.pieceIds] }));
    groupsRef.current = remoteGroups;
    setGroups(remoteGroups);
    setTrayIds(snapshot.trayIds);
    setPieces((current) => current.map((piece) => ({
      ...piece,
      rotation: (snapshot.rotations[piece.id] ?? piece.rotation) as PieceRotation,
    })));
    setMoves(snapshot.moves);
    setRemoteDrag(
      snapshot.activeDrag && snapshot.activeDrag.userId !== props.multiplayerRoom?.userId
        ? snapshot.activeDrag
        : null,
    );
    setSelectedPieceId(null);
    setSelectedGroupId(null);
    if (snapshot.status === "completed") setStatus({ type: "completed" });
    if (snapshot.status === "paused") setStatus({ type: "paused" });
    if (snapshot.status === "playing") setStatus({ type: "playing" });
    const comboEvent = snapshot.comboEvent;
    if (comboEvent && !seenComboEventsRef.current.has(comboEvent.id)) {
      seenComboEventsRef.current.add(comboEvent.id);
      latestComboEventRef.current = comboEvent;
      comboRef.current = comboEvent.count;
      lastSnapAtRef.current = comboEvent.triggeredAt;
      setCombo(comboEvent.count);
      setMultiplier(comboEvent.multiplier);
      setComboBonus((current) => current + comboEvent.matches * 175 * comboEvent.multiplier);
      setComboEffects((current) => [...current, {
        id: comboEvent.id,
        x: comboEvent.x,
        y: comboEvent.y,
        label: comboEvent.label,
        multiplier: comboEvent.multiplier,
        playerName: comboEvent.playerName,
      }]);
      audio.playSnap(comboEvent.multiplier);
      window.setTimeout(() => {
        setComboEffects((current) => current.filter((entry) => entry.id !== comboEvent.id));
      }, 1_250);
      if (comboResetRef.current !== null) window.clearTimeout(comboResetRef.current);
      comboResetRef.current = window.setTimeout(() => {
        comboRef.current = 0;
        setCombo(0);
        setMultiplier(1);
      }, 6_000);
    }
  }, [audio, pieces.length, props.multiplayerRoom, totalPieces]);

  const {
    players: roomPlayers,
    connection: roomConnection,
    broadcastSnapshot,
    broadcastRoomClosed,
  } = useRealtimeRoom(
    props.multiplayerRoom,
    applyRemoteSnapshot,
    () => setRoomEnded(true),
  );

  useEffect(() => {
    const room = props.multiplayerRoom;
    if (!room || room.hostId === room.userId || roomConnection !== "live") return;
    const hostIsPresent = roomPlayers.some((player) => player.userId === room.hostId);
    if (hostIsPresent) {
      hostSeenRef.current = true;
      if (hostMissingTimerRef.current !== null) {
        window.clearTimeout(hostMissingTimerRef.current);
        hostMissingTimerRef.current = null;
      }
    } else if (hostSeenRef.current && hostMissingTimerRef.current === null) {
      hostMissingTimerRef.current = window.setTimeout(() => {
        hostMissingTimerRef.current = null;
        setRoomEnded(true);
      }, 3_000);
    }
  }, [props.multiplayerRoom, roomConnection, roomPlayers]);

  useEffect(() => {
    const room = props.multiplayerRoom;
    if (!room || room.hostId !== room.userId) return;
    let closeOnExit: () => void = () => undefined;
    let active = true;
    void prepareHostRoomExitRequest(room.id).then((request) => {
      if (active) closeOnExit = request;
    });
    const handlePageHide = () => {
      void broadcastRoomClosed();
      closeOnExit();
    };
    window.addEventListener("pagehide", handlePageHide);
    return () => {
      active = false;
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [broadcastRoomClosed, props.multiplayerRoom]);

  const worldSize = useMemo<SurfaceSize>(() => ({
    width: viewportSize.width * zoom,
    height: viewportSize.height * zoom,
  }), [viewportSize, zoom]);

  const pieceMap = useMemo(
    () => new Map(pieces.map((piece) => [piece.id, piece])),
    [pieces],
  );

  const metrics = useMemo<SolutionMetrics>(() => {
    const maximumWidth = worldSize.width * 0.76;
    const maximumHeight = worldSize.height * 0.76;
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
  }, [connectorRatio, imageAspectRatio, props.grid.columns, props.grid.rows, worldSize]);

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
        groupsRef.current = [];
        setSelectedPieceId(null);
        setSelectedGroupId(null);
        setImageAspectRatio(generated.aspectRatio);
        setConnectorRatio(generated.connectorRatio);
        setMoves(0);
        setHintsUsed(0);
        setCombo(0);
        comboRef.current = 0;
        setMultiplier(1);
        setComboBonus(0);
        setComboEffects([]);
        setZoom(1);
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
    if (loading || pieces.length !== totalPieces) return;
    const pending = pendingSnapshotRef.current ?? props.multiplayerRoom?.initialState;
    if (!pending) return;
    pendingSnapshotRef.current = null;
    applyRemoteSnapshot(pending);
  }, [applyRemoteSnapshot, loading, pieces.length, props.multiplayerRoom?.initialState, totalPieces]);

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const measure = () => {
      setViewportSize({
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
      audio.playComplete();
      setStatus({ type: "completed" });
      const room = props.multiplayerRoom;
      if (!room || room.hostId === room.userId) {
        const completedResult: PuzzleResult = {
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
          }) + comboBonus,
        };
        if (!room) {
          void submitLeaderboardScore(completedResult, props.playerName, props.avatar);
        } else {
          const presentPlayers = new Map(roomPlayers.map((player) => [player.userId, player]));
          presentPlayers.set(room.userId, {
            userId: room.userId,
            playerName: room.playerName,
            avatar: room.avatar,
            onlineAt: new Date().toISOString(),
          });
          const fallbackTeam = [...presentPlayers.values()].map((player) => ({
            playerName: player.playerName,
            avatar: player.avatar,
          }));
          void getRoomTeamMembers(room.id)
            .catch(() => fallbackTeam)
            .then((members) => submitLeaderboardScore(
              completedResult,
              room.playerName,
              room.avatar,
              {
                mode: "multiplayer",
                roomCode: room.code,
                teamMembers: members.length ? members : fallbackTeam,
              },
            ));
        }
      }
    }
  }, [
    audio,
    comboBonus,
    elapsedSeconds,
    groups,
    hintsUsed,
    loading,
    moves,
    props.avatar,
    props.behavior.rotation,
    props.difficulty,
    props.grid,
    props.multiplayerRoom,
    props.playerName,
    roomPlayers,
    totalPieces,
    trayIds.length,
  ]);

  useEffect(() => {
    const room = props.multiplayerRoom;
    if (!room || loading || pieces.length !== totalPieces) return;
    if (applyingRemoteRef.current) {
      applyingRemoteRef.current = false;
      return;
    }
    const snapshot: MultiplayerSnapshot = {
      version: 1,
      groups,
      trayIds,
      rotations: Object.fromEntries(pieces.map((piece) => [piece.id, piece.rotation])),
      moves,
      updatedAt: Date.now(),
      updatedBy: room.userId,
      status: status.type === "completed" ? "completed" : status.type === "paused" ? "paused" : "playing",
      activeDrag: dragRef.current ? {
        groupId: dragRef.current.groupId,
        userId: room.userId,
        playerName: room.playerName,
        avatar: room.avatar,
      } : null,
      comboEvent: latestComboEventRef.current,
    };
    latestLocalSnapshotRef.current = snapshot;
    if (realtimeSyncTimerRef.current === null) {
      const delay = Math.max(0, 85 - (Date.now() - lastRealtimeSyncAtRef.current));
      realtimeSyncTimerRef.current = window.setTimeout(() => {
        realtimeSyncTimerRef.current = null;
        const latest = latestLocalSnapshotRef.current;
        if (!latest) return;
        lastRealtimeSyncAtRef.current = Date.now();
        void broadcastSnapshot(latest);
      }, delay);
    }

    latestSnapshotToPersistRef.current = snapshot;
    if (persistSyncTimerRef.current === null) {
      const persistDelay = Math.max(0, 220 - (Date.now() - lastPersistSyncAtRef.current));
      persistSyncTimerRef.current = window.setTimeout(() => {
        persistSyncTimerRef.current = null;
        const latest = latestSnapshotToPersistRef.current;
        if (!latest) return;
        lastPersistSyncAtRef.current = Date.now();
        void persistRoomSnapshot(room.id, latest).catch(() => undefined);
      }, persistDelay);
    }
  }, [
    groups,
    loading,
    moves,
    pieces,
    props.multiplayerRoom,
    broadcastSnapshot,
    status.type,
    totalPieces,
    trayIds,
  ]);

  useEffect(() => () => {
    if (comboResetRef.current !== null) window.clearTimeout(comboResetRef.current);
    if (realtimeSyncTimerRef.current !== null) window.clearTimeout(realtimeSyncTimerRef.current);
    if (persistSyncTimerRef.current !== null) window.clearTimeout(persistSyncTimerRef.current);
    if (hostMissingTimerRef.current !== null) window.clearTimeout(hostMissingTimerRef.current);
  }, []);

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

  const snapGroupList = useCallback((currentGroups: PieceGroup[], activeGroupId: string): SnapOutcome => {
    let working = [...currentGroups];
    let active = working.find((group) => group.id === activeGroupId);
    if (!active) return { groups: working, matches: 0 };
    let matches = 0;
    const toleranceMultiplier = { strict: 0.18, normal: 0.32, forgiving: 0.5 }[props.behavior.snap];
    const tolerance = Math.min(metrics.cellWidth, metrics.cellHeight) * toleranceMultiplier;

    while (active) {
      const activeX = active.originX * worldSize.width;
      const activeY = active.originY * worldSize.height;
      const candidate = working.find((group) => {
        if (group.id === active!.id || !groupsCanConnect(active!, group)) return false;
        const distance = Math.hypot(
          activeX - group.originX * worldSize.width,
          activeY - group.originY * worldSize.height,
        );
        return distance <= tolerance;
      });
      if (!candidate) break;
      matches += 1;

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
    return { groups: working, matches };
  }, [groupsCanConnect, metrics.cellHeight, metrics.cellWidth, props.behavior.snap, worldSize.height, worldSize.width]);

  const registerCombo = (matches: number, clientX?: number, clientY?: number) => {
    if (matches <= 0) return;
    const now = Date.now();
    const nextCombo = now - lastSnapAtRef.current <= 5_500 ? comboRef.current + 1 : 1;
    const nextMultiplier = nextCombo >= 8 ? 5 : nextCombo >= 6 ? 4 : nextCombo >= 4 ? 3 : nextCombo >= 2 ? 2 : 1;
    const labels = ["Good!", "Great!", "Awesome!", "Sweet!", "Fantastic!", "Amazing!", "Brilliant!", "Puzzle power!"];
    const world = worldRef.current;
    const bounds = world?.getBoundingClientRect();
    const effectX = bounds && clientX !== undefined
      ? clamp((clientX - bounds.left) / bounds.width, 0.08, 0.92)
      : 0.5;
    const effectY = bounds && clientY !== undefined
      ? clamp((clientY - bounds.top) / bounds.height, 0.1, 0.9)
      : 0.45;
    const effect: ComboEffect = {
      id: crypto.randomUUID(),
      x: effectX,
      y: effectY,
      label: labels[Math.min(labels.length - 1, nextCombo - 1)]!,
      multiplier: nextMultiplier,
      playerName: props.multiplayerRoom?.playerName,
    };
    const syncedComboEvent: MultiplayerComboEvent | null = props.multiplayerRoom ? {
      id: effect.id,
      label: effect.label,
      count: nextCombo,
      multiplier: nextMultiplier,
      matches,
      x: effect.x,
      y: effect.y,
      triggeredAt: now,
      userId: props.multiplayerRoom.userId,
      playerName: props.multiplayerRoom.playerName,
    } : null;

    comboRef.current = nextCombo;
    if (syncedComboEvent) {
      latestComboEventRef.current = syncedComboEvent;
      seenComboEventsRef.current.add(syncedComboEvent.id);
    }
    lastSnapAtRef.current = now;
    setCombo(nextCombo);
    setMultiplier(nextMultiplier);
    setComboBonus((current) => current + matches * 175 * nextMultiplier);
    setComboEffects((current) => [...current, effect]);
    audio.playSnap(nextMultiplier);
    window.setTimeout(() => {
      setComboEffects((current) => current.filter((entry) => entry.id !== effect.id));
    }, 1_250);

    if (comboResetRef.current !== null) window.clearTimeout(comboResetRef.current);
    comboResetRef.current = window.setTimeout(() => {
      comboRef.current = 0;
      setCombo(0);
      setMultiplier(1);
    }, 6_000);
  };

  const changeZoom = (amount: number) => {
    const surface = surfaceRef.current;
    const nextZoom = clamp(Math.round((zoom + amount) * 10) / 10, 0.8, 2);
    if (!surface || nextZoom === zoom) return;
    const centerX = (surface.scrollLeft + surface.clientWidth / 2) / worldSize.width;
    const centerY = (surface.scrollTop + surface.clientHeight / 2) / worldSize.height;
    setZoom(nextZoom);
    window.requestAnimationFrame(() => {
      surface.scrollLeft = centerX * viewportSize.width * nextZoom - surface.clientWidth / 2;
      surface.scrollTop = centerY * viewportSize.height * nextZoom - surface.clientHeight / 2;
    });
  };

  const placePieceAt = (pieceId: string, clientX: number, clientY: number) => {
    if (status.type !== "playing" || !trayIds.includes(pieceId)) return;
    const piece = pieceMap.get(pieceId);
    const surface = surfaceRef.current;
    const world = worldRef.current;
    if (!piece || !surface || !world) return;
    audio.activate();
    const bounds = world.getBoundingClientRect();
    const localX = clamp(clientX - bounds.left, 0, bounds.width);
    const localY = clamp(clientY - bounds.top, 0, bounds.height);
    const groupId = `group-${crypto.randomUUID()}`;
    const group = clampGroup({
      id: groupId,
      pieceIds: [pieceId],
      originX: (localX - piece.column * metrics.cellWidth - metrics.cellWidth / 2) / worldSize.width,
      originY: (localY - piece.row * metrics.cellHeight - metrics.cellHeight / 2) / worldSize.height,
      zIndex: ++nextZIndex.current,
    }, pieceMap, worldSize, metrics);

    setTrayIds((current) => current.filter((id) => id !== pieceId));
    const snapOutcome = snapGroupList([...groupsRef.current, group], groupId);
    groupsRef.current = snapOutcome.groups;
    setGroups(snapOutcome.groups);
    registerCombo(snapOutcome.matches, clientX, clientY);
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
    audio.activate();
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const zIndex = ++nextZIndex.current;
    const raisedGroups = groupsRef.current.map((entry) => entry.id === group.id ? { ...entry, zIndex } : entry);
    groupsRef.current = raisedGroups;
    setGroups(raisedGroups);
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
    const movedGroups = groupsRef.current.map((group) => {
      if (group.id !== drag.groupId) return group;
      return clampGroup({
        ...group,
        originX: drag.startOriginX + deltaX / worldSize.width,
        originY: drag.startOriginY + deltaY / worldSize.height,
      }, pieceMap, worldSize, metrics);
    });
    groupsRef.current = movedGroups;
    setGroups(movedGroups);
  };

  const endGroupDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const snapOutcome = snapGroupList(groupsRef.current, drag.groupId);
    groupsRef.current = snapOutcome.groups;
    setGroups(snapOutcome.groups);
    registerCombo(snapOutcome.matches, event.clientX, event.clientY);
    if (drag.moved) setMoves((value) => value + 1);
    dragRef.current = null;
  };

  const nudgeGroup = (groupId: string, deltaX: number, deltaY: number) => {
    if (status.type !== "playing") return;
    const moved = groupsRef.current.map((group) => group.id === groupId
      ? clampGroup({
        ...group,
        originX: group.originX + deltaX / worldSize.width,
        originY: group.originY + deltaY / worldSize.height,
      }, pieceMap, worldSize, metrics)
      : group);
    const snapOutcome = snapGroupList(moved, groupId);
    groupsRef.current = snapOutcome.groups;
    setGroups(snapOutcome.groups);
    registerCombo(snapOutcome.matches);
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
    const remainingGroups = groupsRef.current.filter((group) => group.id !== selectedGroup.id);
    groupsRef.current = remainingGroups;
    setGroups(remainingGroups);
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
        const connectedGroups = [
          ...groupsRef.current.filter((group) => group.id !== targetGroup.id && group.id !== matchingGroup.id),
          {
            ...targetGroup,
            pieceIds: connectedIds,
            zIndex: ++nextZIndex.current,
          },
        ];
        groupsRef.current = connectedGroups;
        setGroups(connectedGroups);
        registerCombo(1);
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
        const connectedGroups = groupsRef.current.map((group) => group.id === targetGroup.id
          ? { ...group, pieceIds: [...group.pieceIds, matchingTrayId], zIndex: ++nextZIndex.current }
          : group);
        groupsRef.current = connectedGroups;
        setGroups(connectedGroups);
        registerCombo(1);
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

  const leaveOrEndRoom = async () => {
    const room = props.multiplayerRoom;
    if (!room) return;
    const isHost = room.hostId === room.userId;
    const approved = window.confirm(
      isHost
        ? "End this room for everyone? The room and all memberships will be deleted."
        : "Leave this multiplayer room?",
    );
    if (!approved) return;
    try {
      if (isHost) {
        await broadcastRoomClosed();
        await closeMultiplayerRoom(room.id);
      } else {
        await leaveMultiplayerRoom(room.id, room.userId);
      }
      props.onRoomEnded();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "The room could not be closed.");
    }
  };

  const confirmChangeSettings = async () => {
    if (props.multiplayerRoom) {
      await leaveOrEndRoom();
      return;
    }
    if ((groups.length > 0 || trayIds.length < totalPieces) && !window.confirm("Leave this unfinished puzzle and change settings?")) return;
    props.onChangeSettings();
  };

  const restart = () => {
    if ((groups.length > 0 || trayIds.length < totalPieces) && !window.confirm("Restart this puzzle from the beginning?")) return;
    setGeneration((value) => value + 1);
  };

  const shareRoomInvite = async () => {
    if (!props.multiplayerRoom) return;
    const inviteUrl = new URL(window.location.href);
    inviteUrl.search = "";
    inviteUrl.hash = "";
    inviteUrl.searchParams.set("room", props.multiplayerRoom.code);
    const url = inviteUrl.toString();

    let copied = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        copied = true;
      }
    } catch {
      // Some desktop browsers expose the Clipboard API but block it at runtime.
    }

    if (!copied) {
      const textarea = document.createElement("textarea");
      textarea.value = url;
      textarea.readOnly = true;
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      try {
        copied = document.execCommand("copy");
      } finally {
        textarea.remove();
      }
    }

    if (!copied) window.prompt("Copy this WePuzzle invite link:", url);
    setInviteShared(true);
    window.setTimeout(() => setInviteShared(false), 2_000);
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
    }) + comboBonus,
  };
  const lowTime = props.timer.mode === "countdown" && clock <= Math.min(30, Math.ceil(initialCountdown * 0.15));
  const groupVisualOrigin = (group: PieceGroup) => {
    const members = group.pieceIds
      .map((pieceId) => pieceMap.get(pieceId))
      .filter((piece): piece is PuzzlePiece => Boolean(piece));
    const minimumColumn = members.length ? Math.min(...members.map((piece) => piece.column)) : 0;
    const minimumRow = members.length ? Math.min(...members.map((piece) => piece.row)) : 0;
    return {
      x: group.originX * worldSize.width + minimumColumn * metrics.cellWidth - metrics.overlap,
      y: group.originY * worldSize.height + minimumRow * metrics.cellHeight - metrics.overlap,
    };
  };

  return (
    <main className="game-page freeform-game">
      <header className="game-header">
        <button className="icon-button" onClick={() => void confirmChangeSettings()} aria-label={props.multiplayerRoom ? "Leave multiplayer room" : "Back to puzzle settings"}><ArrowLeft /></button>
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
        <button className={audio.enabled ? "audio-active" : ""} onClick={audio.toggleAudio}>{audio.enabled ? <Volume2 /> : <VolumeX />} Music {audio.enabled ? "on" : "off"}</button>
        <span className="toolbar-spacer" />
        <button onClick={() => setStatus(status.type === "paused" ? { type: "playing" } : { type: "paused" })}>{status.type === "paused" ? <Play /> : <Pause />} {status.type === "paused" ? "Resume" : "Pause"}</button>
        <button onClick={restart}><RotateCcw /> Restart</button>
      </div>

      {props.multiplayerRoom && (
        <div className="room-bar" aria-live="polite">
          <span className={`room-connection ${roomConnection}`}>
            <Wifi /> {roomConnection === "live" ? "Live room" : roomConnection === "connecting" ? "Connecting" : "Reconnecting"}
          </span>
          <strong>{props.multiplayerRoom.code}</strong>
          <button type="button" onClick={() => void shareRoomInvite()} aria-label="Copy multiplayer room invite link">
            <Share2 /> {inviteShared ? "Link copied!" : "Copy invite link"}
          </button>
          <button className="room-exit-button" onClick={() => void leaveOrEndRoom()}>
            <LogOut /> {props.multiplayerRoom.hostId === props.multiplayerRoom.userId ? "End room" : "Leave"}
          </button>
          <div className="room-players">
            {roomPlayers.map((player) => (
              <span key={player.userId} title={player.playerName}>
                <img src={`/assets/avatar-${player.avatar}.png`} alt="" />
                {player.playerName}
              </span>
            ))}
          </div>
        </div>
      )}

      <section className={`freeform-layout ${status.type === "paused" ? "paused" : ""}`}>
        <div className="freeform-main">
          <div className="board-heading">
            <div><span className="section-kicker">Open puzzle space</span><h1>Build it anywhere</h1></div>
            <div className="board-heading-actions">
              {combo > 0 && <span className="combo-chip"><strong>{combo} combo</strong><b>{multiplier}×</b></span>}
              <span className="connected-count">{connectedCount} of {totalPieces} connected</span>
              <div className="zoom-controls" aria-label="Puzzle zoom controls">
                <button onClick={() => changeZoom(-0.2)} disabled={zoom <= 0.8} aria-label="Zoom out"><ZoomOut /></button>
                <span>{Math.round(zoom * 100)}%</span>
                <button onClick={() => changeZoom(0.2)} disabled={zoom >= 2} aria-label="Zoom in"><ZoomIn /></button>
              </div>
            </div>
          </div>
          <div
            className={`free-puzzle-surface ${selectedPieceId && trayIds.includes(selectedPieceId) ? "ready-to-place" : ""}`}
            ref={surfaceRef}
            role="application"
            tabIndex={0}
            aria-label="Open puzzle surface. Drop pieces anywhere and connect matching edges."
            onPointerDown={() => audio.activate()}
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
            onDragEnter={(event) => event.preventDefault()}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
            }}
            onWheel={(event) => {
              if (!event.ctrlKey) return;
              event.preventDefault();
              changeZoom(event.deltaY > 0 ? -0.1 : 0.1);
            }}
            onDrop={(event) => {
              event.preventDefault();
              const pieceId = event.dataTransfer.getData("application/x-wepuzzle-piece")
                || event.dataTransfer.getData("text/piece-id")
                || event.dataTransfer.getData("text/plain")
                || draggingTrayPieceId;
              setDraggingTrayPieceId(null);
              if (pieceId) placePieceAt(pieceId, event.clientX, event.clientY);
            }}
          >
            <div
              className="surface-world"
              ref={worldRef}
              style={{ width: worldSize.width, height: worldSize.height }}
            >
              <div className="surface-message" aria-hidden="true">
                <Hand />
                <span><strong>Drop pieces anywhere</strong><small>Matching edges snap together</small></span>
              </div>
              {groups.map((group) => (
                <div
                  className={`free-piece-group ${group.id === selectedGroupId ? "selected" : ""} ${group.pieceIds.length > 1 ? "connected" : ""} ${remoteDrag?.groupId === group.id ? `remote-dragging drag-${remoteDrag.avatar}` : ""}`}
                  key={group.id}
                  style={{ zIndex: group.zIndex }}
                >
                  {remoteDrag?.groupId === group.id && (
                    <span
                      className="remote-drag-label"
                      style={{
                        left: groupVisualOrigin(group).x,
                        top: groupVisualOrigin(group).y - 6,
                      }}
                    >
                      <img src={`/assets/avatar-${remoteDrag.avatar}.png`} alt="" />
                      {remoteDrag.playerName} is moving
                    </span>
                  )}
                  {group.pieceIds.map((pieceId) => {
                    const piece = pieceMap.get(pieceId);
                    if (!piece) return null;
                    return (
                      <button
                        className="free-piece"
                        key={piece.id}
                        style={{
                          left: group.originX * worldSize.width + piece.column * metrics.cellWidth - metrics.overlap,
                          top: group.originY * worldSize.height + piece.row * metrics.cellHeight - metrics.overlap,
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
              {comboEffects.map((effect) => (
                <div className="combo-burst" key={effect.id} style={{ left: `${effect.x * 100}%`, top: `${effect.y * 100}%` }} aria-live="polite">
                  <strong>{effect.label}</strong>
                  {effect.playerName && <em>{effect.playerName}</em>}
                  {effect.multiplier > 1 && <b>{effect.multiplier}× combo</b>}
                  {Array.from({ length: 8 }, (_, index) => <i key={index} style={{ "--spark": index } as React.CSSProperties} />)}
                </div>
              ))}
            </div>
            {comboEffects.length > 0 && (() => {
              const effect = comboEffects[comboEffects.length - 1]!;
              return (
                <div className="combo-screen-toast" key={`screen-${effect.id}`} role="status" aria-live="assertive">
                  <strong>{effect.label}</strong>
                  {effect.playerName && <em>{effect.playerName}</em>}
                  {effect.multiplier > 1 && <b>{effect.multiplier}Ã— combo</b>}
                </div>
              );
            })()}
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
                    className={`tray-piece jigsaw-tray-piece ${piece.id === selectedPieceId ? "selected" : ""} ${piece.id === draggingTrayPieceId ? "dragging" : ""}`}
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
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("application/x-wepuzzle-piece", piece.id);
                      event.dataTransfer.setData("text/piece-id", piece.id);
                      event.dataTransfer.setData("text/plain", piece.id);
                      setDraggingTrayPieceId(piece.id);
                      setSelectedPieceId(piece.id);
                      setSelectedGroupId(null);
                      audio.activate();
                    }}
                    onDragEnd={() => setDraggingTrayPieceId(null)}
                    aria-label={`Loose puzzle piece ${piece.correctIndex + 1}${piece.id === selectedPieceId ? ", selected" : ""}`}
                  >
                    <img src={piece.imageUrl} alt="" draggable={false} style={{ transform: `rotate(${piece.rotation}deg)` }} />
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

      {roomEnded && (
        <div className="modal-backdrop">
          <section className="room-ended-modal" role="dialog" aria-modal="true" aria-labelledby="room-ended-title">
            <span><LogOut /></span>
            <span className="section-kicker">Room closed</span>
            <h2 id="room-ended-title">The host ended the room</h2>
            <p>This room and its player list are no longer active.</p>
            <button className="primary-button" onClick={props.onRoomEnded}>Return to multiplayer</button>
          </section>
        </div>
      )}

      {loading && <div className="loading-overlay"><div className="loading-piece">✚</div><h2>Cutting real puzzle pieces…</h2><p>Shaping every tab and curve.</p></div>}
      {loadError && <div className="loading-overlay"><h2>We couldn’t make this puzzle</h2><p>{loadError}</p><button className="primary-button" onClick={props.onChangeSettings}>Choose another image</button></div>}
      {(status.type === "completed" || status.type === "expired") && <ResultsModal kind={status.type} result={result} avatar={props.avatar} correctPieces={connectedCount} onReplay={() => setGeneration((value) => value + 1)} onSettings={() => void confirmChangeSettings()} onLeaderboard={props.onLeaderboard} />}
    </main>
  );
}
