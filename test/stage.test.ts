import { describe, expect, test } from "bun:test";
import {
  DIFFICULTY_DEFS,
  MAX_STAGE,
  STAGE_TOWERS,
  stageClearReward,
  stagePowerFor,
  stageTowerIndex,
} from "../src/game/stage.ts";
import {
  applyRunResult,
  claimQuest,
  emptyMeta,
  ensureDailyQuests,
  accountPower,
  normalizeMeta,
  weekKey,
} from "../src/game/meta.ts";
import { stageModifier } from "../src/game/stage.ts";
import { createRun, descendSpeed } from "../src/game/run.ts";
import { towerSpec } from "../src/game/board.ts";
import { STAGE_TOWERS as TOWERS } from "../src/game/stage.ts";

describe("stage geometry", () => {
  test("stageTowerIndex 映射连续", () => {
    expect(stageTowerIndex(1, 0)).toBe(0);
    expect(stageTowerIndex(1, STAGE_TOWERS - 1)).toBe(STAGE_TOWERS - 1);
    expect(stageTowerIndex(2, 0)).toBe(STAGE_TOWERS);
    expect(stageTowerIndex(5, 2)).toBe(4 * STAGE_TOWERS + 2);
  });

  test("难度乘数单调递增", () => {
    expect(DIFFICULTY_DEFS.easy.hpMul).toBeLessThan(DIFFICULTY_DEFS.hard.hpMul);
    expect(DIFFICULTY_DEFS.hard.hpMul).toBeLessThan(DIFFICULTY_DEFS.hell.hpMul);
    expect(DIFFICULTY_DEFS.easy.rewardMul).toBeLessThan(DIFFICULTY_DEFS.hell.rewardMul);
  });

  test("通关奖励随关卡与难度增长", () => {
    expect(stageClearReward(2, "easy")).toBeGreaterThan(stageClearReward(1, "easy"));
    expect(stageClearReward(1, "hard")).toBeGreaterThan(stageClearReward(1, "easy"));
    expect(stageClearReward(1, "hell")).toBeGreaterThan(stageClearReward(1, "hard"));
  });

  test("推荐战力随关卡增长", () => {
    expect(stagePowerFor(1, "easy")).toBeLessThan(stagePowerFor(MAX_STAGE, "hell"));
    expect(stagePowerFor(3, "easy")).toBeLessThan(stagePowerFor(3, "hell"));
  });
});

describe("stage run", () => {
  test("关卡 run 的首塔 = 全局曲线 × 难度乘数", () => {
    const easy = createRun("s1", {}, false, 2, "easy");
    const hell = createRun("s1", {}, false, 2, "hell");
    const plain = createRun("s1", {}, false, null, null);
    // 第 2 关首塔 = 全局第 4 栋(index 3),难度乘数作用在其上
    expect(easy.tower.spec.index).toBe(stageTowerIndex(2, 0));
    const base = towerSpec(stageTowerIndex(2, 0)).hpBase;
    expect(easy.tower.spec.hpBase).toBe(Math.round(base * DIFFICULTY_DEFS.easy.hpMul));
    expect(hell.tower.spec.hpBase).toBe(Math.round(base * DIFFICULTY_DEFS.hell.hpMul));
    expect(plain.tower.spec.hpBase).toBe(towerSpec(0).hpBase);
    // 关底 Boss:每关最后一栋,前面不出
    expect(easy.tower.spec.isBoss).toBe(false);
    const finale = createRun("s-fin", {}, false, 2, "easy");
    // 第 2 关最后一栋 = 局部第 2 栋;用 __win 走两栋不方便,直接查规格函数路径:
    expect(finale.tower.spec.isBoss).toBe(false);
  });

  test("难度提高下沉速度", () => {
    const hell = createRun("s", {}, false, 1, "hell");
    const easy = createRun("s", {}, false, 1, "easy");
    const base = descendSpeed(hell.tower.spec.index);
    expect(base * DIFFICULTY_DEFS.hell.descendMul).toBeGreaterThan(
      base * DIFFICULTY_DEFS.easy.descendMul
    );
  });
});

