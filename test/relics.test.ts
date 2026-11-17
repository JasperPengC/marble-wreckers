import { describe, expect, test } from "bun:test";
import { RELICS, relicById, relicGift, rollRelics } from "../src/game/relics.ts";
import { makeRng } from "../src/game/rng.ts";
import { baseMods, type RunMods } from "../src/game/upgrades.ts";
import { createRun, pickRelic, restoreRun, snapshotRun } from "../src/game/run.ts";

function withRelic(id: string): RunMods {
  const mods = baseMods();
  relicById(id)!.apply(mods);
  return mods;
}

describe("遗物定义", () => {
  test("每个遗物都有收益和代价，id 不重复", () => {
    const ids = new Set<string>();
    for (const relic of RELICS) {
      expect(relic.id.length).toBeGreaterThan(0);
      expect(ids.has(relic.id)).toBe(false);
      ids.add(relic.id);
      expect(relic.gainText.length).toBeGreaterThan(0);
      expect(relic.costText.length).toBeGreaterThan(0);
    }
  });

  test("遗物确实改动了数值（不是纯文案）", () => {
    for (const relic of RELICS) {
      const before = baseMods();
      const after = baseMods();
      relic.apply(after);
      const changed =
        JSON.stringify(before) !== JSON.stringify(after) ||
        (relicGift(relic.id).shields ?? 0) > 0;
      expect(changed).toBe(true);
    }
  });

  test("玻璃大炮换伤害，但耐久不会掉到 0", () => {
    const mods = withRelic("glass-cannon");
    expect(mods.damageMul).toBeGreaterThan(1.4);
    expect(mods.bounces).toBeGreaterThanOrEqual(1);
  });

  test("耐久已经很低时再拿玻璃大炮，仍然保留 1 次", () => {
    const mods = baseMods();
    mods.bounces = 1;
    relicById("glass-cannon")!.apply(mods);
    expect(mods.bounces).toBe(1);
  });

  test("蜂群弹仓加球但降伤害", () => {
    const base = baseMods();
    const mods = withRelic("swarm");
    expect(mods.balls).toBe(base.balls + 3);
    expect(mods.damageMul).toBeLessThan(base.damageMul);
  });
});

describe("遗物抽取", () => {
  test("一次抽 3 个，且不重复", () => {
    const picked = rollRelics([], makeRng("relic-roll"));
    expect(picked).toHaveLength(3);
    expect(new Set(picked).size).toBe(3);
  });

  test("已拿过的不再出现", () => {
    const owned = ["glass-cannon", "swarm", "sharpen"];
    const picked = rollRelics(owned, makeRng("relic-owned"), 5);
    for (const id of owned) expect(picked).not.toContain(id);
  });

  test("池子掏空后返回空数组，不会死循环", () => {
    const all = RELICS.map((relic) => relic.id);
    expect(rollRelics(all, makeRng("empty"))).toEqual([]);
  });

  test("同一种子抽出相同结果（可复现）", () => {
    expect(rollRelics([], makeRng("seed-a"))).toEqual(rollRelics([], makeRng("seed-a")));
  });
});

describe("遗物与存档", () => {
  function readyForRelic(seed: string) {
    const run = createRun(seed, {}, false);
    run.phase = "relic";
    run.relicOptions = ["bulwark", "glass-cannon", "swarm"];
    return run;
  }

  test("选了遗物会记录并生效", () => {
    const run = readyForRelic("pick");
    const shieldsBefore = run.shields;
    expect(pickRelic(run, "bulwark")).toBe(true);
    expect(run.relics).toEqual(["bulwark"]);
    expect(run.shields).toBe(shieldsBefore + 2);
    expect(run.phase).toBe("aim");
    expect(run.tower.spec.index).toBe(1);
  });

  test("不在候选里的遗物不能选", () => {
    const run = readyForRelic("nope");
    expect(pickRelic(run, "needle")).toBe(false);
    expect(run.relics).toEqual([]);
    expect(run.phase).toBe("relic");
  });

  test("遗物阶段的快照能还原回同一个阶段", () => {
    const run = readyForRelic("snap");
    const snap = snapshotRun(run);
    const restored = restoreRun(snap)!;
    expect(restored.phase).toBe("relic");
    expect(restored.relicOptions).toEqual(run.relicOptions);
  });

  test("还原后遗物效果不会翻倍（mods 重建后只应用一次）", () => {
    const run = createRun("apply-once", {}, false);
    run.phase = "relic";
    run.relicOptions = ["glass-cannon"];
    pickRelic(run, "glass-cannon");
    const damageAfter = run.mods.damageMul;

    const snapshot = snapshotRun(run)!;
    // 反复存读，数值必须稳定
    const once = restoreRun(snapshot)!;
    const twice = restoreRun(snapshotRun(once))!;
    expect(once.mods.damageMul).toBeCloseTo(damageAfter, 6);
    expect(twice.mods.damageMul).toBeCloseTo(damageAfter, 6);
    expect(once.relics).toEqual(["glass-cannon"]);
  });

  test("还原后护盾不会被重复发放", () => {
    const run = readyForRelic("shield-once");
    pickRelic(run, "bulwark");
    const shields = run.shields;
    const restored = restoreRun(snapshotRun(run))!;
    expect(restored.shields).toBe(shields);
  });

  test("旧存档（没有 relics 字段）也能读", () => {
    const run = createRun("legacy", {}, false);
    const snapshot = snapshotRun(run)! as unknown as Record<string, unknown>;
    delete snapshot.relics;
    delete snapshot.relicOptions;
    const restored = restoreRun(snapshot)!;
    expect(restored.relics).toEqual([]);
    expect(restored.phase).toBe("aim");
  });

  test("坏掉的遗物 id 会被过滤", () => {
    const run = createRun("bad-id", {}, false);
    const snapshot = snapshotRun(run)!;
    snapshot.relics = ["glass-cannon", "not-a-relic"];
    const restored = restoreRun(snapshot)!;
    expect(restored.relics).toEqual(["glass-cannon"]);
  });
});
