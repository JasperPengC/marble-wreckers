import {
  BOSS_EVERY,
  BRICK_H,
  BRICK_W,
  COLS,
  GRID_LEFT,
  HP_BASE,
  HP_PER_TOWER,
  ROWS_BASE,
  ROWS_PER_TOWER,
  ROWS_MAX,
  TOWER_TOP,
} from "./const.ts";
import { rngInt, rngPick, type Rng } from "./rng.ts";

export type BrickKind =
  | "spam"
  | "gold"
  | "flame"
  | "bomb"
  | "steel"
  | "healer"
  | "mirror"
  | "core";

export interface BrickDef {
  hpMul: number;
  coinMul: number;
  label: string;
}

export const BRICK_DEFS: Record<BrickKind, BrickDef> = {
  spam: { hpMul: 1, coinMul: 1, label: "水贴" },
  gold: { hpMul: 3, coinMul: 6, label: "神帖" },
  flame: { hpMul: 1.2, coinMul: 2, label: "对线" },
  bomb: { hpMul: 1.5, coinMul: 3, label: "引战" },
  steel: { hpMul: 2.2, coinMul: 2, label: "加固" },
  healer: { hpMul: 1.4, coinMul: 3, label: "回帖" },
  mirror: { hpMul: 1.8, coinMul: 2, label: "折叠" },
  core: { hpMul: 7, coinMul: 24, label: "镇站" },
};

const BRICK_WORDS: Record<BrickKind, string[]> = {
  spam: ["顶", "沙发", "前排", "666", "路过", "问就是", "支持", "蹲"],
  gold: ["精华", "加精", "收藏", "置顶"],
  flame: ["你行你上", "急了急了", "杠上了", "来辩"],
  bomb: ["开盒预警", "带节奏", "引爆", "炸楼"],
  steel: ["锁帖", "加固中", "修楼"],
  healer: ["暖楼", "护楼", "回血"],
  mirror: ["已折叠", "折叠党", "静音"],
  core: ["镇站巨楼", "万楼巨贴"],
};

export interface TowerSpec {
  /** Zero-based tower ordinal within a run. */
  index: number;
  rows: number;
  isBoss: boolean;
  hpBase: number;
}

export function towerSpec(index: number): TowerSpec {
  const isBoss = (index + 1) % BOSS_EVERY === 0;
  // Capped: a tower taller than the visible playfield can never be fully
  // cleared (its top rows stay above the ceiling), which used to hard-stop
  // runs around tower 25. Difficulty keeps scaling through hp/descent instead.
  const rows = Math.min(
    ROWS_MAX,
    Math.max(5, Math.round(ROWS_BASE + index * ROWS_PER_TOWER)) + (isBoss ? 1 : 0)
  );
  const hpBase = Math.round(HP_BASE * Math.pow(HP_PER_TOWER, index));
  return { index, rows, isBoss, hpBase };
}

export interface Tower {
  spec: TowerSpec;
  bricks: BoardBrick[];
  /** Vertical offset added to every brick's base y while the tower descends. */
  offset: number;
  nextBrickId: number;
  /** Healer pulse timer (s). */
  healTimer: number;
}

export interface BoardBrick {
  id: number;
  kind: BrickKind;
  col: number;
  row: number;
  /** Base geometry; world y = y + tower.offset. */
  x: number;
  y: number;
  w: number;
  h: number;
  hp: number;
  maxHp: number;
  /** Boss 护甲：>0 时伤害先扣护甲层，护甲打完才碰核心。普通砖恒为 0。 */
  armor: number;
  /** 初始护甲层数，用于画分段血条。 */
  armorMax: number;
  armorHp: number;
  armorMaxHp: number;
  alive: boolean;
  /** Status ticks (s remaining / dps). */
  burnT: number;
  burnDps: number;
  poisonT: number;
  poisonDps: number;
  label: string;
  coinMul: number;
}

export function makeBoardBrick(
  id: number,
  kind: BrickKind,
  col: number,
  row: number,
  x: number,
  y: number,
  w: number,
  h: number,
  hp: number,
  coinMul: number,
  label: string
): BoardBrick {
  return {
    id,
    kind,
    col,
    row,
    x,
    y,
    w,
    h,
    hp,
    maxHp: hp,
    armor: 0,
    armorMax: 0,
    armorHp: 0,
    armorMaxHp: 0,
    alive: true,
    burnT: 0,
    burnDps: 0,
    poisonT: 0,
    poisonDps: 0,
    label,
    coinMul,
  };
}

/** Kind weights unlock progressively by tower index. */
function kindWeights(index: number): Array<[BrickKind, number]> {
  const w: Array<[BrickKind, number]> = [["spam", 10], ["gold", 1.4]];
  if (index >= 1) w.push(["mirror", 0.9], ["flame", 1]);
  if (index >= 2) w.push(["steel", 1.1]);
  if (index >= 3) w.push(["bomb", 0.9]);
  if (index >= 4) w.push(["healer", 0.8]);
  return w;
}

function weightedKind(rng: Rng, weights: Array<[BrickKind, number]>): BrickKind {
  let total = 0;
  for (const [, weight] of weights) total += weight;
  let roll = rng() * total;
  for (const [kind, weight] of weights) {
    roll -= weight;
    if (roll <= 0) return kind;
  }
  return "spam";
}

const ROW_PITCH = BRICK_H + 6;
export const ROW_PITCH_PX = ROW_PITCH;

