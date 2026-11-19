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
  music: boolean;
  locale: "zh_CN" | "en";
  themeMode: ThemeMode;
}

/** Ids renamed between builds, so old unlocks migrate instead of vanishing. */
const LEGACY_ACHIEVEMENT_IDS: Record<string, string> = {
  "score-1m": "score-20k",
};

/** 单关的通关记录:三档难度各一颗星。 */
export interface StageRecord {
  easy?: boolean;
  hard?: boolean;
  hell?: boolean;
  bestScore?: number;
}

export type Difficulty = "easy" | "hard" | "hell";

export interface QuestItemState {
  progress: number;
  claimed: boolean;
}

export interface QuestSave {
  /** 每日任务所属日期(YYYY-MM-DD);换日重置。 */
  date: string;
  daily: Record<string, QuestItemState>;
  milestones: Record<string, QuestItemState>;
  /** 每日累计计数(驱动每日任务进度)。 */
  towers: number;
  gems: number;
  stageClears: number;
}

export interface MetaSave {
  coins: number;
  shop: Record<string, number>;
  achievements: string[];
  /** 主线关卡进度:每关各难度通关记录。 */
  stages: Record<number, StageRecord>;
  /** 已解锁的最高关卡(1-based,≥1)。 */
  stageUnlocked: number;
  /** 地狱难度通关次数(里程碑任务用)。 */
  hellClears: number;
  /** 上一次游玩的关卡与难度(继续闯关默认值)。 */
  lastStage: { stage: number; difficulty: Difficulty } | null;
  /** 任务存档。 */
  quests: QuestSave;
  /** 新手引导是否完成(首局三步)。 */
  tutorial: boolean;
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
    stages: {},
    stageUnlocked: 1,
    hellClears: 0,
    lastStage: null,
    quests: emptyQuests(),
    tutorial: false,
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
      music: true,
      locale: "zh_CN",
      themeMode: "auto",
    },
  };
}

export function emptyQuests(): QuestSave {
  return { date: "", daily: {}, milestones: {}, towers: 0, gems: 0, stageClears: 0 };
}

export interface QuestDef {
  id: string;
  name: string;
  desc: string;
  goal: number;
  reward: number;
}

/** 每日任务:按天重置,进度来自当日累计计数。 */
export const DAILY_QUESTS: QuestDef[] = [
  { id: "daily-towers", name: "拆迁达人", desc: "拆掉 3 栋楼", goal: 3, reward: 150 },
  { id: "daily-gems", name: "日进斗金", desc: "获得 400 灵石", goal: 400, reward: 200 },
  { id: "daily-stage", name: "稳步推进", desc: "通关 1 次任意关卡", goal: 1, reward: 300 },
];

/** 里程碑任务:永久进度,由存档状态推导。 */
export const MILESTONE_QUESTS: Array<QuestDef & { progress: (meta: MetaSave) => number }> = [
  { id: "stage-3", name: "初露锋芒", desc: "解锁第 3 关", goal: 3, reward: 300, progress: (m) => m.stageUnlocked },
  { id: "stage-5", name: "崭露头角", desc: "解锁第 5 关", goal: 5, reward: 800, progress: (m) => m.stageUnlocked },
  { id: "stage-10", name: "拆迁铁军", desc: "解锁第 10 关", goal: 10, reward: 2000, progress: (m) => m.stageUnlocked },
  { id: "hell-1", name: "地狱行者", desc: "通关一次地狱难度", goal: 1, reward: 1200, progress: (m) => m.hellClears },
  { id: "power-800", name: "装备精良", desc: "战力达到 800", goal: 800, reward: 600, progress: (m) => accountPower(m) },
];

/** 账号战力:局外养成 + 成就 + 关卡进度折算的单调数值。 */
export function accountPower(meta: MetaSave): number {
  const shop = meta.shop;
  return (
    100 +
    (shop.research ?? 0) * 30 +
    (shop.balls ?? 0) * 20 +
    (shop.lube ?? 0) * 15 +
    (shop.coin ?? 0) * 15 +
    (shop.shield ?? 0) * 40 +
    (shop.vanguard ?? 0) * 120 +
    meta.achievements.length * 25 +
    (meta.stageUnlocked - 1) * 40
  );
}

/** 规范化单条任务状态。 */
function normalizeQuestItem(raw: unknown): QuestItemState | null {
  if (!raw || typeof raw !== "object") return null;
  const src = raw as Record<string, unknown>;
  return {
    progress: typeof src.progress === "number" && Number.isFinite(src.progress) && src.progress >= 0 ? Math.floor(src.progress) : 0,
    claimed: src.claimed === true,
  };
}

/** Ensure today's daily quest buckets exist (reset on date change). */
export function ensureDailyQuests(meta: MetaSave, today: string): QuestSave {
  if (meta.quests.date !== today) {
    meta.quests = { ...emptyQuests(), date: today };
  }
  for (const def of DAILY_QUESTS) {
    if (!meta.quests.daily[def.id]) meta.quests.daily[def.id] = { progress: 0, claimed: false };
  }
  for (const def of MILESTONE_QUESTS) {
    if (!meta.quests.milestones[def.id]) meta.quests.milestones[def.id] = { progress: 0, claimed: false };
  }
  return meta.quests;
}

