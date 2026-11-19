import {
  BRICK_H,
  BRICK_W,
  CANNON_Y,
  COLS,
  COMBO_WINDOW,
  GRID_LEFT,
  H,
  LANE_SPREAD,
  TOWER_TOP,
  W,
  WALL,
} from "../game/const.ts";
import { aimPreview, type BallBody, type BrickBody } from "../game/physics.ts";
import { ROW_PITCH_PX, type BoardBrick, type Tower } from "../game/board.ts";
import { makeRng } from "../game/rng.ts";
import type { FxEvent, Run } from "../game/run.ts";

export interface ThemePalette {
  background: string;
  text: string;
  accent: string;
  border: string;
  mode: "light" | "dark";
  reducedMotion: boolean;
  /** Screenshake toggle from settings (defaults on). */
  screenShake?: boolean;
}

type ParticleShape = "shard" | "spark" | "dust";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  rot: number;
  vr: number;
  shape: ParticleShape;
  /** Unit-square polygon corners for shards (4 x/y pairs). */
  verts?: number[];
}

interface Ring {
  x: number;
  y: number;
  life: number;
  maxLife: number;
  radius: number;
  color: string;
  width: number;
}

interface CrackLine {
  points: Array<[number, number]>;
  width: number;
}

interface DamageArt {
  cracks: CrackLine[];
  chips: Array<{ corner: number; size: number; seed: number }>;
}

/** Field→device mapping: device px per logical unit plus the field origin. */
export interface FieldView {
  scale: number;
  ox: number;
  oy: number;
}

export interface Renderer {
  frame(run: Run | null, fxEvents: FxEvent[], dt: number): void;
  setPalette(palette: ThemePalette): void;
  setSkin(skin: string): void;
  /** Current playfield mapping, for converting pointer input to game coords. */
  view(): FieldView;
}

const DEFAULT_PALETTE: ThemePalette = {
  background: "#101418",
  text: "#e8e6e3",
  accent: "#e0b64c",
  border: "#2c333b",
  mode: "dark",
  reducedMotion: false,
  screenShake: true,
};

/** Extrusion depth of the 2.5D blocks (px). */
const EX = 7;
/** Sprite padding: room for the baked contact shadow (right/bottom biased). */
const PAD_L = 3;
const PAD_T = 3;
const PAD_R = EX + 5;
const PAD_B = EX + 6;
/** Baked shadow offset/softness. */
const SHADOW_X = 2.4;
const SHADOW_Y = 3.4;
const SHADOW_BLUR = 4.5;

interface Material {
  top: string;
  bottom: string;
  border: string;
  side: string;
  under: string;
  /** Rim / accent colour for material flourishes. */
  accent?: string;
  glow?: string;
  /** Label colours; light bricks need dark ink to stay readable. */
  ink?: string;
  inkStroke?: string;
}

/**
 * Every brick kind gets its own material signature: base gradient, frame and
 * accent. Baked into the sprite so per-frame cost stays one drawImage.
 */
/**
 * 卡通风材质:高饱和色块 + 深描边 + 高光,颜色向《向僵尸开炮》
 * 那类明亮弹幕手游对齐(顶面亮、底面饱和深色、边框近黑)。
 */
const BRICK_MATERIALS: Record<string, Material> = {
  spam: {
    top: "#b9cbe8",
    bottom: "#4d6394",
    border: "#1f2c50",
    side: "#3c5184",
    under: "#26355f",
    accent: "#eaf3ff",
  },
  gold: {
    top: "#ffe25c",
    bottom: "#e89516",
    border: "#7c4e05",
    side: "#c47f12",
    under: "#8f5c0b",
    accent: "#fff6bd",
    glow: "rgba(255,201,90,0.5)",
    ink: "#2c1d03",
    inkStroke: "rgba(255,249,214,0.6)",
  },
  flame: {
    top: "#ff8a5f",
    bottom: "#d93317",
    border: "#661108",
    side: "#b02a12",
    under: "#7e1c0c",
    accent: "#ffcb7d",
    glow: "rgba(255,110,60,0.45)",
  },
  bomb: {
    top: "#ffab42",
    bottom: "#e56f0c",
    border: "#6e3505",
    side: "#c05a0e",
    under: "#8a4108",
    accent: "#ffdb70",
    glow: "rgba(255,150,60,0.45)",
  },
  steel: {
    top: "#e6f1ff",
    bottom: "#6d8fc4",
    border: "#2b4472",
    side: "#5273a8",
    under: "#3a5484",
    accent: "#f7fbff",
    ink: "#101d34",
    inkStroke: "rgba(242,249,255,0.65)",
  },
  healer: {
    top: "#9bf284",
    bottom: "#229a3e",
    border: "#0f5a24",
    side: "#1d8c37",
    under: "#136128",
    accent: "#e6ffdd",
    glow: "rgba(120,240,120,0.45)",
  },
  mirror: {
    top: "#ffffff",
    bottom: "#96b3d8",
    border: "#3c5478",
    side: "#7a94ba",
    under: "#576f92",
    accent: "#ffffff",
    ink: "#131e30",
    inkStroke: "rgba(247,252,255,0.7)",
  },
  core: {
    top: "#b84fe0",
    bottom: "#5c1188",
    border: "#33084f",
    side: "#8f2cb8",
    under: "#410a63",
    accent: "#f0b6ff",
    glow: "rgba(200,110,255,0.55)",
    ink: "#fbeaff",
    inkStroke: "rgba(38,6,58,0.85)",
  },
};

const SKY = {
  // 卡通夜:高饱和靛蓝紫黄昏,而不是写实暗夜。
  dark: { top: "#141c52", mid: "#283487", bottom: "#4653bd" },
  // 卡通白昼:明快蓝天。
  light: { top: "#6fc2f6", mid: "#a3dcfb", bottom: "#ccf0ff" },
};
const SKYLINE_FAR = { dark: "#1c2765", light: "#7aa6e2" };

/** Near skyline parallax band (only this slice can ever be on screen). */
const NEAR_BAND_H = 186;
/** Ground band: haze + wet asphalt. */
const GROUND_H = 132;
const SKYLINE_NEAR = { dark: "#0d1533", light: "#5a83c0" };

/** Stars are re-scattered per background bake: the sky height follows the screen. */
let STARS: Array<{ x: number; y: number; r: number; phase: number; speed: number }> = [];
function makeStars(worldH: number): void {
  const rng = makeRng("night-sky");
  const stars: Array<{ x: number; y: number; r: number; phase: number; speed: number }> = [];
  for (let i = 0; i < 48; i++) {
    stars.push({
      x: 12 + rng() * (W - 24),
      y: 12 + rng() * (worldH * 0.45),
      r: 0.6 + rng() * 1.3,
      phase: rng() * Math.PI * 2,
      speed: 0.6 + rng() * 1.6,
    });
  }
  STARS = stars;
}

const SKYLINE_NEAR_SEGS: Array<{ x: number; w: number; h: number; roof: number }> = [];
{
  const rng2 = makeRng("skyline-near");
  let x = -6;
  while (x < W) {
    const w = 26 + rng2() * 42;
    SKYLINE_NEAR_SEGS.push({ x, w, h: 26 + rng2() * 62, roof: rng2() < 0.35 ? 6 + rng2() * 9 : 0 });
    x += w + 3 + rng2() * 10;
  }
}

/** Window lights on the near skyline; y positions follow the world height. */
let SKYLINE_LIGHTS: Array<{ x: number; y: number }> = [];
function makeSkylineLights(worldH: number): void {
  const rng = makeRng("window-lights");
  const lights: Array<{ x: number; y: number }> = [];
  for (const seg of SKYLINE_NEAR_SEGS) {
    const cols = Math.max(1, Math.floor(seg.w / 12));
    const rows = Math.max(1, Math.floor(seg.h / 16));
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        if (rng() < 0.22) {
          lights.push({
            x: seg.x + 4 + c * 12,
            y: worldH - 74 - seg.h + 6 + r * 16,
          });
        }
      }
    }
  }
  SKYLINE_LIGHTS = lights;
}

/** Deterministic specks for the water-stain material of spam bricks. */
const SPAM_SPECKLES: Array<{ x: number; y: number; r: number; a: number }> = [];
const STEEL_STREAKS: Array<{ y: number; x: number; w: number; a: number }> = [];
{
  const rng = makeRng("material-specks");
  for (let i = 0; i < 14; i++) {
    SPAM_SPECKLES.push({
      x: 4 + rng() * 44,
      y: 3 + rng() * 20,
      r: 0.5 + rng() * 1.4,
      a: 0.06 + rng() * 0.12,
    });
  }
  for (let i = 0; i < 12; i++) {
    STEEL_STREAKS.push({
      y: 3 + rng() * 20,
      x: 3 + rng() * 20,
      w: 10 + rng() * 26,
      a: 0.03 + rng() * 0.07,
    });
  }
}

function shade(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, Math.round(((n >> 16) & 255) * factor)));
  const g = Math.min(255, Math.max(0, Math.round(((n >> 8) & 255) * factor)));
  const b = Math.min(255, Math.max(0, Math.round((n & 255) * factor)));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

function rgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

function linGrad(
  c: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  stops: Array<[number, string]>
): CanvasGradient {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  for (const [p, col] of stops) g.addColorStop(p, col);
  return g;
}

function radGrad(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  r0: number,
  r1: number,
  stops: Array<[number, string]>
): CanvasGradient {
  const g = c.createRadialGradient(x, y, r0, x, y, r1);
  for (const [p, col] of stops) g.addColorStop(p, col);
  return g;
}

function roundRectOn(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  c.beginPath();
  c.moveTo(x + r, y);
  c.lineTo(x + w - r, y);
  c.arcTo(x + w, y, x + w, y + r, r);
  c.lineTo(x + w, y + h - r);
  c.arcTo(x + w, y + h, x + w - r, y + h, r);
  c.lineTo(x + r, y + h);
  c.arcTo(x, y + h, x, y + h - r, r);
  c.lineTo(x, y + r);
  c.arcTo(x, y, x + r, y, r);
  c.closePath();
}

/** Polygon path helper for the 2.5D faces. */
function polyOn(c: CanvasRenderingContext2D, pts: Array<[number, number]>): void {
  c.beginPath();
  c.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
  c.closePath();
}

