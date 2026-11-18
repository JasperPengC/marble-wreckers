import { describe, expect, test } from "bun:test";
import { makeRng } from "../src/game/rng.ts";
import { BASE_DAMAGE, BRICK_W, COLS, HP_BASE, ROWS_BASE, ROWS_MAX } from "../src/game/const.ts";
import { aimRun, createRun, launchVolley, updateRun } from "../src/game/run.ts";
import {
  applyStatuses,
  applyUpgrade,
  baseMods,
  coinValue,
  computeBlastDamage,
  computeHit,
  isEligible,
  neighborsOf,
  rollDraft,
  upgradeById,
  upgradeCategory,
  CATEGORY_LABELS,
  UPGRADES,
  type RunMods,
} from "../src/game/upgrades.ts";
import {
  BOSS_ARMOR_LAYERS,
  BRICK_DEFS,
  createTower,
  makeBoardBrick,
  towerSpec,
  type BoardBrick,
} from "../src/game/board.ts";

const rng = makeRng("test");

function spamBrick(hp = 100): BoardBrick {
  return makeBoardBrick(1, "spam", 0, 0, 0, 0, 52, 26, hp, 1, "水贴");
}

function withMods(patch: Partial<RunMods>): RunMods {
  return { ...baseMods(), ...patch };
}

describe("damage pipeline", () => {
  test("base hit equals BASE_DAMAGE + flat", () => {
    const mods = withMods({ flatDamage: 4, damageMul: 1 });
    const brick = spamBrick();
    const outcome = computeHit(mods, brick, rng);
    expect(outcome.damage).toBe(BASE_DAMAGE + 4);
    expect(outcome.crit).toBe(false);
  });

  test("global damage multiplier applies", () => {
    const mods = withMods({ flatDamage: 0, damageMul: 1.5 });
    const outcome = computeHit(mods, spamBrick(), rng);
    expect(outcome.damage).toBe(Math.round(BASE_DAMAGE * 1.5));
  });

  test("mirror resists 50%", () => {
    const brick = makeBoardBrick(2, "mirror", 1, 0, 0, 0, 52, 26, 100, 2, "折叠");
    const outcome = computeHit(baseMods(), brick, rng);
    expect(outcome.damage).toBe(2); // 3 * 0.5 = 1.5 → 2 (min 1, round 2)
  });

  test("steel caps damage at 2", () => {
    const brick = makeBoardBrick(3, "steel", 2, 0, 0, 0, 52, 26, 100, 2, "加固");
    const mods = withMods({ flatDamage: 50, critChance: 0, critMul: 10 });
    const outcome = computeHit(mods, brick, rng);
    expect(outcome.damage).toBe(2);
  });

  test("core takes bossbane bonus", () => {
    const brick = makeBoardBrick(4, "core", 0, 0, 0, 0, 260, 26, 1000, 24, "镇站");
    const plain = computeHit(withMods({ critChance: 0 }), brick, rng);
    const boosted = computeHit(
      withMods({ critChance: 0, bossDmgMul: 1 }),
      brick,
      rng
    );
    expect(boosted.damage).toBeCloseTo(plain.damage * 2, 0);
  });

  test("crit multiplies damage", () => {
    const mods = withMods({ critChance: 1, critMul: 3 });
    const outcome = computeHit(mods, spamBrick(), rng);
    expect(outcome.crit).toBe(true);
    expect(outcome.damage).toBe(BASE_DAMAGE * 3);
  });

  test("blast damage respects mirror but not steel cap", () => {
    const mirror = makeBoardBrick(5, "mirror", 0, 0, 0, 0, 52, 26, 100, 2, "折叠");
    const steel = makeBoardBrick(6, "steel", 1, 0, 0, 0, 52, 26, 100, 2, "加固");
    expect(computeBlastDamage(baseMods(), mirror, 100)).toBe(50);
    expect(computeBlastDamage(baseMods(), steel, 100)).toBe(100);
  });

  test("coin value scales with coinMul", () => {
    const gold = makeBoardBrick(7, "gold", 0, 0, 0, 0, 52, 26, 100, 6, "神帖");
    expect(coinValue(gold, baseMods())).toBe(6);
    expect(coinValue(gold, withMods({ coinMul: 1.5 }))).toBe(9);
  });
});

describe("statuses", () => {
  test("fire applies burn ticks scaled by dotMul", () => {
    const mods = withMods({ burnDps: 8, dotMul: 1.5 });
    const brick = spamBrick();
    const applied = applyStatuses(mods, brick);
    expect(applied.burn).toBe(12);
    expect(brick.burnT).toBe(3);
    expect(brick.burnDps).toBe(12);
    expect(applied.poison).toBe(0);
  });

  test("poison scales with brick max hp", () => {
    const mods = withMods({ poisonPct: 0.02 });
    const brick = spamBrick(1000);
    const applied = applyStatuses(mods, brick);
    expect(applied.poison).toBeCloseTo(20, 5);
    expect(brick.poisonT).toBe(4);
  });
});