/** 领取任务奖励;返回奖励灵石数(不可领取返回 0)。 */
export function claimQuest(
  meta: MetaSave,
  kind: "daily" | "milestones",
  id: string,
  today: string
): number {
  ensureDailyQuests(meta, today);
  const bucket = meta.quests[kind];
  const state = bucket[id];
  const def = kind === "daily" ? DAILY_QUESTS.find((q) => q.id === id) : MILESTONE_QUESTS.find((q) => q.id === id);
  if (!state || !def || state.claimed) return 0;
  const progress =
    kind === "daily"
      ? (id === "daily-towers" ? meta.quests.towers : id === "daily-gems" ? meta.quests.gems : meta.quests.stageClears)
      : (MILESTONE_QUESTS.find((q) => q.id === id)?.progress(meta) ?? 0);
  if (progress < def.goal) return 0;
  state.claimed = true;
  meta.coins += def.reward;
  return def.reward;
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
    if (typeof settings.music === "boolean") {
      meta.settings.music = settings.music;
    }
    if (settings.locale === "zh_CN" || settings.locale === "en") {
      meta.settings.locale = settings.locale;
    }
    if (settings.themeMode === "auto" || settings.themeMode === "dark" || settings.themeMode === "light") {
      meta.settings.themeMode = settings.themeMode;
    }
  }
  // --- v2:关卡进度 / 任务(旧档缺省 = 新档默认) ---
  if (src.stages && typeof src.stages === "object") {
    const stages = src.stages as Record<string, unknown>;
    for (const [key, value] of Object.entries(stages)) {
      const stage = Number(key);
      if (!Number.isInteger(stage) || stage < 1 || stage > 99 || !value || typeof value !== "object") {
        continue;
      }
      const rec = value as Record<string, unknown>;
      meta.stages[stage] = {
        easy: rec.easy === true,
        hard: rec.hard === true,
        hell: rec.hell === true,
        bestScore: typeof rec.bestScore === "number" && Number.isFinite(rec.bestScore) ? Math.floor(rec.bestScore) : 0,
      };
    }
  }
  if (typeof src.stageUnlocked === "number" && Number.isFinite(src.stageUnlocked)) {
    meta.stageUnlocked = Math.min(99, Math.max(1, Math.floor(src.stageUnlocked)));
  }
  // 关卡记录与解锁数互相校准:记录数不能超过解锁数。
  const clearedMax = Object.keys(meta.stages).reduce(
    (acc, stage) => {
      const rec = meta.stages[Number(stage)];
      return rec && (rec.easy || rec.hard || rec.hell) ? Math.max(acc, Number(stage)) : acc;
    },
    0
  );
  meta.stageUnlocked = Math.max(meta.stageUnlocked, Math.min(99, clearedMax + 1));
  meta.stageUnlocked = Math.max(meta.stageUnlocked, 1);
  if (typeof src.hellClears === "number" && Number.isFinite(src.hellClears) && src.hellClears >= 0) {
    meta.hellClears = Math.floor(src.hellClears);
  }
  if (src.lastStage && typeof src.lastStage === "object") {
    const ls = src.lastStage as Record<string, unknown>;
    if (
      typeof ls.stage === "number" && Number.isFinite(ls.stage) && ls.stage >= 1 &&
      (ls.difficulty === "easy" || ls.difficulty === "hard" || ls.difficulty === "hell")
    ) {
      meta.lastStage = { stage: Math.floor(ls.stage), difficulty: ls.difficulty };
    }
  }
  if (src.tutorial === true) meta.tutorial = true;
  if (src.quests && typeof src.quests === "object") {
    const q = src.quests as Record<string, unknown>;
    meta.quests.date = typeof q.date === "string" ? q.date.slice(0, 10) : "";
    meta.quests.towers = typeof q.towers === "number" && Number.isFinite(q.towers) && q.towers >= 0 ? Math.floor(q.towers) : 0;
    meta.quests.gems = typeof q.gems === "number" && Number.isFinite(q.gems) && q.gems >= 0 ? Math.floor(q.gems) : 0;
    meta.quests.stageClears = typeof q.stageClears === "number" && Number.isFinite(q.stageClears) && q.stageClears >= 0 ? Math.floor(q.stageClears) : 0;
    for (const kind of ["daily", "milestones"] as const) {
      const bucket = q[kind];
      if (bucket && typeof bucket === "object") {
        for (const [id, raw] of Object.entries(bucket as Record<string, unknown>)) {
          if (id.length > 64) continue;
          const item = normalizeQuestItem(raw);
          if (item) meta.quests[kind][id] = item;
        }
      }
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
    /** 关卡制:本局所属关卡与难度;通关时记录星标。 */
    stage?: number | null;
    difficulty?: Difficulty | null;
    victory?: boolean;
  }
): string[] {
  // 跨天首局:先把每日任务桶滚到今天,再累计(保证日期一致)。
  ensureDailyQuests(meta, opts.dailyDate);
  meta.coins += Math.floor(opts.coins);
  meta.totalBricks += opts.bricks;
  meta.totalRuns += 1;
  meta.bossKills += opts.bossKills;
  // 每日任务计数(含每日挑战局)。
  meta.quests.towers += opts.stats.towersCleared;
  meta.quests.gems += Math.max(0, Math.floor(opts.coins));
  if (opts.stage != null && opts.difficulty != null) {
    meta.lastStage = { stage: opts.stage, difficulty: opts.difficulty };
  }
  if (opts.victory && opts.stage != null && opts.difficulty != null) {
    const rec = meta.stages[opts.stage] ?? {};
    rec[opts.difficulty] = true;
    rec.bestScore = Math.max(rec.bestScore ?? 0, Math.floor(opts.score));
    meta.stages[opts.stage] = rec;
    meta.stageUnlocked = Math.max(meta.stageUnlocked, Math.min(99, opts.stage + 1));
    if (opts.difficulty === "hell") meta.hellClears += 1;
    meta.quests.stageClears += 1;
  }
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
