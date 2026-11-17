/**
 * 遗物：Boss 掉落的强力被动，每个都带代价。
 *
 * 和图鉴里的「强化」不同——强化是每栋楼三选一、可以叠等级；遗物整局只有
 * 一个来源（打掉 Boss），拿了就永久生效，且必定牺牲某种东西。目的是让
 * 后期构筑出现方向性差异，而不是同质堆数值。
 */

import type { Rng } from "./rng.ts";
import type { RunMods, SkillGrade } from "./upgrades.ts";

export interface RelicDef {
  id: string;
  name: string;
  grade: SkillGrade;
  /** 得到什么。 */
  gainText: string;
  /** 付出什么。 */
  costText: string;
  apply(mods: RunMods): void;
}

export const RELICS: RelicDef[] = [
  {
    id: "glass-cannon",
    name: "玻璃大炮",
    grade: "S",
    gainText: "全伤害 +45%",
    costText: "弹珠耐久 -1（最低 1）",
    apply(mods) {
      mods.damageMul += 0.45;
      mods.bounces = Math.max(1, mods.bounces - 1);
    },
  },
  {
    id: "swarm",
    name: "蜂群弹仓",
    grade: "A",
    gainText: "每轮弹珠 +3",
    costText: "全伤害 -15%",
    apply(mods) {
      mods.balls += 3;
      mods.damageMul -= 0.15;
    },
  },
  {
    id: "sharpen",
    name: "开刃",
    grade: "A",
    gainText: "暴击率 +12%",
    costText: "全伤害 -12%",
    apply(mods) {
      mods.critChance += 0.12;
      mods.damageMul -= 0.12;
    },
  },
  {
    id: "chain-relic",
    name: "连锁反应堆",
    grade: "S",
    gainText: "连锁增伤 +2（每碎一砖）",
    costText: "每轮弹珠 -2（最低 1）",
    apply(mods) {
      mods.bounceDmg += 2;
      mods.balls = Math.max(1, mods.balls - 2);
    },
  },
  {
    id: "needle",
    name: "钢针",
    grade: "A",
    gainText: "穿透 +1",
    costText: "穿透衰减更重（每层只留 45% 伤害）",
    apply(mods) {
      mods.pierce += 1;
      mods.pierceFalloff = Math.max(0.2, mods.pierceFalloff - 0.15);
    },
  },
  {
    id: "mint",
    name: "灵石矿脉",
    grade: "B",
    gainText: "灵石收益 +50%",
    costText: "全伤害 -10%",
    apply(mods) {
      mods.coinMul += 0.5;
      mods.damageMul -= 0.1;
    },
  },
  {
    id: "overdrive",
    name: "超频核心",
    grade: "B",
    gainText: "弹速 +30%、伤害 +10%",
    costText: "暴击率 -6%",
    apply(mods) {
      mods.speedMul += 0.3;
      mods.damageMul += 0.1;
      mods.critChance = Math.max(0, mods.critChance - 0.06);
    },
  },
  {
    id: "bulwark",
    name: "备用装甲",
    grade: "C",
    gainText: "立刻获得 2 层护盾",
    costText: "灵石收益 -15%",
    apply(mods) {
      mods.coinMul = Math.max(0, mods.coinMul - 0.15);
    },
    // 护盾在 run 上而不是 mods 里，由调用方补发（见 pickRelic）
  },
];

const RELIC_GIFT: Record<string, { shields?: number }> = {
  bulwark: { shields: 2 },
};

export function relicById(id: string): RelicDef | undefined {
  return RELICS.find((relic) => relic.id === id);
}

/** 遗物附带的即时奖励（护盾这类不能只改 mods 的效果）。 */
export function relicGift(id: string): { shields?: number } {
  return RELIC_GIFT[id] ?? {};
}

/** 抽 3 个没拿过的遗物；池子空了就返回空数组。 */
export function rollRelics(
  owned: readonly string[],
  rng: Rng,
  count = 3
): string[] {
  const pool = RELICS.filter((relic) => !owned.includes(relic.id)).map((relic) => relic.id);
  const picked: string[] = [];
  while (picked.length < count && pool.length > 0) {
    const index = Math.floor(rng() * pool.length);
    picked.push(pool.splice(index, 1)[0]);
  }
  return picked;
}
