import type { Game } from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
import * as C from "./constants";
import { initialState, reconcile } from "./world";
import { debugApi } from "./debug";
import { update } from "./simulation";
import { render } from "./render";

export type Direction = "up" | "down" | "left" | "right";
export type Screen =
  | "title"
  | "howto"
  | "countdown"
  | "playing"
  | "paused"
  | "cleared"
  | "gameover";
export type PredatorKind = C.PredatorKind;
export interface Body {
  x: number;
  y: number;
  tx: number;
  ty: number;
  dir: Direction;
}
export interface Forager extends Body {
  moving: boolean;
}
export interface Drifter extends Body {
  lit: boolean;
  mind: boolean;
  travel: boolean;
}
export interface Predator extends Drifter {
  kind: PredatorKind;
  state: "den" | "wander" | "chase" | "search";
  released: boolean;
  speed: number;
  alert: boolean;
  detectRange: number | null;
  hearingRange: number | null;
  hearingLock: boolean | null;
  flareCharging: boolean | null;
  flaring: boolean | null;
  flareRadius: number | null;
  fix: { tx: number; ty: number } | null;
  linger: number;
  alertLeft: number;
  mark: number;
  pingIn: number;
  pingGap: number;
  searchTime: number;
  searchPing: boolean;
  flareIn: number;
  flareTime: number;
  fade: number;
  chaseSpeed: number;
  slot: number | null;
}
export interface Pulse {
  source: "forager" | "gloamfin";
  tint: "cyan" | "violet" | "orange";
  ox: number;
  oy: number;
  front: number;
  range: number;
  owner: number | null;
  caught: boolean;
  distances: number[];
}
export interface InkCloud {
  x: number;
  y: number;
  radius: number;
  remaining: number;
}
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface FathomState {
  version: number;
  screen: Screen;
  menuIndex: number | null;
  titleIndex: number;
  depth: number;
  score: number;
  lives: number;
  muted: boolean;
  planktonRemaining: number;
  drifterIn: number;
  brightness: number;
  brightHold: number;
  visionRadius: number;
  windowRadius: number;
  sonar: { ready: boolean; cooldown: number; range: number };
  ink: { ready: boolean; cooldown: number };
  grid: {
    cols: number;
    rows: number;
    tile: number;
    originX: number;
    originY: number;
  };
  tiles: string[];
  plankton: string[];
  visibility: string[];
  forager: Forager;
  drifters: Drifter[];
  predators: Predator[];
  pulses: Pulse[];
  inkClouds: InkCloud[];
  simTime: number;
  remainder: number;
  screenTime: number;
  playTime: number;
  desired: Direction;
  held: Direction[];
  pending: C.ActionName[];
  pointerStarts: Record<number, number>;
  rng: number;
  start: { tx: number; ty: number };
  marks: number[];
  art: Record<string, ImageBitmap[]>;
}
export type FathomSnapshot = Pick<
  FathomState,
  | "version"
  | "screen"
  | "menuIndex"
  | "titleIndex"
  | "depth"
  | "score"
  | "lives"
  | "muted"
  | "planktonRemaining"
  | "drifterIn"
  | "brightness"
  | "brightHold"
  | "visionRadius"
  | "windowRadius"
  | "sonar"
  | "ink"
  | "grid"
  | "tiles"
  | "plankton"
  | "visibility"
  | "forager"
  | "inkClouds"
  | "simTime"
