import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import { ConstantClock, createEngine } from "@clockwyrks/simple-2d";
import { game, type FathomState, type ReadState } from "./game";
import * as C from "./constants";
import {
  center,
  directions,
  flood,
  layer,
  initialState,
  neighbor,
  put,
  reconcile,
} from "./world";
import { lineOfSight } from "./sensing";

const cleanups: (() => void)[] = [];
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(new Blob())),
  );
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async () => createCanvas(32, 32)),
  );
});
afterEach(() => {
  cleanups.splice(0).forEach((fn) => fn());
  vi.unstubAllGlobals();
});
async function setup(dt = C.TICK_DT, draw = false) {
  const target = new EventTarget();
  const engine = createEngine({
    canvas: createCanvas(C.STAGE_W, C.STAGE_H) as unknown as HTMLCanvasElement,
    width: C.STAGE_W,
    height: C.STAGE_H,
    game: draw ? game : { ...game, render() {} },
    clock: new ConstantClock(dt * 1000),
    surface: {
      cssWidth: () => C.STAGE_W,
      cssHeight: () => C.STAGE_H,
      dpr: () => 1,
      events: () => target,
    },
    layout: C.LAYOUT,
  });
  cleanups.push(() => engine.destroy());
  await engine.initialize();
  const key = (code: string, type = "keydown") => {
    const e = new Event(type);
    Object.assign(e, { code, repeat: false });
    target.dispatchEvent(e);
  };
  const press = async (code: string) => {
    key(code);
    await engine.advance(1);
    key(code, "keyup");
  };
  const pose = (fn: (s: ReadState) => FathomState) => engine.apply(fn);
  const d = engine.debug;
  const blank = () => {
    pose((s) => d.clearPredators(s));
    pose((s) => d.clearPlankton(s));
    pose((s) => d.setScreen(s, "playing"));
  };
  const fixture = (points: [number, number][]) => {
    const rows = layer("#");
    points.forEach(([x, y]) => put(rows, x, y, "."));
    pose((s) => d.setMaze(s, rows));
  };
  return { engine, d, pose, key, press, blank, fixture, target };
}
function corridor(y = 4, from = 1, to = 20): [number, number][] {
  return Array.from({ length: to - from + 1 }, (_, i) => [from + i, y]);
}

describe("maze invariants", () => {
  it("has connected, symmetric, narrow corridors and an enclosed reachable den", () => {
    const s = reconcile(initialState()),
      reachable = flood(s, 17, 13, false);
    let count = 0,
      total = 0;
    const twos = new Set<number>();
    for (let y = 0; y < C.GRID_ROWS; y++)
      for (let x = 0; x < C.GRID_COLS; x++) {
        const t = s.tiles[y][x],
          mirror = s.tiles[y][C.GRID_COLS - 1 - x];
        if (!"dg".includes(t) && !"dg".includes(mirror)) expect(t).toBe(mirror);
        if (t === ".") {
          count++;
          expect(reachable[y * C.GRID_COLS + x]).toBeGreaterThanOrEqual(0);
          const degree = directions.filter((d) => neighbor(s, x, y, d)).length;
          expect(degree).toBeGreaterThanOrEqual(2);
          total += degree;
          if (degree === 2) twos.add(y * C.GRID_COLS + x);
          expect(
            t +
              s.tiles[y]?.[x + 1] +
              s.tiles[y + 1]?.[x] +
              s.tiles[y + 1]?.[x + 1],
          ).not.toBe("....");
        }
        if (t === "d")
          expect(directions.filter((d) => neighbor(s, x, y, d))).toHaveLength(
            0,
          );
      }
    const runs: number[] = [];
    while (twos.size) {
      const queue = [twos.values().next().value!];
      twos.delete(queue[0]);
      for (let i = 0; i < queue.length; i++) {
        const id = queue[i];
        for (const dir of directions) {
          const n = neighbor(
            s,
            id % C.GRID_COLS,
            Math.floor(id / C.GRID_COLS),
            dir,
          );
          if (n && twos.delete(n.ty * C.GRID_COLS + n.tx))
            queue.push(n.ty * C.GRID_COLS + n.tx);
        }
      }
      runs.push(queue.length);
    }
    expect(total / count).toBeGreaterThanOrEqual(C.MAZE_OPENNESS_MIN);
    expect(total / count).toBeLessThanOrEqual(C.MAZE_OPENNESS_MAX);
    expect(
      count / ((C.GRID_COLS - 2) * (C.GRID_ROWS - 2)),
    ).toBeGreaterThanOrEqual(C.MAZE_DENSITY_MIN);
    const mean = runs.reduce((a, b) => a + b, 0) / runs.length;
    expect(mean).toBeGreaterThanOrEqual(C.MAZE_MAZING_MIN);
    expect(mean).toBeLessThanOrEqual(C.MAZE_MAZING_MAX);
    expect(flood(s, 17, 13)[8 * C.GRID_COLS + 17]).toBeGreaterThan(0);
    expect(
      s.tiles.filter((r) => r[0] === "." && r[C.GRID_COLS - 1] === "."),
    ).toHaveLength(1);
  });
});