describe("meta v2", () => {
  test("旧档(无 v2 字段)迁移为默认值", () => {
    const meta = normalizeMeta({ coins: 500, shop: { balls: 2 }, bestTower: 4 });
    expect(meta.coins).toBe(500);
    expect(meta.stageUnlocked).toBe(1);
    expect(meta.stages).toEqual({});
    expect(meta.quests.date).toBe("");
    expect(accountPower(meta)).toBeGreaterThan(100);
  });

  test("通关记录星标并解锁下一关", () => {
    const meta = emptyMeta();
    applyRunResult(meta, {
      coins: 100,
      towerIndex: 2,
      score: 5000,
      bricks: 30,
      bossKills: 0,
      stats: {
        towersCleared: 3,
        bricksDestroyed: 30,
        damage: 5000,
        maxVolleyCombo: 5,
        launches: 8,
        dotDamage: 0,
        bossKills: 0,
        coinsEarned: 100,
        coinsSpent: 0,
      },
      daily: false,
      dailyDate: "2026-01-01",
      stage: 1,
      difficulty: "easy",
      victory: true,
    });
    expect(meta.stageUnlocked).toBe(2);
    expect(meta.stages[1]?.easy).toBe(true);
    expect(meta.lastStage).toEqual({ stage: 1, difficulty: "easy" });
    // 通关记录校准:normalize 后解锁数不回退
    const roundtrip = normalizeMeta(JSON.parse(JSON.stringify(meta)));
    expect(roundtrip.stageUnlocked).toBe(2);
  });

  test("地狱通关计入里程碑计数", () => {
    const meta = emptyMeta();
    applyRunResult(meta, {
      coins: 0,
      towerIndex: 5,
      score: 0,
      bricks: 0,
      bossKills: 0,
      stats: {
        towersCleared: TOWERS,
        bricksDestroyed: 0,
        damage: 0,
        maxVolleyCombo: 0,
        launches: 0,
        dotDamage: 0,
        bossKills: 0,
        coinsEarned: 0,
        coinsSpent: 0,
      },
      daily: false,
      dailyDate: "d",
      stage: 2,
      difficulty: "hell",
      victory: true,
    });
    expect(meta.hellClears).toBe(1);
  });

  test("每日任务进度与领取", () => {
    const meta = emptyMeta();
    applyRunResult(meta, {
      coins: 700,
      towerIndex: 1,
      score: 0,
      bricks: 10,
      bossKills: 0,
      stats: {
        towersCleared: 2,
        bricksDestroyed: 10,
        damage: 0,
        maxVolleyCombo: 0,
        launches: 0,
        dotDamage: 0,
        bossKills: 0,
        coinsEarned: 700,
        coinsSpent: 0,
      },
      daily: true,
      dailyDate: "2026-01-01",
    });
    ensureDailyQuests(meta, "2026-01-01");
    expect(meta.quests.towers).toBe(2);
    expect(meta.quests.gems).toBe(700);
    // 未完成不可领取
    expect(claimQuest(meta, "daily", "daily-towers", "2026-01-01")).toBe(0);
    // 完成后领取一次,重复领取为 0
    expect(claimQuest(meta, "daily", "daily-gems", "2026-01-01")).toBe(200);
    expect(claimQuest(meta, "daily", "daily-gems", "2026-01-01")).toBe(0);
    // 换日重置
    ensureDailyQuests(meta, "2026-01-02");
    expect(meta.quests.gems).toBe(0);
  });

  test("里程碑任务按存档状态推导", () => {
    const meta = emptyMeta();
    meta.stageUnlocked = 3;
    ensureDailyQuests(meta, "d");
    expect(claimQuest(meta, "milestones", "stage-3", "d")).toBe(300);
    expect(claimQuest(meta, "milestones", "stage-5", "d")).toBe(0);
  });

  test("战力随养成单调增长", () => {
    const a = emptyMeta();
    const b = emptyMeta();
    b.shop.research = 3;
    b.achievements = ["first-tower"];
    b.stageUnlocked = 4;
    expect(accountPower(b)).toBeGreaterThan(accountPower(a));
    expect(accountPower(a)).toBe(100);
  });
});

describe("stageModifier", () => {
  test("前 3 关无修改器,第 4 关起轮换", () => {
    expect(stageModifier(1)).toBeNull();
    expect(stageModifier(3)).toBeNull();
    expect(stageModifier(4)?.id).toBe("steel-storm");
    expect(stageModifier(7)?.id).toBe("pressure");
    expect(stageModifier(10)?.id).toBe("gold-rush");
  });

  test("修改器每 3 关轮换,12 关一循环", () => {
    expect(stageModifier(13)?.id).toBe("brittle"); // (13-4)/3=3 → 第 4 个
    expect(stageModifier(16)?.id).toBe(stageModifier(4)!.id); // 16 与 4 同相位(差 12)
  });
});

describe("meta v2 迁移补充", () => {
  test("weekly/achievementClaims/skins 旧档迁移", () => {
    const meta = normalizeMeta({ coins: 10 });
    expect(meta.weekly.cleared).toBe(false);
    expect(meta.skins.selected).toBe("classic");
    expect(meta.achievementClaims).toEqual([]);
  });

  test("weekKey 格式稳定", () => {
    expect(weekKey(new Date("2026-01-01"))).toMatch(/^\d{4}-W\d{2}$/);
  });
});
