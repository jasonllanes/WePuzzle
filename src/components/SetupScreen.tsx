import { ArrowLeft, ArrowRight, Check, ImagePlus, LockKeyhole, Sparkles, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { DIFFICULTIES } from "../data";
import type { Avatar, CustomDifficultySettings, Difficulty, ImageSource } from "../types";
import { readImageFile } from "../utils/imageProcessor";
import { CustomSettingsPanel } from "./CustomSettingsPanel";

interface SetupScreenProps {
  avatar: Avatar;
  onAvatarChange: (avatar: Avatar) => void;
  image: ImageSource;
  onImageChange: (image: ImageSource) => void;
  difficulty: Difficulty;
  onDifficultyChange: (difficulty: Difficulty) => void;
  settings: CustomDifficultySettings;
  onSettingsChange: (settings: CustomDifficultySettings) => void;
  customError: string | null;
  onBack: () => void;
  onStart: () => void;
}

export function SetupScreen(props: SetupScreenProps) {
  const [uploadError, setUploadError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedPreset = DIFFICULTIES.find((item) => item.id === props.difficulty);
  const grid = selectedPreset
    ? { rows: selectedPreset.rows, columns: selectedPreset.columns }
    : props.settings.grid;

  const handleFile = async (file?: File) => {
    if (!file) return;
    try {
      const url = await readImageFile(file);
      props.onImageChange({ kind: "upload", id: crypto.randomUUID(), name: file.name, url, file });
      setUploadError(null);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Could not use that image.");
    }
  };

  return (
    <main className="setup-page">
      <header className="setup-header">
        <button className="icon-button" onClick={props.onBack} aria-label="Back to home"><ArrowLeft /></button>
        <img src="/assets/wepuzzle-logo.png" alt="WePuzzle" />
        <span className="step-label">Create your puzzle</span>
      </header>

      <div className="setup-shell">
        <section className="setup-intro">
          <span className="section-kicker">Let’s make something fun</span>
          <h1>Build your perfect puzzle</h1>
          <p>Choose a picture and challenge level. We’ll handle the magic.</p>
        </section>

        <div className="setup-grid">
          <div className="setup-main">
            <section className="setup-card">
              <div className="card-heading"><span className="step-number">1</span><div><h2>Choose your picture</h2><p>Use our cozy starter or add one of your own.</p></div></div>
              <div className="image-choice-grid">
                <button className={`featured-image ${props.image.kind === "system" ? "selected" : ""}`} onClick={() => props.onImageChange({ kind: "system", id: "cozy-pets", name: "Cozy puzzle night", url: "/assets/hero-pets.png" })}>
                  <img src="/assets/hero-pets.png" alt="Kitten and puppy puzzle" />
                  <span>{props.image.kind === "system" && <Check size={16} />} Featured image</span>
                </button>
                <button className="upload-zone" onClick={() => inputRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void handleFile(event.dataTransfer.files[0]); }}>
                  <span className="upload-icon"><Upload size={24} /></span>
                  <strong>Upload a photo</strong>
                  <small>JPG, PNG or WebP · up to 10 MB</small>
                  <em>Browse files</em>
                </button>
                <input ref={inputRef} type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" hidden onChange={(event) => void handleFile(event.target.files?.[0])} />
              </div>
              {props.image.kind === "upload" && (
                <div className="upload-preview"><img src={props.image.url} alt="Uploaded preview" /><span><strong>{props.image.name}</strong><small>Ready to puzzle</small></span><button onClick={() => inputRef.current?.click()}>Replace</button></div>
              )}
              {uploadError && <p className="form-error" role="alert">{uploadError}</p>}
              <p className="privacy-banner"><LockKeyhole size={16} /> Your photo is processed privately in your browser and never uploaded.</p>
            </section>

            <section className="setup-card">
              <div className="card-heading"><span className="step-number">2</span><div><h2>Pick your puzzle pal</h2><p>Your buddy will cheer you on.</p></div></div>
              <div className="compact-buddies">
                {(["cat", "dog"] as const).map((option) => (
                  <button key={option} className={props.avatar === option ? "selected" : ""} onClick={() => props.onAvatarChange(option)} aria-pressed={props.avatar === option}>
                    <img src={`/assets/avatar-${option}.png`} alt="" />
                    <span><strong>{option === "cat" ? "Milo" : "Poppy"}</strong><small>{option === "cat" ? "Curious & clever" : "Happy & helpful"}</small></span>
                    <i>{props.avatar === option ? "✓" : ""}</i>
                  </button>
                ))}
              </div>
            </section>

            <section className="setup-card">
              <div className="card-heading"><span className="step-number">3</span><div><h2>Choose your challenge</h2><p>You can always try another level later.</p></div></div>
              <div className="difficulty-grid">
                {DIFFICULTIES.map((preset, index) => (
                  <button key={preset.id} className={props.difficulty === preset.id ? "selected" : ""} onClick={() => props.onDifficultyChange(preset.id)}>
                    <span className={`difficulty-icon level-${index}`}>{index < 2 ? "✦" : "✚"}</span>
                    <strong>{preset.label}</strong><small>{preset.rows} × {preset.columns} · {preset.rows * preset.columns} pieces</small><em>{preset.description}</em>
                  </button>
                ))}
                <button className={`custom-difficulty ${props.difficulty === "custom" ? "selected" : ""}`} onClick={() => props.onDifficultyChange("custom")}>
                  <span className="difficulty-icon level-custom"><Sparkles size={19} /></span>
                  <strong>Custom</strong><small>2 × 2 up to 12 × 12</small><em>Make it your own</em>
                </button>
              </div>
              {props.difficulty === "custom" && <CustomSettingsPanel settings={props.settings} onChange={props.onSettingsChange} error={props.customError} />}
            </section>
          </div>

          <aside className="summary-card">
            <span className="summary-label">Your puzzle</span>
            <div className="summary-image"><img src={props.image.url} alt="" /><span>{grid.rows * grid.columns}<small>pieces</small></span></div>
            <h3>{props.image.name}</h3>
            <dl>
              <div><dt>Challenge</dt><dd>{selectedPreset?.label ?? "Custom"}</dd></div>
              <div><dt>Grid</dt><dd>{grid.rows} × {grid.columns}</dd></div>
              <div><dt>Timer</dt><dd>{props.difficulty === "custom" && props.settings.timer.mode === "countdown" ? `${props.settings.timer.minutes}m ${props.settings.timer.seconds}s` : "Relaxed"}</dd></div>
              <div><dt>Puzzle pal</dt><dd>{props.avatar === "cat" ? "Milo" : "Poppy"}</dd></div>
            </dl>
            <button className="primary-button summary-start" onClick={props.onStart} disabled={Boolean(props.customError)}>
              Start puzzle <ArrowRight size={19} />
            </button>
            <p><ImagePlus size={14} /> Ready when you are!</p>
          </aside>
        </div>
      </div>
    </main>
  );
}
