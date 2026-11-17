/** Deterministic RNG utilities shared by runs and the daily challenge. */

/** cyrb53-style string hash producing a 53-bit integer. */
export function hashSeed(input: string): number {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** mulberry32 PRNG: tiny, fast, deterministic, with inspectable state. */
export interface Rng {
  (): number;
  /** Current internal state (for save/restore). */
  getState(): number;
  setState(state: number): void;
}

export function makeRng(seed: number | string): Rng {
  let a = typeof seed === "string" ? hashSeed(seed) : seed | 0;
  const rng = (() => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }) as Rng;
  rng.getState = () => a;
  rng.setState = (state: number) => {
    a = state | 0;
  };
  return rng;
}

/** Uniform integer in [0, n). */
export function rngInt(rng: Rng, n: number): number {
  return Math.floor(rng() * n);
}

/** Pick one element. */
export function rngPick<T>(rng: Rng, list: readonly T[]): T {
  return list[rngInt(rng, list.length)];
}

/** Shuffle in place (Fisher-Yates), returns the same array. */
export function rngShuffle<T>(rng: Rng, list: T[]): T[] {
  for (let i = list.length - 1; i > 0; i--) {
    const j = rngInt(rng, i + 1);
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

/** Today's daily-challenge seed, stable for the whole local day. */
export function dailySeed(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
