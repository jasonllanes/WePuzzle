"use client";

import { useEffect, useMemo, useState } from "react";
import { DIFFICULTIES, DEFAULT_CUSTOM_SETTINGS } from "./data";
import { useLocalStorage } from "./hooks/useLocalStorage";
import type { Avatar, Difficulty, ImageSource } from "./types";
import { validateCustomSettings } from "./utils/settingsValidator";
import { LandingPage } from "./components/LandingPage";
import { SetupScreen } from "./components/SetupScreen";
import { GameScreen } from "./components/GameScreen";
import { LeaderboardScreen } from "./components/LeaderboardScreen";
import { MultiplayerLobby } from "./components/MultiplayerLobby";
import type { MultiplayerRoomSession } from "./services/multiplayerService";

type AppView = "landing" | "setup" | "game" | "leaderboard" | "multiplayer";

const defaultImage: ImageSource = {
  kind: "system",
  id: "cozy-pets",
  name: "Cozy puzzle night",
  url: "/assets/hero-pets.png",
};

function App() {
  const [view, setView] = useState<AppView>("landing");
  const [avatar, setAvatar] = useLocalStorage<Avatar>("wepuzzle-avatar", "cat");
  const [playerName, setPlayerName] = useLocalStorage("wepuzzle-player-name", "Puzzle Pal");
  const [customSettings, setCustomSettings] = useLocalStorage("wepuzzle-custom-settings", DEFAULT_CUSTOM_SETTINGS);
  const [multiplayerRoom, setMultiplayerRoom] = useState<MultiplayerRoomSession | null>(null);
  const [invitedRoomCode, setInvitedRoomCode] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [image, setImage] = useState<ImageSource>(defaultImage);
  const customError = useMemo(() => validateCustomSettings(customSettings), [customSettings]);
  const preset = DIFFICULTIES.find((item) => item.id === difficulty);
  const grid = preset
    ? { rows: preset.rows, columns: preset.columns }
    : customSettings.grid;

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("room")?.trim().toUpperCase() ?? "";
    if (/^[A-Z2-9]{6}$/.test(code)) {
      setInvitedRoomCode(code);
      setView("multiplayer");
    }
  }, []);

  if (view === "landing") {
    return (
      <LandingPage
        avatar={avatar}
        onAvatarChange={setAvatar}
        onCreate={() => setView("setup")}
        onLeaderboard={() => setView("leaderboard")}
        onMultiplayer={() => setView("multiplayer")}
      />
    );
  }

  if (view === "leaderboard") {
    return <LeaderboardScreen onBack={() => setView("landing")} onPlay={() => setView("setup")} />;
  }

  if (view === "multiplayer") {
    return (
      <MultiplayerLobby
        avatar={avatar}
        playerName={playerName}
        onPlayerNameChange={setPlayerName}
        onAvatarChange={setAvatar}
        initialRoomCode={invitedRoomCode}
        onBack={() => {
          setInvitedRoomCode("");
          const cleanUrl = new URL(window.location.href);
          cleanUrl.searchParams.delete("room");
          window.history.replaceState({}, "", cleanUrl);
          setView("landing");
        }}
        onEnterRoom={(room) => {
          setMultiplayerRoom(room);
          setImage(defaultImage);
          setDifficulty("medium");
          setView("game");
        }}
      />
    );
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
      playerName={playerName}
      multiplayerRoom={multiplayerRoom}
      onLeaderboard={() => setView("leaderboard")}
      onChangeSettings={() => {
        setMultiplayerRoom(null);
        setView(multiplayerRoom ? "multiplayer" : "setup");
      }}
    />
  );
}

export default App;