export function createRenderer(canvas: HTMLCanvasElement): Renderer {
  const ctx = canvas.getContext("2d")!;
  let palette: ThemePalette = DEFAULT_PALETTE;
  const particles: Particle[] = [];
  const rings: Ring[] = [];
  let shake = 0;
  let flash = 0;
  let hitFlash = 0;
  let muzzleT = 0;
  let recoil = 0;
  let comboPop = 0;
  let lastCombo = 0;
  let time = 0;
  /** Device pixels per logical unit, derived from the real canvas box. */
  let scale = 1;
  /**
   * The 400x660 playfield stretches with the screen: on portrait canvases the
   * game coordinate system shifts down by `shiftY` logical px so the cannon
   * line hugs the screen bottom and the slack becomes sky above the tower.
   * viewOx/viewOy are the WORLD origin (canvas top-left) in device px; extL/R
   * are horizontal scenery margins on height-limited (desktop) canvases.
   */
  let viewOx = 0;
  let viewOy = 0;
  let shiftY = 0;
  let extL = 0;
  let extR = 0;
  let extW = W;
  /** Camera zoom, eased toward its target instead of snapping. */
  let zoom = 1;
  /** Phase of the decaying camera shake (deterministic, frame-rate independent). */
  let shakeT = 0;
  /** Palette mode the cached background layers were built for. */
  let bgMode: "light" | "dark" | null = null;

  const damageCache = new WeakMap<object, DamageArt>();

  // ------------------------------------------------------------- sprites
  const spriteCache = new Map<string, HTMLCanvasElement>();
  let spriteDpr = 0;

  // Pre-rendered background layers (rebuilt only when DPR/mode changes).
  /** Full-screen static backdrop: sky, moon, shafts, vignette, far skyline, tower shadow. */
  let skyLayer: HTMLCanvasElement | null = null;
  /** Near skyline band (short canvas = far less overdraw than a full screen). */
  let nearStrip: HTMLCanvasElement | null = null;
  /** Ground band: haze + wet asphalt reflections. */
  let groundLayer: HTMLCanvasElement | null = null;
  let mistLayer: HTMLCanvasElement | null = null;
  let fogLayer: HTMLCanvasElement | null = null;
  let shimmerLayer: HTMLCanvasElement | null = null;
  /** Cheap foreground vignette: four thin edge bands instead of a full-screen blit. */
  let vigBottom: HTMLCanvasElement | null = null;
  let vigLeft: HTMLCanvasElement | null = null;
  let vigRight: HTMLCanvasElement | null = null;
  /** Canvas-edge fade bands (device-space cached gradients + sizes). */
  let edgeGradTop: CanvasGradient | null = null;
  let edgeGradBottom: CanvasGradient | null = null;
  let edgeGradLeft: CanvasGradient | null = null;
  let edgeGradRight: CanvasGradient | null = null;
  let edgeHT = 0;
  let edgeHB = 0;
  let edgeHL = 0;
  let edgeHR = 0;
  let wallLeft: HTMLCanvasElement | null = null;
  let wallRight: HTMLCanvasElement | null = null;
  /** 炮台皮肤:经典/黄金/霓虹,只影响炮台与角色的点缀色。 */
  let skinName = "classic";

  // Sprite helpers (baked once per device scale).
  let eyeSprite: HTMLCanvasElement | null = null;
  let coreAuraSprite: HTMLCanvasElement | null = null;
  let coreRingSprite: HTMLCanvasElement | null = null;
  let glowWarm: HTMLCanvasElement | null = null;
  let glowGreen: HTMLCanvasElement | null = null;
  let glowViolet: HTMLCanvasElement | null = null;
  let glowAccent: HTMLCanvasElement | null = null;

  function makeCanvas(logicalW: number, logicalH: number): {
    cv: HTMLCanvasElement;
    s: CanvasRenderingContext2D;
  } {
    const cv = document.createElement("canvas");
    cv.width = Math.max(1, Math.ceil(logicalW * scale));
    cv.height = Math.max(1, Math.ceil(logicalH * scale));
    const s = cv.getContext("2d")!;
    s.scale(scale, scale);
    return { cv, s };
  }

  function makeGlow(r: number, g: number, b: number): HTMLCanvasElement {
    const size = 64;
    const { cv, s } = makeCanvas(size, size);
    const grad = s.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, `rgba(${r},${g},${b},0.9)`);
    grad.addColorStop(0.45, `rgba(${r},${g},${b},0.32)`);
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
    s.fillStyle = grad;
    s.fillRect(0, 0, size, size);
    return cv;
  }

  /** Draw an additive glow sprite centred on (x,y). */
  function blitGlow(sprite: HTMLCanvasElement | null, x: number, y: number, size: number, alpha: number): void {
    if (!sprite || alpha <= 0) return;
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = alpha;
    ctx.drawImage(sprite, x - size / 2, y - size / 2, size, size);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  /** Alpha of the tower's shadow column at global y (baked into backdrop layers). */
  function towerShadowAlpha(y: number, dark: boolean): number {
    if (y < TOWER_TOP) return 0;
    const t = Math.min(1, (y - TOWER_TOP) / (H - TOWER_TOP));
    const peak = dark ? 0.34 : 0.16;
    return peak * (0.25 + 0.75 * t);
  }

  // ------------------------------------------------------------- background
  /** Recompute the field→device mapping from the real canvas box. */
  function updateView(): void {
    const cw = canvas.width;
    const ch = canvas.height;
    if (cw < 1 || ch < 1) {
      extW = W;
      extL = extR = 0;
      shiftY = 0;
      viewOx = viewOy = 0;
      return;
    }
    // Real-game fullscreen: the FIELD stretches with the screen instead of
    // floating inside letterbox margins. The 400-logical width always fills
    // the canvas width; every extra vertical pixel becomes sky ABOVE the
    // tower (game coordinates shift down as a whole), so the cannon line sits
    // near the screen bottom and no dead margin exists. On height-limited
    // (landscape/desktop) canvases the slack is horizontal scenery instead.
    const widthLimited = cw / W <= ch / H;
    scale = widthLimited ? cw / W : ch / H;
    if (widthLimited) {
      viewOx = 0;
      viewOy = 0;
      extL = extR = 0;
      extW = W;
      shiftY = Math.max(0, ch / scale - H);
    } else {
      viewOx = Math.round((cw - W * scale) / 2);
      viewOy = 0;
      extL = viewOx / scale;
      extR = (cw - viewOx - W * scale) / scale;
      extW = extL + W + extR;
      shiftY = 0;
    }
  }

  function buildBackgroundLayers(): void {
    bgMode = palette.mode;
    const dark = palette.mode === "dark";
    // World height: the game field plus the portrait sky shift. All scenery
    // (horizon, city, ground) is baked against this so it reaches the canvas
    // bottom edge on every aspect ratio.
    const Hw = H + shiftY;
    const nearBandTop = Hw - NEAR_BAND_H;
    makeStars(Hw);
    makeSkylineLights(Hw);
    // ---- Static backdrop. One full-screen blit per frame replaces the old
    // sky + far strip + haze + floor + tower-shadow + vignette stack (which
    // cost several full-screen composites per frame).
    skyLayer = document.createElement("canvas");
    // Full canvas: the backdrop also paints the scenery margins around the
    // field (sky above / asphalt below on phones, extra city on the sides on
    // desktop). Content is drawn in field coordinates via translate.
    skyLayer.width = Math.max(1, canvas.width);
    skyLayer.height = Math.max(1, canvas.height);
    {
      const s = skyLayer.getContext("2d")!;
      s.scale(scale, scale);
      s.translate(extL, 0);
      const sky = SKY[palette.mode];
      const grad = s.createLinearGradient(0, 0, 0, Hw);
      grad.addColorStop(0, sky.top);
      grad.addColorStop(0.55, sky.mid);
      grad.addColorStop(1, sky.bottom);
      s.fillStyle = grad;
      s.fillRect(-extL, 0, extW, Hw);
      // Warm city glow on the horizon; cool haze above it.
      const horizon = Hw - 120;
      const halo = s.createRadialGradient(W / 2, horizon, 10, W / 2, horizon, Hw * 0.55);
      halo.addColorStop(0, dark ? "rgba(88,104,168,0.30)" : "rgba(255,232,180,0.5)");
      halo.addColorStop(0.55, dark ? "rgba(46,60,110,0.12)" : "rgba(255,236,190,0.18)");
      halo.addColorStop(1, "rgba(0,0,0,0)");
      s.fillStyle = halo;
      s.fillRect(-extL, horizon - 220, extW, 260);
      if (dark) {
        s.fillStyle = "rgba(232,240,255,0.95)";
        s.beginPath();
        s.arc(W - 66, 78, 12.5, 0, Math.PI * 2);
        s.fill();
        // Soft moon halo.
        const moon = s.createRadialGradient(W - 66, 78, 6, W - 66, 78, 46);
        moon.addColorStop(0, "rgba(214,228,255,0.34)");
        moon.addColorStop(1, "rgba(180,205,255,0)");
        s.fillStyle = moon;
        s.fillRect(W - 120, 24, 112, 112);
        // Light shafts rising off the horizon, across the whole width.
        for (let bx = 40 - extL; bx < W + extR; bx += 108) {
          const shaft = s.createLinearGradient(bx, horizon, bx + 26, horizon - 190);
          shaft.addColorStop(0, "rgba(120,150,230,0.10)");
          shaft.addColorStop(1, "rgba(120,150,230,0)");
          s.fillStyle = shaft;
          s.beginPath();
          s.moveTo(bx - 10, horizon);
          s.lineTo(bx - 30, horizon - 210);
          s.lineTo(bx + 34, horizon - 210);
          s.lineTo(bx + 14, horizon);
          s.closePath();
          s.fill();
        }
      }
      if (!dark) {
        const sun = s.createRadialGradient(W - 70, 60, 6, W - 70, 60, 130);
        sun.addColorStop(0, "rgba(255,236,170,0.85)");
        sun.addColorStop(1, "rgba(255,236,170,0)");
        s.fillStyle = sun;
        s.fillRect(-extL, 0, extW, 240);
      }
      // Soft edge vignette (background only; the foreground adds thin bands).
      const vig = s.createRadialGradient(W / 2, Hw / 2, Hw * 0.32, W / 2, Hw / 2, Hw * 0.8);
      vig.addColorStop(0, "rgba(0,0,0,0)");
      vig.addColorStop(1, dark ? "rgba(2,4,10,0.52)" : "rgba(60,72,96,0.22)");
      s.fillStyle = vig;
      s.fillRect(-extL, 0, extW, Hw);
      // Far skyline is baked here: at this distance it does not need parallax.
      // Marched across the full extended width so side margins keep a city.
      const farBase = SKYLINE_FAR[palette.mode];
      s.fillStyle = linGrad(s, 0, Hw - 240, 0, Hw - 60, [
        [0, shade(farBase, dark ? 1.35 : 1.02)],
        [1, dark ? "rgba(20,30,58,0.55)" : rgba(farBase, 0.9)],
      ]);
      const farRng = makeRng("skyline-far");
      let farX = -extL - 6;
      while (farX < W + extR) {
        const w = 18 + farRng() * 30;
        const h = 60 + farRng() * 95;
        const spire = farRng() < 0.3 ? 8 + farRng() * 14 : 0;
        s.fillRect(farX + 30, Hw - 150 - h, w, h + 150);
        if (spire > 0) {
          s.fillRect(farX + 30 + w / 2 - 1, Hw - 150 - h - spire, 2, spire);
        }
        farX += w + 2 + farRng() * 6;
      }
      // Cartoon clouds: chunky white puffs on day sky, soft violet wisps on
      // night sky. Baked, deterministic, kept away from the moon / sun corner.
      const clouds = linGrad(s, 0, Hw * 0.06, 0, Hw * 0.42, [
        [0, dark ? "rgba(150,160,230,0.20)" : "rgba(255,255,255,0.95)"],
        [1, dark ? "rgba(150,160,230,0)" : "rgba(255,255,255,0.55)"],
      ]);
      const cloudRng = makeRng("sky-clouds");
      for (let i = 0; i < 7; i++) {
        const cx = 30 + cloudRng() * (W - 60);
        const cy = Hw * 0.08 + cloudRng() * Hw * 0.3;
        if (cy > horizon - 210) continue;
        const cw = 46 + cloudRng() * 72;
        const ch2 = cw * 0.38;
        s.fillStyle = clouds;
        s.beginPath();
        s.arc(cx, cy, ch2 * 0.62, Math.PI, 0);
        s.arc(cx + cw * 0.26, cy - ch2 * 0.42, ch2 * 0.5, Math.PI, 0);
        s.arc(cx + cw * 0.52, cy, ch2 * 0.62, Math.PI, 0);
        s.closePath();
        s.fill();
        s.fillRect(cx - ch2 * 0.62, cy - ch2 * 0.1, cw + ch2 * 1.1, ch2 * 0.55);
      }
      // Distant window dust.
      s.fillStyle = dark ? "rgba(190,208,255,0.16)" : "rgba(255,255,255,0.28)";
      const rngFar = makeRng("far-windows");
      for (let i = 0; i < 90; i++) {
        s.fillRect(-extL + rngFar() * extW, Hw - 200 + rngFar() * 130, 1.6, 2);
      }
      // Tower shadow column: darkens the city behind the playfield. Ramps in
      // from zero so the band's top edge never shows as a hard line.
      const shadowTop = TOWER_TOP + shiftY;
      s.fillStyle = linGrad(s, 0, shadowTop, 0, Hw, [
        [0, "rgba(0,0,0,0)"],
        [0.25, `rgba(0,0,0,${towerShadowAlpha(shadowTop + (Hw - shadowTop) * 0.25, dark)})`],
        [1, `rgba(0,0,0,${towerShadowAlpha(Hw, dark)})`],
      ]);
      s.fillRect(0, shadowTop, W, Hw - shadowTop);
    }

    // ---- Near skyline band (parallax). Short canvas: only the band that can
    // ever be on screen, which cuts its blit area by ~70%.
    nearStrip = document.createElement("canvas");
    nearStrip.width = Math.ceil((W + 80) * scale);
    nearStrip.height = Math.ceil(NEAR_BAND_H * scale);
    {
      const s = nearStrip.getContext("2d")!;
      s.scale(scale, scale);
      s.translate(0, -nearBandTop);
      const base = SKYLINE_NEAR[palette.mode];
      for (const seg of SKYLINE_NEAR_SEGS) {
        const x = seg.x + 40;
        const top = Hw - 74 - seg.h;
        s.fillStyle = linGrad(s, 0, top, 0, Hw, [
          [0, shade(base, dark ? 1.12 : 1.04)],
          [1, base],
        ]);
        s.fillRect(x, top, seg.w, seg.h + 74);
        if (seg.roof > 0) {
          s.fillStyle = shade(base, 1.18);
          s.fillRect(x + 3, top - seg.roof, seg.w - 6, seg.roof);
        }
      }
      if (dark) {
        s.fillStyle = "rgba(255,201,118,0.85)";
        for (const light of SKYLINE_LIGHTS) {
          s.fillRect(light.x + 40, light.y, 2.4, 3.4);
        }
        s.fillStyle = "rgba(255,201,118,0.35)";
        for (const light of SKYLINE_LIGHTS) {
          s.fillRect(light.x + 40, light.y + 3.4, 2.4, 1.2);
        }
        s.fillStyle = "rgba(255,80,80,0.9)";
        for (const seg of SKYLINE_NEAR_SEGS) {
          if (seg.h > 70) s.fillRect(seg.x + 40 + seg.w / 2 - 1, Hw - 74 - seg.h - 3, 2, 2);
        }
      }
      // Bake the tower shadow into this band as well (ramped from zero, same
      // reason as the backdrop column).
      s.fillStyle = linGrad(s, 0, nearBandTop, 0, Hw, [
        [0, "rgba(0,0,0,0)"],
        [0.4, `rgba(0,0,0,${towerShadowAlpha(nearBandTop + NEAR_BAND_H * 0.4, dark)})`],
        [1, `rgba(0,0,0,${towerShadowAlpha(Hw, dark)})`],
      ]);
      s.fillRect(0, nearBandTop, W + 80, NEAR_BAND_H);
    }

    // ---- Ground band: haze + wet asphalt with reflections. Anchored to the
    // WORLD bottom (Hw) so the asphalt plane reaches the canvas edge.
    const groundH = GROUND_H;
    groundLayer = document.createElement("canvas");
    groundLayer.width = Math.max(1, Math.ceil(extW * scale));
    groundLayer.height = Math.ceil(groundH * scale);
    {
      const s = groundLayer.getContext("2d")!;
      s.scale(scale, scale);
      s.translate(extL, -(Hw - GROUND_H));
      const fh = groundH;
      const top = Hw - fh;
      // Haze fading the skyline base into the ground.
      s.fillStyle = linGrad(s, 0, Hw - 120, 0, Hw, [
        [0, "rgba(0,0,0,0)"],
        [1, dark ? "rgba(12,16,44,0.85)" : "rgba(78,108,156,0.4)"],
      ]);
      s.fillRect(-extL, Hw - 120, extW, 120);
      // Wet asphalt.
      s.fillStyle = linGrad(s, 0, Hw - 108, 0, Hw, [
        [0, dark ? "rgba(20,28,72,0.55)" : "rgba(178,198,230,0.4)"],
        [0.35, dark ? "rgba(12,18,52,0.9)" : "rgba(148,170,208,0.6)"],
        [1, dark ? "rgba(8,12,36,0.98)" : "rgba(116,138,178,0.75)"],
      ]);
      s.fillRect(-extL, Hw - 108, extW, 108);
      if (dark) {
        // Reflected window lights as soft vertical streaks.
        for (const light of SKYLINE_LIGHTS) {
          if (light.x > W - WALL * 2 || light.x < WALL) continue;
          const rx = light.x + 40;
          const len = 26 + (rx % 13);
          s.fillStyle = linGrad(s, 0, Hw - 108, 0, Hw - 108 + len, [
            [0, "rgba(255,196,110,0.20)"],
            [1, "rgba(255,196,110,0)"],
          ]);
          s.fillRect(rx - 1.2, Hw - 108, 3.4, len);
        }
        // Mirrored silhouettes blurred into the wet ground.
        for (const seg of SKYLINE_NEAR_SEGS) {
          const rx = seg.x + 40;
          s.fillStyle = linGrad(s, 0, Hw - 108, 0, Hw - 62, [
            [0, "rgba(0,0,0,0.34)"],
            [1, "rgba(0,0,0,0)"],
          ]);
          s.fillRect(rx, Hw - 108, seg.w, 46);
        }
      }
      // Specular horizon sheen + warm pool under the cannon.
      s.fillStyle = dark ? "rgba(120,150,210,0.10)" : "rgba(255,255,255,0.35)";
      s.fillRect(-extL, Hw - 106, extW, 1.6);
      const pool = s.createRadialGradient(W / 2, Hw - 34, 4, W / 2, Hw - 34, 96);
      pool.addColorStop(0, dark ? "rgba(255,196,110,0.18)" : "rgba(255,236,180,0.4)");
      pool.addColorStop(1, "rgba(255,196,110,0)");
      s.fillStyle = pool;
      s.fillRect(0, Hw - 130, W, 130);
      // Tower shadow over the ground.
      s.fillStyle = `rgba(0,0,0,${towerShadowAlpha(Hw - 40, dark) * 0.75})`;
      s.fillRect(0, top, W, fh);
    }

    // ---- Drifting mist band (one short layer, parallaxes in drawBackground).
    mistLayer = document.createElement("canvas");
    mistLayer.width = Math.ceil((W + 80) * scale);
    mistLayer.height = Math.ceil(112 * scale);
    {
      const s = mistLayer.getContext("2d")!;
      s.scale(scale, scale);
      const rng = makeRng("mist-bands");
      for (let i = 0; i < 12; i++) {
        const x = rng() * (W + 80);
        const y = 16 + rng() * 84;
        const rx = 40 + rng() * 90;
        const ry = 6 + rng() * 12;
        const g = s.createRadialGradient(x, y, 0, x, y, rx);
        const tint = dark ? "190,210,255" : "255,255,255";
        g.addColorStop(0, `rgba(${tint},${0.05 + rng() * 0.06})`);
        g.addColorStop(1, `rgba(${tint},0)`);
        s.fillStyle = g;
        s.save();
        s.translate(x, y);
        s.scale(1, ry / rx);
        s.beginPath();
        s.arc(0, 0, rx, 0, Math.PI * 2);
        s.fill();
        s.restore();
      }
    }

    // ---- Depth-fog band for far tower rows (drawn over the bricks).
    // Kept whisper-subtle: a heavy veil reads as a dirty overlay on fullscreen.
    fogLayer = document.createElement("canvas");
    fogLayer.width = Math.ceil((W - WALL * 2) * scale);
    fogLayer.height = Math.ceil(H * 0.5 * scale);
    {
      const s = fogLayer.getContext("2d")!;
      s.scale(scale, scale);
      const color = dark ? "20,28,62" : "150,165,195";
      const fogAlpha = dark ? 0.16 : 0.1;
      const fog = s.createLinearGradient(0, 0, 0, H * 0.5);
      fog.addColorStop(0, `rgba(${color},${fogAlpha})`);
      fog.addColorStop(1, `rgba(${color},0)`);
      s.fillStyle = fog;
      s.fillRect(0, 0, W - WALL * 2, H * 0.5);
    }

    // ---- Diagonal shimmer band for metal / gold sweeps.
    shimmerLayer = document.createElement("canvas");
    shimmerLayer.width = Math.ceil(30 * scale);
    shimmerLayer.height = Math.ceil(BRICK_H * scale);
    {
      const s = shimmerLayer.getContext("2d")!;
      s.scale(scale, scale);
      const sh = s.createLinearGradient(0, 0, 30, 0);
      sh.addColorStop(0, "rgba(255,255,255,0)");
      sh.addColorStop(0.45, "rgba(255,255,255,0.42)");
      sh.addColorStop(0.55, "rgba(255,255,255,0.42)");
      sh.addColorStop(1, "rgba(255,255,255,0)");
      s.fillStyle = sh;
      s.fillRect(0, 0, 30, BRICK_H);
    }

    // ---- Foreground vignette: thin edge bands (cheap, keeps the lens feel).
    const edge = (w: number, h: number, horizontal: boolean) => {
      const { cv, s } = makeCanvas(w, h);
      const g = horizontal
        ? linGrad(s, 0, 0, 0, h, [
            [0, dark ? "rgba(2,4,10,0.42)" : "rgba(70,84,110,0.16)"],
            [1, "rgba(0,0,0,0)"],
          ])
        : linGrad(s, 0, 0, w, 0, [
            [0, dark ? "rgba(2,4,10,0.34)" : "rgba(70,84,110,0.14)"],
            [1, "rgba(0,0,0,0)"],
          ]);
      s.fillStyle = g;
      s.fillRect(0, 0, w, h);
      return cv;
    };
    vigBottom = document.createElement("canvas");
    {
      const { cv, s } = makeCanvas(W, 132);
      const g = linGrad(s, 0, 0, 0, 132, [
        [0, "rgba(0,0,0,0)"],
        [1, dark ? "rgba(2,4,10,0.5)" : "rgba(70,84,110,0.18)"],
      ]);
      s.fillStyle = g;
      s.fillRect(0, 0, W, 132);
      vigBottom = cv;
    }
    vigLeft = edge(44, H, false);
    // Right vignette must fade OUT later than the left one: its gradient runs
    // from the inner edge (transparent) to the outer edge (dark). The old
    // reversed gradient produced a translucent vertical band on the right.
    vigRight = document.createElement("canvas");
    {
      const { cv, s } = makeCanvas(44, H);
      const g = linGrad(s, 0, 0, 44, 0, [
        [0, "rgba(0,0,0,0)"],
        [1, dark ? "rgba(2,4,10,0.3)" : "rgba(70,84,110,0.14)"],
      ]);
      s.fillStyle = g;
      s.fillRect(0, 0, 44, H);
      vigRight = cv;
    }

    // ---- Canvas-edge fade (device space): a soft lens edge across the whole
    // canvas so the extended margins blend into the field vignette. Cached
    // gradients, blitted as four rects per frame.
    const edgeInk = dark ? "2,4,10" : "70,84,110";
    const cw = canvas.width;
    const chh = canvas.height;
    const cap = 90 * scale;
    edgeHT = Math.min(cap, Math.max(18, viewOy + 26 * scale));
    edgeHB = Math.min(cap, Math.max(18, chh - viewOy - H * scale + 26 * scale));
    edgeHL = Math.min(cap, Math.max(18, viewOx + 30 * scale));
    edgeHR = Math.min(cap, Math.max(18, cw - viewOx - W * scale + 30 * scale));
    edgeGradTop = ctx.createLinearGradient(0, 0, 0, edgeHT);
    edgeGradTop.addColorStop(0, `rgba(${edgeInk},${dark ? 0.3 : 0.14})`);
    edgeGradTop.addColorStop(1, `rgba(${edgeInk},0)`);
    edgeGradBottom = ctx.createLinearGradient(0, chh, 0, chh - edgeHB);
    edgeGradBottom.addColorStop(0, `rgba(${edgeInk},${dark ? 0.3 : 0.14})`);
    edgeGradBottom.addColorStop(1, `rgba(${edgeInk},0)`);
    edgeGradLeft = ctx.createLinearGradient(0, 0, edgeHL, 0);
    edgeGradLeft.addColorStop(0, `rgba(${edgeInk},${dark ? 0.26 : 0.12})`);
    edgeGradLeft.addColorStop(1, `rgba(${edgeInk},0)`);
    edgeGradRight = ctx.createLinearGradient(cw, 0, cw - edgeHR, 0);
    edgeGradRight.addColorStop(0, `rgba(${edgeInk},${dark ? 0.26 : 0.12})`);
    edgeGradRight.addColorStop(1, `rgba(${edgeInk},0)`);

    // ---- Side walls baked to narrow sprites.
    wallLeft = makeWallSprite(true, dark);
    wallRight = makeWallSprite(false, dark);
  }

  function makeWallSprite(left: boolean, dark: boolean): HTMLCanvasElement {
    // Walls are gameplay bounds only: visually they are CRT edge shading, not a
    // grey panel with ticks (that read as a scrollbar / "shadow" on the right).
    const { cv, s } = makeCanvas(WALL, H);
    const grad = s.createLinearGradient(0, 0, WALL, 0);
    const edge = dark ? 0.62 : 0.16;
    if (left) {
      grad.addColorStop(0, "rgba(0,0,0," + edge + ")");
      grad.addColorStop(1, "rgba(0,0,0,0)");
    } else {
      grad.addColorStop(0, "rgba(0,0,0,0)");
      grad.addColorStop(1, "rgba(0,0,0," + edge + ")");
    }
    s.fillStyle = grad;
    s.fillRect(0, 0, WALL, H);
    // One quiet rim line so the playfield still has a defined edge.
    s.fillStyle = dark ? "rgba(150,180,230,0.14)" : "rgba(255,255,255,0.35)";
    s.fillRect(left ? WALL - 1 : 0, 0, 1, H);
    return cv;
  }

  // ------------------------------------------------------------- materials
  /** Common bevel: front gradient, glass top edge, contact shading. */
  function paintBrickBase(s: CanvasRenderingContext2D, bw: number, mat: Material): void {
    const grad = s.createLinearGradient(0, 0, 0, BRICK_H);
    grad.addColorStop(0, shade(mat.top, 1.02));
    grad.addColorStop(0.52, mat.top);
    grad.addColorStop(1, mat.bottom);
    s.fillStyle = grad;
    roundRectOn(s, 0, 0, bw, BRICK_H, 4);
    s.fill();
    // Glossy candy top edge.
    s.fillStyle = "rgba(255,255,255,0.42)";
    roundRectOn(s, 2.2, 1.4, bw - 4.4, 3.2, 1.8);
    s.fill();
    // Bottom contact shading inside the front face.
    s.fillStyle = "rgba(0,0,0,0.20)";
    roundRectOn(s, 2, BRICK_H - 4.6, bw - 4, 3.2, 1.6);
    s.fill();
  }

  /** 2.5D extrusion: side + under faces with gradients and rim light. */
  function paintExtrusion(s: CanvasRenderingContext2D, bw: number, mat: Material): void {
    // Right side face.
    s.fillStyle = linGrad(s, 0, 0, 0, BRICK_H, [
      [0, shade(mat.side, 1.1)],
      [1, shade(mat.side, 0.9)],
    ]);
    polyOn(s, [
      [bw, 0],
      [bw + EX, EX],
      [bw + EX, BRICK_H + EX],
      [bw, BRICK_H],
    ]);
    s.fill();
    // Bottom face (darkest, receives no sky light).
    s.fillStyle = linGrad(s, 0, BRICK_H, 0, BRICK_H + EX, [
      [0, shade(mat.under, 1.05)],
      [1, shade(mat.under, 0.82)],
    ]);
    polyOn(s, [
      [0, BRICK_H],
      [EX, BRICK_H + EX],
      [bw + EX, BRICK_H + EX],
      [bw, BRICK_H],
    ]);
    s.fill();
    // Rim light along the top-right corner catches the key light.
    s.strokeStyle = "rgba(255,255,255,0.14)";
    s.lineWidth = 1;
    s.beginPath();
    s.moveTo(bw - 0.5, 0.5);
    s.lineTo(bw + EX - 0.5, EX + 0.5);
    s.stroke();
    // Crisp seam between front face and extrusion.
    s.strokeStyle = "rgba(0,0,0,0.35)";
    s.lineWidth = 0.9;
    s.beginPath();
    s.moveTo(bw - 0.4, 0.6);
    s.lineTo(bw - 0.4, BRICK_H - 0.4);
    s.stroke();
    s.strokeStyle = "rgba(0,0,0,0.28)";
    s.beginPath();
    s.moveTo(0.5, BRICK_H);
    s.lineTo(EX + 0.5, BRICK_H + EX);
    s.stroke();
  }

  /** Per-kind surface detail, drawn on top of the base front face. */
  function paintMaterialDetail(s: CanvasRenderingContext2D, bw: number, mat: Material, kind: string): void {
    switch (kind) {
      case "spam": {
        // Water-stained matte plastic: faint run-off streaks + a wet sheen.
        for (let i = 0; i < 4; i++) {
          const x = 6 + i * ((bw - 12) / 3);
          s.fillStyle = "rgba(255,255,255,0.05)";
          s.fillRect(x, 4, 2.2, BRICK_H - 9);
        }
        s.fillStyle = linGrad(s, 0, 0, bw, BRICK_H, [
          [0.05, "rgba(255,255,255,0)"],
          [0.32, "rgba(235,245,255,0.10)"],
          [0.46, "rgba(255,255,255,0)"],
        ]);
        s.fillRect(0, 0, bw, BRICK_H);
        for (const sp of SPAM_SPECKLES) {
          if (sp.x > bw - 4) continue;
          s.fillStyle = `rgba(255,255,255,${sp.a * 0.55})`;
          s.beginPath();
          s.arc(sp.x, sp.y, sp.r * 0.8, 0, Math.PI * 2);
          s.fill();
        }
        // Waterline shadow near the bottom edge.
        s.fillStyle = linGrad(s, 0, BRICK_H - 8, 0, BRICK_H, [
          [0, "rgba(0,0,0,0)"],
          [1, "rgba(0,0,0,0.18)"],
        ]);
        s.fillRect(0, BRICK_H - 8, bw, 8);
        break;
      }
      case "gold": {
        // Metal frame + engraved plate + corner studs.
        s.strokeStyle = linGrad(s, 0, 0, bw, BRICK_H, [
          [0, "#fff1bd"],
          [0.4, "#e0ac3c"],
          [1, "#8e6714"],
        ]);
        s.lineWidth = 2.2;
        roundRectOn(s, 1.4, 1.4, bw - 2.8, BRICK_H - 2.8, 3.4);
        s.stroke();
        s.fillStyle = linGrad(s, 0, 3, 0, BRICK_H - 3, [
          [0, "#f8d37c"],
          [0.5, "#e2b04a"],
          [1, "#c1902c"],
        ]);
        roundRectOn(s, 4.2, 3.8, bw - 8.4, BRICK_H - 7.6, 2.4);
        s.fill();
        s.strokeStyle = "rgba(96,62,8,0.6)";
        s.lineWidth = 0.9;
        roundRectOn(s, 5, 4.6, bw - 10, BRICK_H - 9.2, 2);
        s.stroke();
        // Corner studs.
        for (const [cx, cy] of [
          [4.6, 4.4],
          [bw - 4.6, 4.4],
          [4.6, BRICK_H - 4.4],
          [bw - 4.6, BRICK_H - 4.4],
        ]) {
          s.save();
          s.translate(cx, cy);
          s.rotate(Math.PI / 4);
          s.fillStyle = "#fff3c4";
          s.fillRect(-1.6, -1.6, 3.2, 3.2);
          s.fillStyle = "rgba(126,84,10,0.75)";
          s.fillRect(-0.9, -0.9, 1.8, 1.8);
          s.restore();
        }
        // Baked specular band.
        s.save();
        roundRectOn(s, 1, 1, bw - 2, BRICK_H - 2, 3.4);
        s.clip();
        s.fillStyle = linGrad(s, 0, 0, bw, BRICK_H, [
          [0.28, "rgba(255,255,255,0)"],
          [0.42, "rgba(255,255,255,0.26)"],
          [0.5, "rgba(255,255,255,0.06)"],
          [0.62, "rgba(255,255,255,0)"],
        ]);
        s.fillRect(0, 0, bw, BRICK_H);
        s.restore();
        // Sparkle stars.
        for (const [sx, sy] of [
          [bw * 0.22, 5],
          [bw * 0.78, BRICK_H - 6],
        ]) {
          s.strokeStyle = "rgba(255,250,220,0.75)";
          s.lineWidth = 0.8;
          s.beginPath();
          s.moveTo(sx - 2.4, sy);
          s.lineTo(sx + 2.4, sy);
          s.moveTo(sx, sy - 2.4);
          s.lineTo(sx, sy + 2.4);
          s.stroke();
        }
        break;
      }
      case "flame": {
        // Charred edges + ember veins glowing from below.
        s.save();
        roundRectOn(s, 0, 0, bw, BRICK_H, 4);
        s.clip();
        const char = linGrad(s, 0, 0, 0, BRICK_H, [
          [0, "rgba(30,6,2,0.35)"],
          [0.35, "rgba(30,6,2,0)"],
          [1, "rgba(255,96,32,0.22)"],
        ]);
        s.fillStyle = char;
        s.fillRect(0, 0, bw, BRICK_H);
        s.strokeStyle = "rgba(255,132,58,0.55)";
        s.lineWidth = 1.1;
        s.shadowColor = "rgba(255,110,40,0.8)";
        s.shadowBlur = 4;
        for (let i = 0; i < 3; i++) {
          const x0 = 7 + i * ((bw - 16) / 2.5);
          s.beginPath();
          s.moveTo(x0, BRICK_H - 3);
          s.lineTo(x0 + 4, BRICK_H - 9);
          s.lineTo(x0 + 1, BRICK_H - 13);
          s.lineTo(x0 + 6, BRICK_H - 18);
          s.stroke();
        }
        s.restore();
        break;
      }
      case "bomb": {
        // Hazard stripes on both ends + a lit fuse at the top-right.
        s.save();
        roundRectOn(s, 0, 0, bw, BRICK_H, 4);
        s.clip();
        s.fillStyle = "rgba(28,18,8,0.55)";
        s.fillRect(0, 0, 9, BRICK_H);
        s.fillRect(bw - 9, 0, 9, BRICK_H);
        s.strokeStyle = "rgba(255,214,90,0.85)";
        s.lineWidth = 2.2;
        for (let x = -12; x < 12; x += 6) {
          s.beginPath();
          s.moveTo(x, BRICK_H);
          s.lineTo(x + 9, 0);
          s.stroke();
          s.beginPath();
          s.moveTo(bw - 9 + x + 9, BRICK_H);
          s.lineTo(bw - 9 + x + 18, 0);
          s.stroke();
        }
        s.strokeStyle = "rgba(0,0,0,0.45)";
        s.lineWidth = 0.8;
        s.strokeRect(9, 0, bw - 18, BRICK_H);
        s.restore();
        // Fuse wire curling from the top-right corner.
        s.strokeStyle = "#d8c7a2";
        s.lineWidth = 1.4;
        s.beginPath();
        s.moveTo(bw - 4, 1.5);
        s.quadraticCurveTo(bw + 1, 1, bw - 1.5, 5.5);
        s.stroke();
        s.fillStyle = "#ffd766";
        s.beginPath();
        s.arc(bw - 2, 6.5, 2.1, 0, Math.PI * 2);
        s.fill();
        break;
      }
      case "steel": {
        // Brushed metal plate with a centre seam and chunky rivets.
        s.save();
        roundRectOn(s, 0, 0, bw, BRICK_H, 4);
        s.clip();
        for (const st of STEEL_STREAKS) {
          if (st.x + st.w > bw - 2) continue;
          s.fillStyle = `rgba(255,255,255,${st.a})`;
          s.fillRect(st.x, st.y, st.w, 0.8);
        }
        s.fillStyle = "rgba(0,0,0,0.16)";
        s.fillRect(bw / 2 - 0.5, 2, 1.4, BRICK_H - 4);
        s.fillStyle = "rgba(255,255,255,0.18)";
        s.fillRect(bw / 2 + 0.9, 2, 0.8, BRICK_H - 4);
        s.restore();
        // Rivets: dark socket + lit head.
        for (const [rx, ry] of [
          [5.4, 8],
          [bw - 5.4, 8],
          [5.4, BRICK_H - 8],
          [bw - 5.4, BRICK_H - 8],
        ]) {
          s.fillStyle = "rgba(24,32,44,0.55)";
          s.beginPath();
          s.arc(rx, ry, 2.5, 0, Math.PI * 2);
          s.fill();
          s.fillStyle = "#eaf3ff";
          s.beginPath();
          s.arc(rx - 0.35, ry - 0.35, 1.7, 0, Math.PI * 2);
          s.fill();
          s.fillStyle = "rgba(70,86,106,0.75)";
          s.beginPath();
          s.arc(rx + 0.3, ry + 0.35, 1.3, 0, Math.PI * 2);
          s.fill();
        }
        // Steel band across the top edge.
        s.fillStyle = "rgba(255,255,255,0.22)";
        s.fillRect(3, 2.6, bw - 6, 1.4);
        break;
      }
      case "healer": {
        // Soft capsule with a faint cross watermark.
        s.save();
        roundRectOn(s, 1, 1, bw - 2, BRICK_H - 2, 4);
        s.clip();
        const glow = s.createRadialGradient(bw / 2, BRICK_H * 0.4, 2, bw / 2, BRICK_H * 0.4, bw * 0.6);
        glow.addColorStop(0, "rgba(230,255,220,0.30)");
        glow.addColorStop(1, "rgba(120,220,140,0)");
        s.fillStyle = glow;
        s.fillRect(0, 0, bw, BRICK_H);
        s.fillStyle = "rgba(255,255,255,0.16)";
        s.fillRect(bw / 2 - 1.4, 5, 2.8, BRICK_H - 10);
        s.fillRect(bw / 2 - 7, BRICK_H / 2 - 1.4, 14, 2.8);
        s.restore();
        s.strokeStyle = "rgba(255,255,255,0.30)";
        s.lineWidth = 1;
        roundRectOn(s, 3, 3, bw - 6, BRICK_H - 6, 3);
        s.stroke();
        break;
      }
      case "mirror": {
        // Folded mirror: two facets split by a bright crease.
        s.save();
        roundRectOn(s, 0, 0, bw, BRICK_H, 4);
        s.clip();
        const creaseX = bw * 0.42;
        const left = linGrad(s, 0, 0, creaseX, BRICK_H, [
          [0, "#ffffff"],
          [0.5, "#e7f0fb"],
          [1, "#bfd0e2"],
        ]);
        polyOn(s, [
          [0, 0],
          [creaseX, 0],
          [creaseX + 7, BRICK_H],
          [0, BRICK_H],
        ]);
        s.fillStyle = left;
        s.fill();
        const right = linGrad(s, creaseX, 0, bw, BRICK_H, [
          [0, "#c4d3e4"],
          [0.45, "#a7bacc"],
          [1, "#8fa3b8"],
        ]);
        polyOn(s, [
          [creaseX, 0],
          [bw, 0],
          [bw, BRICK_H],
          [creaseX + 7, BRICK_H],
        ]);
        s.fillStyle = right;
        s.fill();
        // Crease highlight.
        s.strokeStyle = "rgba(255,255,255,0.9)";
        s.lineWidth = 1.2;
        s.beginPath();
        s.moveTo(creaseX, 0);
        s.lineTo(creaseX + 7, BRICK_H);
        s.stroke();
        // Sky reflection diagonal.
        s.fillStyle = linGrad(s, 0, 0, bw, BRICK_H, [
          [0.15, "rgba(255,255,255,0)"],
          [0.35, "rgba(255,255,255,0.34)"],
          [0.45, "rgba(255,255,255,0)"],
        ]);
        s.fillRect(0, 0, bw, BRICK_H);
        s.restore();
        break;
      }
      case "core": {
        // Boss shell: obsidian plate, gilded rune frame, carved end pillars.
        s.fillStyle = linGrad(s, 0, 2, 0, BRICK_H - 2, [
          [0, "#3d1d58"],
          [0.5, "#251037"],
          [1, "#160a24"],
        ]);
        roundRectOn(s, 1, 1, bw - 2, BRICK_H - 2, 4.5);
        s.fill();
        // Rune ticks along the top and bottom edges.
        s.fillStyle = "rgba(214,166,255,0.55)";
        for (let x = 54; x < bw - 54; x += 9) {
          const tall = x % 27 < 9;
          s.fillRect(x, 2.4, 2, tall ? 3 : 1.6);
          s.fillRect(x, BRICK_H - 6, 2, tall ? 3 : 1.6);
        }
        // Gold-violet outer frame.
        s.strokeStyle = linGrad(s, 0, 0, bw, BRICK_H, [
          [0, "#e8c06a"],
          [0.2, "#8c5fc4"],
          [0.5, "#c79cff"],
          [0.8, "#7d4fb8"],
          [1, "#e8c06a"],
        ]);
        s.lineWidth = 1.9;
        roundRectOn(s, 1.2, 1.2, bw - 2.4, BRICK_H - 2.4, 4.2);
        s.stroke();
        s.strokeStyle = "rgba(10,4,18,0.75)";
        s.lineWidth = 0.8;
        roundRectOn(s, 3, 3, bw - 6, BRICK_H - 6, 3.4);
        s.stroke();
        // End pillars.
        s.fillStyle = "rgba(6,2,12,0.55)";
        for (const px of [8, bw - 48]) {
          roundRectOn(s, px, 4, 40, BRICK_H - 8, 3);
          s.fill();
        }
        s.strokeStyle = "rgba(200,150,255,0.35)";
        s.lineWidth = 0.8;
        for (const px of [8, bw - 48]) {
          roundRectOn(s, px, 4, 40, BRICK_H - 8, 3);
          s.stroke();
          for (let i = 0; i < 3; i++) {
            const yy = 8 + i * 6;
            s.fillStyle = "rgba(220,170,255,0.5)";
            s.fillRect(px + 3, yy, 3, 1.2);
          }
        }
        // Right pillar: rune circle.
        const rc = { x: bw - 26, y: BRICK_H / 2 };
        s.strokeStyle = "rgba(190,130,255,0.7)";
        s.lineWidth = 1.2;
        s.beginPath();
        s.arc(rc.x, rc.y, 8.2, 0, Math.PI * 2);
        s.stroke();
        s.strokeStyle = "rgba(230,190,255,0.45)";
        s.lineWidth = 0.8;
        s.beginPath();
        s.arc(rc.x, rc.y, 5.4, 0, Math.PI * 2);
        s.stroke();
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          s.fillStyle = "rgba(226,180,255,0.8)";
          s.fillRect(rc.x + Math.cos(a) * 6.8 - 0.9, rc.y + Math.sin(a) * 6.8 - 0.9, 1.8, 1.8);
        }
        // Recessed centre plate where the label sits.
        s.fillStyle = linGrad(s, 0, 5, 0, BRICK_H - 5, [
          [0, "rgba(58,26,84,0.55)"],
          [1, "rgba(12,5,20,0.65)"],
        ]);
        roundRectOn(s, 52, 4.6, bw - 104, BRICK_H - 9.2, 2.6);
        s.fill();
        s.strokeStyle = "rgba(150,96,210,0.4)";
        s.lineWidth = 0.8;
        roundRectOn(s, 52, 4.6, bw - 104, BRICK_H - 9.2, 2.6);
        s.stroke();
        // Energy line under the plate.
        s.fillStyle = "rgba(210,150,255,0.5)";
        s.fillRect(56, BRICK_H - 5.4, bw - 112, 1.1);
        break;
      }
      default:
        break;
    }
  }

  /** Bake one brick sprite: contact shadow + extrusion + front face + detail. */
  function bakeBrickSprite(kind: string, mat: Material, bw: number): HTMLCanvasElement {
    const sw = bw + PAD_L + PAD_R;
    const sh = BRICK_H + PAD_T + PAD_B;
    const { cv, s } = makeCanvas(sw, sh);
    s.translate(PAD_L, PAD_T);
    // 1. Contact shadow (baked: zero per-frame cost).
    s.save();
    s.shadowColor = "rgba(0,0,0,0.5)";
    s.shadowBlur = SHADOW_BLUR;
    s.shadowOffsetX = SHADOW_X;
    s.shadowOffsetY = SHADOW_Y;
    s.fillStyle = "rgba(0,0,0,0.55)";
    roundRectOn(s, 0, 0, bw, BRICK_H, 4);
    s.fill();
    polyOn(s, [
      [bw, 0],
      [bw + EX, EX],
      [bw + EX, BRICK_H + EX],
      [bw, BRICK_H],
    ]);
    s.fill();
    polyOn(s, [
      [0, BRICK_H],
      [EX, BRICK_H + EX],
      [bw + EX, BRICK_H + EX],
      [bw, BRICK_H],
    ]);
    s.fill();
    s.restore();
    // 2. Extrusion behind the front face.
    paintExtrusion(s, bw, mat);
    // 3. Front face + material.
    paintBrickBase(s, bw, mat);
    s.save();
    roundRectOn(s, 0, 0, bw, BRICK_H, 4);
    s.clip();
    paintMaterialDetail(s, bw, mat, kind);
    s.restore();
    // 4. Front border (thick near-black outline = the cartoon look).
    s.strokeStyle = mat.border;
    s.lineWidth = 2;
    roundRectOn(s, 1, 1, bw - 2, BRICK_H - 2, 4.5);
    s.stroke();
    // Inner bright lip on the top edge for a crisp candy bevel.
    s.strokeStyle = "rgba(255,255,255,0.3)";
    s.lineWidth = 1;
    roundRectOn(s, 2, 2, bw - 4, BRICK_H - 4, 3.4);
    s.stroke();
    return cv;
  }

  function buildSprites(): void {
    spriteCache.clear();
    spriteDpr = scale;
    for (const [kind, mat] of Object.entries(BRICK_MATERIALS)) {
      const widths = kind === "core" ? [(COLS - 2) * BRICK_W] : [BRICK_W];
      for (const bw of widths) {
        spriteCache.set(`${kind}:${bw}`, bakeBrickSprite(kind, mat, bw));
      }
    }
    buildBossExtras();
    glowWarm = makeGlow(255, 150, 60);
    glowGreen = makeGlow(120, 230, 130);
    glowViolet = makeGlow(196, 120, 255);
    glowAccent = makeGlow(255, 205, 110);
    labelSprites.clear();
    orbCache.clear();
    damageSpriteCache = new WeakMap();
  }

  // ------------------------------------------------------------- boss extras
  function buildBossExtras(): void {
    // Blinking eye for the core's left pillar.
    {
      const wEye = 26;
      const hEye = 18;
      const { cv, s } = makeCanvas(wEye, hEye);
      const cx = wEye / 2;
      const cy = hEye / 2;
      // Socket shadow.
      s.fillStyle = "rgba(6,2,12,0.9)";
      s.beginPath();
      s.ellipse(cx, cy, 11.4, 7.4, 0, 0, Math.PI * 2);
      s.fill();
      // Sclera.
      s.fillStyle = linGrad(s, 0, cy - 6, 0, cy + 6, [
        [0, "#7a3fae"],
        [1, "#2a0f42"],
      ]);
      s.beginPath();
      s.ellipse(cx, cy, 10, 6.1, 0, 0, Math.PI * 2);
      s.fill();
      // Iris.
      const iris = s.createRadialGradient(cx - 1.2, cy - 1.4, 0.6, cx, cy, 5.4);
      iris.addColorStop(0, "#ffe9ff");
      iris.addColorStop(0.35, "#e0a4ff");
      iris.addColorStop(0.75, "#a24ce0");
      iris.addColorStop(1, "#52157f");
      s.fillStyle = iris;
      s.beginPath();
      s.arc(cx, cy, 5.2, 0, Math.PI * 2);
      s.fill();
      // Slit pupil.
      s.fillStyle = "#0b0313";
      s.beginPath();
      s.ellipse(cx, cy, 1.5, 4.4, 0, 0, Math.PI * 2);
      s.fill();
      // Glints.
      s.fillStyle = "rgba(255,255,255,0.95)";
      s.beginPath();
      s.arc(cx - 2.1, cy - 2.3, 1.25, 0, Math.PI * 2);
      s.fill();
      s.fillStyle = "rgba(255,255,255,0.5)";
      s.beginPath();
      s.arc(cx + 2.4, cy + 1.6, 0.7, 0, Math.PI * 2);
      s.fill();
      // Eyelid rims.
      s.strokeStyle = "rgba(232,192,106,0.6)";
      s.lineWidth = 0.9;
      s.beginPath();
      s.ellipse(cx, cy, 10.6, 6.6, 0, Math.PI * 1.02, Math.PI * 1.98);
      s.stroke();
      s.beginPath();
      s.ellipse(cx, cy, 10.6, 6.6, 0, Math.PI * 0.02, Math.PI * 0.98);
      s.stroke();
      eyeSprite = cv;
    }
    // Soft violet boss aura.
    {
      const w = 340;
      const h = 130;
      const { cv, s } = makeCanvas(w, h);
      const g = s.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2);
      g.addColorStop(0, "rgba(196,120,255,0.55)");
      g.addColorStop(0.35, "rgba(150,70,230,0.24)");
      g.addColorStop(1, "rgba(120,40,200,0)");
      s.fillStyle = g;
      s.fillRect(0, 0, w, h);
      coreAuraSprite = cv;
    }
    // Rotating rune ring.
    {
      const w = 320;
      const h = 120;
      const { cv, s } = makeCanvas(w, h);
      const cx = w / 2;
      const cy = h / 2;
      s.translate(cx, cy);
      s.strokeStyle = "rgba(214,160,255,0.55)";
      s.lineWidth = 1.1;
      s.beginPath();
      s.ellipse(0, 0, 96, 40, 0, 0, Math.PI * 2);
      s.stroke();
      s.strokeStyle = "rgba(190,120,255,0.28)";
      s.lineWidth = 0.8;
      s.beginPath();
      s.ellipse(0, 0, 78, 32, 0, 0, Math.PI * 2);
      s.stroke();
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2;
        const rx = Math.cos(a) * 96;
        const ry = Math.sin(a) * 40;
        s.save();
        s.translate(rx, ry);
        s.rotate(a);
        s.fillStyle = "rgba(226,180,255,0.8)";
        if (i % 3 === 0) {
          s.fillRect(-1.4, -3.4, 2.8, 6.8);
        } else {
          s.fillRect(-1.1, -2.1, 2.2, 4.2);
        }
        s.restore();
      }
      coreRingSprite = cv;
    }
  }

  function ensureSprites(): void {
    if (spriteDpr !== scale) {
      buildSprites();
    }
    // Background layers depend on the canvas box (the bake covers the whole
    // canvas incl. scenery margins), the device scale and the theme mode.
    if (
      skyLayer === null ||
      bgMode !== palette.mode ||
      skyLayer.width !== canvas.width ||
      skyLayer.height !== canvas.height
    ) {
      buildBackgroundLayers();
    }
  }

  // ------------------------------------------------------------- damage art
  function damageFor(brick: BoardBrick): DamageArt {
    let art = damageCache.get(brick);
    if (!art) {
      const rng = makeRng(`damage-${brick.id}`);
      const cracks: CrackLine[] = [];
      const makeLine = (segments: number, len: number): CrackLine => {
        const pts: Array<[number, number]> = [];
        let x = 5 + rng() * Math.max(1, brick.w - 10);
        let y = 3 + rng() * (BRICK_H - 6);
        let ang = rng() * Math.PI * 2;
        pts.push([x, y]);
        for (let i = 0; i < segments; i++) {
          ang += (rng() - 0.5) * 1.4;
          const step = len * (0.6 + rng() * 0.8);
          x = Math.min(brick.w - 1.5, Math.max(1.5, x + Math.cos(ang) * step));
          y = Math.min(BRICK_H - 1.5, Math.max(1.5, y + Math.sin(ang) * step));
          pts.push([x, y]);
        }
        return { points: pts, width: 0.7 + rng() * 0.8 };
      };
      for (let i = 0; i < 3; i++) cracks.push(makeLine(2, 5.5));
      for (let i = 0; i < 4; i++) cracks.push(makeLine(3, 6.5));
      const chips: Array<{ corner: number; size: number; seed: number }> = [];
      chips.push({ corner: Math.floor(rng() * 4), size: 5 + rng() * 5, seed: rng() * 10 });
      if (rng() < 0.7) {
        chips.push({ corner: Math.floor(rng() * 4), size: 4 + rng() * 5, seed: rng() * 10 });
      }
      art = { cracks, chips };
      damageCache.set(brick, art);
    }
    return art;
  }

  /**
   * Per-brick damage sprite: darkening + scorched rim + cracks + chipped
   * corners baked into one canvas on first use. A damaged brick then costs a
   * single 1:1 blit instead of a clip, two stroke passes and a couple of fills.
   */
  let damageSpriteCache = new WeakMap<BoardBrick, Map<number, HTMLCanvasElement>>();
  function damageSpriteFor(brick: BoardBrick, stage: number): HTMLCanvasElement {
    let stages = damageSpriteCache.get(brick);
    if (!stages) {
      stages = new Map();
      damageSpriteCache.set(brick, stages);
    }
    const cached = stages.get(stage);
    if (cached) return cached;
    const art = damageFor(brick);
    const { cv, s } = makeCanvas(brick.w, BRICK_H);
    // 1. Darkening + stage-2 scorch rim.
    const alpha = stage === 1 ? 0.11 : 0.24;
    s.fillStyle = linGrad(s, 0, 0, 0, BRICK_H, [
      [0, `rgba(8,8,12,${alpha * 0.75})`],
      [0.55, `rgba(8,8,12,${alpha})`],
      [1, `rgba(8,8,12,${alpha * 1.35})`],
    ]);
    roundRectOn(s, 0, 0, brick.w, BRICK_H, 4);
    s.fill();
    if (stage === 2) {
      s.save();
      roundRectOn(s, 0, 0, brick.w, BRICK_H, 4);
      s.clip();
      s.strokeStyle = "rgba(0,0,0,0.42)";
      s.lineWidth = 5;
      roundRectOn(s, 2.5, 2.5, brick.w - 5, BRICK_H - 5, 2.5);
      s.stroke();
      s.strokeStyle = "rgba(0,0,0,0.25)";
      s.lineWidth = 2.2;
      roundRectOn(s, 5, 5, brick.w - 10, BRICK_H - 10, 2);
      s.stroke();
      s.restore();
      // 2. Chipped corners.
      for (const chip of art.chips) {
        const sz = chip.size;
        const cx = chip.corner % 2 === 0 ? 0 : brick.w;
        const cy = chip.corner < 2 ? 0 : BRICK_H;
        const sx = chip.corner % 2 === 0 ? 1 : -1;
        const sy = chip.corner < 2 ? 1 : -1;
        const jag = 0.35 + (chip.seed % 1) * 0.3;
        s.fillStyle = "rgba(8,8,12,0.85)";
        s.beginPath();
        s.moveTo(cx, cy);
        s.lineTo(cx + sx * sz, cy + sy * sz * 0.25);
        s.lineTo(cx + sx * sz * jag, cy + sy * sz * 0.7);
        s.lineTo(cx + sx * sz * 0.28, cy + sy * sz);
        s.closePath();
        s.fill();
        s.strokeStyle = "rgba(255,255,255,0.18)";
        s.lineWidth = 0.9;
        s.stroke();
      }
    }
    // 3. Crack network (dark line + light offset for chipped depth).
    const count = stage === 1 ? 3 : art.cracks.length;
    s.lineCap = "round";
    s.strokeStyle = "rgba(10,10,14,0.72)";
    s.lineWidth = 1.15;
    s.beginPath();
    for (let i = 0; i < count; i++) {
      const line = art.cracks[i];
      s.moveTo(line.points[0][0], line.points[0][1]);
      for (let p = 1; p < line.points.length; p++) {
        s.lineTo(line.points[p][0], line.points[p][1]);
      }
    }
    s.stroke();
    s.strokeStyle = "rgba(255,255,255,0.16)";
    s.lineWidth = 0.7;
    s.beginPath();
    for (let i = 0; i < count; i++) {
      const line = art.cracks[i];
      s.moveTo(line.points[0][0] + 0.7, line.points[0][1] + 0.7);
      for (let p = 1; p < line.points.length; p++) {
        s.lineTo(line.points[p][0] + 0.7, line.points[p][1] + 0.7);
      }
    }
    s.stroke();
    stages.set(stage, cv);
    return cv;
  }

  // ------------------------------------------------------------ scenery
  function drawBackground(): void {
    // Static backdrop (extended sky + far skyline + margins): one full-canvas
    // blit in device space, so the scenery margins come along for free.
    if (skyLayer) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(skyLayer, 0, 0);
      ctx.restore();
    }

    // Twinkling stars over the sky band (small arcs, cheap).
    if (palette.mode === "dark") {
      for (const star of STARS) {
        const tw = 0.4 + 0.6 * Math.abs(Math.sin(time * star.speed + star.phase));
        ctx.globalAlpha = tw * 0.8;
        ctx.fillStyle = "#dfe6ff";
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.r * 0.75, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // Near skyline band with slow parallax, tiled across the whole canvas
    // (field + side margins) so the city never stops at the field edge.
    const drift = palette.reducedMotion ? 0 : time * 3;
    const period = W + 80;
    const nearBandTop = H + shiftY - NEAR_BAND_H;
    if (nearStrip) {
      const off = (((-drift) % period) + period) % period;
      const kMin = Math.floor((-extL - off + 40) / period) - 1;
      const kMax = Math.floor((W + extR - off + 40) / period) + 1;
      for (let k = kMin; k <= kMax; k++) {
        const x = off + k * period - 40;
        if (x + period <= -extL || x >= W + extR) continue;
        ctx.drawImage(nearStrip, x, nearBandTop, period, NEAR_BAND_H);
      }
    }
    // One drifting mist layer, slightly faster than the skyline.
    if (mistLayer) {
      const m = (((-(time * 5)) % period) + period) % period;
      ctx.globalAlpha = 0.85;
      ctx.drawImage(mistLayer, m - 40, H + shiftY - 116, period, 112);
      ctx.globalAlpha = 1;
    }
    if (groundLayer) ctx.drawImage(groundLayer, -extL, H + shiftY - GROUND_H, extW, GROUND_H);

    // Perspective floor lines converging toward the vanishing point, starting
    // from the canvas bottom edge so the ground keeps its depth in the margin.
    ctx.strokeStyle = palette.mode === "dark" ? "rgba(140,160,210,0.08)" : "rgba(70,90,120,0.10)";
    ctx.lineWidth = 1;
    const floorY = H + shiftY;
    for (const [fx, fy] of [
      [-extL, floorY],
      [-extL + extW * 0.25, floorY],
      [-extL + extW * 0.75, floorY],
      [W + extR, floorY],
    ]) {
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.lineTo(W / 2 + (fx - W / 2) * 0.18, CANNON_Y + shiftY - 90);
      ctx.stroke();
    }
  }

  function drawWalls(): void {
    if (wallLeft) ctx.drawImage(wallLeft, 0, 0, WALL, H);
    if (wallRight) ctx.drawImage(wallRight, W - WALL, 0, WALL, H);
  }

  function drawCrushLine(): void {
    ctx.save();
    ctx.strokeStyle = "rgba(255,84,64,0.85)";
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 8]);
    ctx.lineDashOffset = palette.reducedMotion ? 0 : -(time * 26) % 18;
    ctx.beginPath();
    ctx.moveTo(WALL, CANNON_Y);
    ctx.lineTo(W - WALL, CANNON_Y);
    ctx.stroke();
    ctx.setLineDash([]);
    for (const side of [0, 1]) {
      const x = side === 0 ? WALL : W - WALL;
      ctx.fillStyle = "rgba(255,84,64,0.9)";
      ctx.beginPath();
      ctx.moveTo(x - (side === 0 ? 0 : 8), CANNON_Y - 9);
      ctx.lineTo(x + (side === 0 ? 8 : 0), CANNON_Y - 9);
      ctx.lineTo(x, CANNON_Y - 1);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  /** Depth fog that fades far (upper) parts of the tower. */
  function drawDepthFog(): void {
    if (fogLayer) ctx.drawImage(fogLayer, WALL, 0, W - WALL * 2, H * 0.55);
  }

  /** Soft contact shadow cast by the lowest row of the tower. */
  function drawTowerContactShadow(run: Run, offset: number): void {
    let bottom = -Infinity;
    for (const brick of run.tower.bricks) {
      if (!brick.alive) continue;
      const b = brick.y + offset + brick.h;
      if (b > bottom) bottom = b;
    }
    if (!Number.isFinite(bottom) || bottom < TOWER_TOP || bottom > CANNON_Y + 20) return;
    const h = 26;
    ctx.save();
    ctx.globalAlpha = 0.32;
    ctx.fillStyle = linGrad(ctx, 0, bottom + 2, 0, bottom + h, [
      [0, "rgba(0,0,0,0.65)"],
      [1, "rgba(0,0,0,0)"],
    ]);
    ctx.fillRect(WALL + 2, bottom + 2, W - WALL * 2 - 4, h);
    ctx.restore();
  }

  // ------------------------------------------------------------- bricks
  function brickSprite(kind: string, w: number): HTMLCanvasElement | null {
    return spriteCache.get(`${kind}:${w}`) ?? null;
  }

  /** Snap a logical coordinate to the device-pixel grid. */
  function snap(v: number): number {
    return Math.round(v * scale) / scale;
  }

  /** Blit a cached sprite at exactly 1 device px per source px (no resampling). */
  function blitExact(sprite: HTMLCanvasElement, x: number, y: number): void {
    ctx.drawImage(sprite, snap(x), snap(y), sprite.width / scale, sprite.height / scale);
  }

  /** Label text is baked once per (kind, label) instead of being stroked and
   *  filled on every frame — text rasterisation was a major per-frame cost. */
  const labelSprites = new Map<string, HTMLCanvasElement>();
  function labelSprite(kind: string, label: string, w: number): HTMLCanvasElement {
    const key = `${kind}|${w}|${label}`;
    const cached = labelSprites.get(key);
    if (cached) return cached;
    const { cv, s } = makeCanvas(w, BRICK_H);
    const mat = BRICK_MATERIALS[kind] ?? BRICK_MATERIALS.spam;
    const isCore = kind === "core";
    s.font = `${isCore ? 800 : 700} ${isCore ? 13 : 11}px system-ui, sans-serif`;
    s.textAlign = "center";
    s.textBaseline = "middle";
    s.strokeStyle = mat.inkStroke ?? "rgba(0,0,0,0.45)";
    s.lineWidth = 2.2;
    s.strokeText(label, w / 2, BRICK_H / 2 - 1.2, w - 7);
    s.fillStyle = mat.ink ?? "rgba(255,255,255,0.96)";
    s.fillText(label, w / 2, BRICK_H / 2 - 1.2, w - 7);
    labelSprites.set(key, cv);
    return cv;
  }

  /** Emissive + specular flourishes, grouped so compositing state changes once
   *  per pass instead of once per brick. */
  function drawBrickFxPass(run: Run, offset: number): void {
    const animated = !palette.reducedMotion;
    const dim = palette.mode === "light" ? 0.6 : 1;
    let lighter = false;
    for (const brick of run.tower.bricks) {
      if (!brick.alive) continue;
      const y = brick.y + offset;
      let sprite: HTMLCanvasElement | null = null;
      let size = 32;
      let alpha = 0;
      if (brick.kind === "flame") {
        sprite = glowWarm;
        size = 34;
        alpha = (animated ? 0.14 + 0.1 * (0.5 + 0.5 * Math.sin(time * 3 + brick.id)) : 0.18) * dim;
      } else if (brick.kind === "bomb") {
        sprite = glowAccent;
        size = 30;
        alpha = (animated ? 0.1 + 0.08 * (0.5 + 0.5 * Math.sin(time * 2.2 + brick.id)) : 0.13) * dim;
      } else if (brick.kind === "healer") {
        sprite = glowGreen;
        size = 38;
        alpha = (animated ? 0.12 + 0.12 * (0.5 + 0.5 * Math.sin(time * 2.6 + brick.id)) : 0.16) * dim;
      }
      if (!sprite || alpha <= 0.005) continue;
      if (!lighter) {
        ctx.globalCompositeOperation = "lighter";
        lighter = true;
      }
      ctx.globalAlpha = alpha;
      ctx.drawImage(sprite, brick.x + brick.w / 2 - size / 2, y + BRICK_H / 2 - size / 2, size, size);
    }
    if (lighter) {
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    }
    if (!animated || !shimmerLayer) return;
    for (const brick of run.tower.bricks) {
      if (!brick.alive || (brick.kind !== "gold" && brick.kind !== "mirror")) continue;
      const y = brick.y + offset;
      const speed = brick.kind === "gold" ? 0.35 : 0.22;
      const spread = brick.kind === "gold" ? 10 : 7;
      const sweep = ((time * speed + (brick.id % spread) * 0.15) % 1) * (brick.w + 40) - 20;
      ctx.save();
      roundRectOn(ctx, brick.x + 1, y + 1, brick.w - 2, BRICK_H - 2, 3);
      ctx.clip();
      ctx.globalAlpha = brick.kind === "gold" ? 1 : 0.5;
      ctx.drawImage(shimmerLayer, brick.x + sweep - 15, y, 30, BRICK_H);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  /** 护甲层：核心外面套几圈甲片，破一层少一圈。 */
  function drawArmorPlates(brick: BoardBrick, y: number): void {
    if (brick.armor <= 0) return;
    const cx = brick.x + brick.w / 2;
    const cy = y + brick.h / 2;
    const animated = !palette.reducedMotion;
    for (let layer = 0; layer < brick.armor; layer += 1) {
      const inset = 5 + layer * 4;
      const pulse = animated ? 0.72 + 0.1 * Math.sin(time * 2.2 + layer) : 0.78;
      ctx.save();
      ctx.globalAlpha = pulse;
      ctx.strokeStyle = palette.mode === "light" ? "rgba(90,110,150,0.75)" : "rgba(160,200,255,0.8)";
      ctx.lineWidth = 1.6;
      ctx.setLineDash(layer === 0 ? [7, 5] : [3, 4]);
      ctx.lineDashOffset = animated ? (layer % 2 === 0 ? -time * 14 : time * 14) : 0;
      roundRectOn(
        ctx,
        brick.x + inset,
        y + inset * 0.5,
        brick.w - inset * 2,
        brick.h - inset,
        3
      );
      ctx.stroke();
      ctx.restore();
    }
    ctx.setLineDash([]);
  }

  function drawCoreDynamics(brick: BoardBrick, y: number): void {
    const animated = !palette.reducedMotion;
    // Rotating rune ring behind the plate.
    if (coreRingSprite) {
      const rotation = animated ? time * 0.35 : 0.4;
      const alpha =
        (animated ? 0.3 + 0.1 * Math.sin(time * 1.7) : 0.34) * (palette.mode === "light" ? 0.7 : 1);
      ctx.save();
      ctx.translate(brick.x + brick.w / 2, y + BRICK_H / 2);
      ctx.rotate(rotation);
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = alpha;
      ctx.drawImage(coreRingSprite, -160, -60, 320, 120);
      ctx.restore();
    }
    // Blinking eye.
    if (eyeSprite) {
      const cycle = (time + (brick.id % 3) * 1.1) % 4.2;
      const blink =
        cycle > 3.95 ? Math.max(0.12, Math.abs(Math.cos(((cycle - 3.95) / 0.25) * Math.PI))) : 1;
      const ex = brick.x + 28;
      const ey = y + BRICK_H / 2;
      ctx.save();
      ctx.translate(ex, ey);
      ctx.scale(1, blink);
      ctx.drawImage(eyeSprite, -13, -9, 26, 18);
      ctx.restore();
      blitGlow(glowViolet, ex, ey, 22, (0.22 + 0.1 * Math.sin(time * 2.4)) * (blink > 0.5 ? 1 : 0.2));
    }
  }

  function drawBrick(brick: BoardBrick, offset: number, hpFraction: number): void {
    const y = brick.y + offset;
    // 允许画到场地顶以上的天空边距里（楼体滑入时可见），配合顶端连续渐隐。
    if (y > H + BRICK_H + EX || y + brick.h + EX < -ROW_PITCH_PX * 5) return;
    if (brick.kind === "core" && coreAuraSprite) {
      const alpha =
        (palette.reducedMotion ? 0.42 : 0.4 + 0.18 * Math.sin(time * 1.8)) *
        (palette.mode === "light" ? 0.55 : 1);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = alpha;
      ctx.drawImage(coreAuraSprite, brick.x + brick.w / 2 - 170, y + BRICK_H / 2 - 65, 340, 130);
      ctx.restore();
    }
    const sprite = brickSprite(brick.kind, brick.w);
    if (sprite) blitExact(sprite, brick.x - PAD_L, y - PAD_T);

    const stage = hpFraction >= 0.6 ? 0 : hpFraction >= 0.3 ? 1 : 2;
    if (stage > 0) blitExact(damageSpriteFor(brick, stage), brick.x, y);

    if (brick.kind === "core") {
      drawArmorPlates(brick, y);
      drawCoreDynamics(brick, y);
    }

    // Slim HP rail only once the brick is hurt (keeps full bricks clean).
    if (hpFraction < 0.999) {
      const barY = y + BRICK_H - 2.6;
      const barW = brick.w - 8;
      const clamped = Math.max(0, Math.min(1, hpFraction));
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      roundRectOn(ctx, brick.x + 4, barY, barW, 2.3, 1.15);
      ctx.fill();
      ctx.fillStyle = clamped > 0.5 ? "#7ee06a" : clamped > 0.25 ? "#ffce4a" : "#ff5a44";
      if (clamped > 0.02) {
        roundRectOn(ctx, brick.x + 4, barY, barW * clamped, 2.3, 1.15);
        ctx.fill();
      }
    }

    if (brick.w >= 40 && brick.label) {
      blitExact(labelSprite(brick.kind, brick.label, brick.w), brick.x, y);
    }
  }

  // ------------------------------------------------------------- ball
  /** Ball + baked halo, cached per radius so its blit is 1:1 (no resampling). */
  const orbCache = new Map<string, HTMLCanvasElement>();
  function orbFor(radius: number): HTMLCanvasElement {
    const key = radius.toFixed(2);
    const cached = orbCache.get(key);
    if (cached) return cached;
    const logical = radius * 4.2;
    const { cv, s } = makeCanvas(logical, logical);
    const c = logical / 2;
    const r = radius * 1.3;
    // Warm halo (baked: used to be an additive pass per ball per frame).
    const halo = s.createRadialGradient(c, c, r * 0.55, c, c, logical / 2);
    halo.addColorStop(0, "rgba(255,196,100,0.45)");
    halo.addColorStop(0.5, "rgba(255,152,60,0.14)");
    halo.addColorStop(1, "rgba(255,140,50,0)");
    s.fillStyle = halo;
    s.fillRect(0, 0, logical, logical);
    // Amber body.
    const grad = s.createRadialGradient(c - r * 0.34, c - r * 0.4, r * 0.06, c, c, r);
    grad.addColorStop(0, "#ffffff");
    grad.addColorStop(0.16, "#fff7dc");
    grad.addColorStop(0.38, "#ffd875");
    grad.addColorStop(0.66, "#f0a634");
    grad.addColorStop(0.88, "#a85f12");
    grad.addColorStop(1, "#5d3207");
    s.fillStyle = grad;
    s.beginPath();
    s.arc(c, c, r, 0, Math.PI * 2);
    s.fill();
    // Inner shadow on the lower-right (sphere volume) + bounce light.
    s.save();
    s.beginPath();
    s.arc(c, c, r, 0, Math.PI * 2);
    s.clip();
    const inner = s.createRadialGradient(c + r * 0.42, c + r * 0.46, r * 0.1, c + r * 0.3, c + r * 0.3, r * 1.05);
    inner.addColorStop(0, "rgba(84,36,0,0.55)");
    inner.addColorStop(0.5, "rgba(84,36,0,0.10)");
    inner.addColorStop(1, "rgba(84,36,0,0)");
    s.fillStyle = inner;
    s.fillRect(0, 0, logical, logical);
    const bounce = s.createRadialGradient(c, c + r * 0.72, r * 0.05, c, c + r * 0.6, r * 0.55);
    bounce.addColorStop(0, "rgba(255,214,130,0.5)");
    bounce.addColorStop(1, "rgba(255,180,80,0)");
    s.fillStyle = bounce;
    s.fillRect(0, 0, logical, logical);
    s.restore();
    // Specular highlight (sharp + soft).
    s.save();
    s.translate(c - r * 0.36, c - r * 0.42);
    s.rotate(-0.55);
    s.fillStyle = "rgba(255,255,255,0.95)";
    s.beginPath();
    s.ellipse(0, 0, r * 0.2, r * 0.12, 0, 0, Math.PI * 2);
    s.fill();
    s.fillStyle = "rgba(255,255,255,0.35)";
    s.beginPath();
    s.ellipse(0, r * 0.02, r * 0.3, r * 0.19, 0, 0, Math.PI * 2);
    s.fill();
    s.restore();
    // Rim light along the bottom arc.
    s.strokeStyle = "rgba(255,206,140,0.55)";
    s.lineWidth = 1.4;
    s.beginPath();
    s.arc(c, c, r - 0.8, Math.PI * 0.18, Math.PI * 0.82);
    s.stroke();
    orbCache.set(key, cv);
    return cv;
  }

  function drawBall(ball: BallBody): void {
    const trail = ball.trail;
    const head = { x: ball.x, y: ball.y };
    const pts = trail.concat([head]);
    if (!palette.reducedMotion) {
      // Split the path at sharp direction changes (wall/brick bounces): a
      // single ribbon across a reversal self-intersects and shows a white spike.
      const runs: Array<Array<{ x: number; y: number }>> = [];
      let run: Array<{ x: number; y: number }> = [pts[0]];
      for (let i = 1; i < pts.length; i++) {
        if (run.length >= 2) {
          const last = run[run.length - 1];
          const prev = run[run.length - 2];
          const d1x = last.x - prev.x;
          const d1y = last.y - prev.y;
          const d2x = pts[i].x - last.x;
          const d2y = pts[i].y - last.y;
          const l1 = Math.hypot(d1x, d1y) || 1;
          const l2 = Math.hypot(d2x, d2y) || 1;
          if ((d1x * d2x + d1y * d2y) / (l1 * l2) < 0.2) {
            runs.push(run);
            run = [last];
          }
        }
        run.push(pts[i]);
      }
      runs.push(run);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      // One gradient for the whole trail (position based), one fill and one
      // stroke for every run: bouncing must not multiply draw calls.
      const grad = ctx.createLinearGradient(pts[0].x, pts[0].y, head.x, head.y);
      grad.addColorStop(0, "rgba(255,168,60,0)");
      grad.addColorStop(0.5, "rgba(255,178,76,0.22)");
      grad.addColorStop(1, "rgba(255,228,164,0.55)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      for (const segment of runs) {
        const n = segment.length;
        if (n < 2) continue;
        const left: Array<[number, number]> = [];
        const right: Array<[number, number]> = [];
        for (let i = 0; i < n; i++) {
          const t = i / (n - 1);
          const w = ball.r * (0.22 + t);
          const p = segment[i];
          const q = segment[Math.min(n - 1, i + 1)];
          const o = segment[Math.max(0, i - 1)];
          let dx = q.x - o.x;
          let dy = q.y - o.y;
          const len = Math.hypot(dx, dy) || 1;
          dx /= len;
          dy /= len;
          left.push([p.x - dy * w, p.y + dx * w]);
          right.push([p.x + dy * w, p.y - dx * w]);
        }
        ctx.moveTo(left[0][0], left[0][1]);
        for (let i = 1; i < n; i++) ctx.lineTo(left[i][0], left[i][1]);
        for (let i = n - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
        ctx.closePath();
      }
      ctx.fill();
      ctx.strokeStyle = "rgba(255,240,200,0.45)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const segment of runs) {
        if (segment.length < 2) continue;
        ctx.moveTo(segment[0].x, segment[0].y);
        for (let i = 1; i < segment.length; i++) ctx.lineTo(segment[i].x, segment[i].y);
      }
      ctx.stroke();
      ctx.restore();
    }
    const sprite = orbFor(ball.r);
    const logical = sprite.width / scale;
    const x = snap(ball.x - logical / 2);
    const y = snap(ball.y - logical / 2);
    // Durability cue: only when the player invested in bounces, so the
    // default single-bounce ball doesn't paint the whole field red.
    const tired = ball.bounces <= 1 && ball.bouncesMax > 1;
    if (tired) {
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.drawImage(sprite, x, y, logical, logical);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = "rgba(255,107,82,0.85)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.r + 1.6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      return;
    }
    ctx.drawImage(sprite, x, y, logical, logical);
  }

  /** 炮台皮肤色板:只影响炮身/底座警示条/安全帽/工装的点缀色。 */
  const SKIN_DEFS: Record<string, { body: [string, string]; stripe: string; helmet: string; vest: string }> = {
    classic: { body: ["#93a9cc", "#39496b"], stripe: "#ffc13d", helmet: "#ffcf4d", vest: "#ff9d5c" },
    gold: { body: ["#f2d98c", "#a87512"], stripe: "#fff0b8", helmet: "#ffe9a6", vest: "#d8a83c" },
    neon: { body: ["#7de3ff", "#1f7fb8"], stripe: "#8affd4", helmet: "#ff8ae0", vest: "#3fd0ff" },
  };

  function drawCannon(run: Run): void {
    const cx = W / 2;
    const cy = CANNON_Y;
    const dark = palette.mode === "dark";
    const skin = SKIN_DEFS[skinName] ?? SKIN_DEFS.classic;
    const kick = recoil * 5;
    const charging = run.phase === "aim";
    const charge = charging
      ? palette.reducedMotion
        ? 0.6
        : 0.5 + 0.5 * Math.sin(time * 5.2)
      : 0;
    const OUTLINE = "rgba(16,22,34,0.9)";

    // --- soft contact shadow on the floor
    const shadow = ctx.createRadialGradient(cx, cy + 17, 2, cx, cy + 17, 40);
    shadow.addColorStop(0, "rgba(0,0,0,0.5)");
    shadow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = shadow;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 17, 36, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    // --- 卡通底座:圆角平台 + 黄黑警示条
    ctx.fillStyle = linGrad(ctx, cx - 30, 0, cx + 30, 0, [
      [0, dark ? "#2e3c55" : "#8fa6c2"],
      [0.45, dark ? "#5d7194" : "#d5e2f2"],
      [1, dark ? "#233048" : "#7790b2"],
    ]);
    roundRectOn(ctx, cx - 30, cy + 2, 60, 15, 7);
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2;
    roundRectOn(ctx, cx - 30, cy + 2, 60, 15, 7);
    ctx.stroke();
    // Hazard stripes clipped to the platform.
    ctx.save();
    roundRectOn(ctx, cx - 27, cy + 5, 54, 9, 5);
    ctx.clip();
    ctx.fillStyle = skin.stripe;
    ctx.fillRect(cx - 27, cy + 5, 54, 9);
    ctx.fillStyle = "rgba(24,30,44,0.85)";
    for (let x = cx - 27; x < cx + 27; x += 12) {
      ctx.beginPath();
      ctx.moveTo(x, cy + 14);
      ctx.lineTo(x + 6, cy + 14);
      ctx.lineTo(x + 12, cy + 5);
      ctx.lineTo(x + 6, cy + 5);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = "rgba(255,255,255,0.28)";
    ctx.fillRect(cx - 27, cy + 5, 54, 1.6);
    ctx.restore();

    // --- Q 版拆迁队员(站在炮身后侧,随瞄准方向侧头)
    const look = run.aimAngle === 0 ? 0 : run.aimAngle > 0 ? 1 : -1;
    const px = cx - 19;
    const bob = palette.reducedMotion ? 0 : Math.sin(time * 3.1) * 1.1;
    // 身体(橙色工装)
    ctx.fillStyle = linGrad(ctx, px - 8, 0, px + 8, 0, [
      [0, shade(skin.vest, dark ? 0.75 : 1.05)],
      [1, shade(skin.vest, dark ? 0.5 : 0.85)],
    ]);
    roundRectOn(ctx, px - 8, cy - 14 + bob, 16, 17, 6);
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2;
    roundRectOn(ctx, px - 8, cy - 14 + bob, 16, 17, 6);
    ctx.stroke();
    // 反光背心条纹
    ctx.fillStyle = "rgba(255,236,150,0.9)";
    ctx.fillRect(px - 6, cy - 6 + bob, 12, 3);
    ctx.fillStyle = "rgba(255,236,150,0.55)";
    ctx.fillRect(px - 6, cy - 1.6 + bob, 12, 2);
    // 头
    const headY = cy - 22 + bob;
    ctx.fillStyle = "#ffd9b0";
    ctx.beginPath();
    ctx.arc(px, headY, 7.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2;
    ctx.stroke();
    // 安全帽(黄) + 帽檐
    ctx.fillStyle = skin.helmet;
    ctx.beginPath();
    ctx.arc(px, headY - 1.4, 7.6, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2;
    ctx.stroke();
    roundRectOn(ctx, px - 9.6, headY - 1.8, 19.2, 3.2, 1.6);
    ctx.fillStyle = skin.helmet;
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    roundRectOn(ctx, px - 3.4, headY - 8.6, 6.8, 2.6, 1.3);
    ctx.fill();
    // 眼睛看向瞄准方向 + 红晕
    ctx.fillStyle = "#26202a";
    ctx.beginPath();
    ctx.arc(px + 2.4 + look * 1.6, headY + 1.6, 1.25, 0, Math.PI * 2);
    ctx.arc(px - 2.2 + look * 1.6, headY + 1.6, 1.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,120,110,0.5)";
    ctx.beginPath();
    ctx.arc(px - 5 + look, headY + 3.4, 1.5, 0, Math.PI * 2);
    ctx.arc(px + 5 + look, headY + 3.4, 1.5, 0, Math.PI * 2);
    ctx.fill();
    // 手臂扶着炮枢轴
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 3.4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(px + 6, cy - 8 + bob);
    ctx.lineTo(cx - 7, cy - 6);
    ctx.stroke();
    ctx.lineCap = "butt";

    // --- 卡通炮身(随瞄准旋转)
    ctx.save();
    ctx.translate(cx, cy - 1);
    ctx.rotate(run.aimAngle);
    ctx.translate(0, kick);

    // 炮管:粗短圆润,上亮下暗
    ctx.fillStyle = linGrad(ctx, -9, 0, 9, 0, [
      [0, dark ? shade(skin.body[1], 0.9) : skin.body[0]],
      [0.3, dark ? shade(skin.body[0], 1.1) : shade(skin.body[0], 1.12)],
      [1, dark ? skin.body[1] : shade(skin.body[1], 1.15)],
    ]);
    roundRectOn(ctx, -9, -32, 18, 30, 8);
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2;
    roundRectOn(ctx, -9, -32, 18, 30, 8);
    ctx.stroke();
    // 炮口箍
    ctx.fillStyle = linGrad(ctx, -10.5, 0, 10.5, 0, [
      [0, dark ? "#31415f" : "#7291bb"],
      [0.4, dark ? "#a3b8d8" : "#e6f0fb"],
      [1, dark ? "#26344e" : "#5c78a4"],
    ]);
    roundRectOn(ctx, -10.5, -37.5, 21, 10, 5);
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2;
    roundRectOn(ctx, -10.5, -37.5, 21, 10, 5);
    ctx.stroke();
    // 炮口
    ctx.fillStyle = "#0a0f1c";
    ctx.beginPath();
    ctx.ellipse(0, -36.5, 6.4, 2.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(224,182,76,0.9)";
    ctx.beginPath();
    ctx.ellipse(0, -36.5, 4, 1.5, 0, 0, Math.PI * 2);
    ctx.fill();
    // 炮身上高光条
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    roundRectOn(ctx, -5.4, -29, 3, 22, 1.5);
    ctx.fill();
    // 铆钉
    ctx.fillStyle = "rgba(16,22,34,0.85)";
    ctx.beginPath();
    ctx.arc(-5.5, -5.5, 1.3, 0, Math.PI * 2);
    ctx.arc(5.5, -5.5, 1.3, 0, Math.PI * 2);
    ctx.fill();

    // 瞄准充能:炮口聚能(保留)
    if (charge > 0) {
      blitGlow(glowAccent, 0, -37, 30 + charge * 14, 0.16 + charge * 0.28);
      ctx.strokeStyle = `rgba(255,214,130,${0.3 + charge * 0.4})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(0, -36.5, 8 + charge * 2.6, Math.PI * 0.12, Math.PI * 0.88);
      ctx.stroke();
      if (!palette.reducedMotion) {
        for (let i = 0; i < 3; i++) {
          const a = time * 3.4 + (i * Math.PI * 2) / 3;
          const rad = 12 + Math.sin(time * 6 + i) * 2;
          ctx.fillStyle = "rgba(255,226,160,0.7)";
          ctx.beginPath();
          ctx.arc(Math.cos(a) * rad * 0.5, -36.5 - Math.abs(Math.sin(a)) * rad * 0.4, 0.9, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.restore();

    // 弹珠计数胶囊(保留)
    const label = `● ×${run.mods.balls}`;
    ctx.font = "800 11px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const tw = ctx.measureText(label).width + 18;
    ctx.fillStyle = dark ? "rgba(10,14,26,0.78)" : "rgba(255,255,255,0.75)";
    roundRectOn(ctx, cx - tw / 2, cy + 21.5, tw, 16, 8);
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.6;
    roundRectOn(ctx, cx - tw / 2, cy + 21.5, tw, 16, 8);
    ctx.stroke();
    ctx.fillStyle = palette.text;
    ctx.fillText(label, cx, cy + 29.6);
    ctx.textBaseline = "alphabetic";
  }

  // ------------------------------------------------------------- fx
  function handleFx(run: Run, events: FxEvent[]): void {
    for (const event of events) {
      switch (event.type) {
        case "launch": {
          muzzleT = 0.09;
          recoil = 1;
          break;
        }
        case "hit": {
          hitFlash = Math.min(1, hitFlash + (event.crit ? 0.14 : 0.04));
          spawnSparks(event.x, event.y, event.crit ? palette.accent : "#ffe9c9", event.crit ? 18 : 7, 85);
          rings.push({
            x: event.x,
            y: event.y,
            life: 0.24,
            maxLife: 0.24,
            radius: event.crit ? 32 : 17,
            color: event.crit ? palette.accent : "rgba(255,255,255,0.8)",
            width: event.crit ? 3 : 2.2,
          });
          if (event.crit) shake = Math.min(3, shake + 0.7);
          break;
        }
        case "destroy": {
          const mat = BRICK_MATERIALS[event.kind] ?? BRICK_MATERIALS.spam;
          spawnDebris(event.x, event.y, mat.top, event.kind === "core" ? 38 : 11);
          spawnSparks(event.x, event.y, mat.bottom, event.kind === "core" ? 40 : 10, 130);
          shake = Math.min(3, shake + (event.kind === "core" ? 1.5 : 0.6));
          break;
        }
        case "blast": {
          rings.push({
            x: event.x,
            y: event.y,
            life: 0.45,
            maxLife: 0.45,
            radius: event.radius,
            color: "rgba(255,154,60,0.9)",
            width: 5,
          });
          rings.push({
            x: event.x,
            y: event.y,
            life: 0.62,
            maxLife: 0.62,
            radius: event.radius * 1.15,
            color: "rgba(255,214,150,0.45)",
            width: 2,
          });
          spawnSparks(event.x, event.y, "#ff9a3c", 26, 190);
          spawnDebris(event.x, event.y, "#cd5c14", 9);
          shake = Math.min(4, shake + 1.5);
          break;
        }
        case "proc": {
          const paletteByKind: Record<string, string> = {
            crit: "#ffe9a8",
            pierce: "#8fd8ff",
            burn: "#ff8a3c",
            poison: "#9de06a",
            resonance: "#d68cff",
            splash: "#ffb347",
            bossbane: "#ffd977",
            rebound: "#8fb8ff",
          };
          const ink = paletteByKind[event.kind] ?? "#ffffff";
          const core = event.kind === "crit" || event.kind === "bossbane";
          rings.push({
            x: event.x,
            y: event.y,
            life: core ? 0.42 : 0.3,
            maxLife: core ? 0.42 : 0.3,
            radius: core ? 46 : event.kind === "splash" ? 54 : 30,
            color: ink,
            width: core ? 3.2 : 2,
          });
          spawnSparks(event.x, event.y, ink, core ? 10 : 5, core ? 90 : 55);
          if (event.kind === "burn") spawnDebris(event.x, event.y, "#ff7a3c", 4);
          if (event.kind === "poison") spawnSparks(event.x, event.y, "#9de06a", 6, 30);
          if (event.kind === "resonance") {
            rings.push({
              x: event.x,
              y: event.y,
              life: 0.5,
              maxLife: 0.5,
              radius: 62,
              color: "#8ee06a",
              width: 2,
            });
          }
          if (core) {
            flash = Math.max(flash, 0.22);
            shake = Math.min(4, shake + 0.9);
          }
          break;
        }
        case "fizzle": {
          spawnSparks(event.x, event.y, "#ffd9a0", 3, 26);
          rings.push({
            x: event.x,
            y: event.y,
            life: 0.22,
            maxLife: 0.22,
            radius: 14,
            color: "rgba(255,220,160,0.55)",
            width: 1.4,
          });
          break;
        }
        case "status": {
          spawnSparks(event.x, event.y, event.kind === "burn" ? "#ff7a3c" : "#8ee06a", 3, 34);
          break;
        }
        case "heal": {
          rings.push({
            x: event.x,
            y: event.y,
            life: 0.5,
            maxLife: 0.5,
            radius: 40,
            color: "rgba(126,224,106,0.8)",
            width: 3,
          });
          break;
        }
        case "shield": {
          flash = Math.max(flash, 0.6);
          rings.push({
            x: W / 2,
            y: CANNON_Y - 20,
            life: 0.5,
            maxLife: 0.5,
            radius: 90,
            color: "rgba(120,190,255,0.9)",
            width: 6,
          });
          shake = Math.min(4, shake + 1.5);
          break;
        }
        case "collapse": {
          shake = Math.min(5, shake + 2.5);
          spawnDebris(W / 2, H - 90, SKYLINE_NEAR[palette.mode], 26);
          rings.push({
            x: W / 2,
            y: H - 60,
            life: 0.6,
            maxLife: 0.6,
            radius: 150,
            color: "rgba(200,210,230,0.5)",
            width: 8,
          });
          break;
        }
        case "death": {
          flash = 1;
          shake = 5;
          break;
        }
        case "bossappear": {
          shake = Math.min(4.5, shake + 2.6);
          flash = Math.min(1, flash + 0.55);
          rings.push({
            x: W / 2,
            y: TOWER_TOP + 60,
            life: 0.6,
            maxLife: 0.6,
            radius: 150,
            color: "rgba(255,110,90,0.9)",
            width: 6,
          });
          break;
        }
        case "bosskill": {
          flash = Math.max(flash, 0.8);
          spawnDebris(W / 2, TOWER_TOP + 40, BRICK_MATERIALS.core.top, 34);
          spawnSparks(W / 2, TOWER_TOP + 40, palette.accent, 60, 230);
          shake = 4.5;
          break;
        }
        default:
          break;
      }
    }
  }

  /** Small additive sparks: hot streaks along the velocity vector. */
  function spawnSparks(x: number, y: number, color: string, count: number, power = 90): void {
    const cap = palette.reducedMotion ? Math.ceil(count / 3) : count;
    for (let i = 0; i < cap; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = power * (0.4 + Math.random() * 0.9);
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 40,
        life: 0.28 + Math.random() * 0.3,
        maxLife: 0.6,
        size: 1 + Math.random() * 2,
        color,
        rot: 0,
        vr: 0,
        shape: "spark",
      });
    }
    if (particles.length > 420) particles.splice(0, particles.length - 420);
  }

  /** Chunky tumbling shards with a dark rim, plus a little dust puff. */
  function spawnDebris(x: number, y: number, color: string, count: number): void {
    const cap = palette.reducedMotion ? Math.ceil(count / 3) : count;
    for (let i = 0; i < cap; i++) {
      const verts: number[] = [];
      const seed = Math.random() * 10;
      for (let v = 0; v < 4; v++) {
        const a = (v / 4) * Math.PI * 2 + seed;
        const r = 0.45 + Math.random() * 0.55;
        verts.push(Math.cos(a) * r, Math.sin(a) * r);
      }
      particles.push({
        x: x + (Math.random() - 0.5) * 34,
        y: y + (Math.random() - 0.5) * 16,
        vx: (Math.random() - 0.5) * 200,
        vy: -40 - Math.random() * 160,
        life: 0.75 + Math.random() * 0.7,
        maxLife: 1.45,
        size: 3 + Math.random() * 6.5,
        color,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 14,
        shape: "shard",
        verts,
      });
    }
    // Dust puff: a few soft motes that hang and fade.
    const dust = palette.reducedMotion ? 2 : Math.ceil(count / 2);
    for (let i = 0; i < dust; i++) {
      particles.push({
        x: x + (Math.random() - 0.5) * 26,
        y: y + (Math.random() - 0.5) * 10,
        vx: (Math.random() - 0.5) * 60,
        vy: -10 - Math.random() * 30,
        life: 0.5 + Math.random() * 0.5,
        maxLife: 1,
        size: 2 + Math.random() * 4,
        color,
        rot: 0,
        vr: 0,
        shape: "dust",
      });
    }
    if (particles.length > 420) particles.splice(0, particles.length - 420);
  }

  // ------------------------------------------------------------- menu
  // ------------------------------------------------------- cabinet scenery

  /** One floor of the building interior behind the bricks, cached per scale. */
  let facadeUnit: HTMLCanvasElement | null = null;
  let facadeScale = 0;

  function buildFacadeUnit(): void {
    const h = ROW_PITCH_PX;
    const cv = document.createElement("canvas");
    cv.width = Math.ceil(W * scale);
    cv.height = Math.ceil(h * scale);
    const s = cv.getContext("2d")!;
    s.scale(scale, scale);
    const dark = palette.mode === "dark";
    const wall = s.createLinearGradient(0, 0, 0, h);
    wall.addColorStop(0, dark ? "#0a1019" : "#c9d3e1");
    wall.addColorStop(1, dark ? "#121b28" : "#b3bfd1");
    s.fillStyle = wall;
    s.fillRect(0, 0, W, h);
    // Window bays inside each demolished cell.
    for (let c = 0; c < COLS; c++) {
      const x = GRID_LEFT + c * BRICK_W + 5;
      const grad = s.createLinearGradient(0, 4, 0, BRICK_H - 2);
      grad.addColorStop(0, dark ? "rgba(80,120,180,0.20)" : "rgba(255,255,255,0.5)");
      grad.addColorStop(1, dark ? "rgba(18,30,50,0.12)" : "rgba(120,140,170,0.12)");
      s.fillStyle = grad;
      s.fillRect(x, 4, BRICK_W - 10, BRICK_H - 6);
    }
    // Vertical mullion between cells.
    s.fillStyle = dark ? "rgba(130,160,210,0.10)" : "rgba(255,255,255,0.3)";
    for (let c = 0; c <= COLS; c++) {
      s.fillRect(GRID_LEFT + c * BRICK_W - 1, 0, 2, BRICK_H);
    }
    // Floor slab.
    s.fillStyle = dark ? "#050a12" : "#7c8da5";
    s.fillRect(0, BRICK_H + 1, W, h - BRICK_H - 1);
    s.fillStyle = dark ? "rgba(140,170,220,0.16)" : "rgba(255,255,255,0.5)";
    s.fillRect(0, BRICK_H + 1, W, 1);
    facadeUnit = cv;
    facadeScale = scale;
  }

  /** Building body behind the bricks: destroyed cells reveal a building, not sky. */
  function drawTowerBody(run: Run, offset: number): void {
    if (facadeUnit === null || facadeScale !== scale) buildFacadeUnit();
    const spec = run.tower.spec;
    const left = GRID_LEFT - 4;
    const width = COLS * BRICK_W + 8;
    const dark = palette.mode === "dark";
    const bodyTop = Math.max(-ROW_PITCH_PX * 5, TOWER_TOP + offset - ROW_PITCH_PX * 2);
    const bodyBottom = Math.min(H + 4, TOWER_TOP + (spec.rows - 1) * ROW_PITCH_PX + offset + ROW_PITCH_PX);
    if (bodyBottom > bodyTop) {
      // Slab melts into the sky at its top edge: 56px ramp instead of a hard
      // cut line (the tower slides down through it during spawn).
      const slab = dark ? "#070c15" : "#9fadc2";
      const slabRamp = ctx.createLinearGradient(0, bodyTop, 0, bodyTop + 56);
      slabRamp.addColorStop(0, dark ? "rgba(7,12,21,0)" : "rgba(159,173,194,0)");
      slabRamp.addColorStop(1, slab);
      ctx.fillStyle = slabRamp;
      ctx.fillRect(left, bodyTop, width, Math.min(56, bodyBottom - bodyTop));
      if (bodyBottom - bodyTop > 56) {
        ctx.fillStyle = slab;
        ctx.fillRect(left, bodyTop + 56, width, bodyBottom - bodyTop - 56);
      }
      ctx.fillStyle = dark ? "rgba(120,150,200,0.14)" : "rgba(255,255,255,0.4)";
      const railTop = bodyTop + 56;
      ctx.fillRect(left, railTop, 2, bodyBottom - railTop);
      ctx.fillRect(left + width - 2, railTop, 2, bodyBottom - railTop);
    }
    if (facadeUnit) {
      for (let row = 0; row < spec.rows; row++) {
        const y = TOWER_TOP + row * ROW_PITCH_PX + offset - 3;
        if (y > H || y + ROW_PITCH_PX < -ROW_PITCH_PX * 5) continue;
        ctx.drawImage(facadeUnit, 0, y, W, ROW_PITCH_PX);
      }
    }
  }

  /**
   * Dissolve the tower while it slides in at the top. Spanned in DEVICE space
   * from the canvas top (behind the notch / HUD chips) down to 76 logical px
   * into the field, so the margin part and the field part share ONE gradient —
   * no segmented fade line where the field begins.
   */
  function drawTopFade(): void {
    const dark = palette.mode === "dark";
    const end = (shiftY + 76) * scale + viewOy;
    if (end <= 0) return;
    const grad = ctx.createLinearGradient(0, 0, 0, end);
    grad.addColorStop(0, dark ? "rgba(3,5,10,0.88)" : "rgba(238,241,246,0.8)");
    grad.addColorStop(0.5, dark ? "rgba(3,5,10,0.32)" : "rgba(238,241,246,0.28)");
    grad.addColorStop(1, "rgba(3,5,10,0)");
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, end);
    ctx.restore();
  }

  // ---------------------------------------------------------- attract mode

  const ATTRACT_DUST: Array<{ x: number; y: number; r: number; ph: number }> = [];
  {
    const rng = makeRng("attract-dust");
    for (let i = 0; i < 34; i++) {
      ATTRACT_DUST.push({
        x: 10 + rng() * (W - 20),
        y: 140 + rng() * (H - 260),
        r: 0.7 + rng() * 1.6,
        ph: rng() * Math.PI * 2,
      });
    }
  }

  const ATTRACT_WINDOWS: Array<{ x: number; y: number; w: number; h: number; lit: number }> = [];
  {
    const rng = makeRng("attract-windows");
    for (let row = 0; row < 16; row++) {
      for (let col = 0; col < 6; col++) {
        ATTRACT_WINDOWS.push({
          x: 146 + col * 21 + Math.round(rng() * 2),
          y: 322 + row * 23 + Math.round(rng() * 2),
          w: 10 + Math.round(rng() * 7),
          h: 8 + Math.round(rng() * 5),
          lit: rng() < 0.28 ? 0.35 + rng() * 0.6 : 0,
        });
      }
    }
  }

  function drawAttractTower(): void {
    const dark = palette.mode === "dark";
    // Tower body: a dark slab with visible floor lines and edge rim light.
    const left = 138;
    const right = 272;
    const top = 186;
    ctx.fillStyle = dark ? "#0a1220" : "#96a4ba";
    ctx.beginPath();
    ctx.moveTo(left, H);
    ctx.lineTo(left, top + 26);
    ctx.lineTo(left + 14, top + 4);
    ctx.lineTo(left + 34, top + 22);
    ctx.lineTo(left + 52, top);
    ctx.lineTo(left + 74, top + 18);
    ctx.lineTo(left + 94, top - 6);
    ctx.lineTo(left + 116, top + 14);
    ctx.lineTo(right, top + 8);
    ctx.lineTo(right, H);
    ctx.closePath();
    ctx.fill();
    // Rim light on the silhouette edges.
    ctx.strokeStyle = dark ? "rgba(150,185,240,0.28)" : "rgba(255,255,255,0.45)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(left + 1, H);
    ctx.lineTo(left + 1, top + 26);
    ctx.moveTo(right - 1, H);
    ctx.lineTo(right - 1, top + 8);
    ctx.stroke();
    // Floor lines.
    ctx.strokeStyle = dark ? "rgba(130,160,210,0.10)" : "rgba(60,80,110,0.18)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let y = top + 40; y < H; y += 23) {
      ctx.moveTo(left + 2, y);
      ctx.lineTo(right - 2, y);
    }
    ctx.stroke();
    // Windows: lit ones glow warm, the rest are faintly cool.
    for (const win of ATTRACT_WINDOWS) {
      if (win.lit > 0) {
        blitGlow(glowWarm, win.x + win.w / 2, win.y + win.h / 2, 26, win.lit * 0.5);
        ctx.globalAlpha = win.lit;
        ctx.fillStyle = "#ffcf7a";
      } else {
        ctx.globalAlpha = 1;
        ctx.fillStyle = dark ? "rgba(120,150,200,0.12)" : "rgba(255,255,255,0.32)";
      }
      ctx.fillRect(win.x, win.y, win.w, win.h);
    }
    ctx.globalAlpha = 1;
    // Roof crane.
    ctx.strokeStyle = dark ? "rgba(160,185,225,0.4)" : "rgba(60,80,110,0.5)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(205, top + 6);
    ctx.lineTo(205, top - 34);
    ctx.lineTo(258, top - 34);
    ctx.moveTo(205, top - 26);
    ctx.lineTo(228, top - 34);
    ctx.moveTo(205, top - 12);
    ctx.lineTo(238, top - 34);
    ctx.stroke();
  }

  function drawAttractSearchlights(): void {
    for (const side of [0, 1]) {
      const originX = side === 0 ? 34 : W - 34;
      const angle = (side === 0 ? -0.26 : 0.26) + Math.sin(time * 0.3 + side * 2.1) * 0.2;
      const len = 640;
      const ex = originX + Math.sin(angle) * len;
      const ey = H - Math.cos(angle) * len;
      const grad = ctx.createLinearGradient(originX, H, ex, ey);
      grad.addColorStop(0, "rgba(180,210,255,0.14)");
      grad.addColorStop(0.55, "rgba(150,190,255,0.055)");
      grad.addColorStop(1, "rgba(150,190,255,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(originX - 7, H);
      ctx.lineTo(originX + 7, H);
      ctx.lineTo(ex + 44, ey);
      ctx.lineTo(ex - 44, ey);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawAttractRuins(): void {
    const dark = palette.mode === "dark";
    ctx.fillStyle = dark ? "#03060c" : "#5f6e84";
    ctx.beginPath();
    ctx.moveTo(0, H);
    ctx.lineTo(0, H - 92);
    ctx.lineTo(24, H - 118);
    ctx.lineTo(46, H - 86);
    ctx.lineTo(72, H - 98);
    ctx.lineTo(96, H - 74);
    ctx.lineTo(96, H);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(W, H);
    ctx.lineTo(W, H - 106);
    ctx.lineTo(W - 30, H - 128);
    ctx.lineTo(W - 58, H - 92);
    ctx.lineTo(W - 88, H - 104);
    ctx.lineTo(W - 88, H);
    ctx.closePath();
    ctx.fill();
    // Hazard tape at street level.
    ctx.fillStyle = "rgba(255,190,60,0.14)";
    ctx.fillRect(0, H - 26, W, 3);
    ctx.fillStyle = "rgba(255,190,60,0.07)";
    ctx.fillRect(0, H - 18, W, 2);
  }

  function drawMenuScene(): void {
    drawAttractTower();
    drawAttractSearchlights();
    drawAttractRuins();
    // Floating embers.
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const mote of ATTRACT_DUST) {
      const t = (time * 0.12 + mote.ph * 0.16) % 1;
      const y = mote.y - t * 130;
      ctx.globalAlpha = (1 - t) * 0.45;
      ctx.fillStyle = "#ffcf8a";
      ctx.fillRect(mote.x + Math.sin(time + mote.ph) * 6, y, mote.r, mote.r);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function frame(run: Run | null, fxEvents: FxEvent[], dt: number): void {
    // Derive the field→device mapping from the real canvas box instead of a
    // fixed devicePixelRatio: a fixed backing store is resampled every frame
    // (blurry text, crawling edges). The field is contained and centred; the
    // leftover margins are painted with extended scenery.
    updateView();
    if (!(scale > 0)) return;
    ensureSprites();
    // One logical unit == `scale` device pixels on BOTH axes (uniform). A
    // non-uniform y scale forced bilinear resampling of every cached layer
    // and sprite every frame, which was the biggest raster cost.
    // WORLD space first: scenery is anchored to the canvas edges.
    ctx.setTransform(scale, 0, 0, scale, viewOx, viewOy);
    // Cached layers/sprite blits are pixel aligned; nearest sampling is 4-8x
    // cheaper than bilinear here and visually identical at 1:1.
    ctx.imageSmoothingEnabled = false;

    time += dt;
    if (run) handleFx(run, fxEvents);

    // Camera: deterministic decaying shake, eased slow-motion zoom. No free
    // running sway — a drifting playfield reads as "the tower jitters".
    shakeT += dt * 42;
    shake = Math.max(0, shake - dt * 55);
    if (shake < 0.05) shake = 0;
    flash = Math.max(0, flash - dt * 2.6);
    hitFlash = Math.max(0, hitFlash - dt * 5);
    muzzleT = Math.max(0, muzzleT - dt);
    recoil = Math.max(0, recoil - dt * 6);
    if (run && run.combo !== lastCombo) {
      comboPop = 0.16;
      lastCombo = run.combo;
    }
    comboPop = Math.max(0, comboPop - dt);

    const zoomTarget = run?.slowmo && !palette.reducedMotion ? 1.03 : 1;
    zoom += (zoomTarget - zoom) * Math.min(1, dt * 7);

    drawBackground();

    // Switch to GAME space: the whole playfield sits `shiftY` logical px down
    // (portrait slack becomes sky above the tower).
    ctx.setTransform(scale, 0, 0, scale, viewOx, viewOy + shiftY * scale);

    const amp = palette.reducedMotion || palette.screenShake === false ? 0 : shake;
    const sx = amp * (Math.sin(shakeT) * 0.55 + Math.sin(shakeT * 2.31 + 1.7) * 0.25);
    const sy = amp * (Math.sin(shakeT * 1.27 + 0.4) * 0.4 + Math.sin(shakeT * 3.11) * 0.18);
    const tilt = palette.reducedMotion ? 0 : Math.sin(shakeT * 0.87) * shake * 0.0005;

    ctx.save();
    ctx.translate(W / 2 + sx, H / 2 + sy);
    ctx.rotate(tilt);
    ctx.scale(zoom, zoom);
    ctx.translate(-W / 2, -H / 2);

    drawWalls();
    drawCrushLine();

    let offsetSnap = 0;
    if (run) {
      offsetSnap = Math.round(run.tower.offset * scale) / scale;
      drawTowerBody(run, offsetSnap);
      // Floor rail labels in the gutter next to the wall, drawn before the
      // bricks so the bricks win any overlap. Snap the scroll offset to whole
      // device pixels: text is rasterised on the device-pixel grid, so a
      // fractional offset makes floor numbers and brick labels hop 1px while
      // the sprites slide smoothly. One shared snapped offset keeps sprites
      // and text locked together.
      const occupiedRows = new Set<number>();
      for (const brick of run.tower.bricks) if (brick.alive) occupiedRows.add(brick.row);

      drawTowerContactShadow(run, offsetSnap);

      for (const brick of run.tower.bricks) {
        if (!brick.alive) continue;
        drawBrick(brick, offsetSnap, brick.hp / brick.maxHp);
      }

      // Glows, gold sweeps and mirror sheens in grouped passes.
      drawBrickFxPass(run, offsetSnap);

      drawDepthFog();
      drawTopFade();

      // Floor rail badges: drawn last so the bricks and their fx never hide
      // the floor number; the badge overlaps the facade edge like a bolted-on
      // floor marker.
      const firstRow = Math.floor((offsetSnap * -1) / ROW_PITCH_PX) - 1;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.font = "800 7px system-ui, sans-serif";
      for (let row = Math.max(0, firstRow); row < run.tower.spec.rows; row++) {
        if (!occupiedRows.has(row)) continue;
        const y = TOWER_TOP + row * ROW_PITCH_PX + offsetSnap + BRICK_H / 2;
        if (y < 16 || y > H - 8) continue;
        ctx.fillStyle = palette.mode === "dark" ? "rgba(4,8,14,0.9)" : "rgba(238,241,246,0.94)";
        roundRectOn(ctx, WALL + 1, y - 5.5, 14, 11, 3);
        ctx.fill();
        ctx.strokeStyle = palette.mode === "dark" ? "rgba(255,179,71,0.45)" : "rgba(120,90,30,0.5)";
        ctx.lineWidth = 1;
        roundRectOn(ctx, WALL + 1.5, y - 5, 13, 10, 3);
        ctx.stroke();
        ctx.fillStyle = palette.mode === "dark" ? "#ffcf8a" : "#6a4a12";
        ctx.fillText(`${row + 1}F`, WALL + 2.5, y + 0.5);
      }
      ctx.textBaseline = "alphabetic";

      if (run.phase === "aim") {
        const bricks: BrickBody[] = run.tower.bricks.map((b) => ({
          id: b.id,
          col: b.col,
          row: b.row,
          x: b.x,
          y: b.y,
          w: b.w,
          h: b.h,
          hp: b.hp,
          maxHp: b.maxHp,
          alive: b.alive,
        }));
        const laneCount = Math.max(1, run.mods.lanes);
        const dash = palette.reducedMotion ? 0 : -(time * 40) % 11;
        for (let lane = 0; lane < laneCount; lane++) {
          const laneOffset =
            laneCount > 1 ? (lane - (laneCount - 1) / 2) * LANE_SPREAD : 0;
          const points = aimPreview(
            W / 2,
            CANNON_Y - 8,
            run.aimAngle + laneOffset,
            bricks,
            {
              left: WALL,
              right: W - WALL,
              ceiling: 8,
              collectY: CANNON_Y + 10,
            },
            700,
            offsetSnap
          );
          const laneAlpha = laneCount === 1 ? 1 : lane === Math.floor(laneCount / 2) ? 1 : 0.55;
          // Soft underglow.
          ctx.strokeStyle = "rgba(255,214,150," + 0.1 * laneAlpha + ")";
          ctx.lineWidth = 5;
          ctx.setLineDash([5, 6]);
          ctx.lineDashOffset = dash;
          ctx.beginPath();
          ctx.moveTo(points[0].x, points[0].y);
          for (const p of points) ctx.lineTo(p.x, p.y);
          ctx.stroke();
          // Main dashed guide.
          ctx.strokeStyle = "rgba(255,248,232," + 0.62 * laneAlpha + ")";
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(points[0].x, points[0].y);
          for (const p of points) ctx.lineTo(p.x, p.y);
          ctx.stroke();
          ctx.setLineDash([]);
          const laneLast = points[points.length - 1];
          ctx.strokeStyle = "rgba(255,220,150," + (0.55 + 0.35 * (palette.reducedMotion ? 0.7 : 0.65 + 0.35 * Math.sin(time * 6))) * laneAlpha + ")";
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(laneLast.x, laneLast.y, 5.5, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = "rgba(255,240,210," + 0.9 * laneAlpha + ")";
          ctx.beginPath();
          ctx.arc(laneLast.x, laneLast.y, 2, 0, Math.PI * 2);
          ctx.fill();
        }
        const last = { x: W / 2, y: CANNON_Y - 8 };
      }

      for (const ball of run.balls) {
        if (!ball.alive) continue;
        ball.trail.push({ x: ball.x, y: ball.y });
        if (ball.trail.length > 9) ball.trail.shift();
        drawBall(ball);
      }

      drawCannon(run);

      if (run.combo >= 5) {
        const t = Math.max(0, run.comboTimer / COMBO_WINDOW);
        const pop = 1 + 0.4 * (comboPop / 0.16) + 0.25 * t;
        ctx.save();
        ctx.translate(W - 18, 66);
        ctx.scale(pop, pop);
        ctx.rotate(-0.03);
        ctx.font = "900 21px system-ui, sans-serif";
        ctx.textAlign = "right";
        ctx.strokeStyle = "rgba(0,0,0,0.55)";
        ctx.lineWidth = 4;
        ctx.strokeText(`连拆 ×${run.combo}`, 0, 0);
        ctx.fillStyle = palette.accent;
        ctx.fillText(`连拆 ×${run.combo}`, 0, 0);
        ctx.restore();
      }

      if (run.phase === "collapse") {
        const t = run.collapseT / 0.7;
        ctx.save();
        ctx.translate(W / 2, H / 2 - 20);
        const s = 0.6 + t * 0.9;
        ctx.scale(s, s);
        ctx.rotate(-0.06 + t * 0.1);
        ctx.globalAlpha = Math.min(1, 1.4 - t);
        ctx.font = "900 46px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.strokeStyle = "rgba(0,0,0,0.5)";
        ctx.lineWidth = 6;
        ctx.strokeText("塌!!", 0, 0);
        ctx.fillStyle = palette.accent;
        ctx.fillText("塌!!", 0, 0);
        ctx.restore();
      }
    } else {
      drawMenuScene();
    }

    // Particles: shards tumble with weight, sparks streak, dust drifts.
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.shape === "spark" ? 300 * dt : p.shape === "dust" ? 30 * dt : 420 * dt;
      p.rot += p.vr * dt;
      const fade = Math.max(0, p.life / p.maxLife);
      if (p.shape === "shard") {
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        if (p.verts) {
          ctx.beginPath();
          ctx.moveTo(p.verts[0] * p.size, p.verts[1] * p.size);
          for (let v = 2; v < p.verts.length; v += 2) {
            ctx.lineTo(p.verts[v] * p.size, p.verts[v + 1] * p.size);
          }
          ctx.closePath();
          ctx.fillStyle = p.color;
          ctx.fill();
          ctx.strokeStyle = "rgba(0,0,0,0.4)";
          ctx.lineWidth = 0.9;
          ctx.stroke();
          ctx.strokeStyle = "rgba(255,255,255,0.3)";
          ctx.lineWidth = 0.6;
          ctx.beginPath();
          ctx.moveTo(p.verts[0] * p.size, p.verts[1] * p.size);
          ctx.lineTo(p.verts[2] * p.size, p.verts[3] * p.size);
          ctx.stroke();
        }
        ctx.restore();
      } else if (p.shape === "spark") {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = fade * 0.9;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size * 0.7;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.022, p.y - p.vy * 0.022);
        ctx.stroke();
        ctx.restore();
      } else {
        ctx.save();
        ctx.globalAlpha = fade * 0.28;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1.6 - fade * 0.6), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;

    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      r.life -= dt;
      if (r.life <= 0) {
        rings.splice(i, 1);
        continue;
      }
      const t = 1 - r.life / r.maxLife;
      ctx.globalAlpha = (1 - t) * 0.85;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.width * (1 - t * 0.5);
      ctx.beginPath();
      ctx.arc(r.x, r.y, Math.max(1, r.radius * t), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    if (run) {
      for (const p of run.popups) {
        const alpha = Math.max(0, p.life / p.maxLife);
        const rise = (1 - alpha) * 26;
        const py = Math.max(22, p.y - rise);
        ctx.globalAlpha = alpha;
        const procInk: Record<string, string> = {
          crit: "#ffe9a8",
          pierce: "#8fd8ff",
          burn: "#ff9a4c",
          poison: "#9de06a",
          resonance: "#d68cff",
          splash: "#ffb347",
          bossbane: "#ffd977",
          rebound: "#8fb8ff",
        };
        const isProc = p.kind === "proc";
        ctx.font = isProc
          ? "900 15px system-ui, sans-serif"
          : p.crit
            ? "900 21px system-ui, sans-serif"
            : "800 13.5px system-ui, sans-serif";
        ctx.textAlign = "center";
        const fill = isProc
          ? (procInk[p.proc ?? ""] ?? "#ffffff")
          : p.kind === "damage"
            ? p.crit
              ? palette.accent
              : "#ffffff"
            : p.kind === "coin"
              ? "#ffd977"
              : p.kind === "heal"
                ? "#8ee06a"
                : "#bcd0e8";
        if (p.kind === "damage" && !p.crit) {
          ctx.fillStyle = "rgba(0,0,0,0.55)";
          ctx.fillText(p.text, p.x + 1, py + 1);
        } else {
          ctx.strokeStyle = "rgba(0,0,0,0.65)";
          ctx.lineWidth = p.crit ? 5 : 3.5;
          ctx.strokeText(p.text, p.x, py);
        }
        ctx.fillStyle = fill;
        ctx.fillText(p.text, p.x, py);
      }
      ctx.globalAlpha = 1;
    }

    // Screen-space polish: cheap edge vignette, slow-mo tint, impact flashes.
    if (vigBottom) ctx.drawImage(vigBottom, 0, H - 132, W, 132);
    if (vigLeft) ctx.drawImage(vigLeft, 0, 0, 44, H);
    if (vigRight) ctx.drawImage(vigRight, W - 44, 0, 44, H);

    // Canvas-space polish (device space): edge fades over the scenery margins,
    // slow-mo tint, impact flashes.
    const cw = canvas.width;
    const chh = canvas.height;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (edgeGradTop && edgeHT > 0) {
      ctx.fillStyle = edgeGradTop;
      ctx.fillRect(0, 0, cw, edgeHT);
    }
    if (edgeGradBottom && edgeHB > 0) {
      ctx.fillStyle = edgeGradBottom;
      ctx.fillRect(0, chh - edgeHB, cw, edgeHB);
    }
    if (edgeGradLeft && edgeHL > 0) {
      ctx.fillStyle = edgeGradLeft;
      ctx.fillRect(0, 0, edgeHL, chh);
    }
    if (edgeGradRight && edgeHR > 0) {
      ctx.fillStyle = edgeGradRight;
      ctx.fillRect(cw - edgeHR, 0, edgeHR, chh);
    }

    if (run?.slowmo && !palette.reducedMotion) {
      const slow = ctx.createRadialGradient(cw / 2, chh / 2, chh * 0.2, cw / 2, chh / 2, chh * 0.62);
      slow.addColorStop(0, "rgba(90,140,255,0)");
      slow.addColorStop(1, "rgba(90,140,255,0.18)");
      ctx.fillStyle = slow;
      ctx.fillRect(0, 0, cw, chh);
    }

    if (flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${flash * 0.5})`;
      ctx.fillRect(0, 0, cw, chh);
    }
    if (hitFlash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${hitFlash * 0.1})`;
      ctx.fillRect(0, 0, cw, chh);
    }
    ctx.restore();
  }

  return {
    frame,
    setPalette(p) {
      palette = p;
    },
    setSkin(skin) {
      skinName = skin;
    },
    view() {
      // Field origin = world origin + the game-coordinate shift.
      return { scale, ox: viewOx, oy: viewOy + shiftY * scale };
    },
  };
}
