import { describe, expect, test } from "bun:test";
import {
  ACHIEVEMENTS,
  applyRunResult,
  checkAchievements,
  emptyMeta,
  normalizeMeta,
  shopById,
  type RunSummaryStats,
} from "../src/game/meta.ts";
import { dailySeed } from "../src/game/rng.ts";
import { baseMods, upgradeById } from "../src/game/upgrades.ts";

const stats: RunSummaryStats = {
  towersCleared: 1,
  bricksDestroyed: 30,
  damage: 5000,
  maxVolleyCombo: 12,
  launches: 4,
  dotDamage: 0,
  bossKills: 0,
  coinsEarned: 40,
  coinsSpent: 0,
};

describe("meta save", () => {
  test("normalize resets garbage input", () => {
    const meta = normalizeMeta({ coins: "lots", shop: { balls: 99 }, bestTower: -7.5 });
    expect(meta.coins).toBe(0);
    expect(meta.shop.balls).toBe(5); // clamped to max level
    expect(meta.bestTower).toBe(-8); // floored, keeps negative sentinel
  });

  test("normalize keeps valid data", () => {
    const meta = normalizeMeta({
      coins: 1234,
      shop: { balls: 2, research: 3 },
      achievements: ["first-tower", 42, "fake"],
      bestTower: 6,
      bestScore: 99999,
      daily: { date: "2026-11-12", bestTower: 3, bestScore: 12345 },
    });
    expect(meta.coins).toBe(1234);
    expect(meta.shop).toEqual({ balls: 2, research: 3 });
    // Unknown ids are kept on purpose: dropping them wiped unlocks whenever an
    // achievement was renamed between builds.
    expect(meta.achievements).toEqual(["first-tower", "fake"]);
    expect(meta.bestTower).toBe(6);
    expect(meta.daily).toEqual({ date: "2026-11-12", bestTower: 3, bestScore: 12345 });
  });

  test("applyRunResult adds coins and updates records", () => {
    const meta = emptyMeta();
    const unlocked = applyRunResult(meta, {
      coins: 55,
      towerIndex: 4,
      score: 123456,
      bricks: 70,
      bossKills: 1,
      stats: { ...stats, towersCleared: 4, bossKills: 1 },
      daily: false,
      dailyDate: "",
    });
    expect(meta.coins).toBe(55);
    expect(meta.bestTower).toBe(4);
    expect(meta.bestScore).toBe(123456);
    expect(meta.totalBricks).toBe(70);
    expect(meta.bossKills).toBe(1);
    expect(unlocked).toContain("first-tower");
    expect(unlocked).toContain("boss-kill");
  });

  test("daily records are tracked per date", () => {
    const meta = emptyMeta();
    const date = dailySeed();
    applyRunResult(meta, {
      coins: 0,
      towerIndex: 2,
      score: 100,
      bricks: 10,
      bossKills: 0,
      stats,
      daily: true,
      dailyDate: date,
    });
    applyRunResult(meta, {
      coins: 0,
      towerIndex: 5,
      score: 300,
      bricks: 10,
      bossKills: 0,
      stats,
      daily: true,
      dailyDate: date,
    });
    expect(meta.daily?.bestTower).toBe(5);
    expect(meta.daily?.bestScore).toBe(300);
    // Standard best untouched by daily runs.
    expect(meta.bestTower).toBe(-1);
    expect(meta.bestScore).toBe(0);
  });
});

describe("achievements", () => {
  test("renamed achievement ids migrate instead of being lost", () => {
    const meta = normalizeMeta({ achievements: ["score-1m", "first-tower", "score-1m"] });
    expect(meta.achievements).toEqual(["score-20k", "first-tower"]);
  });

  test("lifetime achievement unlocks from meta totals", () => {
    const meta = emptyMeta();
    meta.totalBricks = 1000;
    const unlocked = checkAchievements(meta, null);
    expect(unlocked).toContain("bricks-1k");
    // Not re-unlocked.
    expect(checkAchievements(meta, null)).not.toContain("bricks-1k");
  });

  test("achievement defs are unique", () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("shop", () => {
  test("costs increase with level", () => {
    const def = shopById("balls")!;
    expect(def.cost(0)).toBeLessThan(def.cost(1));
    expect(def.cost(4)).toBeLessThan(def.cost(5));
  });
});


describe("achievement reachability", () => {
  test("volley-size achievement is reachable with the full kit", () => {
    const maxBalls =
      baseMods().balls +
      (upgradeById("clone")?.maxLevel ?? 0) +
      (shopById("balls")?.maxLevel ?? 0);
    expect(maxBalls).toBeGreaterThanOrEqual(18);
    const rain = ACHIEVEMENTS.find((a) => a.id === "ball-rain")!;
    expect(rain.run!({ ...stats, launches: maxBalls })).toBe(true);
  });

  test("score achievement is reachable in a good run", () => {
    const score = ACHIEVEMENTS.find((a) => a.id === "score-20k")!;
    expect(score.run!({ ...stats, damage: 20_000 })).toBe(true);
  });
});

describe("player settings", () => {
  test("settings survive a round trip and garbage resets", () => {
    const meta = normalizeMeta({
      settings: { reducedMotion: true, screenShake: false, locale: "en" },
    });
    expect(meta.settings.reducedMotion).toBe(true);
    expect(meta.settings.screenShake).toBe(false);
    expect(meta.settings.locale).toBe("en");
    const broken = normalizeMeta({ settings: { locale: "xx", reducedMotion: "yes" } });
    expect(broken.settings.locale).toBe("zh_CN");
    expect(broken.settings.reducedMotion).toBe(false);
  });
});
