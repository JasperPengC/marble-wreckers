import { describe, expect, test } from "bun:test";
import {
  COOLDOWN_MS,
  MAX_VOICES_PER_BATCH,
  createPlanState,
  planVoices,
} from "../src/audio/voices.ts";
import type { FxEvent } from "../src/game/run.ts";

const hit = (damage = 4, crit = false): FxEvent => ({
  type: "hit",
  x: 0,
  y: 0,
  damage,
  crit,
});

describe("音效决策", () => {
  test("空事件不发声音", () => {
    expect(planVoices([], createPlanState(), 0)).toEqual([]);
  });

  test("同一类音效在冷却时间内只响一次", () => {
    const state = createPlanState();
    const events = [hit(), hit(), hit()];
    const first = planVoices(events, state, 1000);
    expect(first).toHaveLength(1);
    expect(first[0].kind).toBe("hit");

    // 冷却未过：仍然不响
    expect(planVoices([hit()], state, 1000 + COOLDOWN_MS.hit - 1)).toHaveLength(0);
    // 冷却已过：可以再响
    expect(planVoices([hit()], state, 1000 + COOLDOWN_MS.hit + 1)).toHaveLength(1);
  });

  test("单批数量有上限，弹幕不会把声卡打爆", () => {
    const state = createPlanState();
    const many: FxEvent[] = Array.from({ length: 60 }, () => ({
      type: "destroy",
      kind: "spam",
      x: 0,
      y: 0,
      coins: 1,
    }));
    const voices = planVoices(many, state, 0);
    expect(voices.length).toBeLessThanOrEqual(MAX_VOICES_PER_BATCH);
    expect(voices.length).toBeGreaterThan(0);
  });

  test("关键事件不被数量上限吞掉", () => {
    const state = createPlanState();
    const spam: FxEvent[] = Array.from({ length: 30 }, () => ({
      type: "destroy",
      kind: "spam",
      x: 0,
      y: 0,
      coins: 1,
    }));
    const events: FxEvent[] = [...spam, { type: "collapse" }, { type: "death" }];
    const voices = planVoices(events, state, 0);
    const kinds = voices.map((voice) => voice.kind);
    expect(kinds).toContain("collapse");
    expect(kinds).toContain("death");
  });

  test("暴击比普通命中更响更高", () => {
    const normal = planVoices([hit(10, false)], createPlanState(), 0)[0];
    const crit = planVoices([hit(10, true)], createPlanState(), 0)[0];
    expect(crit.gain).toBeGreaterThan(normal.gain);
    expect(crit.pitch).toBeGreaterThan(normal.pitch);
  });

  test("伤害越高音高越低（有下限）", () => {
    const light = planVoices([hit(1)], createPlanState(), 0)[0];
    const heavy = planVoices([hit(60)], createPlanState(), 0)[0];
    expect(heavy.pitch).toBeLessThan(light.pitch);
    expect(heavy.pitch).toBeGreaterThan(0);
  });

  test("值钱的砖碎得更亮", () => {
    const cheap = planVoices(
      [{ type: "destroy", kind: "spam", x: 0, y: 0, coins: 1 }],
      createPlanState(),
      0
    )[0];
    const rich = planVoices(
      [{ type: "destroy", kind: "gold", x: 0, y: 0, coins: 30 }],
      createPlanState(),
      0
    )[0];
    expect(rich.pitch).toBeGreaterThan(cheap.pitch);
  });

  test("所有事件类型都能映射成声音", () => {
    const events: FxEvent[] = [
      { type: "launch", x: 0, y: 0, angle: 0 },
      { type: "fizzle", x: 0, y: 0 },
      { type: "proc", kind: "burn", x: 0, y: 0 },
      hit(),
      { type: "destroy", kind: "spam", x: 0, y: 0, coins: 1 },
      { type: "blast", x: 0, y: 0, radius: 30 },
      { type: "status", x: 0, y: 0, kind: "burn" },
      { type: "heal", x: 0, y: 0 },
      { type: "shield" },
      { type: "collapse" },
      { type: "death" },
      { type: "bosskill" },
    ];
    const voices = planVoices(events, createPlanState(), 0);
    expect(new Set(voices.map((voice) => voice.kind)).size).toBe(events.length);
  });
});