/** Boss 护甲层数：打穿两层才轮到核心。 */
export const BOSS_ARMOR_LAYERS = 2;
/** 每层护甲占 Boss 总血量的比例（核心留 56%）。 */
export const BOSS_ARMOR_SHARE = 0.22;

/** Boss 血条的合并进度：护甲层与核心合成一条。 */
export function bossProgress(brick: BoardBrick): {
  current: number;
  max: number;
  layers: number;
  layersMax: number;
} {
  const layersMax = brick.armorMax;
  const max = brick.maxHp + layersMax * brick.armorMaxHp;
  const current =
    brick.hp + (brick.armor > 0 ? (brick.armor - 1) * brick.armorMaxHp + brick.armorHp : 0);
  return { current, max, layers: brick.armor, layersMax };
}

/** Build the bricks of one tower; row 0 is the topmost row. */
export function createTower(spec: TowerSpec, rng: Rng): Tower {
  const bricks: BoardBrick[] = [];
  let id = spec.index * 1000 + 1;
  const hpBase = spec.hpBase;
  const weights = kindWeights(spec.index);
  for (let row = 0; row < spec.rows; row++) {
    const y = TOWER_TOP + row * ROW_PITCH;
    if (spec.isBoss && row === 0) {
      // Boss core spans the middle five columns.
      const startCol = 1;
      const span = COLS - 2;
      const core = makeBoardBrick(
        id++,
        "core",
        startCol,
        row,
        GRID_LEFT + startCol * BRICK_W,
        y,
        span * BRICK_W,
        BRICK_H,
        Math.round(hpBase * BRICK_DEFS.core.hpMul),
        BRICK_DEFS.core.coinMul,
        rngPick(rng, BRICK_WORDS.core)
      );
      // 三层结构：护甲 2 层 + 核心。总量按比例拆开，不额外加血。
      const total = core.maxHp;
      const layerHp = Math.round(total * BOSS_ARMOR_SHARE);
      core.armor = BOSS_ARMOR_LAYERS;
      core.armorMax = BOSS_ARMOR_LAYERS;
      core.armorHp = layerHp;
      core.armorMaxHp = layerHp;
      core.hp = total - layerHp * BOSS_ARMOR_LAYERS;
      core.maxHp = core.hp;
      bricks.push(core);
      continue;
    }
    // Solid row with a chance of a missing cell; always keep at least 5 bricks.
    for (let col = 0; col < COLS; col++) {
      const filled = rng() > (spec.index >= 2 ? 0.12 : 0.05);
      if (!filled && bricksInRow(bricks, row) >= 4) continue;
      const kind = weightedKind(rng, weights);
      const def = BRICK_DEFS[kind];
      const hp = Math.round(hpBase * def.hpMul);
      bricks.push(
        makeBoardBrick(
          id++,
          kind,
          col,
          row,
          GRID_LEFT + col * BRICK_W,
          y,
          BRICK_W,
          BRICK_H,
          hp,
          def.coinMul,
          rngPick(rng, BRICK_WORDS[kind])
        )
      );
    }
  }
  const offset = -spec.rows * ROW_PITCH;
  return { spec, bricks, offset, nextBrickId: id, healTimer: 3 };
}

function bricksInRow(bricks: BoardBrick[], row: number): number {
  let n = 0;
  for (const brick of bricks) if (brick.row === row && brick.alive) n++;
  return n;
}

/** Lowest alive brick bottom edge in world coordinates. */
export function towerBottomY(tower: Tower): number {
  let bottom = -Infinity;
  for (const brick of tower.bricks) {
    if (!brick.alive) continue;
    const y = brick.y + tower.offset + brick.h;
    if (y > bottom) bottom = y;
  }
  return bottom === -Infinity ? -Infinity : bottom;
}

/** Alive brick count. */
export function aliveCount(tower: Tower): number {
  let n = 0;
  for (const brick of tower.bricks) if (brick.alive) n++;
  return n;
}

/**
 * True when at least one alive brick sticks out below `ceilingY`, i.e. balls
 * launched from the cannon can actually reach it. Bricks above the ceiling
 * (the not-yet-descended part of the tower) are unreachable.
 */
export function hasReachableBrick(tower: Tower, ceilingY: number): boolean {
  for (const brick of tower.bricks) {
    if (!brick.alive) continue;
    if (brick.y + tower.offset + brick.h > ceilingY) return true;
  }
  return false;
}

/**
 * Healer pulse: every 3s alive healer bricks heal orthogonal neighbours by
 * 4% of their max hp. Returns total healed (for popups).
 */
export function tickHealers(tower: Tower, dt: number): number {
  tower.healTimer -= dt;
  if (tower.healTimer > 0) return 0;
  tower.healTimer = 3;
  let healed = 0;
  for (const brick of tower.bricks) {
    if (!brick.alive || brick.kind !== "healer") continue;
    for (const other of tower.bricks) {
      if (
        !other.alive ||
        other === brick ||
        other.kind === "core" ||
        Math.abs(other.col - brick.col) + Math.abs(other.row - brick.row) !== 1
      ) {
        continue;
      }
      const amount = Math.round(other.maxHp * 0.04);
      if (other.hp < other.maxHp && amount > 0) {
        other.hp = Math.min(other.maxHp, other.hp + amount);
        healed += amount;
      }
    }
  }
  return healed;
}

/** Random brick label pool lookup, used by tests. */
export function wordsFor(kind: BrickKind): string[] {
  return BRICK_WORDS[kind];
}

/** Deterministic label pick helper for tests. */
export function labelFor(rng: Rng, kind: BrickKind): string {
  return rngPick(rng, BRICK_WORDS[kind]);
}
