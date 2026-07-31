import { ArrowLeft, Clock3, Crown, Medal, Move, RefreshCw, Trophy, UserRound, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { LeaderboardEntry, LeaderboardMode } from "../services/leaderboardService";
import { getLeaderboard } from "../services/leaderboardService";
import { formatTime } from "../utils/format";

interface LeaderboardScreenProps {
  initialMode?: LeaderboardMode;
  onBack: () => void;
  onPlay: () => void;
}

export function LeaderboardScreen({ initialMode = "solo", onBack, onPlay }: LeaderboardScreenProps) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [leaderboardMode, setLeaderboardMode] = useState<LeaderboardMode>(initialMode);
  const [storageMode, setStorageMode] = useState<"cloud" | "local">("local");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await getLeaderboard(leaderboardMode);
    setEntries(result.entries);
    setStorageMode(result.mode);
    setLoading(false);
  }, [leaderboardMode]);

  useEffect(() => { void load(); }, [load]);

  return (
    <main className="online-page">
      <header className="online-header container">
        <button className="icon-button" onClick={onBack} aria-label="Back to home"><ArrowLeft /></button>
        <img className="brand-image" src="/assets/wepuzzle-logo.png" alt="WePuzzle" />
        <button className="secondary-button compact" onClick={() => void load()}><RefreshCw size={17} /> Refresh</button>
      </header>

      <section className="online-hero container">
        <span className="online-icon"><Trophy /></span>
        <span className="section-kicker">{storageMode === "cloud" ? "Global rankings" : "On this device"}</span>
        <h1>Puzzle champions</h1>
        <p>
          {storageMode === "cloud"
            ? "The brightest scores from WePuzzle players everywhere."
            : "Cloud scores appear here after Supabase is connected. Your finished puzzles are still saved locally."}
        </p>
      </section>

      <section className="leaderboard-card container" aria-live="polite">
        <div className="leaderboard-tabs" role="tablist" aria-label="Leaderboard type">
          <button
            className={leaderboardMode === "solo" ? "active" : ""}
            onClick={() => setLeaderboardMode("solo")}
            role="tab"
            aria-selected={leaderboardMode === "solo"}
          >
            <UserRound /> Solo
          </button>
          <button
            className={leaderboardMode === "multiplayer" ? "active" : ""}
            onClick={() => setLeaderboardMode("multiplayer")}
            role="tab"
            aria-selected={leaderboardMode === "multiplayer"}
          >
            <Users /> Multiplayer
          </button>
        </div>
        <div className={`leaderboard-head ${leaderboardMode}`}>
          {leaderboardMode === "solo"
            ? <><span>Rank</span><span>Player</span><span>Puzzle</span><span>Time</span><span>Moves</span><span>Score</span></>
            : <><span>Rank</span><span>Team</span><span>Players</span><span>Puzzle</span><span>Time</span><span>Score</span></>}
        </div>
        {loading && <div className="leaderboard-empty">Gathering the top scores…</div>}
        {!loading && entries.length === 0 && (
          <div className="leaderboard-empty">
            <Trophy />
            <h2>No scores yet</h2>
            <p>{leaderboardMode === "solo" ? "Complete the first puzzle and claim the crown." : "Finish a room together and put your team on the board."}</p>
            <button className="primary-button" onClick={onPlay}>Play a puzzle</button>
          </div>
        )}
        {!loading && entries.map((entry, index) => (
          <article className={`leaderboard-row ${leaderboardMode} rank-${index + 1}`} key={entry.id}>
            <span className="rank">
              {index === 0 ? <Crown /> : index < 3 ? <Medal /> : `#${index + 1}`}
            </span>
            {leaderboardMode === "solo" ? (
              <>
                <span className="leader-player">
                  <img src={`/assets/avatar-${entry.avatar}.png`} alt="" />
                  <strong>{entry.playerName}</strong>
                </span>
                <span><small>{entry.difficulty}</small><strong>{entry.rows} × {entry.columns}</strong></span>
                <span><Clock3 /><strong>{formatTime(entry.elapsedSeconds)}</strong></span>
                <span><Move /><strong>{entry.moves}</strong></span>
              </>
            ) : (
              <>
                <span className="leader-team">
                  <span className="team-avatar-stack">
                    {entry.teamMembers.slice(0, 4).map((member, memberIndex) => (
                      <img
                        key={`${entry.id}-${memberIndex}`}
                        src={`/assets/avatar-${member.avatar}.png`}
                        alt=""
                        style={{ "--member-index": memberIndex } as React.CSSProperties}
                      />
                    ))}
                  </span>
                  <span><strong>{entry.teamMembers.map((member) => member.playerName).join(" & ")}</strong><small>Room {entry.roomCode ?? "team"}</small></span>
                </span>
                <span className="player-count"><Users /><strong>{entry.teamMembers.length}</strong><small>{entry.teamMembers.length === 1 ? "player" : "players"}</small></span>
                <span><small>{entry.difficulty}</small><strong>{entry.rows} × {entry.columns}</strong></span>
                <span><Clock3 /><strong>{formatTime(entry.elapsedSeconds)}</strong></span>
              </>
            )}
            <strong className="leader-score">{entry.score.toLocaleString()}</strong>
          </article>
        ))}
      </section>
    </main>
  );
}
