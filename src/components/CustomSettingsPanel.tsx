import { RotateCw, Timer, WandSparkles } from "lucide-react";
import type { CustomDifficultySettings } from "../types";
import { DEFAULT_CUSTOM_SETTINGS } from "../data";

interface CustomSettingsPanelProps {
  settings: CustomDifficultySettings;
  onChange: (settings: CustomDifficultySettings) => void;
  error: string | null;
}

export function CustomSettingsPanel({ settings, onChange, error }: CustomSettingsPanelProps) {
  const patch = <K extends keyof CustomDifficultySettings>(
    key: K,
    value: CustomDifficultySettings[K],
  ) => onChange({ ...settings, [key]: value });

  return (
    <div className="custom-panel">
      <div className="custom-panel-heading">
        <div><span className="icon-tile purple"><WandSparkles size={20} /></span><div><h3>Make it your own</h3><p>Fine-tune every part of your puzzle.</p></div></div>
        <button className="text-button" onClick={() => onChange(DEFAULT_CUSTOM_SETTINGS)}>Reset defaults</button>
      </div>

      <div className="setting-section">
        <div className="setting-title"><span>01</span><div><h4>Puzzle grid</h4><p>Mix rows and columns for rectangular puzzles.</p></div></div>
        <div className="number-row">
          <label>Rows<input type="number" min={2} max={12} value={settings.grid.rows} onChange={(event) => patch("grid", { ...settings.grid, rows: Number(event.target.value) })} /></label>
          <span>×</span>
          <label>Columns<input type="number" min={2} max={12} value={settings.grid.columns} onChange={(event) => patch("grid", { ...settings.grid, columns: Number(event.target.value) })} /></label>
          <div className="piece-total"><strong>{settings.grid.rows * settings.grid.columns}</strong><small>pieces</small></div>
        </div>
      </div>

      <div className="setting-section">
        <div className="setting-title"><span>02</span><div><h4>Timer</h4><p>Relax with a stopwatch or race the clock.</p></div></div>
        <div className="segmented">
          <button className={settings.timer.mode === "stopwatch" ? "active" : ""} onClick={() => patch("timer", { mode: "stopwatch" })}><Timer size={17} /> Stopwatch</button>
          <button className={settings.timer.mode === "countdown" ? "active" : ""} onClick={() => patch("timer", { mode: "countdown", minutes: 5, seconds: 0 })}><Timer size={17} /> Countdown</button>
        </div>
        {settings.timer.mode === "countdown" && (
          <div className="number-row compact">
            <label>Minutes<input type="number" min={0} max={120} value={settings.timer.minutes} onChange={(event) => patch("timer", { mode: "countdown", minutes: Number(event.target.value), seconds: settings.timer.mode === "countdown" ? settings.timer.seconds : 0 })} /></label>
            <label>Seconds<input type="number" min={0} max={59} value={settings.timer.seconds} onChange={(event) => patch("timer", { mode: "countdown", minutes: settings.timer.mode === "countdown" ? settings.timer.minutes : 0, seconds: Number(event.target.value) })} /></label>
          </div>
        )}
      </div>

      <div className="setting-columns">
        <div className="setting-section">
          <div className="setting-title"><span>03</span><div><h4>Helpful tools</h4><p>Choose how much help you want.</p></div></div>
          <label className="select-label">Reference image
            <select value={settings.assistance.reference} onChange={(event) => patch("assistance", { ...settings.assistance, reference: event.target.value as CustomDifficultySettings["assistance"]["reference"] })}>
              <option value="always">Always visible</option><option value="toggle">Toggle during play</option><option value="disabled">Disabled</option>
            </select>
          </label>
          <Toggle label="Hint button" checked={settings.assistance.hintsEnabled} onChange={(checked) => patch("assistance", { ...settings.assistance, hintsEnabled: checked })} />
          {settings.assistance.hintsEnabled && <label className="range-label">Maximum hints <strong>{settings.assistance.maxHints}</strong><input type="range" min={0} max={10} value={settings.assistance.maxHints} onChange={(event) => patch("assistance", { ...settings.assistance, maxHints: Number(event.target.value) })} /></label>}
          <Toggle label="Highlight correct pieces" checked={settings.assistance.highlightCorrect} onChange={(checked) => patch("assistance", { ...settings.assistance, highlightCorrect: checked })} />
          <Toggle label="Lock correct pieces" checked={settings.assistance.lockCorrect} onChange={(checked) => patch("assistance", { ...settings.assistance, lockCorrect: checked })} />
          <Toggle label="Show grid lines" checked={settings.assistance.showGridLines} onChange={(checked) => patch("assistance", { ...settings.assistance, showGridLines: checked })} />
        </div>

        <div className="setting-section">
          <div className="setting-title"><span>04</span><div><h4>Puzzle behavior</h4><p>Add an extra twist to the challenge.</p></div></div>
          <label className="select-label">Shuffle intensity
            <select value={settings.behavior.shuffle} onChange={(event) => patch("behavior", { ...settings.behavior, shuffle: event.target.value as CustomDifficultySettings["behavior"]["shuffle"] })}>
              <option value="light">Light</option><option value="normal">Normal</option><option value="strong">Strong</option>
            </select>
          </label>
          <label className="select-label">Snap tolerance
            <select value={settings.behavior.snap} onChange={(event) => patch("behavior", { ...settings.behavior, snap: event.target.value as CustomDifficultySettings["behavior"]["snap"] })}>
              <option value="strict">Strict</option><option value="normal">Normal</option><option value="forgiving">Forgiving</option>
            </select>
          </label>
          <Toggle label="Piece rotation" icon={<RotateCw size={15} />} checked={settings.behavior.rotation} onChange={(checked) => patch("behavior", { ...settings.behavior, rotation: checked })} />
          <Toggle label="Allow incorrect placements" checked={settings.behavior.allowIncorrect} onChange={(checked) => patch("behavior", { ...settings.behavior, allowIncorrect: checked })} />
        </div>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <p className="save-note">Custom settings save automatically on this device.</p>
    </div>
  );
}

interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  icon?: React.ReactNode;
}

function Toggle({ label, checked, onChange, icon }: ToggleProps) {
  return (
    <label className="toggle-row">
      <span>{icon}{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <i aria-hidden="true" />
    </label>
  );
}