describe("engine and menus", () => {
  it("initializes every resource and diagnostic, and renders without changing state", async () => {
    const { engine, d } = await setup(C.TICK_DT, true);
    expect(engine.state.screen).toBe("title");
    expect(engine.state.planktonRemaining).toBeGreaterThan(200);
    expect(globalThis.fetch).toHaveBeenCalledTimes(75);
    const before = d.snapshot(engine.state);
    await engine.advance(1);
    expect({ ...d.snapshot(engine.state), simTime: 0 }).toEqual(before);
    expect(engine.diagnostics().every((r) => !r.error)).toBe(true);
  });
  it("remembers title choice and resumes once per Escape", async () => {
    const { engine, press } = await setup();
    await press("ArrowDown");
    await press("Enter");
    expect(engine.state.screen).toBe("howto");
    await press("Escape");
    expect(engine.state.menuIndex).toBe(1);
    await press("ArrowUp");
    await press("Enter");
    expect(engine.state.screen).toBe("countdown");
    await engine.advance(240);
    expect(engine.state.screen).toBe("playing");
    await press("Escape");
    expect(engine.state.screen).toBe("paused");
    const t = engine.state.playTime;
    await engine.advance(100);
    expect(engine.state.playTime).toBe(t);
    await press("Escape");
    expect(engine.state.screen).toBe("playing");
  });
  it("pointer confirmation requires both edges in the same region", async () => {
    const { engine, d, target } = await setup();
    const pointer = (type: string, x: number, y: number) => {
      const e = new Event(type);
      Object.assign(e, {
        clientX: x,
        clientY: y,
        pointerId: 1,
        pointerType: "mouse",
        isPrimary: true,
        button: 0,
        buttons: type === "pointerup" ? 0 : 1,
      });
      target.dispatchEvent(e);
    };
    const a = d.menuItemRect(engine.state, 0)!,
      b = d.menuItemRect(engine.state, 1)!;
    pointer("pointerdown", a.x + 10, a.y + 10);
    pointer("pointerup", b.x + 10, b.y + 10);
    await engine.advance(1);
    expect(engine.state.screen).toBe("title");
    pointer("pointerdown", b.x + 10, b.y + 10);
    pointer("pointerup", b.x + 10, b.y + 10);
    await engine.advance(1);
    expect(engine.state.screen).toBe("howto");
    pointer("pointerdown", 100, 100);
    pointer("pointerup", 100, 100);
    await engine.advance(1);
    expect(engine.state.screen).toBe("title");
  });
  it("muting persists across reset and cues are still emitted", async () => {
    const { engine, press, blank, pose, d } = await setup();
    await press("KeyM");
    expect(engine.state.muted).toBe(true);
    pose((s) => d.reset(s));
    expect(engine.state.muted).toBe(true);
    blank();
    const cues: string[] = [];
    engine.events.on("cue:played", (e) => {
      cues.push(e.cue);
      expect(e.gain).toBe(0);
    });
    await press("Space");
    expect(cues).toContain(C.CUES.sonar);
  });
  it("reconcile is pure, idempotent and does not relight cleared fog", async () => {
    const { engine, pose, d } = await setup();
    pose((s) => d.clearFog(s));
    pose((s) => d.setBrightness(s, 1));
    const before = d.snapshot(engine.state);
    pose((s) => d.reconcile(s));
    pose((s) => d.reconcile(s));
    expect(d.snapshot(engine.state)).toEqual(before);
    expect(engine.state.visibility.join("")).toMatch(/^u+$/);
    expect(engine.state.windowRadius).toBe(
      C.KINDLE_VISION_MIN + C.KINDLE_VISION_GAIN,
    );
  });
  it("rejects invalid poses loudly", async () => {
    const { engine, d } = await setup();
    const s = engine.state;
    expect(() => d.setBrightness(s, 2)).toThrow();
    expect(() => d.setDepth(s, 0)).toThrow();
    expect(() => d.setPredatorMind(s, 8, false)).toThrow();
    expect(() => d.setMaze(s, ["."])).toThrow();
    expect(() => d.setForagerTile(s, 0, 0)).toThrow();
    expect(() => d.setMenuIndex(s, 5)).toThrow();
    expect(() => d.setBrightHold(s, 2)).toThrow();
    expect(() => d.setDrifterIn(s, 26)).toThrow();
    expect(() => d.setLives(s, 0.5)).toThrow();
  });
});

