import { describe, expect, test } from "bun:test";
import { BOSS_ARMOR_LAYERS, ROW_PITCH_PX, bossProgress, makeBoardBrick } from "../src/game/board.ts";
import { ARMOR_PUSH_ROWS, BRICK_H, BRICK_W, GRID_LEFT, TOWER_TOP } from "../src/game/const.ts";
import { createRun, drainFx, updateRun } from "../src/game/run.ts";
import type { BoardBrick } from "../src/game/board.ts";

/**
 * 造一个带两层护甲的 Boss 核心。
 *
 * 注意核心本身有每跳 0.8% 血量的自愈（原有机制），所以测试里把核心血量取小
 * （maxHp < 62.5 时自愈四舍五入为 0），避免自愈数字掺进断言。
 */
function armoredCore(
  layerHp = 20,
  coreHp = 50
): { core: BoardBrick; run: ReturnType<typeof createRun> } {
  const run = createRun("boss-armor", {}, false);
  const core = makeBoardBrick(
    1,
    "core",
    1,
    0,
    GRID_LEFT + BRICK_W,
    TOWER_TOP,
    (7 - 2) * BRICK_W,
    BRICK_H,
    coreHp,
    24,
    "镇站巨楼"
  );
  core.armor = BOSS_ARMOR_LAYERS;
  core.armorMax = BOSS_ARMOR_LAYERS;
  core.armorHp = layerHp;
  core.armorMaxHp = layerHp;
  run.tower.bricks = [core];
  // 用灼烧持续伤害驱动 damageBrick，一秒一跳
  core.burnT = 999;
  core.burnDps = 0;
  return { core, run };
}

/** 走满一秒，让灼烧结算一次。 */
function tickOneSecond(run: ReturnType<typeof createRun>): void {
  for (let i = 0; i < 62; i += 1) updateRun(run, 1 / 60);
}

describe("Boss 护甲", () => {
  test("护甲没打穿前核心不掉血", () => {
    const { core, run } = armoredCore(20);
    core.burnDps = 6;
    const hpBefore = core.hp;
    tickOneSecond(run);
    expect(core.armor).toBe(BOSS_ARMOR_LAYERS);
    expect(core.armorHp).toBe(14);
    expect(core.hp).toBe(hpBefore);
  });

  test("打穿一层：层数递减、发出破甲事件、楼被推回", () => {
    // 楼每帧都在下沉，所以拿一个「不掉血」的对照局消掉下沉量，只留冲击波。
    const hit = armoredCore(20);
    hit.core.burnDps = 22;
    const control = armoredCore(20);
    control.core.burnDps = 0;

    tickOneSecond(hit.run);
    tickOneSecond(control.run);

    expect(hit.core.armor).toBe(BOSS_ARMOR_LAYERS - 1);
    // 溢出 2 点带进下一层
    expect(hit.core.armorHp).toBe(18);
    expect(control.run.tower.offset - hit.run.tower.offset).toBeCloseTo(
      ARMOR_PUSH_ROWS * ROW_PITCH_PX,
      5
    );

    const events = drainFx(hit.run).filter((event) => event.type === "bossarmor");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ left: BOSS_ARMOR_LAYERS - 1 });
  });

  test("护甲全破的那一跳，溢出伤害才落到核心", () => {
    const { core, run } = armoredCore(10);
    core.burnDps = 25;
    const hpFull = core.hp;

    // 25 = 10(第一层) + 10(第二层) + 5 溢出
    tickOneSecond(run);
    expect(core.armor).toBe(0);
    expect(core.hp).toBe(hpFull - 5);
  });

  test("护甲全破后，后续伤害完整落在核心", () => {
    const { core, run } = armoredCore(10);
    core.burnDps = 20;
    const hpFull = core.hp;

    tickOneSecond(run); // 20 = 10 + 10，刚好破完两层，核心未受伤
    expect(core.armor).toBe(0);
    expect(core.hp).toBe(hpFull);

    tickOneSecond(run); // 这一跳才轮到核心
    expect(core.hp).toBe(hpFull - 20);
  });

  test("破甲不会让 Boss 总血量变多（护甲+核心=原总量）", () => {
    const { core } = armoredCore(20);
    const progress = bossProgress(core);
    expect(progress.max).toBe(core.maxHp + BOSS_ARMOR_LAYERS * core.armorMaxHp);
    expect(progress.layersMax).toBe(BOSS_ARMOR_LAYERS);
    expect(progress.current).toBe(progress.max);
  });

  test("bossProgress 随破甲单调下降", () => {
    const { core, run } = armoredCore(20);
    core.burnDps = 22;
    const start = bossProgress(core).current;
    tickOneSecond(run);
    const after = bossProgress(core).current;
    expect(after).toBeLessThan(start);
    expect(bossProgress(core).layers).toBe(BOSS_ARMOR_LAYERS - 1);
  });
});
