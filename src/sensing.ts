import * as C from "./constants";
import type { FathomState, Predator, ReadState } from "./game";
import {
  center,
  distance,
  directions,
  flood,
  open,
  put,
  tileOf,
} from "./world";

/** Grid traversal checks every crossed cell; the destination wall may receive light. */
export function lineOfSight(
  s: ReadState,
  a: { x: number; y: number },
  b: { x: number; y: number },
  wallEnd = false,
): boolean {
  const start = tileOf(a),
    end = tileOf(b);
  let x = start.tx,
    y = start.ty;
  const dx = b.x - a.x,
    dy = b.y - a.y,
    sx = Math.sign(dx),
    sy = Math.sign(dy);
  const deltaX = dx === 0 ? Infinity : C.TILE / Math.abs(dx),
    deltaY = dy === 0 ? Infinity : C.TILE / Math.abs(dy);
  let maxX =
    dx === 0
      ? Infinity
      : (C.GRID_ORIGIN_X + (x + (sx > 0 ? 1 : 0)) * C.TILE - a.x) / dx;
  let maxY =
    dy === 0
      ? Infinity
      : (C.GRID_ORIGIN_Y + (y + (sy > 0 ? 1 : 0)) * C.TILE - a.y) / dy;
  for (let i = 0; i < C.GRID_COLS + C.GRID_ROWS + 2; i++) {
    if (x === end.tx && y === end.ty) return wallEnd || s.tiles[y]?.[x] !== "#";
    if (s.tiles[y]?.[x] === "#") return false;
    if (Math.abs(maxX - maxY) < 1e-10) {
      if (s.tiles[y]?.[x + sx] === "#" || s.tiles[y + sy]?.[x] === "#")
        return false;
      x += sx;
      y += sy;
      maxX += deltaX;
      maxY += deltaY;
    } else if (maxX < maxY) {
      x += sx;
      maxX += deltaX;
    } else {
      y += sy;
      maxY += deltaY;
    }
  }
  return false;
}
export function blinded(s: ReadState, p: Predator): boolean {
  const f = s.forager,
    dx = f.x - p.x,
    dy = f.y - p.y,
    length = dx * dx + dy * dy;
  return s.inkClouds.some((c) => {
    const t = length
      ? Math.max(0, Math.min(1, ((c.x - p.x) * dx + (c.y - p.y) * dy) / length))
      : 0;
    return Math.hypot(c.x - p.x - t * dx, c.y - p.y - t * dy) <= c.radius;
  });
}
export function acquire(s: FathomState, p: Predator, fresh = true) {
  if (!p.mind || p.state === "den") return;
  if (fresh && p.kind !== "lanternjaw") {
    p.alertLeft = C.ALERT_TIME;
    p.alert = true;
    p.chaseSpeed = C.GLOAMFIN_CHASE_SPEED;
  }
  p.fix = { tx: s.forager.tx, ty: s.forager.ty };
  p.state = "chase";
  p.linger = C.LINGER_TIME;
  p.searchTime = 0;
  p.searchPing = false;
  if (p.kind === "flarefish") {
    if (p.flaring) p.fade = 0.4;
    p.flaring = false;
    p.flareCharging = false;
    p.flareRadius = 0;
    p.flareTime = 0;
  }
}
export function cast(
  s: FathomState,
  source: "forager" | "gloamfin",
  owner: number | null = null,
  tint: "cyan" | "violet" | "orange" = "cyan",
) {
  const b = owner === null ? s.forager : s.predators[owner];
  s.pulses.push({
    source,
    tint,
    ox: b.tx,
    oy: b.ty,
    front: 0,
    range: source === "forager" ? s.sonar.range : C.GLOAMFIN_PING_RANGE,
    owner,
    caught: false,
    distances: flood(s, b.tx, b.ty),
  });
}
export function advancePulses(s: FathomState) {
  for (const p of s.pulses) {
    if (!p.distances.length) p.distances = flood(s, p.ox, p.oy);
    const prev = p.front;
    p.front += C.SONAR_WAVE_SPEED * C.TICK_DT;
    const arrived = (d: number) =>
      d >= 0 &&
      d <= p.range &&
      d <= p.front + 1e-9 &&
      (d > prev + 1e-9 || (d === 0 && prev === 0));
    if (p.source === "forager") {
      p.distances.forEach((d, i) => {
        if (!arrived(d)) return;
        const x = i % C.GRID_COLS,
          y = Math.floor(i / C.GRID_COLS);
        s.marks[i] = C.SONAR_MARK_TIME;
        put(s.visibility, x, y, "l");
        for (const dir of directions) {
          const [dx, dy] =
            dir === "up"
              ? [0, -1]
              : dir === "right"
                ? [1, 0]
                : dir === "down"
                  ? [0, 1]
                  : [-1, 0];
          if (s.tiles[y + dy]?.[x + dx] === "#") {
            s.marks[(y + dy) * C.GRID_COLS + x + dx] = C.SONAR_MARK_TIME;
            put(s.visibility, x + dx, y + dy, "l");
          }
        }
      });
      for (const hunter of s.predators)
        if (
          hunter.state !== "den" &&
          arrived(p.distances[hunter.ty * C.GRID_COLS + hunter.tx])
        ) {
          if (hunter.kind !== "lanternjaw") hunter.mark = C.SONAR_MARK_TIME;
          if (hunter.kind === "gloamfin") acquire(s, hunter);
        }
    } else if (
      !p.caught &&
      arrived(p.distances[s.forager.ty * C.GRID_COLS + s.forager.tx])
    ) {
      p.caught = true;
      const hunter = p.owner === null ? undefined : s.predators[p.owner];
      if (hunter?.kind === "gloamfin") acquire(s, hunter);
    }
  }
  s.pulses = s.pulses.filter((p) => p.front <= p.range);
}
export function illuminate(s: FathomState) {
  const flares = s.predators.filter((p) => p.flaring && p.state !== "den");
  const flareLit = (b: { x: number; y: number }) =>
    flares.some((p) => distance(p, b) <= C.FLARE_RADIUS);
  const passive = (b: { x: number; y: number }) =>
    distance(s.forager, b) <= s.visionRadius &&
    lineOfSight(s, s.forager, b, true);
  for (let y = 0; y < C.GRID_ROWS; y++) {
    let row = "";
    for (let x = 0; x < C.GRID_COLS; x++) {
      const b = center(x, y);
      const lit = passive(b) || flareLit(b) || s.marks[y * C.GRID_COLS + x] > 0;
      row += lit ? "l" : s.visibility[y][x] === "u" ? "u" : "r";
    }
    s.visibility[y] = row;
  }
  for (const p of s.predators)
    p.lit =
      p.state !== "den" &&
      (passive(center(p.tx, p.ty)) ||
        flareLit(p) ||
        p.alert ||
        (p.kind !== "lanternjaw" && p.mark > 0));
  for (const d of s.drifters)
    d.lit = passive(center(d.tx, d.ty)) || flareLit(d);
}
export function gateExit(s: ReadState): { tx: number; ty: number } | null {
  for (let y = 0; y < C.GRID_ROWS; y++)
    for (let x = 0; x < C.GRID_COLS; x++)
      if (s.tiles[y][x] === "g") {
        for (const [dx, dy] of [
          [0, -1],
          [-1, 0],
          [1, 0],
          [0, 1],
        ])
          if (open(s, x + dx, y + dy)) return { tx: x + dx, ty: y + dy };
      }
  return null;
}
