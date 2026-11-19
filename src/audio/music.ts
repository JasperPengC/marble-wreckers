/**
 * 背景音乐引擎：WebAudio 现场合成的循环小曲，同样不带音频文件。
 *
 * 与音效引擎分离(独立 AudioContext + 独立开关)，走 16 分音符 lookahead
 * 调度器：每 120ms 醒来一次，把未来 0.4s 内的音符排进队列，保证节奏不抖。
 *
 * 曲式：Am — F — C — G 四小节循环，低音 + 软垫 + 琶音三层，
 * Boss 战切到更急的半音阶变奏(仅加速与换音色，结构不变)。
 */

export interface MusicEngine {
  unlock(): void;
  setEnabled(enabled: boolean): void;
  isEnabled(): boolean;
  /** normal = 常规推进;boss = 镇站巨楼战(加速变奏)。 */
  setIntensity(mode: "normal" | "boss"): void;
  stats(): { enabled: boolean; state: string; bar: number };
  dispose(): void;
}

const MASTER_GAIN = 0.16;

/** 四小节和弦(A 小调进行),每小节 8 个八分音符。 */
const PROGRESSION: Array<{ root: number; chord: number[]; lead: number[] }> = [
  { root: 110.0, chord: [220.0, 261.63, 329.63], lead: [440, 523.25, 659.25, 523.25] }, // Am
  { root: 87.31, chord: [174.61, 220.0, 261.63], lead: [349.23, 440, 523.25, 440] }, // F
  { root: 130.81, chord: [261.63, 329.63, 392.0], lead: [523.25, 659.25, 783.99, 659.25] }, // C
  { root: 98.0, chord: [196.0, 246.94, 293.66], lead: [392, 493.88, 587.33, 493.88] }, // G
];

const STEP_SECONDS = 60 / 104 / 2; // 104 BPM 的八分音符

type Rig = {
  ctx: AudioContext;
  master: GainNode;
};

export function createMusicEngine(initialEnabled = true): MusicEngine {
  let enabled = initialEnabled;
  let rig: Rig | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let bar = 0;
  let step = 0;
  let nextTime = 0;
  let intensity: "normal" | "boss" = "normal";
  let locked = false;

  function ensure(): Rig | null {
    if (!enabled) return null;
    if (rig) {
      if (rig.ctx.state === "suspended") void rig.ctx.resume();
      return rig;
    }
    const Controller =
      (globalThis as { AudioContext?: typeof AudioContext }).AudioContext ??
      (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Controller) return null;
    try {
      const ctx = new Controller();
      const master = ctx.createGain();
      master.gain.value = 0.0001;
      master.connect(ctx.destination);
      rig = { ctx, master };
      return rig;
    } catch {
      return null;
    }
  }

  /** 淡入(开启/解锁)与淡出(关闭),避免硬切。 */
  function ramp(r: Rig, target: number, seconds: number): void {
    r.master.gain.cancelScheduledValues(r.ctx.currentTime);
    r.master.gain.setValueAtTime(Math.max(0.0001, r.master.gain.value), r.ctx.currentTime);
    r.master.gain.exponentialRampToValueAtTime(Math.max(0.0001, target), r.ctx.currentTime + seconds);
  }

  function noteAt(
    r: Rig,
    time: number,
    freq: number,
    dur: number,
    type: OscillatorType,
    peak: number
  ): void {
    const osc = r.ctx.createOscillator();
    const gain = r.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, time);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(peak, time + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    osc.connect(gain).connect(r.master);
    osc.start(time);
    osc.stop(time + dur + 0.03);
  }

  function hatAt(r: Rig, time: number, peak: number): void {
    const length = Math.floor(r.ctx.sampleRate * 0.05);
    const buffer = r.ctx.createBuffer(1, length, r.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = r.ctx.createBufferSource();
    source.buffer = buffer;
    const filter = r.ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 6000;
    const gain = r.ctx.createGain();
    gain.gain.setValueAtTime(peak, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.04);
    source.connect(filter).connect(gain).connect(r.master);
    source.start(time);
    source.stop(time + 0.06);
  }

  /** 调度一个八分音符步:低音/软垫在偶数步,琶音+踩镲走全步。 */
  function scheduleStep(r: Rig, time: number, barIndex: number, stepIndex: number): void {
    const track = PROGRESSION[barIndex % PROGRESSION.length];
    const boss = intensity === "boss";
    const isEven = stepIndex % 2 === 0;
    const peak = boss ? 0.5 : 0.42;
    if (isEven) {
      noteAt(r, time, track.root, STEP_SECONDS * 3.4, "sine", 0.5);
      for (const freq of track.chord) {
        noteAt(r, time, freq, STEP_SECONDS * 2.8, "triangle", 0.1);
      }
    }
    const lead = track.lead[(stepIndex + (boss ? 1 : 0)) % track.lead.length];
    noteAt(r, time, lead * (boss ? 1 : 1), STEP_SECONDS * (boss ? 0.9 : 1.4), boss ? "square" : "triangle", boss ? 0.12 : 0.09);
    hatAt(r, time, isEven ? 0.1 : 0.06);
  }

  function tick(): void {
    if (!enabled || !rig) return;
    const horizon = rig.ctx.currentTime + 0.4;
    while (nextTime < horizon) {
      scheduleStep(rig, nextTime, bar, step);
      step += 1;
      if (step >= 8) {
        step = 0;
        bar += 1;
      }
      nextTime += STEP_SECONDS;
    }
  }

  function startScheduler(): void {
    if (timer !== null) return;
    nextTime = Math.max(rig?.ctx.currentTime ?? 0, 0) + 0.1;
    tick();
    timer = setInterval(tick, 120);
  }

  return {
    unlock() {
      if (locked) return;
      locked = true;
      const r = ensure();
      if (!r) return;
      ramp(r, enabled ? MASTER_GAIN : 0.0001, 1.2);
      startScheduler();
    },
    setEnabled(next) {
      enabled = next;
      if (!rig) return;
      if (next) {
        ramp(rig, MASTER_GAIN, 1.0);
        startScheduler();
      } else {
        ramp(rig, 0.0001, 0.6);
      }
    },
    isEnabled: () => enabled,
    setIntensity(mode) {
      intensity = mode;
    },
    stats: () => ({ enabled, state: rig ? rig.ctx.state : "none", bar }),
    dispose() {
      if (timer !== null) clearInterval(timer);
      timer = null;
      if (rig) void rig.ctx.close();
      rig = null;
    },
  };
}
