import { BASE_BOUNCES, BASE_DAMAGE } from "./const.ts";
import type { BoardBrick } from "./board.ts";
import type { Rng } from "./rng.ts";

/** Modifier set accumulated by upgrades, meta shop and the base kit. */
export interface RunMods {
  balls: number;
  pierce: number;
  rebound: number;
  flatDamage: number;
  damageMul: number;
  critChance: number;
  critMul: number;
  speedMul: number;
  splash: number;
  burnDps: number;
  poisonPct: number;
  dotMul: number;
  bossDmgMul: number;
  coinMul: number;
  ballR: number;
  /** Surface bounces a ball survives. */
  bounces: number;
  /** Flat damage gained per bounce the ball has already made. */
  bounceDmg: number;
  /** Damage multiplier gained per combo point (0.01 = +1% per combo). */
  comboDmg: number;
  /** Number of parallel lanes per volley. */
  lanes: number;
  /** Damage scale paid for splitting into lanes (1 = no penalty). */
  laneDamageMul: number;
  /** Damage multiplier applied per brick already pierced (1 = no penalty). */
  pierceFalloff: number;
}

export function baseMods(): RunMods {
  return {
    balls: 8,
    pierce: 0,
    rebound: 0,
    flatDamage: 0,
    damageMul: 1,
    critChance: 0.05,
    critMul: 3,
    speedMul: 1,
    splash: 0,
    burnDps: 0,
    poisonPct: 0,
    dotMul: 1,
    bossDmgMul: 0,
    coinMul: 1,
    ballR: 5,
    bounces: BASE_BOUNCES,
    bounceDmg: 0,
    comboDmg: 0,
    lanes: 1,
    laneDamageMul: 1,
    pierceFalloff: 0.6,
  };
}

export type SkillGrade = "S" | "A" | "B" | "C";

