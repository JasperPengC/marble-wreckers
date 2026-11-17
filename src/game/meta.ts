/** Meta progression: persistent coins, shop upgrades, achievements, records. */

export interface ShopDef {
  id: string;
  name: string;
  desc: string;
  maxLevel: number;
  /** Cost of the next level given the current level. */
  cost(level: number): number;
}

export const SHOP: ShopDef[] = [
  {
    id: "balls",
    name: "弹珠扩容",
    desc: "每局初始弹珠 +1",
    maxLevel: 5,
    cost(level) {
      return 120 * Math.pow(3, level);
    },
  },
  {
    id: "shield",
    name: "备用支架",
    desc: "每局 +1 次防压塌护盾",
    maxLevel: 2,
    cost(level) {
      return level === 0 ? 1500 : 6000;
    },
  },
  {
    id: "coin",
    name: "灵石分红",
    desc: "灵石掉落 +10%",
    maxLevel: 5,
    cost(level) {
      return 220 * Math.pow(3, level);
    },
  },
  {
    id: "research",
    name: "研发预算",
    desc: "全部伤害 +2%",
    maxLevel: 10,
    cost(level) {
      return Math.round(160 * Math.pow(2.2, level));
    },
  },
  {
    id: "vanguard",
    name: "先锋锦囊",
    desc: "开局先抽一次三选一",
    maxLevel: 1,
    cost(level) {
      return level === 0 ? 5000 : Infinity;
    },
  },
  {
    id: "lube",
    name: "润滑弹道",
    desc: "弹珠速度 +4%",
    maxLevel: 5,
    cost(level) {
      return Math.round(260 * Math.pow(2.5, level));
    },
  },
];

export function shopById(id: string): ShopDef | undefined {
  return SHOP.find((s) => s.id === id);
}

export interface RunSummaryStats {
  towersCleared: number;
  bricksDestroyed: number;
  damage: number;
  maxVolleyCombo: number;
  launches: number;
  dotDamage: number;
  bossKills: number;
  coinsEarned: number;
  /** Gems spent on rerolls during this run (settlement uses the net). */
  coinsSpent: number;
}

export type ThemeMode = "auto" | "dark" | "light";

export interface PlayerSettings {
  reducedMotion: boolean;
  screenShake: boolean;
  sound: boolean;
  locale: "zh_CN" | "en";
  themeMode: ThemeMode;
}

/** Ids renamed between builds, so old unlocks migrate instead of vanishing. */
const LEGACY_ACHIEVEMENT_IDS: Record<string, string> = {
  "score-1m": "score-20k",
};

export interface MetaSave {
  coins: number;
  shop: Record<string, number>;
  achievements: string[];
  /** Highest tower ordinal reached (0-based) in standard mode. */
  bestTower: number;
  bestScore: number;
  totalBricks: number;
  totalRuns: number;
  bossKills: number;
  daily: { date: string; bestTower: number; bestScore: number } | null;
  settings: PlayerSettings;
  /** ISO timestamp of the last successful save (diagnostics only). */
  savedAt?: string;
}

export function emptyMeta(): MetaSave {
  return {
    coins: 0,
    shop: {},
    achievements: [],
    bestTower: -1,
    bestScore: 0,
    totalBricks: 0,
    totalRuns: 0,
    bossKills: 0,
    daily: null,
    settings: {
      reducedMotion: false,
      screenShake: true,
      sound: true,
      locale: "zh_CN",
      themeMode: "auto",
    },
  };
}

