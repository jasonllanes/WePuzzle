import { ArrowLeft, Copy, Gamepad2, LogIn, Sparkles, Users } from "lucide-react";
import { useState } from "react";
import type { Avatar } from "../types";
import {
  createMultiplayerRoom,
  joinMultiplayerRoom,
  type MultiplayerRoomSession,
} from "../services/multiplayerService";
import { isSupabaseConfigured } from "../services/supabaseClient";

interface MultiplayerLobbyProps {
  avatar: Avatar;
  playerName: string;
  initialRoomCode?: string;
  onPlayerNameChange: (name: string) => void;
  onAvatarChange: (avatar: Avatar) => void;
  onBack: () => void;
  onEnterRoom: (room: MultiplayerRoomSession) => void;
}

export function MultiplayerLobby(props: MultiplayerLobbyProps) {
  const [roomCode, setRoomCode] = useState(props.initialRoomCode ?? "");
  const [busy, setBusy] = useState<"create" | "join" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const invited = Boolean(props.initialRoomCode);

  const create = async () => {
    setBusy("create");
    setError(null);
    try {
      props.onEnterRoom(await createMultiplayerRoom(props.playerName, props.avatar));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The room could not be created.");
    } finally {
      setBusy(null);
    }
  };

  const join = async () => {
    setBusy("join");
    setError(null);
    try {
      props.onEnterRoom(await joinMultiplayerRoom(roomCode, props.playerName, props.avatar));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That room could not be joined.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <main className="online-page multiplayer-page">
      <header className="online-header container">
        <button className="icon-button" onClick={props.onBack} aria-label="Back to home"><ArrowLeft /></button>
        <img className="brand-image" src="/assets/wepuzzle-logo.png" alt="WePuzzle" />
        <span className={`cloud-pill ${isSupabaseConfigured ? "online" : ""}`}>
          <i /> {isSupabaseConfigured ? "Rooms online" : "Setup needed"}
        </span>
      </header>

      <section className="online-hero container">
        <span className="online-icon"><Users /></span>
        <span className="section-kicker">{invited ? "Puzzle invitation" : "Co-op rooms"}</span>
        <h1>{invited ? "Your friends are waiting!" : "Piece it together"}</h1>
        <p>
          {invited
            ? "Choose how you’ll appear, then jump straight into the shared puzzle."
            : "Create a private room, share its six-character code, and move the same puzzle together in real time."}
        </p>
        {invited && (
          <div className="invite-banner">
            <LogIn />
            <span><strong>You’ve been invited!</strong> Room {props.initialRoomCode} is ready below.</span>
          </div>
        )}
      </section>

      {invited ? (
        <section className="invite-join-dialog container" role="dialog" aria-labelledby="invite-join-title">
          <div className="invite-room-label"><span>Room</span><strong>{props.initialRoomCode}</strong></div>
          <span className="section-kicker">Almost there</span>
          <h2 id="invite-join-title">What should we call you?</h2>
          <label>
            Display name
            <input
              value={props.playerName}
              maxLength={24}
              onChange={(event) => props.onPlayerNameChange(event.target.value)}
              placeholder="Puzzle Pal"
              autoFocus
              onKeyDown={(event) => {
                if (event.key === "Enter" && props.playerName.trim() && !busy) void join();
              }}
            />
          </label>
          <span className="avatar-label">Choose a puzzle pal</span>
          <div className="lobby-avatars invite-avatars" aria-label="Choose your avatar">
            {(["cat", "dog"] as const).map((avatar) => (
              <button
                key={avatar}
                className={props.avatar === avatar ? "selected" : ""}
                onClick={() => props.onAvatarChange(avatar)}
                aria-pressed={props.avatar === avatar}
              >
                <img src={`/assets/avatar-${avatar}.png`} alt="" />
                <span>{avatar === "cat" ? "Milo" : "Poppy"}</span>
              </button>
            ))}
          </div>
          <button
            className="primary-button invite-join-button"
            onClick={() => void join()}
            disabled={!isSupabaseConfigured || !props.playerName.trim() || Boolean(busy)}
          >
            <LogIn /> {busy === "join" ? "Joining puzzle…" : "Join the puzzle"}
          </button>
          <small>By joining, your name and puzzle moves will be visible to everyone in this room.</small>
        </section>
      ) : (
        <section className="lobby-grid container">
          <article className="lobby-card player-card">
            <span className="section-kicker">Your player</span>
            <h2>How friends see you</h2>
            <label>
              Display name
              <input
                value={props.playerName}
                maxLength={24}
                onChange={(event) => props.onPlayerNameChange(event.target.value)}
                placeholder="Puzzle Pal"
              />
            </label>
            <div className="lobby-avatars" aria-label="Choose your avatar">
              {(["cat", "dog"] as const).map((avatar) => (
                <button
                  key={avatar}
                  className={props.avatar === avatar ? "selected" : ""}
                  onClick={() => props.onAvatarChange(avatar)}
                  aria-pressed={props.avatar === avatar}
                >
                  <img src={`/assets/avatar-${avatar}.png`} alt="" />
                  <span>{avatar === "cat" ? "Milo" : "Poppy"}</span>
                </button>
              ))}
            </div>
          </article>

          <article className="lobby-card action-card">
            <span className="action-badge"><Sparkles /></span>
            <span className="section-kicker">Start fresh</span>
            <h2>Create a room</h2>
            <p>You’ll be the host. Send the code to friends and start puzzling right away.</p>
            <button className="primary-button" onClick={() => void create()} disabled={!isSupabaseConfigured || Boolean(busy)}>
              <Gamepad2 /> {busy === "create" ? "Creating…" : "Create room"}
            </button>
          </article>

          <article className="lobby-card action-card">
            <span className="action-badge mint"><Copy /></span>
            <span className="section-kicker">Have a code?</span>
            <h2>Join friends</h2>
            <label>
              Room code
              <input
                className="room-code-input"
                value={roomCode}
                maxLength={6}
                onChange={(event) => setRoomCode(event.target.value.replace(/[^a-z0-9]/gi, "").toUpperCase())}
                placeholder="ABC123"
                autoCapitalize="characters"
              />
            </label>
            <button className="secondary-button" onClick={() => void join()} disabled={!isSupabaseConfigured || roomCode.length !== 6 || Boolean(busy)}>
              <LogIn /> {busy === "join" ? "Joining…" : "Join room"}
            </button>
          </article>
        </section>
      )}

      {!isSupabaseConfigured && (
        <aside className="setup-notice container">
          <strong>Cloud setup is not connected yet.</strong>
          <span>Follow <code>docs/VERCEL_DEPLOYMENT.md</code> to create the database and add the two public environment variables.</span>
        </aside>
      )}
      {error && <p className="lobby-error container" role="alert">{error}</p>}
      <p className="lobby-note container">Multiplayer uses the featured Cozy Puzzle Night image, so personal uploads always stay on your own device.</p>
    </main>
  );
}
