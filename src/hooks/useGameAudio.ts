import { useEffect, useRef, useState } from "react";

const melody = [60, 64, 67, 72, 67, 64, 62, 65, 69, 74, 69, 65, 60, 64, 69, 67];
const AUDIO_PREFERENCE_KEY = "wepuzzle-music-enabled";

function readAudioPreference(): boolean {
  if (typeof window === "undefined") return true;
  const stored = window.localStorage.getItem(AUDIO_PREFERENCE_KEY);
  return stored === null ? true : stored === "true";
}

function frequencyForMidi(note: number): number {
  return 440 * 2 ** ((note - 69) / 12);
}

export function useGameAudio() {
  const [enabled, setEnabled] = useState(readAudioPreference);
  const enabledRef = useRef(enabled);
  const contextRef = useRef<AudioContext | null>(null);
  const musicTimerRef = useRef<number | null>(null);
  const melodyIndexRef = useRef(0);

  const getContext = () => {
    if (!contextRef.current) {
      contextRef.current = new AudioContext();
    }
    return contextRef.current;
  };

  const playTone = (
    frequency: number,
    duration: number,
    volume: number,
    delay = 0,
    wave: OscillatorType = "triangle",
  ) => {
    if (!enabledRef.current) return;
    const context = getContext();
    const start = context.currentTime + delay;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  };

  const stopMusic = () => {
    if (musicTimerRef.current !== null) {
      window.clearInterval(musicTimerRef.current);
      musicTimerRef.current = null;
    }
  };

  const startMusic = () => {
    if (!enabledRef.current || musicTimerRef.current !== null) return;
    const context = getContext();
    void context.resume();
    const playNextNote = () => {
      const note = melody[melodyIndexRef.current % melody.length]!;
      const isAccent = melodyIndexRef.current % 4 === 0;
      playTone(frequencyForMidi(note), 0.28, isAccent ? 0.045 : 0.032);
      if (isAccent) playTone(frequencyForMidi(note - 12), 0.34, 0.018, 0, "sine");
      melodyIndexRef.current += 1;
    };
    playNextNote();
    musicTimerRef.current = window.setInterval(playNextNote, 340);
  };

  const toggleAudio = () => {
    const nextEnabled = !enabledRef.current;
    enabledRef.current = nextEnabled;
    setEnabled(nextEnabled);
    window.localStorage.setItem(AUDIO_PREFERENCE_KEY, String(nextEnabled));
    if (nextEnabled) startMusic();
    else stopMusic();
  };

  const activate = () => {
    if (!enabledRef.current) return;
    void getContext().resume();
    startMusic();
  };

  const playSnap = (multiplier: number) => {
    if (!enabledRef.current) return;
    const root = 72 + Math.min(7, multiplier * 2);
    playTone(frequencyForMidi(root), 0.13, 0.09, 0, "sine");
    playTone(frequencyForMidi(root + 4), 0.16, 0.075, 0.075, "sine");
    playTone(frequencyForMidi(root + 7), 0.2, 0.065, 0.14, "triangle");
  };

  const playComplete = () => {
    if (!enabledRef.current) return;
    [72, 76, 79, 84].forEach((note, index) => {
      playTone(frequencyForMidi(note), 0.42, 0.08, index * 0.1, "triangle");
    });
  };

  useEffect(() => () => {
    stopMusic();
    if (contextRef.current) void contextRef.current.close();
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const beginAfterGesture = () => startMusic();
    window.addEventListener("pointerdown", beginAfterGesture, { once: true });
    window.addEventListener("keydown", beginAfterGesture, { once: true });
    return () => {
      window.removeEventListener("pointerdown", beginAfterGesture);
      window.removeEventListener("keydown", beginAfterGesture);
    };
  // startMusic intentionally reads the latest refs; re-register only when the preference changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  return {
    enabled,
    toggleAudio,
    activate,
    playSnap,
    playComplete,
  };
}
