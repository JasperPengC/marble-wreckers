/**
 * 关卡制主线:每一关打穿 STAGE_TOWERS 栋楼算通关,分简单/困难/地狱三档。
 * 数值曲线沿用全局楼序号(连续、无跳变),难度作为乘数叠上去。
 */

import { HP_PER_TOWER } from "./const.ts";

export type Difficulty = "easy" | "hard" | "hell";

export const DIFFICULTIES: ReadonlyArray<Difficulty> = ["easy", "hard", "hell"];

/** 每关需要打穿的楼数。 */
export const STAGE_TOWERS = 3;
/** 主线关卡总数。 */
export const MAX_STAGE = 30;

export interface DifficultyDef {
  id: Difficulty;
  hpMul: number;
  descendMul: number;
  rewardMul: number;
  /** 砖种类解锁的楼序号偏移:高难度更早遇到特殊砖。 */
  kindShift: number;
}

export const DIFFICULTY_DEFS: Record<Difficulty, DifficultyDef> = {
  easy: { id: "easy", hpMul: 0.8, descendMul: 0.85, rewardMul: 0.7, kindShift: -1 },
  hard: { id: "hard", hpMul: 1.2, descendMul: 1.15, rewardMul: 1.6, kindShift: 1 },
  hell: { id: "hell", hpMul: 1.75, descendMul: 1.3, rewardMul: 2.6, kindShift: 3 },
};

export function difficultyRank(diff: Difficulty): number {
  return DIFFICULTIES.indexOf(diff);
}

/** 关卡内第 localIdx(0-based)栋楼的全局楼序号(驱动数值曲线)。 */
export function stageTowerIndex(stage: number, localIdx: number): number {
  return (stage - 1) * STAGE_TOWERS + localIdx;
}

/** 通关奖励(灵石):基础值 × 关卡成长 × 难度倍率。 */
export function stageClearReward(stage: number, diff: Difficulty): number {
  const mod = stageModifier(stage);
  const modMul = mod ? mod.rewardMul : 1;
  return Math.round(200 * Math.pow(1.18, stage - 1) * DIFFICULTY_DEFS[diff].rewardMul * modMul);
}

/** 关卡规则修改器:第 4 关起每 3 关轮换一个,让关卡结构不再同质。 */
export interface StageModifier {
  id: string;
  name: string;
  desc: string;
  hpMul: number;
  descendMul: number;
  rewardMul: number;
  goldMul: number;
  steelMul: number;
}

export const STAGE_MODIFIERS: StageModifier[] = [
  { id: "steel-storm", name: "加固风暴", desc: "加固砖数量翻倍", hpMul: 1, descendMul: 1, rewardMul: 1.15, goldMul: 1, steelMul: 2 },
  { id: "pressure", name: "高层加压", desc: "下沉速度 +15%", hpMul: 1, descendMul: 1.15, rewardMul: 1.15, goldMul: 1, steelMul: 1 },
  { id: "gold-rush", name: "淘金热", desc: "神帖(高灵石)数量翻倍", hpMul: 1.05, descendMul: 1, rewardMul: 1.3, goldMul: 2, steelMul: 1 },
  { id: "brittle", name: "脆壳时代", desc: "砖更脆,但下沉 +25%", hpMul: 0.75, descendMul: 1.25, rewardMul: 1.2, goldMul: 1, steelMul: 1 },
];

/** 前 3 关为纯教学,不挂修改器。 */
export function stageModifier(stage: number): StageModifier | null {
  if (stage < 4) return null;
  return STAGE_MODIFIERS[Math.floor((stage - 4) / 3) % STAGE_MODIFIERS.length];
}

/** 推荐战力:以困难档为基准的线性成长,简单/地狱做偏移。 */
export function stagePowerFor(stage: number, diff: Difficulty): number {
  const base = 120 + (stage - 1) * 140;
  const bump = diff === "easy" ? 0.8 : diff === "hard" ? 1 : 1.4;
  return Math.round(base * bump);
}
