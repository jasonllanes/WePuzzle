import { ArrowRight, ImagePlus, ShieldCheck, Sparkles } from "lucide-react";
import type { Avatar } from "../types";

interface LandingPageProps {
  avatar: Avatar;
  onAvatarChange: (avatar: Avatar) => void;
  onCreate: () => void;
}

export function LandingPage({ avatar, onAvatarChange, onCreate }: LandingPageProps) {
  return (
    <main className="landing">
      <nav className="landing-nav" aria-label="Main navigation">
        <img className="brand-image" src="/assets/wepuzzle-logo.png" alt="WePuzzle" />
        <button className="nav-cta" onClick={onCreate}>Create a puzzle</button>
      </nav>

      <section className="hero container">
        <div className="hero-copy">
          <span className="eyebrow"><Sparkles size={15} /> Your pictures, your puzzle</span>
          <h1>Every picture holds a <em>little adventure.</em></h1>
          <p>
            Turn a favorite photo into a playful jigsaw in seconds. No account,
            no upload to a server—just pick, shuffle, and play.
          </p>
          <div className="hero-actions">
            <button className="primary-button large" onClick={onCreate}>
              Create my puzzle <ArrowRight size={20} />
            </button>
            <span className="privacy-note"><ShieldCheck size={17} /> Your images stay on this device</span>
          </div>
          <div className="feature-strip" aria-label="WePuzzle features">
            <span><ImagePlus size={17} /> Any photo</span>
            <span><Sparkles size={17} /> 4 difficulties</span>
            <span>∞ Play anytime</span>
          </div>
        </div>

        <div className="hero-visual">
          <div className="hero-orbit orbit-one" aria-hidden="true">✦</div>
          <div className="hero-orbit orbit-two" aria-hidden="true">✚</div>
          <figure className="hero-frame">
            <img src="/assets/hero-pets.png" alt="A kitten and puppy playing with a colorful puzzle" />
            <figcaption><span>Featured puzzle</span><strong>Cozy puzzle night</strong></figcaption>
          </figure>
          <div className="floating-piece piece-blue" aria-hidden="true">✚</div>
          <div className="floating-piece piece-yellow" aria-hidden="true">✚</div>
        </div>
      </section>

      <section className="buddy-section container" aria-labelledby="buddy-title">
        <div>
          <span className="section-kicker">Meet your puzzle pals</span>
          <h2 id="buddy-title">Who’s joining your adventure?</h2>
          <p>Choose a cheerful buddy. You can switch anytime before you play.</p>
        </div>
        <div className="buddy-options">
          <button
            className={`buddy-card ${avatar === "cat" ? "selected" : ""}`}
            onClick={() => onAvatarChange("cat")}
            aria-pressed={avatar === "cat"}
          >
            <img src="/assets/avatar-cat.png" alt="" />
            <span><strong>Milo</strong><small>Curious & clever</small></span>
            <i aria-hidden="true">{avatar === "cat" ? "✓" : ""}</i>
          </button>
          <button
            className={`buddy-card ${avatar === "dog" ? "selected" : ""}`}
            onClick={() => onAvatarChange("dog")}
            aria-pressed={avatar === "dog"}
          >
            <img src="/assets/avatar-dog.png" alt="" />
            <span><strong>Poppy</strong><small>Happy & helpful</small></span>
            <i aria-hidden="true">{avatar === "dog" ? "✓" : ""}</i>
          </button>
        </div>
      </section>
    </main>
  );
}