describe("movement and fixed ticks", () => {
  it("holds speed, reverses between centers and stops on release", async () => {
    const { engine, d, pose, blank, fixture, key } = await setup();
    blank();
    fixture(corridor());
    pose((s) => d.setForagerTile(s, 5, 4));
    key("ArrowRight");
    await engine.advance(15);
    expect(engine.state.forager.x).toBeCloseTo(center(5, 4).x + 16);
    key("ArrowRight", "keyup");
    key("ArrowLeft");
    await engine.advance(5);
    expect(engine.state.forager.x).toBeCloseTo(
      center(5, 4).x + 16 - C.FORAGER_SPEED * 5 * C.TICK_DT,
    );
    key("ArrowLeft", "keyup");
    const x = engine.state.forager.x;
    await engine.advance(30);
    expect(engine.state.forager.x).toBe(x);
  });
  it("buffers perpendicular turns until a tile center", async () => {
    const { engine, d, pose, blank, fixture, key } = await setup();
    blank();
    fixture([...corridor(), [6, 3], [6, 2]]);
    pose((s) => d.setForagerTile(s, 5, 4));
    key("ArrowRight");
    await engine.advance(10);
    key("ArrowUp");
    await engine.advance(30);
    expect(engine.state.forager.x).toBeCloseTo(center(6, 4).x);
    expect(engine.state.forager.y).toBeLessThan(center(6, 4).y);
  });
  it("wraps continuously in one tile of travel", async () => {
    const { engine, d, pose, blank, fixture, key } = await setup();
    blank();
    fixture(corridor(4, 0, 35));
    pose((s) => d.setForagerTile(s, 0, 4));
    key("ArrowLeft");
    await engine.advance(20);
    expect(engine.state.forager.x).toBeCloseTo(
      C.GRID_ORIGIN_X +
        C.GRID_COLS * C.TILE +
        16 -
        C.FORAGER_SPEED * 20 * C.TICK_DT,
    );
    await engine.advance(10);
    expect(engine.state.forager.x).toBeCloseTo(center(35, 4).x);
  });
  it("produces the same state for differently partitioned frames", async () => {
    const a = await setup(1 / 60),
      b = await setup(1 / 120);
    for (const h of [a, b]) {
      h.blank();
      h.fixture(corridor());
      h.pose((s) => h.d.setForagerTile(s, 3, 4));
      h.key("ArrowRight");
    }
    await a.engine.advance(60);
    await b.engine.advance(120);
    expect(a.d.snapshot(a.engine.state)).toEqual(b.d.snapshot(b.engine.state));
  });
  it("holds an isolated body and respects a fixture that closes its tile", async () => {
    const { engine, d, pose, blank, fixture, key } = await setup();
    blank();
    fixture([[4, 4]]);
    pose((s) => d.setForagerTile(s, 4, 4));
    key("ArrowRight");
    await engine.advance(20);
    expect(engine.state.forager.moving).toBe(false);
    fixture([[8, 8]]);
    await engine.advance(20);
    expect(engine.state.forager.tx).toBe(4);
  });
});

