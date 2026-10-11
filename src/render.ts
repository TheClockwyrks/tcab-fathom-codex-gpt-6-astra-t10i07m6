import type { RenderApi } from "@clockwyrks/simple-2d";
import * as C from "./constants";
import type { Body, ReadState } from "./game";
import { BACKGROUND } from "./game";
import { items, menuItemRect } from "./debug";
import { center, distance } from "./world";

const CYAN = "#8cf8eb",
  DIM = "#537c87",
  WHITE = "#d6f3ef",
  AMBER = "#ff8a4b";
const FONT = '"SFMono-Regular", Consolas, "Liberation Mono", monospace';
type Context = CanvasRenderingContext2D;
function text(
  ctx: Context,
  value: string,
  x: number,
  y: number,
  size = 14,
  color = DIM,
  align: CanvasTextAlign = "left",
) {
  ctx.font = `${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.fillText(value, x, y);
}
function tracked(
  ctx: Context,
  value: string,
  x: number,
  y: number,
  size: number,
  spacing: number,
  color: string,
) {
  ctx.font = `${size}px ${FONT}`;
  const width = ctx.measureText(value).width + (value.length - 1) * spacing;
  let cursor = x - width / 2;
  for (const char of value) {
    text(ctx, char, cursor, y, size, color);
    cursor += ctx.measureText(char).width + spacing;
  }
}
function line(
  ctx: Context,
  x: number,
  y: number,
  x2: number,
  y2: number,
  color = "#17343f",
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}
function circle(ctx: Context, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
}
function glow(
  ctx: Context,
  x: number,
  y: number,
  r: number,
  color: string,
  alpha = 1,
) {
  ctx.save();
  ctx.globalAlpha = alpha;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, "transparent");
  ctx.fillStyle = g;
  circle(ctx, x, y, r);
  ctx.fill();
  ctx.restore();
}
function sprite(
  ctx: Context,
  s: ReadState,
  sheet: string,
  frame: number,
  x: number,
  y: number,
  size = C.TILE,
) {
  const image = s.art[sheet]?.[frame];
  if (image) ctx.drawImage(image, x - size / 2, y - size / 2, size, size);
}
const facing: Record<Body["dir"], number> = {
  down: 0,
  up: 2,
  left: 4,
  right: 6,
};
function terrain(
  ctx: Context,
  s: ReadState,
  x: number,
  y: number,
  force = false,
) {
  const v = s.visibility[y][x];
  if (v === "u" && !force) return;
  const tile = s.tiles[y][x],
    b = center(x, y);
  let frame = 16;
  if (tile === "#")
    frame =
      (s.tiles[y - 1]?.[x] === "#" ? 1 : 0) +
      (s.tiles[y]?.[x + 1] === "#" ? 2 : 0) +
      (s.tiles[y + 1]?.[x] === "#" ? 4 : 0) +
      (s.tiles[y]?.[x - 1] === "#" ? 8 : 0);
  else if (tile === "g") frame = 18;
  ctx.save();
  ctx.globalAlpha *= force || v === "l" ? 1 : 0.27;
  sprite(ctx, s, "trench-walls", frame, b.x, b.y);
  if (s.plankton[y][x] === "*" && tile === ".") {
    ctx.shadowColor = CYAN;
    ctx.shadowBlur = v === "l" ? 9 : 0;
    ctx.fillStyle = CYAN;
    circle(ctx, b.x, b.y, C.PLANKTON_DOT / 2);
    ctx.fill();
  }
  ctx.restore();
}
function amber(ctx: Context, x: number, y: number) {
  glow(ctx, x, y, 19, "#f875293b");
  ctx.fillStyle = AMBER;
  ctx.shadowColor = AMBER;
  ctx.shadowBlur = 9;
  circle(ctx, x, y, 2.6);
  ctx.fill();
  ctx.shadowBlur = 0;
}
function board(ctx: Context, s: ReadState) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(
    C.GRID_ORIGIN_X,
    C.GRID_ORIGIN_Y,
    C.GRID_COLS * C.TILE,
    C.GRID_ROWS * C.TILE,
  );
  ctx.clip();
  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(
    C.GRID_ORIGIN_X,
    C.GRID_ORIGIN_Y,
    C.GRID_COLS * C.TILE,
    C.GRID_ROWS * C.TILE,
  );
  const f = s.forager;
  ctx.save();
  circle(ctx, f.x, f.y, s.windowRadius);
  ctx.clip();
  for (let y = 0; y < C.GRID_ROWS; y++)
    for (let x = 0; x < C.GRID_COLS; x++) terrain(ctx, s, x, y);
  glow(ctx, f.x, f.y, s.windowRadius, "#35dfd914", 0.8);
  for (const d of s.drifters) {
    if (d.lit)
      sprite(ctx, s, "drifter", Math.floor(s.playTime * 8) % 8, d.x, d.y);
    amber(ctx, d.x, d.y);
  }
  for (const p of s.predators)
    if (p.kind === "lanternjaw" && p.state !== "den") amber(ctx, p.x, p.y);
  ctx.restore();
  for (const p of s.predators)
    if (p.flaring) {
      ctx.save();
      circle(ctx, p.x, p.y, C.FLARE_RADIUS);
      ctx.clip();
      for (let y = 0; y < C.GRID_ROWS; y++)
        for (let x = 0; x < C.GRID_COLS; x++)
          if (distance(p, center(x, y)) <= C.FLARE_RADIUS)
            terrain(ctx, s, x, y, true);
      ctx.restore();
    }
  for (const d of s.drifters)
    if (d.lit && distance(d, f) > s.windowRadius)
      sprite(ctx, s, "drifter", Math.floor(s.playTime * 8) % 8, d.x, d.y);
  for (const p of s.predators) {
    if (p.state === "den") continue;
    if (p.lit) {
      const frame =
        p.kind === "lanternjaw" && p.state === "wander"
          ? 8 + (Math.floor(s.playTime * 8) % 8)
          : facing[p.dir] + (Math.floor(s.playTime * 7) % 2);
      ctx.save();
      ctx.globalAlpha =
        p.mark > 0 && !p.alert && distance(p, f) > s.visionRadius
          ? Math.min(1, p.mark / 0.4)
          : 1;
      sprite(ctx, s, p.kind, frame, p.x, p.y);
      ctx.restore();
    }
    if (p.alert) {
      const age = 1 - p.alertLeft / C.ALERT_TIME;
      ctx.save();
      ctx.globalAlpha = 1 - age;
      for (let ray = 0; ray < 8; ray++) {
        const angle = (ray * Math.PI) / 4;
        line(
          ctx,
          p.x + Math.cos(angle) * (14 + age * 10),
          p.y + Math.sin(angle) * (14 + age * 10),
          p.x + Math.cos(angle) * (23 + age * 20),
          p.y + Math.sin(angle) * (23 + age * 20),
          p.kind === "gloamfin" ? "#d1b1ff" : AMBER,
        );
      }
      ctx.restore();
      glow(
        ctx,
        p.x,
        p.y,
        35,
        p.kind === "gloamfin" ? "#b98aff66" : "#ffb67666",
      );
      text(
        ctx,
        "!",
        p.x,
        p.y - 27,
        21,
        p.kind === "gloamfin" ? "#d1b1ff" : AMBER,
        "center",
      );
    }
    if (p.flareCharging || p.flaring || p.fade > 0) {
      const frame = p.flareCharging
        ? Math.min(2, Math.floor((1 - p.flareTime / C.FLARE_CHARGE) * 3))
        : p.flaring
          ? 3 + Math.min(2, Math.floor((1 - p.flareTime / C.FLARE_BLOOM) * 3))
          : p.fade > 0.2
            ? 6
            : 7;
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      sprite(ctx, s, "flare-bloom", frame, p.x, p.y, C.FLARE_RADIUS * 2);
      ctx.restore();
    }
  }
  for (const pulse of s.pulses) {
    ctx.save();
    const color =
      pulse.tint === "cyan"
        ? CYAN
        : pulse.tint === "violet"
          ? "#b798ff"
          : "#ff9755";
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    pulse.distances.forEach((d, i) => {
      const trail = pulse.front - d;
      if (d < 0 || d > pulse.range || trail < 0 || trail > 1.35) return;
      const b = center(i % C.GRID_COLS, Math.floor(i / C.GRID_COLS));
      ctx.globalAlpha = (1 - trail / 1.35) * 0.75;
      ctx.lineWidth = 2;
      ctx.strokeRect(b.x - 12, b.y - 12, 24, 24);
      ctx.globalAlpha *= 0.13;
      ctx.fillRect(b.x - 15, b.y - 15, 30, 30);
    });
    ctx.restore();
  }
  for (const cloud of s.inkClouds) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, cloud.remaining / 0.4);
    const g = ctx.createRadialGradient(
      cloud.x,
      cloud.y,
      cloud.radius * 0.5,
      cloud.x,
      cloud.y,
      cloud.radius,
    );
    g.addColorStop(0, "#000107f5");
    g.addColorStop(1, "#00010700");
    ctx.fillStyle = g;
    circle(ctx, cloud.x, cloud.y, cloud.radius);
    ctx.fill();
    ctx.strokeStyle = "#151a36";
    ctx.setLineDash([2, 9]);
    circle(ctx, cloud.x, cloud.y, cloud.radius * 0.8);
    ctx.stroke();
    ctx.restore();
  }
  glow(ctx, f.x, f.y, 38, "#48fff238");
  sprite(
    ctx,
    s,
    "glimmerfin",
    facing[f.dir] + (f.moving ? Math.floor(s.playTime * 9) % 2 : 0),
    f.x,
    f.y,
  );
  ctx.restore();
  // Quiet coordinate ticks locate the field without revealing its topology.
  for (let x = 0; x < C.GRID_COLS; x += 2) {
    const px = C.GRID_ORIGIN_X + x * C.TILE;
    line(ctx, px, 77, px, 80);
    line(ctx, px, 656, px, 659);
  }
  for (let y = 0; y < C.GRID_ROWS; y += 2) {
    const py = C.GRID_ORIGIN_Y + y * C.TILE;
    line(ctx, 60, py, 64, py);
    line(ctx, 1216, py, 1220, py);
  }
}
function gauge(
  ctx: Context,
  label: string,
  key: string,
  x: number,
  value: number,
  color: string,
) {
  text(ctx, key, x, 683, 12, DIM);
  text(ctx, label, x + 48, 680, 12, value >= 1 ? color : DIM);
  text(
    ctx,
    value >= 1 ? "READY" : `${Math.round(value * 100)}%`,
    x + 180,
    680,
    11,
    value >= 1 ? color : DIM,
    "right",
  );
  ctx.fillStyle = "#102731";
  ctx.fillRect(x + 48, 697, 132, 3);
  ctx.fillStyle = color;
  ctx.fillRect(x + 48, 697, 132 * Math.max(0, value), 3);
}
function hud(ctx: Context, s: ReadState) {
  text(ctx, C.TITLE_TEXT, 64, 30, 23, WHITE);
  text(ctx, C.DIVE_LABEL, 65, 56, 11, DIM);
  text(
    ctx,
    String(s.score).padStart(6, "0"),
    C.STAGE_W / 2,
    36,
    48,
    WHITE,
    "center",
  );
  text(ctx, "PLANKTON", 1030, 26, 10, DIM);
  text(ctx, String(s.planktonRemaining).padStart(3, "0"), 1030, 48, 20, CYAN);
  text(ctx, s.muted ? "M / MUTED" : "M / SOUND", 1216, 28, 11, DIM, "right");
  text(ctx, "ESC / PAUSE", 1216, 51, 11, DIM, "right");
  line(ctx, 64, 72, 1216, 72);
  line(ctx, 64, 662, 1216, 662);
  text(ctx, `DEPTH ${s.depth}`, 64, 690, 16, WHITE);
  for (let i = 0; i < s.lives; i++)
    sprite(ctx, s, "glimmerfin", 6, 226 + i * 26, 690, 24);
  gauge(
    ctx,
    "SONAR",
    "SPACE",
    420,
    1 - s.sonar.cooldown / C.SONAR_COOLDOWN,
    CYAN,
  );
  gauge(
    ctx,
    "INK",
    "SHIFT",
    690,
    1 - s.ink.cooldown / C.INK_COOLDOWN,
    "#b1a0f8",
  );
  text(ctx, "ARROWS / WASD", 1216, 688, 12, DIM, "right");
}
function menu(ctx: Context, s: ReadState) {
  items(s.screen).forEach((value, i) => {
    const r = menuItemRect(s, i);
    if (!r) return;
    const active = s.menuIndex === i;
    ctx.fillStyle = active ? "#102d35" : "#061018";
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = active ? "#62d7d0" : "#18303a";
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    if (active) {
      ctx.fillStyle = CYAN;
      ctx.fillRect(r.x, r.y, 3, r.h);
      text(ctx, "›", r.x + 22, r.y + r.h / 2, 24, CYAN);
    }
    tracked(
      ctx,
      value,
      r.x + r.w / 2,
      r.y + r.h / 2,
      15,
      2,
      active ? WHITE : DIM,
    );
  });
}
function corners(ctx: Context) {
  for (const [x, y, sx, sy] of [
    [40, 40, 1, 1],
    [1240, 40, -1, 1],
    [40, 680, 1, -1],
    [1240, 680, -1, -1],
  ]) {
    line(ctx, x, y, x + sx * 25, y, "#26535b");
    line(ctx, x, y, x, y + sy * 25, "#26535b");
  }
}
function title(ctx: Context, s: ReadState) {
  glow(ctx, 640, 285, 400, "#0c393943");
  const backdrop = {
    ...s,
    visibility: s.tiles.map((row) => row.replace(/./g, "l")),
  };
  ctx.save();
  ctx.globalAlpha = 0.28;
  for (let y = 0; y < C.GRID_ROWS; y++)
    for (let x = 0; x < C.GRID_COLS; x++)
      if (s.tiles[y][x] === "#") terrain(ctx, backdrop, x, y);
  ctx.restore();
  for (const radius of [125, 207, 295]) {
    ctx.strokeStyle = "#15363e";
    ctx.lineWidth = 1;
    circle(ctx, 640, 286, radius);
    ctx.stroke();
  }
  ctx.fillStyle = "#02070dc9";
  ctx.fillRect(300, 130, 680, 420);
  tracked(ctx, "A B I O L U M I N E S C E N T   D I V E", 640, 133, 11, 1, DIM);
  ctx.save();
  ctx.shadowColor = "#39d8d6";
  ctx.shadowBlur = 28;
  tracked(ctx, C.TITLE_TEXT, 640, 226, 100, 14, WHITE);
  ctx.restore();
  tracked(ctx, C.TAGLINE_TEXT, 640, 305, 17, 6, CYAN);
  line(ctx, 595, 350, 617, 350);
  line(ctx, 663, 350, 685, 350);
  glow(ctx, 640, 350, 29, "#3ce6eb40");
  sprite(ctx, s, "glimmerfin", 6, 640, 350);
  menu(ctx, s);
  text(
    ctx,
    "Eat to glow. Glow to see. Be seen.",
    640,
    558,
    14,
    "#8aaaae",
    "center",
  );
  text(ctx, "01 / KINDLE", 64, 54, 11, DIM);
  text(ctx, "THE ABYSS IS LISTENING", 1216, 54, 11, DIM, "right");
  text(ctx, "↑ ↓ SELECT     ENTER DIVE", 640, 639, 11, DIM, "center");
  text(ctx, "HEADPHONES RECOMMENDED", 64, 661, 10, DIM);
  text(
    ctx,
    s.muted ? "M / SOUND OFF" : "M / SOUND ON",
    1216,
    661,
    10,
    DIM,
    "right",
  );
  corners(ctx);
}
function howto(ctx: Context, s: ReadState) {
  corners(ctx);
  text(ctx, "FIELD GUIDE / 01", 80, 72, 12, CYAN);
  text(ctx, "SURVIVE THE SIGNAL", 80, 126, 42, WHITE);
  text(
    ctx,
    "Graze the maze. Read the dark. Leave nothing behind.",
    80,
    179,
    16,
    "#91b5bc",
  );
  line(ctx, 80, 216, 1200, 216);
  const guides = [
    [
      "lanternjaw",
      "01 / LANTERNJAW",
      "Follows your light.",
      "An amber glimmer may be a meal.",
      "Or a mouth. Ink breaks its sight.",
    ],
    [
      "gloamfin",
      "02 / GLOAMFIN",
      "Hunts by sound.",
      "Your sonar finds it — and calls it.",
      "Round corners to lose its speed.",
    ],
    [
      "flarefish",
      "03 / FLAREFISH",
      "Burns away the dark.",
      "Its flare sees straight through rock.",
      "Move away before the bloom.",
    ],
  ];
  guides.forEach((g, i) => {
    const x = 80 + i * 385;
    sprite(ctx, s, g[0], 6, x + 28, 265, 48);
    text(ctx, g[1], x + 68, 256, 13, i === 1 ? "#c3a3fb" : AMBER);
    text(ctx, g[2], x + 68, 282, 12, WHITE);
    text(ctx, g[3], x, 329, 13, "#8ba9af");
    text(ctx, g[4], x, 353, 13, "#8ba9af");
  });
  line(ctx, 80, 392, 1200, 392);
  const rows = [
    ["ARROWS / WASD", "Swim the corridors. Release to stop."],
    ["SPACE", "Send sonar around corners. It reveals, but it is heard."],
    ["SHIFT", "Leave ink behind. Hide from the hunters that see."],
    ["ESC / P     M", "Pause your dive. Toggle sound."],
  ];
  rows.forEach(([key, value], i) => {
    text(ctx, key, 80, 431 + i * 34, 13, CYAN);
    text(ctx, value, 300, 431 + i * 34, 13, WHITE);
  });
  text(
    ctx,
    "Eat plankton to widen your window. Explored passages stay in memory,",
    80,
    596,
    13,
    DIM,
  );
  text(
    ctx,
    "but only the circle around you can show them. Clear every mote to descend.",
    80,
    618,
    13,
    DIM,
  );
  text(ctx, "ENTER / ESC / TAP TO RETURN", 1200, 667, 12, CYAN, "right");
}
export function render(s: ReadState, api: RenderApi): void {
  const ctx = api.ctx;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, C.STAGE_W, C.STAGE_H);
  if (s.screen === "title") {
    title(ctx, s);
    return;
  }
  if (s.screen === "howto") {
    howto(ctx, s);
    return;
  }
  if (s.screen !== "gameover") {
    board(ctx, s);
    hud(ctx, s);
  }
  if (s.screen === "playing") return;
  if (s.screen === "countdown") {
    text(ctx, "DIVE", 640, 286, 40, WHITE, "center");
    text(
      ctx,
      String(Math.max(1, Math.ceil(2 - s.screenTime))),
      640,
      346,
      26,
      CYAN,
      "center",
    );
    return;
  }
  if (s.screen === "cleared") {
    ctx.fillStyle = "#02070da6";
    ctx.fillRect(320, 245, 640, 220);
    tracked(ctx, `DEPTH ${s.depth} CLEARED`, 640, 316, 30, 3, WHITE);
    text(ctx, `+${C.SCORE_CLEAR} / DESCENDING`, 640, 380, 15, CYAN, "center");
    return;
  }
  ctx.fillStyle = "#02070ddb";
  ctx.fillRect(0, 80, 1280, 576);
  glow(ctx, 640, 300, 300, "#123c3a55");
  if (s.screen === "paused") {
    tracked(ctx, "SUSPENDED", 640, 257, 43, 5, WHITE);
    text(ctx, "The deep can wait.", 640, 312, 14, DIM, "center");
  } else {
    corners(ctx);
    tracked(ctx, "LOST TO THE DEEP", 640, 210, 42, 3, WHITE);
    text(
      ctx,
      `${String(s.score).padStart(6, "0")}  /  DEPTH ${s.depth}`,
      640,
      290,
      26,
      CYAN,
      "center",
    );
    text(ctx, "Every light leaves a trace.", 640, 330, 13, DIM, "center");
  }
  menu(ctx, s);
}
