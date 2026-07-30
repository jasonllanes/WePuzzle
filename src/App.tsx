import { useMemo, useState } from "react";
import { DIFFICULTIES, DEFAULT_CUSTOM_SETTINGS } from "./data";
import { useLocalStorage } from "./hooks/useLocalStorage";
import type { Avatar, Difficulty, ImageSource } from "./types";
import { validateCustomSettings } from "./utils/settingsValidator";
import { LandingPage } from "./components/LandingPage";
import { SetupScreen } from "./components/SetupScreen";
import { GameScreen } from "./components/GameScreen";

type AppView = "landing" | "setup" | "game";

const defaultImage: ImageSource = {
  kind: "system",
  id: "cozy-pets",
  name: "Cozy puzzle night",
  url: "/assets/hero-pets.png",
};

function App() {
  const [view, setView] = useState<AppView>("landing");
  const [avatar, setAvatar] = useLocalStorage<Avatar>("wepuzzle-avatar", "cat");
  const [customSettings, setCustomSettings] = useLocalStorage("wepuzzle-custom-settings", DEFAULT_CUSTOM_SETTINGS);
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [image, setImage] = useState<ImageSource>(defaultImage);
  const customError = useMemo(() => validateCustomSettings(customSettings), [customSettings]);
  const preset = DIFFICULTIES.find((item) => item.id === difficulty);
  const grid = preset
    ? { rows: preset.rows, columns: preset.columns }
    : customSettings.grid;

  if (view === "landing") {
    return <LandingPage avatar={avatar} onAvatarChange={setAvatar} onCreate={() => setView("setup")} />;
  }

  if (view === "setup") {
    return (
      <SetupScreen
        avatar={avatar}
        onAvatarChange={setAvatar}
        image={image}
        onImageChange={setImage}
        difficulty={difficulty}
        onDifficultyChange={setDifficulty}
        settings={customSettings}
        onSettingsChange={setCustomSettings}
        customError={difficulty === "custom" ? customError : null}
        onBack={() => setView("landing")}
        onStart={() => { if (!customError || difficulty !== "custom") setView("game"); }}
      />
    );
  }

  return (
    <GameScreen
      avatar={avatar}
      difficulty={difficulty}
      grid={grid}
      timer={difficulty === "custom" ? customSettings.timer : { mode: "stopwatch" }}
      assistance={difficulty === "custom" ? customSettings.assistance : DEFAULT_CUSTOM_SETTINGS.assistance}
      behavior={difficulty === "custom" ? customSettings.behavior : DEFAULT_CUSTOM_SETTINGS.behavior}
      image={image}
      onChangeSettings={() => setView("setup")}
    />
  );
}

export default App;
