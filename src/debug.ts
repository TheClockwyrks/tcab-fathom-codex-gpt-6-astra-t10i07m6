import * as C from "./constants";
import type {
  Direction,
  FathomDebugApi,
  FathomState,
  Predator,
  ReadState,
  Screen,
} from "./game";
import {
  center,
  copy,
  directions,
  drifter,
  enter,
  fresh,
  layer,
  open,
  predator,
  put,
  reconcile,
  refresh,
  roster,
} from "./world";

export function items(screen: Screen): readonly string[] {
  return screen === "title"
    ? C.TITLE_ITEMS
    : screen === "paused"
      ? C.PAUSE_ITEMS
      : screen === "gameover"
        ? C.GAMEOVER_ITEMS
        : [];
}
export function menuItemRect(s: ReadState, index: number) {
  if (!Number.isInteger(index) || index < 0 || index >= items(s.screen).length)
    return null;
  return {
    x: 480,
    y: (s.screen === "title" ? 408 : 370) + index * 58,
    w: 320,
    h: 46,
  };
}
function requireValue(ok: boolean): asserts ok {
  if (!ok) throw new RangeError("Fathom: invalid debug pose");
}
function number(n: number, min = 0, max = Infinity, integer = false) {
  requireValue(
    Number.isFinite(n) &&
      n >= min &&
      n <= max &&
      (!integer || Number.isInteger(n)),
  );
}
function tile(s: ReadState, x: number, y: number, den = false) {
  number(x, 0, C.GRID_COLS - 1, true);
  number(y, 0, C.GRID_ROWS - 1, true);
  requireValue(open(s, x, y, den));
}
function dir(d: Direction) {
  requireValue(directions.includes(d));
}
function pose(s: ReadState, fn: (n: FathomState) => void) {
  const n = copy(s);
  fn(n);
  return refresh(n);
}
function hunter(
  s: ReadState,
  i: number,
  fn: (p: Predator, n: FathomState) => void,
) {
  number(i, 0, s.predators.length - 1, true);
  return pose(s, (n) => fn(n.predators[i], n));
}
function bool(v: boolean) {
  requireValue(typeof v === "boolean");
}
export const debugApi: FathomDebugApi = {
  version: C.FATHOM_DEBUG_VERSION,
  reset: (s) => {
    const n = fresh(copy(s), "title", false);
    n.simTime = 0;
    n.remainder = 0;
    return n;
  },
  snapshot: (s) => {
    const n = reconcile(s);
    return {
      version: n.version,
      screen: n.screen,
      menuIndex: n.menuIndex,
      titleIndex: n.titleIndex,
      depth: n.depth,
      score: n.score,
      lives: n.lives,
      muted: n.muted,
      planktonRemaining: n.planktonRemaining,
      drifterIn: n.drifterIn,
      brightness: n.brightness,
      brightHold: n.brightHold,
      visionRadius: n.visionRadius,
      windowRadius: n.windowRadius,
      sonar: n.sonar,
      ink: n.ink,
      grid: n.grid,
      tiles: n.tiles,
      plankton: n.plankton,
      visibility: n.visibility,
      forager: n.forager,
      drifters: n.drifters.map((d) => ({
        x: d.x,
        y: d.y,
        tx: d.tx,
        ty: d.ty,
        lit: d.lit,
        mind: d.mind,
        travel: d.travel,
      })),
      predators: n.predators.map((p) => ({
        kind: p.kind,
        x: p.x,
        y: p.y,
        tx: p.tx,
        ty: p.ty,
        dir: p.dir,
        state: p.state,
        released: p.released,
        mind: p.mind,
        travel: p.travel,
        speed: p.speed,
        alert: p.alert,
        lit: p.lit,
        detectRange: p.detectRange,
        hearingRange: p.hearingRange,
        hearingLock: p.hearingLock,
        flareCharging: p.flareCharging,
        flaring: p.flaring,
        flareRadius: p.flareRadius,
      })),
      pulses: n.pulses.map((p) => ({
        source: p.source,
        tint: p.tint,
        ox: p.ox,
        oy: p.oy,
        front: p.front,
        range: p.range,
      })),
      inkClouds: n.inkClouds,
      simTime: n.simTime,
    };
  },
  reconcile,
  setScreen: (s, screen) => {
    requireValue(
      [
        "title",
        "howto",
        "countdown",
        "playing",
        "paused",
        "cleared",
        "gameover",
      ].includes(screen),
    );
    return pose(s, (n) => enter(n, screen));
  },
  setMenuIndex: (s, i) => {
    number(i, 0, items(s.screen).length - 1, true);
    return pose(s, (n) => {
      n.menuIndex = i;
    });
  },
  setTitleIndex: (s, i) => {
    number(i, 0, C.TITLE_ITEMS.length - 1, true);
    return pose(s, (n) => {
      n.titleIndex = i;
    });
  },
  menuItemRect,
  setScore: (s, v) => {
    number(v, 0, Infinity, true);
    return pose(s, (n) => {
      n.score = v;
    });
  },
  setLives: (s, v) => {
    number(v, 0, Infinity, true);
    return pose(s, (n) => {
      n.lives = v;
    });
  },
  setDepth: (s, v) => {
    number(v, 1, Infinity, true);
    return pose(s, (n) => {
      n.depth = v;
      n.predators = roster(v);
      n.playTime = 0;
    });
  },
  setMaze: (s, rows) => {
    requireValue(
      rows.length === C.GRID_ROWS &&
        rows.every((r) => r.length === C.GRID_COLS && /^[#.dg]+$/.test(r)),
    );
    const all = rows.join("");
    requireValue(!/[dg]/.test(all) || all.split("g").length === 2);
    return pose(s, (n) => {
      n.tiles = [...rows];
      n.pulses = n.pulses.map((p) => ({ ...p, distances: [] }));
    });
  },
  setPlankton: (s, x, y, v) => {
    tile(s, x, y);
    bool(v);
    return pose(s, (n) => put(n.plankton, x, y, v ? "*" : "-"));
  },
  clearPlankton: (s) =>
    pose(s, (n) => {
      n.plankton = layer("-");
    }),
  clearFog: (s) =>
    pose(s, (n) => {
      n.visibility = layer("u");
      n.marks.fill(0);
    }),
  setForagerTile: (s, x, y) => {
    tile(s, x, y);
    return pose(s, (n) => {
      Object.assign(n.forager, center(x, y), { moving: false });
    });
  },
  setForagerDir: (s, d) => {
    dir(d);
    return pose(s, (n) => {
      n.forager.dir = d;
      n.desired = d;
      n.forager.moving = false;
    });
  },
  setBrightness: (s, v) => {
    number(v, 0, 1);
    return pose(s, (n) => {
      n.brightness = v;
    });
  },
  setBrightHold: (s, v) => {
    number(v, 0, C.BRIGHT_HOLD);
    return pose(s, (n) => {
      n.brightHold = v;
    });
  },
  clearPredators: (s) =>
    pose(s, (n) => {
      n.predators = [];
    }),
  addPredator: (s, k, x, y) => {
    requireValue(C.DEN_ORDER.includes(k));
    tile(s, x, y);
    return pose(s, (n) => {
      n.predators.push(predator(k, x, y));
    });
  },
  setPredatorTile: (s, i, x, y) => {
    tile(s, x, y, true);
    return hunter(s, i, (p) => {
      Object.assign(p, center(x, y));
    });
  },
  setPredatorDir: (s, i, d) => {
    dir(d);
    return hunter(s, i, (p) => {
      p.dir = d;
    });
  },
  setPredatorState: (s, i, v) =>
    hunter(s, i, (p, n) => {
      requireValue(["den", "wander", "chase"].includes(v));
      requireValue(
        v === "den"
          ? ["d", "g"].includes(n.tiles[p.ty]?.[p.tx])
          : n.tiles[p.ty]?.[p.tx] === ".",
      );
      p.state = v;
      p.fix = v === "chase" ? { tx: n.forager.tx, ty: n.forager.ty } : null;
      p.linger = C.LINGER_TIME;
      p.alert = false;
      p.alertLeft = 0;
      p.chaseSpeed = C.GLOAMFIN_CHASE_SPEED;
    }),
  setPredatorReleased: (s, i, v) => {
    bool(v);
    return hunter(s, i, (p) => {
      p.released = v;
    });
  },
  setPredatorMind: (s, i, v) => {
    bool(v);
    return hunter(s, i, (p) => {
      p.mind = v;
    });
  },
  setPredatorTravel: (s, i, v) => {
    bool(v);
    return hunter(s, i, (p) => {
      p.travel = v;
    });
  },
  spawnDrifter: (s, x, y) => {
    tile(s, x, y);
    return pose(s, (n) => {
      n.drifters.push(drifter(x, y));
    });
  },
  clearDrifters: (s) =>
    pose(s, (n) => {
      n.drifters = [];
    }),
  setDrifterMind: (s, i, v) => {
    bool(v);
    number(i, 0, s.drifters.length - 1, true);
    return pose(s, (n) => {
      n.drifters[i].mind = v;
    });
  },
  setDrifterTravel: (s, i, v) => {
    bool(v);
    number(i, 0, s.drifters.length - 1, true);
    return pose(s, (n) => {
      n.drifters[i].travel = v;
    });
  },
  setDrifterIn: (s, v) => {
    number(v, 0, C.DRIFTER_INTERVAL);
    return pose(s, (n) => {
      n.drifterIn = v;
    });
  },
  setSonarCooldown: (s, v) => {
    number(v);
    return pose(s, (n) => {
      n.sonar.cooldown = v;
    });
  },
  setInkCooldown: (s, v) => {
    number(v);
    return pose(s, (n) => {
      n.ink.cooldown = v;
    });
  },
};
