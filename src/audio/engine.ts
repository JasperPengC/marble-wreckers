/**
 * 音效引擎：用 WebAudio 现场合成，不带任何音频文件。
 *
 * 取舍原因：小程序包不允许外部素材（也没有网络），一个 wav 塞进 zip 既不
 * 优雅也容易踩权限；振荡器+噪声现场合成只占代码体积，还能按伤害/暴击调音高。
 *
 * 浏览器有自动播放限制，所以 AudioContext 在第一次用户交互时才创建
 * （`unlock()`），之前调用 `play()` 会静默丢弃。
 */

import type { FxEvent } from "../game/run.ts";
import {
  createPlanState,
  planVoices,
  type PlanState,
  type VoiceKind,
  type VoiceSpec,
} from "./voices.ts";

export interface AudioEngine {
  /** 每帧喂一次事件（和渲染器共用同一批 drainFx 结果）。 */
  play(events: readonly FxEvent[]): void;
  /** 静音开关。关闭时立刻收声。 */
  setEnabled(enabled: boolean): void;
  isEnabled(): boolean;
  /** 胜利小调:通关结算时来一段上行琶音。 */
  jingle(): void;
  /** 首次用户交互时调用，创建/恢复音频上下文。 */
  unlock(): void;
  /** 诊断用：已发声数量 / 上下文状态。 */
  stats(): { played: number; state: string; enabled: boolean };
  dispose(): void;
}

const MASTER_GAIN = 0.5;

type Ctx = {
  ctx: AudioContext;
  master: GainNode;
  noise: AudioBuffer;
};

function makeNoiseBuffer(ctx: AudioContext): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * 0.4);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  return buffer;
}

