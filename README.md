# Fathom

**Hunt in the dark.** Fathom is a bioluminescent maze chase: graze plankton, read the corridors with sonar, and escape three predators that hunt by light, sound, and flare. Clear a maze to descend into a deeper one.

This is the **Kindle** dive. Eating widens your circular view. Explored ground stays in memory, but disappears into darkness outside your window. A bright forager sees more and attracts more attention.

## Run

Requires Node.js 22.12 or newer.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. The game runs entirely in the browser and uses no remote services.

## Build

```sh
npm run build
npm run preview
```

Deploy the contents of `dist/` to any static host, at the root or under a sub-path. All assets resolve relative to the page.

## Controls

| Input | Action |
| --- | --- |
| Arrow keys / WASD | Swim; release to stop |
| Space | Sonar pulse |
| Shift | Ink cloud |
| Escape / P | Pause or resume |
| M | Toggle sound |
| Up / Down, Enter / Space | Select and confirm a menu item |
| Pointer / touch | Select and activate menus |
| Backtick | Engine diagnostics |

Touch play uses the engine's four-way pad and two action buttons. Sonar reveals corridors and marks hunters, but the Gloamfin can hear it. Ink blinds the light hunters. Amber lights may be harmless drifters or disguised Lanternjaws. Three reserve lives give you four attempts; catches preserve your score, explored terrain, and eaten plankton.

## Development and checks

```sh
npm run typecheck
npm run lint
npm run format
npm test
```

The Simple 2D engine owns input, rendering cadence, canvas fitting, assets, audio, and diagnostics. The game advances at 120 fixed ticks per second. Simulation and debug transitions copy their read-only input; rendering never advances the world.

`src/game.ts` exports the state types, `game`, and its background color. `world.ts` contains maze topology and movement; `simulation.ts`, `predators.ts`, and `sensing.ts` implement the dive; `render.ts` draws it. The engine exposes the debug API from `engine.debug`. Apply poses using `engine.apply(s => engine.debug.setScreen(s, "playing"))` and read using `engine.debug.snapshot(engine.state)`.

Tests run through the engine with a counted clock and a local canvas, covering maze rules, controls, motion, visibility, predators, progression, and immutable transitions. Store-page screenshots and a recorded dive are in `showcase/`.
