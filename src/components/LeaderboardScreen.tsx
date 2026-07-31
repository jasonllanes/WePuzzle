import { ArrowLeft, Clock3, Crown, Medal, Move, RefreshCw, Trophy } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { LeaderboardEntry } from "../services/leaderboardService";
import { getLeaderboard } from "../services/leaderboardService";
import { formatTime } from "../utils/format";

interface LeaderboardScreenProps {
  onBack: () => void;
  onPlay: () => void;
}

export function LeaderboardScreen({ onBack, onPlay }: LeaderboardScreenProps) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [mode, setMode] = useState<"cloud" | "local">("local");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await getLeaderboard();
    setEntries(result.entries);
    setMode(result.mode);
    setLoading(false);
  }, []);

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
        <span className="section-kicker">{mode === "cloud" ? "Global rankings" : "On this device"}</span>
        <h1>Puzzle champions</h1>
        <p>
          {mode === "cloud"
            ? "The brightest scores from WePuzzle players everywhere."
            : "Cloud scores appear here after Supabase is connected. Your finished puzzles are still saved locally."}
        </p>
      </section>

      <section className="leaderboard-card container" aria-live="polite">
        <div className="leaderboard-head">
          <span>Rank</span><span>Player</span><span>Puzzle</span><span>Time</span><span>Moves</span><span>Score</span>
        </div>
        {loading && <div className="leaderboard-empty">Gathering the top scores…</div>}
        {!loading && entries.length === 0 && (
          <div className="leaderboard-empty">
            <Trophy />
            <h2>No scores yet</h2>
            <p>Complete the first puzzle and claim the crown.</p>
            <button className="primary-button" onClick={onPlay}>Play a puzzle</button>
          </div>
        )}
        {!loading && entries.map((entry, index) => (
          <article className={`leaderboard-row rank-${index + 1}`} key={entry.id}>
            <span className="rank">
              {index === 0 ? <Crown /> : index < 3 ? <Medal /> : `#${index + 1}`}
            </span>
            <span className="leader-player">
              <img src={`/assets/avatar-${entry.avatar}.png`} alt="" />
              <strong>{entry.playerName}</strong>
            </span>
            <span><small>{entry.difficulty}</small><strong>{entry.rows} × {entry.columns}</strong></span>
            <span><Clock3 /><strong>{formatTime(entry.elapsedSeconds)}</strong></span>
            <span><Move /><strong>{entry.moves}</strong></span>
            <strong className="leader-score">{entry.score.toLocaleString()}</strong>
          </article>
        ))}
      </section>
    </main>
  );
}