describe("light, sonar and ink", () => {
  it("holds brightness then halves on the specified curve", async () => {
    const { engine, d, pose, blank } = await setup();
    blank();
    pose((s) => d.setBrightness(s, 1));
    pose((s) => d.setBrightHold(s, C.BRIGHT_HOLD));
    await engine.advance(120);
    expect(engine.state.brightness).toBeCloseTo(1);
    await engine.advance(108);
    expect(engine.state.brightness).toBeCloseTo(0.5);
  });
  it("reveals the first rock but not the water behind it", async () => {
    const { engine, d, pose, blank, fixture } = await setup();
    blank();
    fixture([
      [4, 4],
      [6, 4],
    ]);
    pose((s) => d.setForagerTile(s, 4, 4));
    await engine.advance(1);
    expect(engine.state.visibility[4][5]).toBe("l");
    expect(engine.state.visibility[4][6]).toBe("u");
    expect(lineOfSight(engine.state, center(4, 4), center(6, 4))).toBe(false);
  });
  it("sonar follows corners over time and never reveals disconnected ground", async () => {
    const { engine, d, pose, blank, fixture, press } = await setup();
    blank();
    fixture([...corridor(4, 3, 8), [8, 5], [8, 6], [8, 7], [10, 7]]);
    pose((s) => d.setForagerTile(s, 3, 4));
    await press("Space");
    expect(engine.state.visibility[7][8]).toBe("u");
    await engine.advance(69);
    expect(engine.state.visibility[7][8]).toBe("l");
    expect(engine.state.visibility[7][10]).toBe("u");
    expect(engine.state.pulses[0]?.front).toBeCloseTo(
      70 * C.TICK_DT * C.SONAR_WAVE_SPEED,
    );
  });
  it("keeps explored ground remembered beyond the outer circle", async () => {
    const { engine, d, pose, blank, fixture } = await setup();
    blank();
    fixture(corridor(4, 1, 34));
    pose((s) => d.setForagerTile(s, 3, 4));
    await engine.advance(1);
    pose((s) => d.setForagerTile(s, 30, 4));
    await engine.advance(1);
    expect(engine.state.visibility[4][3]).toBe("r");
  });
  it("sonar marks sound hunters but not amber bodies", async () => {
    const { engine, d, pose, blank, fixture, press } = await setup();
    blank();
    fixture(corridor());
    pose((s) => d.setForagerTile(s, 2, 4));
    for (const kind of ["gloamfin", "lanternjaw"] as const) {
      pose((s) => d.addPredator(s, kind, 8, 4));
      pose((s) => d.setPredatorMind(s, s.predators.length - 1, false));
    }
    await press("Space");
    await engine.advance(53);
    expect(engine.state.predators[0].lit).toBe(true);
    expect(engine.state.predators[1].lit).toBe(false);
  });
  it("ink drops a light fix immediately but does not silence hearing", async () => {
    const { engine, d, pose, blank, fixture, press } = await setup();
    blank();
    fixture(corridor());
    pose((s) => d.setForagerTile(s, 5, 4));
    for (const kind of ["lanternjaw", "gloamfin"] as const) {
      pose((s) => d.addPredator(s, kind, 7, 4));
      pose((s) => d.setPredatorTravel(s, s.predators.length - 1, false));
    }
    await engine.advance(1);
    expect(engine.state.predators.every((p) => p.state === "chase")).toBe(true);
    await press("ShiftLeft");
    expect(engine.state.predators[0].state).toBe("wander");
    expect(engine.state.predators[1].hearingLock).toBe(true);
    expect(engine.state.inkClouds[0].radius).toBe(C.INK_RADIUS);
  });
});