describe("upgrade eligibility and drafts", () => {
  test("critPower requires crit", () => {
    const def = upgradeById("critPower")!;
    expect(isEligible(def, {})).toBe(false);
    expect(isEligible(def, { crit: 1 })).toBe(true);
    expect(isEligible(def, { crit: 5, critPower: 2 })).toBe(false); // maxed
  });

  test("resonance requires fire or poison", () => {
    const def = upgradeById("resonance")!;
    expect(isEligible(def, {})).toBe(false);
    expect(isEligible(def, { fire: 1 })).toBe(true);
    expect(isEligible(def, { poison: 1 })).toBe(true);
  });

  test("rollDraft returns three distinct eligible ids", () => {
    const picks = rollDraft({}, makeRng("draft"));
    expect(picks.length).toBe(3);
    expect(new Set(picks).size).toBe(3);
    for (const id of picks) {
      const def = UPGRADES.find((u) => u.id === id)!;
      expect(isEligible(def, {})).toBe(true);
    }
  });

  test("applyUpgrade mutates mods exactly once per level", () => {
    const mods = baseMods();
    const def = upgradeById("clone")!;
    applyUpgrade(mods, def, 0);
    expect(mods.balls).toBe(baseMods().balls + 1);
    applyUpgrade(mods, def, 1);
    expect(mods.balls).toBe(baseMods().balls + 2);
  });
});

describe("neighbors", () => {
  test("orthogonal neighbors on the same grid", () => {
    const a = makeBoardBrick(1, "spam", 3, 3, 0, 0, 52, 26, 10, 1, "x");
    const right = makeBoardBrick(2, "spam", 4, 3, 0, 0, 52, 26, 10, 1, "x");
    const below = makeBoardBrick(3, "spam", 3, 4, 0, 0, 52, 26, 10, 1, "x");
    const diag = makeBoardBrick(4, "spam", 4, 4, 0, 0, 52, 26, 10, 1, "x");
    const core = makeBoardBrick(5, "core", 1, 0, 0, 0, 260, 26, 10, 1, "x");
    const out = neighborsOf([a, right, below, diag, core], a);
    expect(out.map((b) => b.id).sort()).toEqual([2, 3]);
  });
});

describe("tower generation", () => {
  test("tower 0 has base rows and hp", () => {
    const spec = towerSpec(0);
    expect(spec.isBoss).toBe(false);
    expect(spec.rows).toBe(ROWS_BASE);
    expect(spec.hpBase).toBe(HP_BASE);
    const tower = createTower(spec, makeRng("t0"));
    expect(tower.bricks.length).toBeGreaterThan(0);
    for (const brick of tower.bricks) {
      expect(brick.maxHp).toBeGreaterThan(0);
    }
  });

  test("late towers are capped so the top row stays reachable", () => {
    for (const index of [10, 20, 40, 80]) {
      expect(towerSpec(index).rows).toBeLessThanOrEqual(ROWS_MAX);
    }
  });

  test("every 5th tower is a boss with a spanning, three-layer core", () => {
    const spec = towerSpec(4);
    expect(spec.isBoss).toBe(true);
    const tower = createTower(spec, makeRng("t4"));
    const cores = tower.bricks.filter((b) => b.kind === "core");
    expect(cores.length).toBe(1);
    expect(cores[0].w).toBe((COLS - 2) * BRICK_W);

    // 血量被拆成护甲层 + 核心，但总量和改动前一致，难度不该暴涨。
    const core = cores[0];
    const total = Math.round(spec.hpBase * BRICK_DEFS.core.hpMul);
    expect(core.armor).toBe(BOSS_ARMOR_LAYERS);
    expect(core.armorMax).toBe(BOSS_ARMOR_LAYERS);
    expect(core.hp + core.armorHp * BOSS_ARMOR_LAYERS).toBe(total);
    expect(core.hp).toBeLessThan(total);
  });

  test("普通塔的砖没有护甲层", () => {
    const tower = createTower(towerSpec(0), makeRng("plain"));
    expect(tower.bricks.every((brick) => brick.armor === 0)).toBe(true);
  });

  test("hp grows per tower", () => {
    expect(towerSpec(3).hpBase).toBeGreaterThan(towerSpec(0).hpBase);
  });

  test("tower spawn offset puts it above the screen", () => {
    const tower = createTower(towerSpec(0), makeRng("off"));
    expect(tower.offset).toBeLessThan(0);
    const bottomRow = tower.bricks.reduce((max, b) => Math.max(max, b.y + b.h), 0);
    expect(bottomRow + tower.offset).toBeLessThan(56);
  });

  test("brick labels come from the kind word pool", () => {
    const tower = createTower(towerSpec(0), makeRng("labels"));
    for (const brick of tower.bricks) {
      expect(brick.label.length).toBeGreaterThan(0);
    }
  });
});

