import * as C from "./constants";
import type { FathomState, Predator } from "./game";
import {
  atCenter,
  distance,
  move,
  open,
  opposite,
  refresh,
  route,
  sameTile,
  wander,
} from "./world";
import { acquire, blinded, cast, gateExit, lineOfSight } from "./sensing";

export const down = (n: number, dt = C.TICK_DT) =>
  Math.max(0, n - dt < 1e-10 ? 0 : n - dt);
function patrol(p: Predator) {
  p.state = "wander";
  p.fix = null;
  p.linger = 0;
  if (p.kind === "flarefish") {
    p.flareIn = C.FLARE_INTERVAL;
    p.flareCharging = false;
    p.flaring = false;
    p.flareRadius = 0;
    p.flareTime = 0;
  }
}
function ping(
  s: FathomState,
  p: Predator,
  i: number,
  tint: "violet" | "orange",
  cues: Set<C.CueName>,
) {
  cast(s, "gloamfin", i, tint);
  p.pingIn = C.GLOAMFIN_PING_INTERVAL;
  p.pingGap = 0;
  cues.add(C.CUES.predatorPing);
}
function soundMind(
  s: FathomState,
  p: Predator,
  i: number,
  cues: Set<C.CueName>,
) {
  const lock = distance(p, s.forager) <= C.GLOAMFIN_HEAR;
  const previous = p.hearingLock;
  p.hearingLock = lock;
  p.pingIn = down(p.pingIn);
  p.pingGap += C.TICK_DT;
  if (lock) acquire(s, p, !previous);
  if (!lock && previous) p.pingIn = 0;
  if (
    p.state === "chase" &&
    p.fix &&
    sameTile(p, p.fix) &&
    atCenter(p) &&
    !sameTile(p, s.forager)
  ) {
    p.state = "search";
    p.searchTime = 0;
    p.searchPing = false;
  }
  if (p.state === "search") {
    p.searchTime += C.TICK_DT;
    if (p.searchTime >= C.GLOAMFIN_GIVEUP) {
      patrol(p);
    }
  }
  const orange =
    p.state === "search" &&
    !p.searchPing &&
    p.searchTime >= C.GLOAMFIN_SEARCH_DELAY;
  if (
    !lock &&
    p.pingGap + 1e-9 >= C.GLOAMFIN_PING_MIN_GAP &&
    (orange || p.pingIn === 0)
  ) {
    ping(s, p, i, orange ? "orange" : "violet", cues);
    if (orange) p.searchPing = true;
  }
  if (p.state === "chase")
    p.chaseSpeed = Math.min(
      C.GLOAMFIN_CHASE_SPEED,
      p.chaseSpeed +
        (C.TICK_DT * (C.GLOAMFIN_CHASE_SPEED - C.GLOAMFIN_CORNER_SPEED)) /
          C.GLOAMFIN_RAMP_TIME,
    );
}
function lightMind(s: FathomState, p: Predator, cues: Set<C.CueName>) {
  const blind = blinded(s, p);
  if (blind && p.state === "chase") patrol(p);
  const sensed =
    !blind &&
    distance(p, s.forager) <= (p.detectRange ?? 0) &&
    lineOfSight(s, p, s.forager);
  const bloomLock =
    !blind && p.flaring && distance(p, s.forager) <= C.FLARE_RADIUS;
  if (sensed || bloomLock) {
    acquire(s, p, p.state !== "chase");
    return;
  }
  if (p.state === "chase") {
    p.linger = down(p.linger);
    if (p.linger === 0) patrol(p);
    return;
  }
  if (p.kind !== "flarefish") return;
  if (p.flareCharging) {
    p.flareTime = down(p.flareTime);
    if (p.flareTime === 0) {
      p.flareCharging = false;
      p.flaring = true;
      p.flareRadius = C.FLARE_RADIUS;
      p.flareTime = C.FLARE_BLOOM;
      cues.add(C.CUES.flare);
      if (!blind && distance(p, s.forager) <= C.FLARE_RADIUS) acquire(s, p);
    }
  } else if (p.flaring) {
    p.flareTime = down(p.flareTime);
    if (p.flareTime === 0) {
      p.flaring = false;
      p.flareRadius = 0;
      p.fade = 0.4;
      p.flareIn = C.FLARE_INTERVAL;
    }
  } else {
    p.flareIn = down(p.flareIn);
    if (p.flareIn === 0) {
      p.flareCharging = true;
      p.flareTime = C.FLARE_CHARGE;
    }
  }
}
export function hunters(s: FathomState, cues: Set<C.CueName>) {
  const exit = gateExit(s),
    hasDen = s.tiles.some((r) => r.includes("d"));
  for (let i = 0; i < s.predators.length; i++) {
    const p = s.predators[i];
    if (!p.mind) continue;
    p.fade = down(p.fade);
    if (
      p.slot !== null &&
      !p.released &&
      s.playTime + 1e-9 >= p.slot * C.DEN_RELEASE_GAP
    )
      p.released = true;
    if (p.state === "den") {
      p.lit = false;
      if (!hasDen || !exit || !p.released || !p.travel) continue;
      move(s, p, p.speed, () => route(s, p, exit, true), true);
      if (open(s, p.tx, p.ty)) p.state = "wander";
      continue;
    }
    if (p.kind === "gloamfin") soundMind(s, p, i, cues);
    else lightMind(s, p, cues);
    refresh(s);
    if (!p.travel) continue;
    const choose = () => {
      if (p.state === "chase" && p.fix) return route(s, p, p.fix);
      if (
        p.state === "search" &&
        p.fix &&
        Math.abs(p.tx - p.fix.tx) + Math.abs(p.ty - p.fix.ty) >=
          C.GLOAMFIN_SEARCH_ROAM
      )
        return route(s, p, p.fix);
      return wander(s, p);
    };
    // Reverse a chase immediately when its shortest route goes back down this corridor.
    if (!atCenter(p) && p.state === "chase" && p.fix && !sameTile(p, p.fix)) {
      const d = route(s, p, p.fix);
      if (d === opposite(p.dir)) p.dir = d;
    }
    move(s, p, p.speed, choose, false, (old, next) => {
      if (
        p.kind === "gloamfin" &&
        p.state === "chase" &&
        next !== old &&
        next !== opposite(old)
      ) {
        p.chaseSpeed = C.GLOAMFIN_CORNER_SPEED;
        p.speed = p.chaseSpeed;
        return p.speed;
      }
      return undefined;
    });
  }
}
