/** DOM overlays: menu, draft, death, shop, achievements. */

export type El<K extends keyof HTMLElementTagNameMap> = HTMLElementTagNameMap[K];

export type Attrs = Record<
  string,
  string | boolean | ((event: Event) => void) | undefined
>;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Array<Node | string | null | undefined>
): El<K> {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined) continue;
    if (typeof value === "boolean") {
      if (value) el.setAttribute(key, "");
    } else if (typeof value === "function") {
      // Accept both "click" and "onclick" spellings.
      const type = key.startsWith("on") ? key.slice(2) : key;
      el.addEventListener(type, value as EventListener);
    } else if (key === "class") {
      el.className = value;
    } else {
      el.setAttribute(key, value);
    }
  }
  for (const child of children) {
    if (child == null) continue;
    el.append(child);
  }
  return el;
}

export interface OverlayManager {
  show(): void;
  hide(): void;
  clear(): void;
  root: HTMLElement;
}

export function getOverlay(): OverlayManager {
  const root = document.getElementById("overlay")!;
  return {
    root,
    show() {
      root.hidden = false;
    },
    hide() {
      root.hidden = true;
      root.replaceChildren();
    },
    clear() {
      root.replaceChildren();
    },
  };
}

/** Compact Chinese number: 12345 -> "1.2万", 100000000 -> "1.00亿". */
export function fmtNum(n: number): string {
  const value = Math.floor(n);
  if (value >= 99_999_500) return `${(value / 100_000_000).toFixed(2)}亿`;
  if (value >= 10_000) {
    const wan = value / 10_000;
    const digits = wan >= 100 ? 0 : 1;
    return `${wan.toFixed(digits).replace(/\.0$/, "")}万`;
  }
  return String(value);
}

/** Exact grouped number for prices ("20,684"). */
export function fmtFull(n: number): string {
  return Math.floor(n).toLocaleString("en-US");
}

export type Rarity = "common" | "rare" | "epic";

export interface CardSkin {
  rarity: Rarity;
  icon: string;
}

/** Visual identity for each upgrade, shown on draft cards. */
const UPGRADE_SKINS: Record<string, CardSkin> = {
  clone: { rarity: "common", icon: "❉" },
  pierce: { rarity: "rare", icon: "⇥" },
  rebound: { rarity: "common", icon: "↺" },
  heavy: { rarity: "common", icon: "◆" },
  crit: { rarity: "rare", icon: "✦" },
  critPower: { rarity: "rare", icon: "✷" },
  speed: { rarity: "common", icon: "≫" },
  splash: { rarity: "rare", icon: "◉" },
  fire: { rarity: "rare", icon: "焰" },
  poison: { rarity: "rare", icon: "毒" },
  resonance: { rarity: "epic", icon: "☯" },
  bossbane: { rarity: "epic", icon: "镇" },
  greedy: { rarity: "common", icon: "宝" },
  bigball: { rarity: "common", icon: "⬤" },
};

export function upgradeSkin(id: string): CardSkin {
  return UPGRADE_SKINS[id] ?? { rarity: "common", icon: "★" };
}

export const RARITY_CLASS: Record<Rarity, string> = {
  common: "card--common",
  rare: "card--rare",
  epic: "card--epic",
};
