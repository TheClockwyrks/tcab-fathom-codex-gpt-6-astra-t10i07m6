import * as C from "./constants";
import type {
  Body,
  Direction,
  Drifter,
  FathomState,
  Predator,
  PredatorKind,
  ReadState,
  Screen,
} from "./game";

export const directions: Direction[] = ["up", "right", "down", "left"];
export const vectors: Record<Direction, [number, number]> = {
  up: [0, -1],
  right: [1, 0],
  down: [0, 1],
  left: [-1, 0],
};
export const opposite = (d: Direction): Direction =>
  directions[(directions.indexOf(d) + 2) % 4];
export const center = (tx: number, ty: number) => ({
  x: C.GRID_ORIGIN_X + (tx + 0.5) * C.TILE,
  y: C.GRID_ORIGIN_Y + (ty + 0.5) * C.TILE,
  tx,
  ty,
});
export function tileOf(b: { x: number; y: number }) {
  return {
    tx: Math.floor((b.x - C.GRID_ORIGIN_X) / C.TILE),
    ty: Math.floor((b.y - C.GRID_ORIGIN_Y) / C.TILE),
  };
}
export const layer = (char: string) =>
  Array<string>(C.GRID_ROWS).fill(char.repeat(C.GRID_COLS));
export function put(rows: string[], x: number, y: number, char: string) {
  rows[y] = rows[y].slice(0, x) + char + rows[y].slice(x + 1);
}
export function maze(): string[] {
  const rows = layer("#");
  for (let y = 1; y < C.GRID_ROWS - 1; y++)
    for (let x = 1; x < C.GRID_COLS - 1; x++) {
      if (
        [1, 5, 9, 13, 22, 26, 30, 34].includes(x) ||
        ([1, 3, 5, 7, 9, 11, 13, 16].includes(y) &&
          (![7, 9].includes(y) || x <= 13 || x >= 22))
      )
        put(rows, x, y, ".");
    }
  for (let y = 7; y <= 9; y++)
    for (let x = 16; x <= 19; x++) put(rows, x, y, "d");
  put(rows, 17, 6, "g");
  put(rows, 0, 9, ".");
  put(rows, 35, 9, ".");
  return rows;
}
export function drifter(tx: number, ty: number): Drifter {
  return { ...center(tx, ty), dir: "up", lit: false, mind: true, travel: true };
}
export function predator(kind: PredatorKind, tx: number, ty: number): Predator {
  return {
    ...drifter(tx, ty),
    kind,
    state: "wander",
    released: true,
    speed: C.PREDATOR_SPEED,
    alert: false,
    detectRange: kind === "gloamfin" ? null : C.LANTERN_RANGE_BASE,
    hearingRange: kind === "gloamfin" ? C.GLOAMFIN_HEAR : null,
    hearingLock: kind === "gloamfin" ? false : null,
    flareCharging: kind === "flarefish" ? false : null,
    flaring: kind === "flarefish" ? false : null,
    flareRadius: kind === "flarefish" ? 0 : null,
    fix: null,
    linger: 0,
    alertLeft: 0,
    mark: 0,
    pingIn: C.GLOAMFIN_PING_INTERVAL,
    pingGap: C.GLOAMFIN_PING_MIN_GAP,
    searchTime: 0,
    searchPing: false,
    flareIn: C.FLARE_INTERVAL,
    flareTime: 0,
    fade: 0,
    chaseSpeed: C.GLOAMFIN_CHASE_SPEED,
    slot: null,
  };
}
export function roster(depth: number): Predator[] {
  const kinds = [
    ...C.DEN_ORDER,
    ...C.ROSTER_ADD_ORDER.slice(0, Math.min(depth, C.ROSTER_CAP_DEPTH) - 1),
  ];
  return kinds.map((kind, i) => ({
    ...predator(kind, 16 + (i % 4), 8 + Math.floor(i / 4)),
    state: "den",
    released: false,
    slot: i,
  }));
}
export function initialState(): FathomState {
  const tiles = maze();
  return {
    version: C.FATHOM_DEBUG_VERSION,
    screen: "title",
    menuIndex: 0,
    titleIndex: 0,
    depth: 1,
    score: 0,
    lives: C.START_LIVES,
    muted: false,
    planktonRemaining: 0,
    drifterIn: C.DRIFTER_INTERVAL,
    brightness: 0,
    brightHold: 0,
    visionRadius: C.VISION_MIN,
    windowRadius: C.KINDLE_VISION_MIN,
    sonar: { ready: true, cooldown: 0, range: C.SONAR_RANGE_BASE },
    ink: { ready: true, cooldown: 0 },
    grid: {
      cols: C.GRID_COLS,
      rows: C.GRID_ROWS,
      tile: C.TILE,
      originX: C.GRID_ORIGIN_X,
      originY: C.GRID_ORIGIN_Y,
    },
    tiles,
    plankton: tiles.map((row) => row.replace(/[^.]/g, "-").replace(/\./g, "*")),
    visibility: layer("u"),
    forager: { ...center(17, 13), dir: "left", moving: false },
    predators: roster(1),
    drifters: [],
    pulses: [],
    inkClouds: [],
    simTime: 0,
    remainder: 0,
    screenTime: 0,
    playTime: 0,
    desired: "left",
    held: [],
    pending: [],
    pointerStarts: {},
    rng: 0xface123,
    start: { tx: 17, ty: 13 },
    marks: Array<number>(C.GRID_COLS * C.GRID_ROWS).fill(0),
    art: {},
  };
}
/** Copy all mutable simulation data; decoded images are immutable engine resources. */
export function copy(s: ReadState): FathomState {
  return {
    ...s,
    grid: { ...s.grid },
    sonar: { ...s.sonar },
    ink: { ...s.ink },
    tiles: [...s.tiles],
    plankton: [...s.plankton],
    visibility: [...s.visibility],
    forager: { ...s.forager },
    predators: s.predators.map((p) => ({
      ...p,
      fix: p.fix ? { ...p.fix } : null,
    })),
    drifters: s.drifters.map((d) => ({ ...d })),
    pulses: s.pulses.map((p) => ({ ...p, distances: [...p.distances] })),
    inkClouds: s.inkClouds.map((c) => ({ ...c })),
    held: [...s.held],
    pending: [...s.pending],
    pointerStarts: { ...s.pointerStarts },
    start: { ...s.start },
    marks: [...s.marks],
    art: Object.fromEntries(Object.entries(s.art).map(([k, v]) => [k, [...v]])),
  };
}
export function refresh(s: FathomState): FathomState {
  for (const b of [s.forager, ...s.predators, ...s.drifters])
    Object.assign(b, tileOf(b));
  s.visionRadius = C.VISION_MIN + C.VISION_GAIN * s.brightness;
  s.windowRadius = C.KINDLE_VISION_MIN + C.KINDLE_VISION_GAIN * s.brightness;
  s.sonar.range = Math.max(
    C.SONAR_RANGE_MIN,
    C.SONAR_RANGE_BASE - (s.depth - 1),
  );
  s.sonar.ready = s.sonar.cooldown === 0;
  s.ink.ready = s.ink.cooldown === 0;
  s.planktonRemaining = s.plankton.join("").split("*").length - 1;
  for (const p of s.predators) {
    p.speed =
      p.kind === "lanternjaw" && p.state === "wander"
        ? C.DRIFTER_SPEED
        : p.kind === "gloamfin" && p.state === "chase"
          ? p.chaseSpeed
          : C.PREDATOR_SPEED;
    p.detectRange =
      p.kind === "gloamfin"
        ? null
        : C.LANTERN_RANGE_BASE + C.LANTERN_RANGE_GAIN * s.brightness;
    p.hearingRange = p.kind === "gloamfin" ? C.GLOAMFIN_HEAR : null;
  }
  return s;
}
export const reconcile = (s: ReadState) => refresh(copy(s));
export function enter(s: FathomState, screen: Screen) {
  if (screen === "playing" && s.screen !== "paused") s.playTime = 0;
  s.screen = screen;
  s.screenTime = 0;
  s.pointerStarts = {};
  s.menuIndex =
    screen === "title"
      ? s.titleIndex
      : screen === "paused" || screen === "gameover"
        ? 0
        : null;
}
export function fresh(s: FathomState, screen: Screen, preserveTitle = true) {
  const n = initialState();
  n.art = s.art;
  n.muted = s.muted;
  n.titleIndex = preserveTitle ? s.titleIndex : 0;
  n.simTime = s.simTime;
  n.remainder = s.remainder;
  enter(n, screen);
  return refresh(n);
}
export function open(
  s: ReadState,
  tx: number,
  ty: number,
  den = false,
): boolean {
  const t = s.tiles[ty]?.[tx];
  return t === "." || (den && (t === "d" || t === "g"));
}
export function neighbor(
  s: ReadState,
  tx: number,
  ty: number,
  dir: Direction,
  den = false,
) {
  const [dx, dy] = vectors[dir];
  let x = tx + dx;
  const y = ty + dy;
  const wrap = s.tiles.findIndex(
    (row) => row[0] !== "#" && row[C.GRID_COLS - 1] !== "#",
  );
  if (ty === wrap && (x < 0 || x >= C.GRID_COLS))
    x = (x + C.GRID_COLS) % C.GRID_COLS;
  return open(s, x, y, den) ? { tx: x, ty: y } : null;
}
export const distance = (
  a: { x: number; y: number },
  b: { x: number; y: number },
) => Math.hypot(a.x - b.x, a.y - b.y);
export const sameTile = (
  a: { tx: number; ty: number },
  b: { tx: number; ty: number },
) => a.tx === b.tx && a.ty === b.ty;
export const atCenter = (b: Body) => distance(b, center(b.tx, b.ty)) < 1e-6;
export function flood(
  s: ReadState,
  tx: number,
  ty: number,
  den = true,
): number[] {
  const out = Array<number>(C.GRID_COLS * C.GRID_ROWS).fill(-1);
  if (!open(s, tx, ty, den)) return out;
  const q = [{ tx, ty }];
  out[ty * C.GRID_COLS + tx] = 0;
  for (let i = 0; i < q.length; i++) {
    const b = q[i];
    for (const dir of directions) {
      const n = neighbor(s, b.tx, b.ty, dir, den);
      if (n && out[n.ty * C.GRID_COLS + n.tx] < 0) {
        out[n.ty * C.GRID_COLS + n.tx] = out[b.ty * C.GRID_COLS + b.tx] + 1;
        q.push(n);
      }
    }
  }
  return out;
}
export function route(
  s: ReadState,
  b: Body,
  target: { tx: number; ty: number },
  den = false,
): Direction | null {
  if (sameTile(b, target) && atCenter(b)) return null;
  const distances = flood(s, target.tx, target.ty, den);
  let best = Infinity;
  let result: Direction | null = null;
  for (const d of directions) {
    const n = neighbor(s, b.tx, b.ty, d, den);
    if (n) {
      const cost = distances[n.ty * C.GRID_COLS + n.tx];
      if (cost >= 0 && cost < best) {
        best = cost;
        result = d;
      }
    }
  }
  return result;
}
export function random(s: FathomState): number {
  s.rng = (Math.imul(s.rng, 1664525) + 1013904223) >>> 0;
  return s.rng / 4294967296;
}
export function wander(s: FathomState, b: Body, den = false): Direction | null {
  const opts = directions.filter((d) => neighbor(s, b.tx, b.ty, d, den));
  const forward = opts.filter((d) => d !== opposite(b.dir));
  const choices = forward.length ? forward : opts;
  return choices.length
    ? choices[Math.floor(random(s) * choices.length)]
    : null;
}
/** Center-to-center integration, including residual distance across the wrap seam. */
export function move(
  s: FathomState,
  b: Body,
  speed: number,
  choose: () => Direction | null,
  den = false,
  onTurn?: (old: Direction, next: Direction) => number | void,
): boolean {
  if (!open(s, b.tx, b.ty, den)) return false;
  let left = speed * C.TICK_DT;
  let moved = false;
  while (left > 1e-8) {
    if (atCenter(b)) {
      const d = choose();
      if (!d || !neighbor(s, b.tx, b.ty, d, den)) break;
      const nextSpeed = onTurn?.(b.dir, d);
      if (nextSpeed !== undefined) {
        left *= nextSpeed / speed;
        speed = nextSpeed;
      }
      b.dir = d;
    }
    const [dx, dy] = vectors[b.dir];
    const axis = dx ? b.x : b.y;
    const origin = dx ? C.GRID_ORIGIN_X : C.GRID_ORIGIN_Y;
    const sign = dx || dy;
    const u = (axis - origin - C.TILE / 2) / C.TILE;
    const next = sign > 0 ? Math.floor(u + 1e-8) + 1 : Math.ceil(u - 1e-8) - 1;
    const span = Math.abs(origin + C.TILE / 2 + next * C.TILE - axis);
    const step = Math.min(left, span);
    b.x += dx * step;
    b.y += dy * step;
    left -= step;
    moved = true;
    const width = C.GRID_COLS * C.TILE;
    if (b.x < C.GRID_ORIGIN_X) b.x += width;
    if (b.x >= C.GRID_ORIGIN_X + width) b.x -= width;
    Object.assign(b, tileOf(b));
  }
  return moved;
}
