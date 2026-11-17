/**
 * 音效决策层（纯函数，不碰 WebAudio）。
 *
 * 游戏每帧从 `drainFx()` 拿到一串事件，24 颗弹珠同时炸开时可能一次几十条。
 * 这里负责「哪些该响、响多高」，把节流和音高换算从音频实现里拆出来，
 * 这样可以直接单测，不用起音频上下文。
 */

import type { FxEvent } from "../game/run.ts";

export type VoiceKind =
  | "launch"
  | "hit"
  | "destroy"
  | "blast"
  | "collapse"
  | "bosskill"
  | "bossarmor"
  | "death"
  | "shield"
  | "fizzle"
  | "status"
  | "heal"
  | "proc";

export interface VoiceSpec {
  kind: VoiceKind;
  /** 相对音量，已含暴击等加成。 */
  gain: number;
  /** 频率倍率，1 为基准音高。 */
  pitch: number;
}

/** 同一类音效的最小间隔，避免弹幕把耳朵打穿孔。 */
export const COOLDOWN_MS: Record<VoiceKind, number> = {
  launch: 16,
  hit: 20,
  destroy: 26,
  blast: 55,
  collapse: 200,
  bosskill: 200,
  bossarmor: 140,
  death: 200,
  shield: 90,
  fizzle: 45,
  status: 55,
  heal: 80,
  proc: 40,
};

/** 单批最多发多少个声音，超过就只留前面的。 */
export const MAX_VOICES_PER_BATCH = 10;

const BASE_GAIN: Record<VoiceKind, number> = {
  launch: 0.16,
  hit: 0.3,
  destroy: 0.38,
  blast: 0.5,
  collapse: 0.7,
  bosskill: 0.8,
  bossarmor: 0.85,
  death: 0.75,
  shield: 0.4,
  fizzle: 0.12,
  status: 0.2,
  heal: 0.3,
  proc: 0.22,
};

export interface PlanState {
  lastAt: Partial<Record<VoiceKind, number>>;
}

export function createPlanState(): PlanState {
  return { lastAt: {} };
}

/** 伤害越高音越低沉一点，暴击再亮一点——别做成一样的声音。 */
function hitPitch(damage: number): number {
  const pitch = 1.5 - Math.min(1, Math.max(0, damage) / 40) * 0.7;
  return Math.round(pitch * 100) / 100;
}

function toVoice(event: FxEvent): VoiceSpec | null {
  switch (event.type) {
    case "launch":
      return { kind: "launch", gain: BASE_GAIN.launch, pitch: 1 };
    case "fizzle":
      return { kind: "fizzle", gain: BASE_GAIN.fizzle, pitch: 1 };
    case "proc":
      return { kind: "proc", gain: BASE_GAIN.proc, pitch: 1 };
    case "hit":
      return {
        kind: "hit",
        gain: BASE_GAIN.hit * (event.crit ? 1.35 : 1),
        pitch: hitPitch(event.damage) * (event.crit ? 1.2 : 1),
      };
    case "destroy":
      return {
        kind: "destroy",
        gain: BASE_GAIN.destroy,
        // 值钱的砖碎得更亮
        pitch: 0.9 + Math.min(0.6, event.coins / 40),
      };
    case "blast":
      return { kind: "blast", gain: BASE_GAIN.blast, pitch: 1 };
    case "status":
      return { kind: "status", gain: BASE_GAIN.status, pitch: 1 };
    case "heal":
      return { kind: "heal", gain: BASE_GAIN.heal, pitch: 1 };
    case "shield":
      return { kind: "shield", gain: BASE_GAIN.shield, pitch: 1 };
    case "collapse":
      return { kind: "collapse", gain: BASE_GAIN.collapse, pitch: 1 };
    case "death":
      return { kind: "death", gain: BASE_GAIN.death, pitch: 1 };
    case "bosskill":
      return { kind: "bosskill", gain: BASE_GAIN.bosskill, pitch: 1 };
    case "bossarmor":
      return { kind: "bossarmor", gain: BASE_GAIN.bossarmor, pitch: 1 };
    default:
      return null;
  }
}

/**
 * 把一批事件压成这一帧要发的音。会就地更新 `state.lastAt`。
 * 关键事件（boom、塌楼、死亡）不参与数量上限，免得关键时刻被吞掉。
 */
const ALWAYS_PLAY: ReadonlySet<VoiceKind> = new Set([
  "collapse",
  "bosskill",
  "death",
  "blast",
  "shield",
]);

export function planVoices(
  events: readonly FxEvent[],
  state: PlanState,
  now: number
): VoiceSpec[] {
  const voices: VoiceSpec[] = [];
  let budget = MAX_VOICES_PER_BATCH;

  for (const event of events) {
    const voice = toVoice(event);
    if (!voice) continue;

    const last = state.lastAt[voice.kind];
    if (last !== undefined && now - last < COOLDOWN_MS[voice.kind]) continue;

    const critical = ALWAYS_PLAY.has(voice.kind);
    if (!critical) {
      if (budget <= 0) continue;
      budget -= 1;
    }

    state.lastAt[voice.kind] = now;
    voices.push(voice);
  }

  return voices;
}