describe("predators and progression", () => {
  it("releases on live time and travel-off holds the den", async () => {
    const { engine, d, pose } = await setup();
    pose((s) => d.clearPlankton(s));
    for (let i = 0; i < 3; i++) pose((s) => d.setPredatorTravel(s, i, false));
    pose((s) => d.setScreen(s, "countdown"));
    await engine.advance(240);
    expect(engine.state.predators.every((p) => !p.released)).toBe(true);
    await engine.advance(1);
    expect(engine.state.predators[0].released).toBe(true);
    await engine.advance(600);
    expect(engine.state.predators[1].released).toBe(true);
    expect(engine.state.predators[1].state).toBe("den");
  });
  it("uses the depth roster and sonar floor without changing speed", async () => {
    const { engine, d, pose } = await setup();
    for (let depth = 1; depth <= 7; depth++) {
      pose((s) => d.setDepth(s, depth));
      expect(engine.state.predators).toHaveLength(Math.min(6, depth + 2));
      expect(engine.state.sonar.range).toBe(Math.max(5, 10 - depth));
    }
  });
  it("mind-off freezes decisions while travel-off still senses", async () => {
    const { engine, d, pose, blank, fixture } = await setup();
    blank();
    fixture(corridor());
    pose((s) => d.setForagerTile(s, 5, 4));
    pose((s) => d.addPredator(s, "lanternjaw", 7, 4));
    pose((s) => d.setPredatorMind(s, 0, false));
    await engine.advance(10);
    expect(engine.state.predators[0].state).toBe("wander");
    pose((s) => d.setPredatorMind(s, 0, true));
    pose((s) => d.setPredatorTravel(s, 0, false));
    await engine.advance(1);
    expect(engine.state.predators[0].state).toBe("chase");
    expect(engine.state.predators[0].tx).toBe(7);
  });
  it("a light hunter holds a lost fix for two seconds", async () => {
    const { engine, d, pose, blank, fixture } = await setup();
    blank();
    fixture([...corridor(4, 1, 30), [5, 5], [5, 6], [5, 7]]);
    pose((s) => d.setForagerTile(s, 5, 4));
    pose((s) => d.addPredator(s, "lanternjaw", 8, 4));
    pose((s) => d.setPredatorTravel(s, 0, false));
    await engine.advance(1);
    pose((s) => d.setForagerTile(s, 5, 7));
    await engine.advance(239);
    expect(engine.state.predators[0].state).toBe("chase");
    await engine.advance(1);
    expect(engine.state.predators[0].state).toBe("wander");
  });
  it("a flare charges, reveals through rock, and expires", async () => {
    const { engine, d, pose, blank, fixture } = await setup();
    blank();
    fixture([
      [2, 2],
      [20, 10],
      [23, 10],
    ]);
    pose((s) => d.setForagerTile(s, 2, 2));
    pose((s) => d.addPredator(s, "flarefish", 20, 10));
    pose((s) => d.setPredatorTravel(s, 0, false));
    await engine.advance(840);
    expect(engine.state.predators[0].flareCharging).toBe(true);
    await engine.advance(60);
    expect(engine.state.predators[0].flaring).toBe(true);
    expect(engine.state.visibility[10][23]).toBe("l");
    await engine.advance(120);
    expect(engine.state.predators[0].flaring).toBe(false);
    expect(engine.state.visibility[10][23]).toBe("r");
  });
  it("a gloamfin ping reveals nothing and acquires only on arrival", async () => {
    const { engine, d, pose, blank, fixture } = await setup();
    blank();
    fixture(corridor(4, 1, 30));
    pose((s) => d.setForagerTile(s, 9, 4));
    pose((s) => d.addPredator(s, "gloamfin", 2, 4));
    pose((s) => d.setPredatorTravel(s, 0, false));
    await engine.advance(480);
    expect(engine.state.pulses[0].tint).toBe("violet");
    expect(engine.state.predators[0].state).toBe("wander");
    expect(engine.state.visibility[4][2]).toBe("u");
    await engine.advance(60);
    expect(engine.state.predators[0].state).toBe("chase");
    expect(engine.state.predators[0].alert).toBe(true);
  });
  it("eats a drifter and restarts the admission cadence", async () => {
    const { engine, d, pose, blank } = await setup();
    blank();
    pose((s) => d.setPlankton(s, 1, 1, true));
    pose((s) => d.setDrifterIn(s, 0));
    await engine.advance(1);
    expect(engine.state.drifters).toHaveLength(1);
    pose((s) => d.setForagerTile(s, s.drifters[0].tx, s.drifters[0].ty));
    await engine.advance(1);
    expect(engine.state.score).toBe(C.SCORE_DRIFTER);
  });
  it("losing a life preserves food, fog and score; zero reserves ends the run", async () => {
    const { engine, d, pose, blank } = await setup();
    blank();
    pose((s) => d.setScore(s, 100));
    await engine.advance(1);
    const fog = engine.state.visibility.join("");
    pose((s) => d.addPredator(s, "lanternjaw", s.forager.tx, s.forager.ty));
    pose((s) => d.setPredatorMind(s, 0, false));
    await engine.advance(1);
    expect(engine.state.screen).toBe("countdown");
    expect(engine.state.lives).toBe(2);
    expect(engine.state.score).toBe(100);
    expect(engine.state.planktonRemaining).toBe(0);
    expect(engine.state.visibility.join("")).toBe(fog);
    pose((s) => d.setScreen(s, "playing"));
    pose((s) => d.setLives(s, 0));
    pose((s) => d.addPredator(s, "gloamfin", s.forager.tx, s.forager.ty));
    await engine.advance(1);
    expect(engine.state.screen).toBe("gameover");
  });
  it("only eating the final plankton clears and descends with score and lives intact", async () => {
    const { engine, d, pose, blank } = await setup();
    blank();
    await engine.advance(10);
    expect(engine.state.screen).toBe("playing");
    pose((s) => d.setPlankton(s, s.forager.tx, s.forager.ty, true));
    await engine.advance(1);
    expect(engine.state.screen).toBe("cleared");
    expect(engine.state.score).toBe(C.SCORE_PLANKTON + C.SCORE_CLEAR);
    await engine.advance(240);
    expect(engine.state.depth).toBe(2);
    expect(engine.state.screen).toBe("countdown");
    expect(engine.state.lives).toBe(C.START_LIVES);
  });
});