/** Sanitize untrusted JSON into a MetaSave (missing/invalid fields reset). */
export function normalizeMeta(raw: unknown): MetaSave {
  const meta = emptyMeta();
  if (!raw || typeof raw !== "object") return meta;
  const src = raw as Record<string, unknown>;
  if (typeof src.coins === "number" && Number.isFinite(src.coins) && src.coins >= 0) {
    meta.coins = Math.floor(src.coins);
  }
  if (src.shop && typeof src.shop === "object") {
    for (const def of SHOP) {
      const level = (src.shop as Record<string, unknown>)[def.id];
      if (typeof level === "number" && Number.isInteger(level) && level >= 0) {
        meta.shop[def.id] = Math.min(def.maxLevel, level);
      }
    }
  }
  if (Array.isArray(src.achievements)) {
    // Keep every remembered id, including ones this build no longer defines:
    // dropping unknown ids used to wipe unlocks whenever an achievement was
    // renamed between builds. Unknown ids simply don't render in the codex.
    const seen = new Set<string>();
    for (const raw of src.achievements) {
      if (typeof raw !== "string" || raw.length === 0 || raw.length > 64) continue;
      const id = LEGACY_ACHIEVEMENT_IDS[raw] ?? raw;
      if (seen.has(id)) continue;
      seen.add(id);
      meta.achievements.push(id);
    }
  }
  for (const key of ["bestScore", "totalBricks", "totalRuns", "bossKills"] as const) {
    const value = src[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      meta[key] = Math.floor(value);
    }
  }
  if (typeof src.bestTower === "number" && Number.isFinite(src.bestTower)) {
    meta.bestTower = Math.floor(src.bestTower);
  }
  if (src.settings && typeof src.settings === "object") {
    const settings = src.settings as Record<string, unknown>;
    if (typeof settings.reducedMotion === "boolean") {
      meta.settings.reducedMotion = settings.reducedMotion;
    }
    if (typeof settings.screenShake === "boolean") {
      meta.settings.screenShake = settings.screenShake;
    }
    if (typeof settings.sound === "boolean") {
      meta.settings.sound = settings.sound;
    }
    if (settings.locale === "zh_CN" || settings.locale === "en") {
      meta.settings.locale = settings.locale;
    }
    if (settings.themeMode === "auto" || settings.themeMode === "dark" || settings.themeMode === "light") {
      meta.settings.themeMode = settings.themeMode;
    }
  }
  if (src.daily && typeof src.daily === "object") {
    const d = src.daily as Record<string, unknown>;
    if (typeof d.date === "string" && typeof d.bestTower === "number") {
      meta.daily = {
        date: d.date,
        bestTower: Math.floor(d.bestTower),
        bestScore: typeof d.bestScore === "number" ? Math.floor(d.bestScore) : 0,
      };
    }
  }
  return meta;
}

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  /** Lifetime meta check (boss kills, totals). */
  meta?: (meta: MetaSave) => boolean;
  /** Per-run check on the run summary. */
  run?: (stats: RunSummaryStats) => boolean;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: "first-tower",
    name: "新手管理员",
    desc: "拆掉第 1 栋楼",
    run: (s) => s.towersCleared >= 1,
  },
  {
    id: "five-towers",
    name: "拆迁办主任",
    desc: "单局拆掉 5 栋楼",
    run: (s) => s.towersCleared >= 5,
  },
  {
    id: "ten-towers",
    name: "真·管理员",
    desc: "单局拆到第 10 栋楼",
    run: (s) => s.towersCleared >= 10,
  },
  {
    id: "boss-kill",
    name: "大楼克星",
    desc: "击杀一次镇站核心",
    run: (s) => s.bossKills >= 1,
  },
  {
    id: "combo-60",
    name: "连环拆迁",
    desc: "单回合连拆 60 块砖",
    run: (s) => s.maxVolleyCombo >= 60,
  },
  {
    id: "score-20k",
    name: "热榜屠夫",
    desc: "单局热度突破 2 万",
    run: (s) => s.damage >= 20_000,
  },
  {
    id: "dot-master",
    name: "毒火焚楼",
    desc: "单局持续伤害累计 2 万",
    run: (s) => s.dotDamage >= 20_000,
  },
  {
    id: "ball-rain",
    name: "弹珠暴雨",
    desc: "单回合发射 18 颗以上弹珠",
    run: (s) => s.launches >= 18,
  },
  {
    id: "daily-player",
    name: "拆迁打卡",
    desc: "完成一局任意模式的拆除",
    run: (s) => s.towersCleared >= 1,
  },
  {
    id: "bricks-1k",
    name: "碎纸机成精",
    desc: "累计拆掉 1000 块砖",
    meta: (m) => m.totalBricks >= 1000,
  },
];

export function achievementById(id: string): AchievementDef | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id);
}

/** Evaluate all achievements; returns newly unlocked ids (mutates meta). */
export function checkAchievements(
  meta: MetaSave,
  stats: RunSummaryStats | null
): string[] {
  const unlocked: string[] = [];
  for (const def of ACHIEVEMENTS) {
    if (meta.achievements.includes(def.id)) continue;
    const pass = def.meta
      ? def.meta(meta)
      : def.run && stats
        ? def.run(stats)
        : false;
    if (pass) {
      meta.achievements.push(def.id);
      unlocked.push(def.id);
    }
  }
  return unlocked;
}

/** Apply a finished run to the meta save; returns newly unlocked achievements. */
export function applyRunResult(
  meta: MetaSave,
  opts: {
    coins: number;
    towerIndex: number;
    score: number;
    bricks: number;
    bossKills: number;
    stats: RunSummaryStats;
    daily: boolean;
    dailyDate: string;
  }
): string[] {
  meta.coins += Math.floor(opts.coins);
  meta.totalBricks += opts.bricks;
  meta.totalRuns += 1;
  meta.bossKills += opts.bossKills;
  if (!opts.daily) {
    meta.bestTower = Math.max(meta.bestTower, opts.towerIndex);
    meta.bestScore = Math.max(meta.bestScore, opts.score);
  } else {
    const current = meta.daily;
    if (!current || current.date !== opts.dailyDate) {
      meta.daily = {
        date: opts.dailyDate,
        bestTower: opts.towerIndex,
        bestScore: opts.score,
      };
    } else {
      current.bestTower = Math.max(current.bestTower, opts.towerIndex);
      current.bestScore = Math.max(current.bestScore, opts.score);
    }
  }
  return checkAchievements(meta, opts.stats);
}