export function createAudioEngine(initialEnabled = true): AudioEngine {
  let enabled = initialEnabled;
  let played = 0;
  let audio: Ctx | null = null;
  const plan: PlanState = createPlanState();

  function ensure(): Ctx | null {
    if (!enabled) return null;
    if (audio) {
      if (audio.ctx.state === "suspended") void audio.ctx.resume();
      return audio;
    }
    const Controller =
      (globalThis as { AudioContext?: typeof AudioContext }).AudioContext ??
      (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Controller) return null;
    try {
      const ctx = new Controller();
      const master = ctx.createGain();
      master.gain.value = MASTER_GAIN;
      // 一颗压缩器兜住多声部叠加，避免削波
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -18;
      limiter.knee.value = 12;
      limiter.ratio.value = 6;
      master.connect(limiter).connect(ctx.destination);
      audio = { ctx, master, noise: makeNoiseBuffer(ctx) };
      return audio;
    } catch {
      return null;
    }
  }

  function envelope(
    node: GainNode,
    ctx: AudioContext,
    peak: number,
    attack: number,
    decay: number
  ): void {
    const now = ctx.currentTime;
    node.gain.setValueAtTime(0.0001, now);
    node.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), now + attack);
    node.gain.exponentialRampToValueAtTime(0.0001, now + attack + decay);
  }

  function tone(
    rig: Ctx,
    type: OscillatorType,
    from: number,
    to: number,
    peak: number,
    attack: number,
    decay: number
  ): void {
    const { ctx, master } = rig;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), ctx.currentTime + attack + decay);
    envelope(gain, ctx, peak, attack, decay);
    osc.connect(gain).connect(master);
    osc.start();
    osc.stop(ctx.currentTime + attack + decay + 0.02);
  }

  function noiseBurst(
    rig: Ctx,
    peak: number,
    decay: number,
    filterHz: number,
    sweepTo?: number
  ): void {
    const { ctx, master, noise } = rig;
    const source = ctx.createBufferSource();
    source.buffer = noise;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(filterHz, ctx.currentTime);
    filter.Q.value = 0.9;
    if (sweepTo !== undefined) {
      filter.frequency.exponentialRampToValueAtTime(
        Math.max(60, sweepTo),
        ctx.currentTime + decay
      );
    }
    const gain = ctx.createGain();
    envelope(gain, ctx, peak, 0.004, decay);
    source.connect(filter).connect(gain).connect(master);
    source.start();
    source.stop(ctx.currentTime + decay + 0.02);
  }

  function render(rig: Ctx, voice: VoiceSpec): void {
    const { pitch, gain } = voice;
    switch (voice.kind) {
      case "launch":
        tone(rig, "sine", 560 * pitch, 260 * pitch, gain, 0.004, 0.07);
        break;
      case "hit":
        tone(rig, "triangle", 190 * pitch, 120 * pitch, gain, 0.003, 0.055);
        noiseBurst(rig, gain * 0.5, 0.035, 1400 * pitch, 700 * pitch);
        break;
      case "destroy":
        tone(rig, "square", 270 * pitch, 130 * pitch, gain * 0.6, 0.004, 0.09);
        noiseBurst(rig, gain * 0.7, 0.11, 900 * pitch, 320);
        break;
      case "blast":
        noiseBurst(rig, gain, 0.22, 700, 90);
        break;
      case "collapse":
        tone(rig, "sawtooth", 110, 42, gain * 0.6, 0.02, 0.5);
        noiseBurst(rig, gain * 0.8, 0.45, 380, 90);
        break;
      case "bossarmor":
        noiseBurst(rig, gain * 0.7, 0.16, 2600, 700);
        tone(rig, "sawtooth", 150, 60, gain * 0.7, 0.01, 0.34);
        break;
      case "bosskill":
        tone(rig, "triangle", 523, 523, gain * 0.6, 0.01, 0.16);
        tone(rig, "triangle", 659, 659, gain * 0.55, 0.01, 0.22);
        tone(rig, "triangle", 784, 784, gain * 0.5, 0.01, 0.3);
        break;
      case "death":
        tone(rig, "sawtooth", 220, 68, gain * 0.7, 0.01, 0.55);
        noiseBurst(rig, gain * 0.4, 0.4, 500, 120);
        break;
      case "shield":
        tone(rig, "sine", 880, 1180, gain, 0.005, 0.13);
        break;
      case "fizzle":
        noiseBurst(rig, gain, 0.03, 2600, 1500);
        break;
      case "status":
        noiseBurst(rig, gain, 0.05, 1800, 900);
        break;
      case "heal":
        tone(rig, "sine", 440, 700, gain, 0.01, 0.16);
        break;
      case "proc":
        tone(rig, "square", 760, 900, gain * 0.5, 0.004, 0.05);
        break;
      default:
        break;
    }
  }

  return {
    play(events) {
      if (!enabled || events.length === 0) return;
      const rig = ensure();
      if (!rig) return;
      for (const voice of planVoices(events, plan, performance.now())) {
        render(rig, voice);
        played += 1;
      }
    },
    setEnabled(next) {
      enabled = next;
      if (!next && audio) {
        audio.master.gain.value = 0;
        void audio.ctx.suspend();
      } else if (next && audio) {
        audio.master.gain.value = MASTER_GAIN;
        void audio.ctx.resume();
      }
    },
    isEnabled: () => enabled,
    jingle() {
      const rig = ensure();
      if (!rig) return;
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, index) => {
        const delay = index * 0.09;
        const osc = rig.ctx.createOscillator();
        const gain = rig.ctx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(freq, rig.ctx.currentTime + delay);
        gain.gain.setValueAtTime(0.0001, rig.ctx.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(0.3, rig.ctx.currentTime + delay + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, rig.ctx.currentTime + delay + 0.3);
        osc.connect(gain).connect(rig.master);
        osc.start(rig.ctx.currentTime + delay);
        osc.stop(rig.ctx.currentTime + delay + 0.35);
        played += 1;
      });
    },
    unlock() {
      ensure();
    },
    stats: () => ({
      played,
      state: audio ? audio.ctx.state : "none",
      enabled,
    }),
    dispose() {
      if (!audio) return;
      void audio.ctx.close();
      audio = null;
    },
  };
}

export type { VoiceKind };
