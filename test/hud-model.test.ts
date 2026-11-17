import { describe, expect, test } from "bun:test";
import { createRun, launchVolley, aimRun, updateRun } from "../src/game/run.ts";
import { applyUpgrade, baseMods, upgradeById } from "../src/game/upgrades.ts";
import { emptyMeta } from "../src/game/meta.ts";
import { buildHudModel } from "../src/ui/hud-model.ts";

/** 文案键原样返回，方便断言“哪一条文案被取了”。 */
const t = (key: string) => key;

describe("hud model adapter", () => {
  test("菜单状态：没有局内数据时回落到历史最高", () => {
    const meta = emptyMeta();
    meta.bestScore = 1234;
    meta.bestTower = 6;
    meta.coins = 90;

    const model = buildHudModel(null, meta, t);
    expect(model.inRun).toBe(false);
    expect(model.readout.score).toBe(1234);
    expect(model.readout.coins).toBe(90);
    expect(model.readout.tower).toBe("7");
    expect(model.readout.shield).toBeNull();
    expect(model.skills).toEqual([]);
    expect(model.floorsLeft).toBeNull();
  });

  test("没有历史记录时楼栋显示占位符", () => {
    const model = buildHudModel(null, emptyMeta(), t);
    expect(model.readout.tower).toBe("—");
  });

  test("图例始终来自游戏常量，文案走本地化", () => {
    const model = buildHudModel(null, emptyMeta(), t);
    expect(model.legend).toHaveLength(8);
    expect(model.legend[0].label).toBe("brick.spam");
    for (const entry of model.legend) expect(entry.color).toMatch(/^#/);
  });

  test("局内：读数取自当前局，强化按等级降序", () => {
    const run = createRun("hud-model", {}, false);
    const light = upgradeById("speed")!;
    const heavy = upgradeById("heavy")!;
    for (let level = 0; level < 2; level++) applyUpgrade(run.mods, light, level);
    run.levels[light.id] = 2;
    applyUpgrade(run.mods, heavy, 0);
    run.levels[heavy.id] = 1;
    run.coins = 40;
    run.shields = 2;

    const model = buildHudModel(run, emptyMeta(), t);
    expect(model.inRun).toBe(true);
    expect(model.readout.coins).toBe(40);
    expect(model.readout.shield).toBe(2);
    expect(model.readout.tower).toBe("1");
    expect(model.skills.map((skill) => skill.id)).toEqual([light.id, heavy.id]);
    expect(model.skills[0]).toMatchObject({
      level: 2,
      maxLevel: light.maxLevel,
      grade: light.grade,
      maxed: false,
    });
    expect(model.floorsLeft).toBeGreaterThan(0);
  });

  test("等级满时标记 maxed，界面据此显示 MAX", () => {
    const run = createRun("hud-maxed", {}, false);
    const def = upgradeById("speed")!;
    for (let level = 0; level < def.maxLevel; level++) applyUpgrade(run.mods, def, level);
    run.levels[def.id] = def.maxLevel;

    const model = buildHudModel(run, emptyMeta(), t);
    const skill = model.skills.find((entry) => entry.id === def.id)!;
    expect(skill.maxed).toBe(true);
    expect(skill.level).toBe(def.maxLevel);
  });

  test("清掉砖块后剩余楼层数下降", () => {
    const run = createRun("hud-floors", {}, false);
    const before = buildHudModel(run, emptyMeta(), t).floorsLeft!;
    const alive = run.tower.bricks.filter((brick) => brick.alive);
    const row = alive[0].row;
    for (const brick of alive) if (brick.row === row) brick.alive = false;
    const after = buildHudModel(run, emptyMeta(), t).floorsLeft!;
    expect(after).toBeLessThan(before);
  });

  test("未知强化 id 不会让界面崩", () => {
    const run = createRun("hud-unknown", {}, false);
    run.levels["not-a-real-upgrade"] = 3;
    const model = buildHudModel(run, emptyMeta(), t);
    expect(model.skills.every((skill) => skill.id !== "not-a-real-upgrade")).toBe(true);
  });

  test("发射后热度读数是本局伤害而不是历史分", () => {
    const run = createRun("hud-damage", {}, false);
    const meta = emptyMeta();
    meta.bestScore = 99999;
    aimRun(run, 0);
    launchVolley(run);
    for (let i = 0; i < 240; i++) updateRun(run, 1 / 60);
    const model = buildHudModel(run, meta, t);
    expect(model.readout.score).toBe(run.stats.damage);
    expect(model.readout.score).not.toBe(99999);
  });
});