> & {
  drifters: Pick<
    Drifter,
    "x" | "y" | "tx" | "ty" | "lit" | "mind" | "travel"
  >[];
  predators: Pick<
    Predator,
    | "kind"
    | "x"
    | "y"
    | "tx"
    | "ty"
    | "dir"
    | "state"
    | "released"
    | "mind"
    | "travel"
    | "speed"
    | "alert"
    | "lit"
    | "detectRange"
    | "hearingRange"
    | "hearingLock"
    | "flareCharging"
    | "flaring"
    | "flareRadius"
  >[];
  pulses: Pick<Pulse, "source" | "tint" | "ox" | "oy" | "front" | "range">[];
};
export type ReadState = DeepReadonly<FathomState>;
export interface FathomDebugApi {
  version: number;
  reset(s: ReadState): FathomState;
  snapshot(s: ReadState): FathomSnapshot;
  reconcile(s: ReadState): FathomState;
  setScreen(s: ReadState, screen: Screen): FathomState;
  setMenuIndex(s: ReadState, index: number): FathomState;
  setTitleIndex(s: ReadState, index: number): FathomState;
  menuItemRect(s: ReadState, index: number): Rect | null;
  setScore(s: ReadState, points: number): FathomState;
  setLives(s: ReadState, lives: number): FathomState;
  setDepth(s: ReadState, depth: number): FathomState;
  setMaze(s: ReadState, rows: readonly string[]): FathomState;
  setPlankton(
    s: ReadState,
    tx: number,
    ty: number,
    present: boolean,
  ): FathomState;
  clearPlankton(s: ReadState): FathomState;
  clearFog(s: ReadState): FathomState;
  setForagerTile(s: ReadState, tx: number, ty: number): FathomState;
  setForagerDir(s: ReadState, dir: Direction): FathomState;
  setBrightness(s: ReadState, g: number): FathomState;
  setBrightHold(s: ReadState, seconds: number): FathomState;
  clearPredators(s: ReadState): FathomState;
  addPredator(
    s: ReadState,
    kind: PredatorKind,
    tx: number,
    ty: number,
  ): FathomState;
  setPredatorTile(
    s: ReadState,
    index: number,
    tx: number,
    ty: number,
  ): FathomState;
  setPredatorDir(s: ReadState, index: number, dir: Direction): FathomState;
  setPredatorState(
    s: ReadState,
    index: number,
    state: "den" | "wander" | "chase",
  ): FathomState;
  setPredatorReleased(s: ReadState, index: number, value: boolean): FathomState;
  setPredatorMind(s: ReadState, index: number, value: boolean): FathomState;
  setPredatorTravel(s: ReadState, index: number, value: boolean): FathomState;
  spawnDrifter(s: ReadState, tx: number, ty: number): FathomState;
  clearDrifters(s: ReadState): FathomState;
  setDrifterMind(s: ReadState, index: number, value: boolean): FathomState;
  setDrifterTravel(s: ReadState, index: number, value: boolean): FathomState;
  setDrifterIn(s: ReadState, seconds: number): FathomState;
  setSonarCooldown(s: ReadState, seconds: number): FathomState;
  setInkCooldown(s: ReadState, seconds: number): FathomState;
}
export const BACKGROUND = "#03060c";
export const game: Game<FathomState, FathomDebugApi> = {
  async initialize(api) {
    for (const action of C.ACTIONS)
      api.input.register(action, { keys: [...C.BINDINGS[action]] });
    Object.values(C.CUES).forEach((cue, i) =>
      api.audio.define(cue, {
        freq: [690, 930, 110, 360, 180, 220, 420][i],
        freqTo: [940, 170, 45, 740, 1050, 55, 840][i],
        durationMs: [60, 340, 260, 230, 450, 500, 620][i],
        gain: 0.12,
        wave: i === 2 || i === 5 ? "triangle" : "sine",
      }),
    );
    const s = initialState();
    await Promise.all(
      Object.entries({
        glimmerfin: 8,
        lanternjaw: 16,
        gloamfin: 8,
        flarefish: 8,
        drifter: 8,
        "flare-bloom": 8,
        "trench-walls": 19,
      }).map(async ([sheet, count]) => {
        s.art[sheet] = await Promise.all(
          Array.from({ length: count }, (_, i) =>
            api.assets.loadImage(`${sheet}/${i}.png`),
          ),
        );
      }),
    );
    for (const key of [
      "screen",
      "depth",
      "score",
      "lives",
      "brightness",
      "visionRadius",
      "windowRadius",
      "planktonRemaining",
    ] as const)
      api.diagnostics.register(key, (s) => s[key]);
    api.diagnostics.register("sonar cooldown", (s) => s.sonar.cooldown);
    api.diagnostics.register("ink cooldown", (s) => s.ink.cooldown);
    api.diagnostics.register(
      "forager",
      (s) => `${s.forager.tx},${s.forager.ty} ${s.forager.dir}`,
    );
    for (let i = 0; i < C.DEN_ORDER.length * C.ROSTER_CAP; i++)
      api.diagnostics.register(`predator ${i}`, (s) => {
        const p = s.predators[i];
        return p
          ? `${p.kind} ${p.state} ${p.tx},${p.ty} ${p.speed.toFixed(1)} alert:${p.alert}`
          : "none";
      });
    return [reconcile(s), debugApi];
  },
  update,
  render,
};
