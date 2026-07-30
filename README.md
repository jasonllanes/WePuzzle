# WePuzzle

WePuzzle is a polished, responsive, browser-only jigsaw game built with React, TypeScript, and the Vite-powered vinext runtime. Players can use the included cozy starter image or upload a JPG, PNG, or WebP, choose a puzzle pal, select a preset or custom challenge, and solve real interlocking puzzle shapes with drag, touch/tap, or keyboard controls. Matching pieces snap together and connected groups remain freely draggable.

The game includes an optional Web Audio chiptune and snap sounds, timed praise combos with score multipliers, animated connection effects, a looping pastel background, and a zoomable scrollable play space designed for mobile touch targets.

## Run locally

```bash
npm install
npm run dev
```

For a production build:

```bash
npm run build
npm run start
```

## Project structure

- `src/components` — landing, setup, settings, game, and results interfaces
- `src/utils/imageProcessor.ts` — local file validation and browser image decoding
- `src/utils/puzzleGenerator.ts` — Canvas-based interlocking piece shaping, image clipping, and shuffling
- `src/utils/scoreCalculator.ts` — isolated, typed score formula
- `src/utils/settingsValidator.ts` — custom grid, timer, and hint validation
- `src/hooks/useLocalStorage.ts` — persistent avatar and custom settings
- `src/types.ts` — domain models and discriminated unions
- `public/assets` — WePuzzle logo, hero artwork, and selectable avatars

## TypeScript models

The central models cover `Difficulty`, `CustomDifficultySettings`, `GridSettings`, the stopwatch/countdown `TimerSettings` union, assistance and behavior settings, `PuzzlePiece`, the discriminated `GameStatus`, source-independent `ImageSource`, structured `GameAction`, and `PuzzleResult`.

Custom puzzles support independent row and column counts from 2–12, with a 144-piece maximum. Countdown games must be between 15 seconds and two hours. Hint limits are validated against the current piece count. The latest custom settings are restored from `localStorage`.

## Future backend and multiplayer work

`ImageSource` already separates uploaded, system, and backend images, while the puzzle generator only depends on a URL plus grid settings. A backend gallery can therefore supply another typed image source without changing the puzzle engine. Game operations are also represented by the transport-friendly `GameAction` interface, providing a boundary for future WebSocket rooms, player presence, synchronized placements, and collaborative scoring.

Uploaded images are processed entirely in the browser and are never sent to a server.
