import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type {
  MultiplayerPlayer,
  MultiplayerRoomSession,
  MultiplayerSnapshot,
} from "../services/multiplayerService";
import { getSupabase } from "../services/supabaseClient";

export function useRealtimeRoom(
  room: MultiplayerRoomSession | null | undefined,
  onSnapshot: (snapshot: MultiplayerSnapshot) => void,
  onRoomClosed?: () => void,
) {
  const [players, setPlayers] = useState<MultiplayerPlayer[]>([]);
  const [connection, setConnection] = useState<"offline" | "connecting" | "live">(
    room ? "connecting" : "offline",
  );
  const channelRef = useRef<RealtimeChannel | null>(null);
  const latestSnapshotRef = useRef<MultiplayerSnapshot | null>(null);
  const callbackRef = useRef(onSnapshot);
  const roomClosedCallbackRef = useRef(onRoomClosed);
  callbackRef.current = onSnapshot;
  roomClosedCallbackRef.current = onRoomClosed;

  useEffect(() => {
    const client = getSupabase();
    if (!room || !client) {
      setPlayers([]);
      setConnection("offline");
      return;
    }

    setConnection("connecting");
    const channel = client.channel(`room:${room.id}`, {
      config: {
        private: true,
        presence: { key: room.userId },
      },
    });
    channelRef.current = channel;
    const syncPresence = () => {
      const state = channel.presenceState<MultiplayerPlayer>();
      const active = Object.values(state)
        .flat()
        .map((entry) => entry as unknown as MultiplayerPlayer);
      setPlayers(active);
    };

    channel
      .on("presence", { event: "sync" }, syncPresence)
      .on("presence", { event: "join" }, syncPresence)
      .on("presence", { event: "leave" }, syncPresence)
      .on("broadcast", { event: "puzzle_state" }, ({ payload }) => {
        const snapshot = payload as MultiplayerSnapshot;
        if (snapshot.updatedBy !== room.userId) {
          latestSnapshotRef.current = snapshot;
          callbackRef.current(snapshot);
        }
      })
      .on("broadcast", { event: "request_state" }, () => {
        const latest = latestSnapshotRef.current;
        if (latest && room.hostId === room.userId) {
          void channel.send({ type: "broadcast", event: "puzzle_state", payload: latest });
        }
      })
      .on("broadcast", { event: "room_closed" }, () => {
        roomClosedCallbackRef.current?.();
      })
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "multiplayer_rooms",
          filter: `id=eq.${room.id}`,
        },
        ({ new: updatedRoom }) => {
          const snapshot = updatedRoom.game_state as MultiplayerSnapshot | null;
          if (snapshot && snapshot.updatedBy !== room.userId) {
            latestSnapshotRef.current = snapshot;
            callbackRef.current(snapshot);
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "multiplayer_rooms",
          filter: `id=eq.${room.id}`,
        },
        () => roomClosedCallbackRef.current?.(),
      )
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          setConnection("live");
          await channel.track({
            userId: room.userId,
            playerName: room.playerName,
            avatar: room.avatar,
            onlineAt: new Date().toISOString(),
          } satisfies MultiplayerPlayer);
          if (room.initialState) callbackRef.current(room.initialState);
          await channel.send({ type: "broadcast", event: "request_state", payload: { userId: room.userId } });
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setConnection("offline");
        }
      });

    return () => {
      channelRef.current = null;
      void client.removeChannel(channel);
    };
  }, [room]);

  const broadcastSnapshot = useCallback(async (snapshot: MultiplayerSnapshot) => {
    latestSnapshotRef.current = snapshot;
    if (!channelRef.current) return;
    await channelRef.current.send({
      type: "broadcast",
      event: "puzzle_state",
      payload: snapshot,
    });
  }, []);

  const broadcastRoomClosed = useCallback(async () => {
    if (!channelRef.current) return;
    await channelRef.current.send({
      type: "broadcast",
      event: "room_closed",
      payload: { closedAt: Date.now() },
    });
  }, []);

  return { players, connection, broadcastSnapshot, broadcastRoomClosed };
}
