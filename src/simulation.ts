import type { UpdateApi } from "@clockwyrks/simple-2d";
import * as C from "./constants";
import type { FathomState, ReadState } from "./game";
import { items, menuItemRect } from "./debug";
import {
  center,
  copy,
  directions,
  drifter,
  enter,
  fresh,
  move,
  neighbor,
  opposite,
  put,
  refresh,
  roster,
  sameTile,
  wander,
} from "./world";
import { advancePulses, cast, gateExit, illuminate } from "./sensing";
import { down, hunters } from "./predators";

function activate(s: FathomState): FathomState {
  const i = s.menuIndex;
  if (s.screen === "title") {
    s.titleIndex = i ?? 0;
    return i === 0 ? fresh(s, "countdown") : (enter(s, "howto"), s);
  }
  if (s.screen === "paused") {
    if (i === 0) {
      enter(s, "playing");
      return s;
    }
    return fresh(s, i === 1 ? "countdown" : "title");
  }
  if (s.screen === "gameover") return fresh(s, i === 0 ? "countdown" : "title");
  return s;
}
function input(s: FathomState, api: UpdateApi): FathomState {
  const edges = new Set(C.ACTIONS.filter((a) => api.input.pressed(a)));
  if (edges.has("mute")) api.audio.setMuted(!api.audio.muted());
  s.muted = api.audio.muted();
  const held = directions.filter((d) => api.input.value(d) > 0);
  for (const d of held) if (!s.held.includes(d)) s.desired = d;
  s.held = held;
  if (s.screen === "playing") {
    if (edges.has("pause")) {
      enter(s, "paused");
      return s;
    }
    for (const a of ["a", "b"] as const) if (edges.has(a)) s.pending.push(a);
    return s;
  }
  if (s.screen === "paused" && (edges.has("pause") || edges.has("back"))) {
    enter(s, "playing");
    return s;
  }
  let confirmed = edges.has("confirm");
  for (const sample of api.input.pointerSamples()) {
    if (!sample.primary) continue;
    const index = items(s.screen).findIndex((_, i) => {
      const r = menuItemRect(s, i);
      return (
        r &&
        sample.x >= r.x &&
        sample.x <= r.x + r.w &&
        sample.y >= r.y &&
        sample.y <= r.y + r.h
      );
    });
    if (index >= 0) s.menuIndex = index;
    if (sample.type === "down" && sample.button === "primary")
      s.pointerStarts[sample.id] = s.screen === "howto" ? -2 : index;
    if (sample.type === "up" && sample.button === "primary") {
      if (s.screen === "howto" && s.pointerStarts[sample.id] === -2)
        confirmed = true;
      else if (index >= 0 && s.pointerStarts[sample.id] === index)
        confirmed = true;
      delete s.pointerStarts[sample.id];
    }
  }
  if (s.screen === "howto" && (confirmed || edges.has("back")))
    return fresh(s, "title");
  if (s.screen === "gameover" && edges.has("back")) return fresh(s, "title");
  const menu = items(s.screen);
  if (menu.length) {
    if (edges.has("up"))
      s.menuIndex = ((s.menuIndex ?? 0) + menu.length - 1) % menu.length;
    if (edges.has("down")) s.menuIndex = ((s.menuIndex ?? 0) + 1) % menu.length;
    if (confirmed) return activate(s);
  }
  return s;
}
function attempt(s: FathomState) {
  s.forager = { ...center(s.start.tx, s.start.ty), dir: "left", moving: false };
  s.desired = "left";
  s.brightness = 0;
  s.brightHold = 0;
  s.predators = roster(s.depth);
  s.drifters = [];
  s.drifterIn = C.DRIFTER_INTERVAL;
  s.pulses = [];
  s.inkClouds = [];
  s.sonar.cooldown = 0;
  s.ink.cooldown = 0;
  s.marks.fill(0);
  s.pending = [];
  s.playTime = 0;
  enter(s, "countdown");
}
function contact(s: FathomState, cues: Set<C.CueName>): boolean {
  if (!s.predators.some((p) => p.state !== "den" && sameTile(p, s.forager)))
    return false;
  cues.add(C.CUES.caught);
  if (s.lives === 0) enter(s, "gameover");
  else {
    s.lives--;
    attempt(s);
  }
  return true;
}
function eat(s: FathomState, cues: Set<C.CueName>) {
  const f = s.forager;
  if (s.plankton[f.ty]?.[f.tx] === "*" && s.tiles[f.ty]?.[f.tx] === ".") {
    put(s.plankton, f.tx, f.ty, "-");
    s.planktonRemaining--;
    s.score += C.SCORE_PLANKTON;
    s.brightness = Math.min(1, s.brightness + C.BRIGHT_PER_EAT);
    s.brightHold = C.BRIGHT_HOLD;
    cues.add(C.CUES.eat);
    if (s.planktonRemaining === 0) {
      s.score += C.SCORE_CLEAR;
      enter(s, "cleared");
      cues.add(C.CUES.descend);
    }
  }
  s.drifters = s.drifters.filter((d) => {
    if (sameTile(d, f)) {
      s.score += C.SCORE_DRIFTER;
      return false;
    }
    return true;
  });
}
function play(s: FathomState, cues: Set<C.CueName>) {
  s.playTime += C.TICK_DT;
  s.sonar.cooldown = down(s.sonar.cooldown);
  s.ink.cooldown = down(s.ink.cooldown);
  const decay = Math.max(0, C.TICK_DT - s.brightHold);
  s.brightHold = down(s.brightHold);
  s.brightness *= Math.pow(0.5, decay / C.BRIGHT_HALFLIFE);
  s.marks = s.marks.map((v) => down(v));
  s.inkClouds = s.inkClouds
    .map((c) => ({ ...c, remaining: down(c.remaining) }))
    .filter((c) => c.remaining > 0);
  for (const action of s.pending) {
    if (action === "a" && s.sonar.cooldown === 0) {
      cast(s, "forager");
      s.sonar.cooldown = C.SONAR_COOLDOWN;
      cues.add(C.CUES.sonar);
    }
    if (action === "b" && s.ink.cooldown === 0) {
      s.inkClouds.push({
        x: s.forager.x,
        y: s.forager.y,
        radius: C.INK_RADIUS,
        remaining: C.INK_LIFE,
      });
      s.ink.cooldown = C.INK_COOLDOWN;
      cues.add(C.CUES.ink);
    }
  }
  s.pending = [];
  if (contact(s, cues)) return;
  const f = s.forager;
  if (s.held.length) {
    if (s.desired === opposite(f.dir)) f.dir = s.desired;
    f.moving = move(s, f, C.FORAGER_SPEED, () =>
      neighbor(s, f.tx, f.ty, s.desired)
        ? s.desired
        : neighbor(s, f.tx, f.ty, f.dir)
          ? f.dir
          : null,
    );
  } else f.moving = false;
  eat(s, cues);
  if (s.screen !== "playing") return;
  // Age existing reveals before a wavefront creates a new full-length mark.
  for (const p of s.predators) {
    p.mark = down(p.mark);
    if (p.mind) {
      p.alertLeft = down(p.alertLeft);
      p.alert = p.kind !== "lanternjaw" && p.alertLeft > 0;
    }
  }
  refresh(s);
  advancePulses(s);
  hunters(s, cues);
  for (const d of s.drifters)
    if (d.mind && d.travel) move(s, d, C.DRIFTER_SPEED, () => wander(s, d));
  s.drifters = s.drifters.filter((d) => {
    if (sameTile(d, f)) {
      s.score += C.SCORE_DRIFTER;
      return false;
    }
    return true;
  });
  s.drifterIn = down(s.drifterIn);
  if (
    s.drifterIn === 0 &&
    s.planktonRemaining > 0 &&
    s.drifters.length < C.DRIFTER_MAX
  ) {
    const exit = gateExit(s);
    if (exit) {
      s.drifters.push(drifter(exit.tx, exit.ty));
      s.drifterIn = C.DRIFTER_INTERVAL;
    }
  }
  contact(s, cues);
  refresh(s);
  illuminate(s);
}
export function update(
  state: ReadState,
  api: UpdateApi,
  dt: number,
): FathomState {
  let s = input(copy(state), api);
  s.remainder += dt;
  while (s.remainder + 1e-10 >= C.TICK_DT) {
    s.remainder = Math.max(0, s.remainder - C.TICK_DT);
    s.simTime += C.TICK_DT;
    s.screenTime += C.TICK_DT;
    const cues = new Set<C.CueName>();
    if (s.screen === "playing") play(s, cues);
    else if (s.screen === "countdown") {
      illuminate(s);
      if (s.screenTime + 1e-9 >= 2) enter(s, "playing");
    } else if (s.screen === "cleared" && s.screenTime + 1e-9 >= 2) {
      const depth = s.depth + 1,
        score = s.score,
        lives = s.lives;
      s = fresh(s, "countdown");
      s.depth = depth;
      s.score = score;
      s.lives = lives;
      s.predators = roster(depth);
    }
    for (const cue of cues) api.audio.play(cue);
  }
  return refresh(s);
}