describe("upgrade identity", () => {
  test("every upgrade has a category and all four families are used", () => {
    const categories = new Set(UPGRADES.map((def) => upgradeCategory(def.id)));
    expect(categories.size).toBe(4);
    for (const def of UPGRADES) {
      expect(CATEGORY_LABELS[upgradeCategory(def.id)]).toBeTruthy();
    }
  });
});

describe("multi-lane and stacking damage", () => {
  test("extra flat damage from bounces/combo enters the hit pipeline", () => {
    const plain = computeHit(withMods({ critChance: 0 }), spamBrick(), rng);
    const boosted = computeHit(withMods({ critChance: 0 }), spamBrick(), rng, 4);
    expect(boosted.damage).toBe(plain.damage + 4);
  });

  test("lane damage penalty scales hits", () => {
    const full = computeHit(withMods({ critChance: 0 }), spamBrick(), rng);
    const split = computeHit(
      withMods({ critChance: 0, laneDamageMul: 0.55 }),
      spamBrick(),
      rng
    );
    expect(split.damage).toBeLessThan(full.damage);
  });

  test("lanes upgrade fans out and restores damage at max level", () => {
    const mods = baseMods();
    const def = upgradeById("lanes")!;
    applyUpgrade(mods, def, 0);
    expect(mods.lanes).toBe(2);
    expect(mods.laneDamageMul).toBeCloseTo(0.55, 2);
    applyUpgrade(mods, def, 1);
    expect(mods.lanes).toBe(3);
    applyUpgrade(mods, def, 2);
    expect(mods.laneDamageMul).toBe(1);
  });
});

describe("pierce and lanes", () => {
  test("damage falls off per pierced brick unless invested in", () => {
    const mods = withMods({ critChance: 0 });
    const first = computeHit(mods, spamBrick(), rng, 0, 1);
    const third = computeHit(mods, spamBrick(), rng, 0, Math.pow(mods.pierceFalloff, 2));
    expect(third.damage).toBeLessThan(first.damage);
  });

  test("贯穿强化 raises the pierce falloff toward no penalty", () => {
    const mods = baseMods();
    const def = upgradeById("piercePower")!;
    expect(mods.pierceFalloff).toBeLessThan(1);
    for (let l = 0; l < def.maxLevel; l++) applyUpgrade(mods, def, l);
    expect(mods.pierceFalloff).toBeGreaterThan(0.9);
  });

  test("lane count multiplies the volley (balls x lanes)", () => {
    const one = createRun("lane-a", {}, false);
    const three = createRun("lane-b", {}, false);
    three.mods.lanes = 3;
    aimRun(one, 0);
    aimRun(three, 0);
    launchVolley(one);
    launchVolley(three);
    updateRun(one, 1 / 60);
    updateRun(three, 1 / 60);
    const ratio = three.balls.length / Math.max(1, one.balls.length);
    expect(ratio).toBe(3);
    expect(three.ballsToLaunch).toBe(one.ballsToLaunch);
  });
});

import { makeBoardBrick } from "../src/game/board.ts";
import { bricksWithin } from "../src/game/upgrades.ts";

describe("bricksWithin 爆炸范围", () => {
  test("必须计入楼体下沉偏移(炸视觉上邻近的砖,而非错位坐标的砖)", () => {
    // 两块砖 x 相同,spawn y 分别为 0 与 32(上下相邻)
    const a = makeBoardBrick(1, "spam", 0, 0, 100, 0, 50, 26, 10, 1, "a");
    const b = makeBoardBrick(2, "spam", 1, 1, 100, 32, 50, 26, 10, 1, "b");
    // 塔下沉 200px:炸 a(视觉中心 (125,-187),半径 20)→ 只命中 a;
    // 旧行为(漏加 offset)会把世界坐标错位 232px 的 b 当成目标
    const hit = bricksWithin([a, b], 125, -187, 20, -200).map((br) => br.id);
    expect(hit).toContain(1);
    expect(hit).not.toContain(2);
    // 不传 offset 等价于 0(兼容旧调用):爆心取 b 的静止中心时两块都在范围
    const hitZero = bricksWithin([a, b], 125, 45, 33).map((br) => br.id);
    expect(hitZero).toContain(1);
    expect(hitZero).toContain(2);
  });
});