export interface UpgradeDef {
  id: string;
  name: string;
  /** Intrinsic power grade, shown as a letter badge on every surface. */
  grade: SkillGrade;
  maxLevel: number;
  /** Upgrade id that must already be owned (any level) before this is offered. */
  requires?: string;
  /** Requires one of a set (used for 毒火共鸣). */
  requiresAny?: string[];
  apply(mods: RunMods, level: number, prevLevel: number): void;
  /** Short effect line shown on the card at the given (next) level. */
  effect(level: number): string;
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

export const UPGRADES: UpgradeDef[] = [
  {
    id: "clone",
    name: "分身弹珠",
    grade: "A",
    maxLevel: 8,
    apply(m, _l, _p) {
      m.balls += 1;
    },
    effect() {
      return "每回合 +1 颗弹珠";
    },
  },
  {
    id: "pierce",
    name: "穿透芯",
    grade: "A",
    maxLevel: 3,
    apply(m) {
      m.pierce += 1;
    },
    effect() {
      return "弹珠可穿透 1 块砖再反弹";
    },
  },
  {
    id: "rebound",
    name: "回旋回收",
    grade: "B",
    maxLevel: 2,
    apply(m) {
      m.rebound += 1;
    },
    effect() {
      return "弹珠落底时回弹 1 次";
    },
  },
  {
    id: "heavy",
    name: "加重核心",
    grade: "B",
    maxLevel: 5,
    apply(m) {
      m.flatDamage += 2;
    },
    effect() {
      return "每次撞击 +2 伤害";
    },
  },
  {
    id: "crit",
    name: "暴击协议",
    grade: "A",
    maxLevel: 5,
    apply(m) {
      m.critChance += 0.08;
    },
    effect() {
      return "暴击率 +8%";
    },
  },
  {
    id: "critPower",
    name: "会心一击",
    grade: "S",
    maxLevel: 2,
    requires: "crit",
    apply(m) {
      m.critMul += 1;
    },
    effect() {
      return "暴击伤害 +1 倍";
    },
  },
  {
    id: "speed",
    name: "超频弹道",
    grade: "C",
    maxLevel: 3,
    apply(m) {
      m.speedMul += 0.12;
    },
    effect() {
      return "弹珠速度 +12%";
    },
  },
  {
    id: "splash",
    name: "溅射涂层",
    grade: "B",
    maxLevel: 3,
    apply(m) {
      m.splash += 0.25;
    },
    effect() {
      return "命中波及相邻砖 25% 伤害";
    },
  },
  {
    id: "fire",
    name: "灼烧弹头",
    grade: "A",
    maxLevel: 4,
    apply(m, l) {
      m.burnDps = 4 * l;
    },
    effect(l) {
      return `命中点燃: ${4 * l} 伤害/秒 × 3 秒`;
    },
  },
  {
    id: "poison",
    name: "腐蚀毒珠",
    grade: "S",
    maxLevel: 4,
    apply(m, l) {
      m.poisonPct = 0.008 * l;
    },
    effect(l) {
      return `命中施毒: 最大生命 ${(0.8 * l).toFixed(1)}%/秒 × 4 秒`;
    },
  },
  {
    id: "resonance",
    name: "毒火共鸣",
    grade: "S",
    maxLevel: 3,
    requiresAny: ["fire", "poison"],
    apply(m) {
      m.dotMul += 0.5;
    },
    effect() {
      return "灼烧与腐蚀伤害 +50%";
    },
  },
  {
    id: "bossbane",
    name: "镇楼怒火",
    grade: "A",
    maxLevel: 3,
    apply(m) {
      m.bossDmgMul += 0.4;
    },
    effect() {
      return "对「镇站核心」伤害 +40%";
    },
  },
  {
    id: "greedy",
    name: "挖矿插件",
    grade: "C",
    maxLevel: 3,
    apply(m) {
      m.coinMul += 0.2;
    },
    effect() {
      return "灵石掉落 +20%";
    },
  },
  {
    id: "piercePower",
    name: "贯穿强化",
    grade: "A",
    maxLevel: 3,
    requires: "pierce",
    apply(m, level) {
      m.pierceFalloff = 0.6 + 0.13 * level;
    },
    effect(l) {
      return `穿透每层只损失 ${Math.round((1 - (0.6 + 0.13 * l)) * 100)}% 伤害`;
    },
  },
  {
    id: "bounce",
    name: "弹跳核心",
    grade: "A",
    maxLevel: 4,
    apply(m) {
      m.bounces += 2;
    },
    effect() {
      return "弹珠多弹 2 次再消失";
    },
  },
  {
    id: "bounceDmg",
    name: "连锁增伤",
    grade: "S",
    maxLevel: 4,
    apply(m) {
      m.bounceDmg += 1;
    },
    effect(l) {
      return `本次齐射每碎 1 块砖，后续命中 +${l} 伤害`;
    },
  },
  {
    id: "lanes",
    name: "分裂弹道",
    grade: "S",
    maxLevel: 3,
    apply(m, level) {
      m.lanes = level >= 2 ? 3 : 2;
      m.laneDamageMul = level >= 3 ? 1 : level === 2 ? 0.7 : 0.55;
    },
    effect(l) {
      if (l <= 1) return "双弹道齐射，单珠伤害 55%";
      if (l === 2) return "三弹道齐射，单珠伤害 70%";
      return "三弹道齐射，单珠伤害恢复 100%";
    },
  },
  {
    id: "comboDmg",
    name: "连拆蓄势",
    grade: "A",
    maxLevel: 3,
    apply(m) {
      m.comboDmg += 1;
    },
    effect(l) {
      return `连拆每 +1 层，单珠伤害 +${l}`;
    },
  },
  {
    id: "bigball",
    name: "胖墩弹珠",
    grade: "B",
    maxLevel: 3,
    apply(m) {
      m.ballR += 1;
      m.flatDamage += 1;
    },
    effect() {
      return "弹珠更胖 +1 伤害";
    },
  },
];

export type UpgradeCategory = "shot" | "power" | "element" | "economy";

/** Colour/identity family for the in-game build strip. */
export const UPGRADE_CATEGORIES: Record<string, UpgradeCategory> = {
  clone: "shot",
  bounce: "shot",
  bounceDmg: "shot",
  lanes: "shot",
  pierce: "shot",
  piercePower: "shot",
  rebound: "shot",
  speed: "shot",
  bigball: "shot",
  heavy: "power",
  crit: "power",
  critPower: "power",
  bossbane: "power",
  comboDmg: "power",
  fire: "element",
  poison: "element",
  resonance: "element",
  splash: "economy",
  greedy: "economy",
};

export const CATEGORY_LABELS: Record<UpgradeCategory, string> = {
  shot: "弹道",
  power: "火力",
  element: "元素",
  economy: "收益",
};

export function upgradeCategory(id: string): UpgradeCategory {
  return UPGRADE_CATEGORIES[id] ?? "shot";
}

export function upgradeById(id: string): UpgradeDef | undefined {
  return UPGRADES.find((u) => u.id === id);
}

export type UpgradeLevels = Record<string, number>;

/** True when the upgrade can be offered given current ownership. */
export function isEligible(def: UpgradeDef, levels: UpgradeLevels): boolean {
  const level = levels[def.id] ?? 0;
  if (level >= def.maxLevel) return false;
  if (def.requires && !(levels[def.requires] > 0)) return false;
  if (def.requiresAny && !def.requiresAny.some((id) => (levels[id] ?? 0) > 0)) {
    return false;
  }
  return true;
}

/** Draft three distinct upgrade ids. */
export function rollDraft(levels: UpgradeLevels, rng: Rng): string[] {
  const eligible = UPGRADES.filter((u) => isEligible(u, levels));
  const picks: string[] = [];
  while (picks.length < 3 && eligible.length > 0) {
    const i = Math.floor(rng() * eligible.length);
    picks.push(eligible[i].id);
    eligible.splice(i, 1);
  }
  return picks;
}

/** Apply one upgrade level to the mods. */
export function applyUpgrade(mods: RunMods, def: UpgradeDef, prevLevel: number): void {
  const level = prevLevel + 1;
  def.apply(mods, level, prevLevel);
}

export interface HitOutcome {
  damage: number;
  crit: boolean;
}

/**
 * Full hit pipeline: base + flat, global multiplier, crit roll, core bonus,
 * then brick defenses (加固 caps per hit, 折叠 resists).
 */
export function computeHit(
  mods: RunMods,
  brick: BoardBrick,
  rng: Rng,
  extraFlat = 0,
  damageScale = 1
): HitOutcome {
  const crit = rng() < mods.critChance;
  let damage =
    (BASE_DAMAGE + mods.flatDamage + extraFlat) *
    mods.damageMul *
    mods.laneDamageMul *
    damageScale;
  if (crit) damage *= mods.critMul;
  if (brick.kind === "core") damage *= 1 + mods.bossDmgMul;
  if (brick.kind === "mirror") damage *= 0.5;
  if (brick.kind === "steel") damage = Math.min(damage, 2);
  return { damage: Math.max(1, Math.round(damage)), crit };
}

/** Direct (non-ball) damage such as explosions: fixed amount, defense still applies except 加固 cap. */
export function computeBlastDamage(mods: RunMods, brick: BoardBrick, amount: number): number {
  let damage = amount * (brick.kind === "mirror" ? 0.5 : 1) * mods.laneDamageMul;
  if (brick.kind === "core") damage *= 1 + mods.bossDmgMul;
  return Math.max(1, Math.round(damage));
}

/** Apply (or refresh) burn + poison statuses from a ball hit. */
export function applyStatuses(mods: RunMods, brick: BoardBrick): { burn: number; poison: number } {
  const out = { burn: 0, poison: 0 };
  if (mods.burnDps > 0) {
    const dps = mods.burnDps * mods.dotMul;
    brick.burnT = 3;
    brick.burnDps = dps;
    out.burn = dps;
  }
  if (mods.poisonPct > 0) {
    const dps = brick.maxHp * mods.poisonPct * mods.dotMul;
    brick.poisonT = 4;
    brick.poisonDps = dps;
    out.poison = dps;
  }
  return out;
}

/** Orthogonal neighbours among alive bricks (by grid distance 1). */
export function neighborsOf(bricks: BoardBrick[], brick: BoardBrick): BoardBrick[] {
  const out: BoardBrick[] = [];
  for (const other of bricks) {
    if (other === brick || !other.alive) continue;
    if (
      Math.abs(other.col - brick.col) + Math.abs(other.row - brick.row) === 1 &&
      other.w === brick.w
    ) {
      out.push(other);
    }
  }
  return out;
}

/** Bricks within blast radius (euclidean, world coordinates). */
export function bricksWithin(
  bricks: BoardBrick[],
  cx: number,
  cy: number,
  radius: number,
  /** 楼体下沉偏移:目标砖的实际 y = brick.y + offset。漏加会炸到错位的砖。 */
  offset = 0
): BoardBrick[] {
  const out: BoardBrick[] = [];
  for (const brick of bricks) {
    if (!brick.alive) continue;
    const bx = brick.x + brick.w / 2;
    const by = brick.y + offset + brick.h / 2;
    if (Math.hypot(bx - cx, by - cy) <= radius) out.push(brick);
  }
  return out;
}

/** Coins dropped by a destroyed brick. */
export function coinValue(brick: BoardBrick, mods: RunMods): number {
  return Math.max(1, Math.round(brick.coinMul * mods.coinMul));
}