describe("hunting routes and effect boundaries", () => {
  it("paths around rock on a shortest route to a posed fix", async () => {
    const { engine, d, pose, blank, fixture } = await setup();
    blank();
    fixture([
      [3, 3],
      [3, 4],
      [3, 5],
      [4, 5],
      [5, 5],
      [5, 4],
      [5, 3],
    ]);
    pose((s) => d.setForagerTile(s, 5, 3));
    pose((s) => d.addPredator(s, "lanternjaw", 3, 3));
    pose((s) => d.setPredatorState(s, 0, "chase"));
    await engine.advance(30);
    expect(engine.state.predators[0].y).toBeGreaterThan(center(3, 3).y);
    expect(engine.state.predators[0].x).toBeCloseTo(center(3, 3).x);
    expect(
      engine.state.tiles[engine.state.predators[0].ty][
        engine.state.predators[0].tx
      ],
    ).toBe(".");
  });
  it("drops a Gloamfin below player speed at a corner and ramps back up", async () => {
    const { engine, d, pose, blank, fixture } = await setup();
    blank();
    fixture([...corridor(4, 3, 15), [3, 3], [3, 2]]);
    pose((s) => d.setForagerTile(s, 15, 4));
    pose((s) => d.addPredator(s, "gloamfin", 3, 4));
    pose((s) => d.setPredatorDir(s, 0, "down"));
    pose((s) => d.setPredatorState(s, 0, "chase"));
    await engine.advance(1);
    expect(engine.state.predators[0].speed).toBe(C.GLOAMFIN_CORNER_SPEED);
    await engine.advance(120);
    expect(engine.state.predators[0].speed).toBeCloseTo(
      (C.GLOAMFIN_CORNER_SPEED + C.GLOAMFIN_CHASE_SPEED) / 2,
      1,
    );
  });
  it("searches a stale sound fix and emits one orange ping", async () => {
    const { engine, d, pose, blank, fixture } = await setup();
    blank();
    fixture(corridor(4, 1, 34));
    pose((s) => d.setForagerTile(s, 8, 4));
    pose((s) => d.addPredator(s, "gloamfin", 8, 4));
    pose((s) => d.setPredatorState(s, 0, "chase"));
    pose((s) => d.setPredatorTravel(s, 0, false));
    pose((s) => d.setForagerTile(s, 30, 4));
    await engine.advance(1);
    expect(engine.state.predators[0].state).toBe("search");
    await engine.advance(145);
    expect(engine.state.pulses.some((p) => p.tint === "orange")).toBe(true);
    await engine.advance(455);
    expect(engine.state.predators[0].state).toBe("wander");
  });
  it("acquires a flare lock through rock after the bloom has begun", async () => {
    const { engine, d, pose, blank, fixture } = await setup();
    blank();
    fixture([
      [2, 2],
      [20, 10],
      [23, 10],
    ]);
    pose((s) => d.setForagerTile(s, 2, 2));
    pose((s) => d.addPredator(s, "flarefish", 20, 10));
    pose((s) => d.setPredatorTravel(s, 0, false));
    await engine.advance(915);
    expect(engine.state.predators[0].flaring).toBe(true);
    pose((s) => d.setForagerTile(s, 23, 10));
    await engine.advance(1);
    expect(engine.state.predators[0].state).toBe("chase");
    expect(engine.state.predators[0].alert).toBe(true);
    expect(engine.state.predators[0].flaring).toBe(false);
  });
  it("never puts the forager in the den and lets hunters cross its gate", async () => {
    const { engine, d, pose, blank, key } = await setup();
    blank();
    pose((s) => d.setForagerTile(s, 17, 5));
    key("ArrowDown");
    await engine.advance(60);
    expect(engine.state.forager.ty).toBe(5);
    key("ArrowDown", "keyup");
    pose((s) => d.setForagerTile(s, 1, 16));
    pose((s) => d.setDepth(s, 1));
    await engine.advance(200);
    expect(engine.state.predators[0].state).not.toBe("den");
  });
  it("accepts denless fixtures and freezes den occupants out of contact", async () => {
    const { engine, d, pose, fixture } = await setup();
    fixture([[16, 8]]);
    pose((s) => d.setForagerTile(s, 16, 8));
    pose((s) => d.clearPlankton(s));
    pose((s) => d.setScreen(s, "playing"));
    await engine.advance(100);
    expect(engine.state.lives).toBe(C.START_LIVES);
    expect(engine.state.predators[0].state).toBe("den");
    expect(engine.state.predators[0].lit).toBe(false);
  });
  it("carries fractional ticks and holds cooldowns while paused", async () => {
    const { engine, d, pose, blank } = await setup(C.TICK_DT / 3);
    blank();
    pose((s) => d.setInkCooldown(s, 2));
    await engine.advance(2);
    expect(engine.state.simTime).toBe(0);
    await engine.advance(1);
    expect(engine.state.simTime).toBeCloseTo(C.TICK_DT);
    pose((s) => d.setScreen(s, "paused"));
    const cooldown = engine.state.ink.cooldown;
    await engine.advance(300);
    expect(engine.state.ink.cooldown).toBe(cooldown);
    expect(engine.state.simTime).toBeGreaterThan(0.8);
  });
  it("does not mutate prior state values when stepping or posing", async () => {
    const { engine, d, pose, blank, key } = await setup();
    blank();
    const old = engine.state;
    const before = d.snapshot(old);
    pose((s) => d.setBrightness(s, 1));
    key("ArrowLeft");
    await engine.advance(30);
    expect(d.snapshot(old)).toEqual(before);
  });
  it("renders all screens and freezes the paused drawing", async () => {
    const { engine, d, pose, press } = await setup(C.TICK_DT, true);
    for (const screen of [
      "howto",
      "countdown",
      "playing",
      "paused",
      "cleared",
      "gameover",
    ] as const) {
      pose((s) => d.setScreen(s, screen));
      await engine.advance(1);
    }
    pose((s) => d.setScreen(s, "gameover"));
    await press("Enter");
    expect(engine.state.screen).toBe("countdown");
  });
});
