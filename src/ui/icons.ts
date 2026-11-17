/** Authored inline SVG icon set: one 24px grid, one stroke weight, currentColor. */

const PATHS: Record<string, string> = {
  flame:
    "M12 3c2.2 3.6 5 4.8 5 8.6a5 5 0 0 1-10 0c0-1.9.9-3.2 2.2-4.4.1 1.7.7 2.8 1.8 3.3C10.4 7.6 10.8 5.4 12 3Z",
  gem: "M6 4h12l3 5.5-9 11.5L3 9.5 6 4Zm0 0 3 5.5h6L18 4M3 9.5h18M9.5 9.5 12 21l2.5-11.5",
  shield: "M12 3.2 19 6v5.6c0 4.6-3.6 6.9-7 9.2-3.4-2.3-7-4.6-7-9.2V6l7-2.8Zm-2.6 8.9 1.9 1.9 3.4-3.6",
  pause: "M9 5v14M15 5v14",
  help: "M9.4 9.2a2.7 2.7 0 1 1 3.8 2.5c-.8.4-1.2.9-1.2 1.9M12 17.2v.1",
  flag: "M6 21V4m0 0h11l-2.2 4L17 12H6",
  tower: "M4 20h16M6 20V9m4 11V6m4 14v-8m4 8V4",
  clone: "M8.2 12.5a3.8 3.8 0 1 0 7.6 0a3.8 3.8 0 1 0-7.6 0M14.8 11a3.8 3.8 0 1 0 7.6 0a3.8 3.8 0 1 0-7.6 0",
  pierce: "M4 12h13m0 0-4-4m4 4-4 4M20 8v8",
  rebound: "M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 3.5v4h-4",
  heavy: "M6 20h12l-1.8-8H7.8L6 20Zm3.8-8V8a2.2 2.2 0 0 1 4.4 0v4",
  crit: "M12 2.5 14.2 9l6.8 2.4-6.8 2.4L12 20.5 9.8 13.8 3 11.4 9.8 9 12 2.5Z",
  critPower: "M11 2.5 13 8.5l6 1.9-6 1.9-2 6-2-6-6-1.9 6-1.9 2-6ZM19 16v5m-2.5-2.5h5",
  speed: "M13.5 2.5 6 13.5h4.5L9 21.5l8.5-11.5h-4.5l3-7.5Z",
  splash: "M12 12m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0M12 4.5v3M12 16.5v3M4.5 12h3M16.5 12h3M6.7 6.7l2.1 2.1m6.4 6.4 2.1 2.1m0-12.8-2.1 2.1m-6.4 6.4-2.1 2.1",
  fire: "M12 3c2.2 3.6 5 4.8 5 8.6a5 5 0 0 1-10 0c0-1.9.9-3.2 2.2-4.4.1 1.7.7 2.8 1.8 3.3C10.4 7.6 10.8 5.4 12 3Z",
  poison: "M12 3.5c3 3.2 5 5.6 5 8.4a5 5 0 0 1-10 0c0-2.8 2-5.2 5-8.4ZM10.2 12.2h.01m3.6-1.2h.01m-1.8 3.4h.01",
  resonance: "M9 15.5l6-6M7.5 16.5a3.2 3.2 0 0 1 0-4.5l2-2M16.5 7.5a3.2 3.2 0 0 1 0 4.5l-2 2",
  bossbane: "M4 17.5 6 7l3 3.5L12 5l3 5.5L18 7l2 10.5H4Zm2 3h12",
  greedy: "M5 19 19 5M19 5l-1 5.5M19 5l-5.5 1M8 8l4 4-3.5 1.5L5 10 8 8Z",
  bigball: "M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17Zm-3 5.5a2 2 0 1 0 0 4",
  play: "M8 5.5 18 12 8 18.5V5.5Z",
  restart: "M4 12a8 8 0 1 0 2.5-5.8M4 4v4h4",
  home: "M4 11.5 12 4l8 7.5M6.5 10v9.5h11V10",
  shop: "M4 9.5h16L18 20H6L4 9.5Zm3 0V7a5 5 0 0 1 10 0v2.5",
  book: "M5 4.5h6.5a2 2 0 0 1 2 2V20a2 2 0 0 0-2-2H5V4.5Zm14 0h-3.5a2 2 0 0 0-2 2V20a2 2 0 0 1 2-2H19V4.5Z",
  chevron: "M9 6l6 6-6 6",
  bounce: "M3.5 19.5c0-7.5 5-13 11.5-13M15 4.5l3.5-1-1 3.5M4.5 19.5h.01M9 19.5h.01m4.5 0h.01m4.5 0h.01",
  impact: "M12 7.5 14 12l4.5 2-4.5 2-2 4.5-2-4.5L5.5 14l4.5-2 2-4.5ZM19 5h.01M5.5 6.5h.01M18.5 18h.01",
  back: "M15 5l-7 7 7 7",
  coin: "M12 4.5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15Zm0 3.5v8m-2.4-6.4h3.4a1.8 1.8 0 0 1 0 3.6H9.9",
  gear: "M12 8.5A3.5 3.5 0 1 0 12 15.5 3.5 3.5 0 0 0 12 8.5Zm0-6 .9 3.1-2 1.2-2.8-1.7-1.7 1.7 1.7 2.8-1.2 2L3 12l3.1.9 1.2 2-1.7 2.8 1.7 1.7 2.8-1.7 2 1.2L12 21l.9-3.1 2-1.2 2.8 1.7 1.7-1.7-1.7-2.8 1.2-2L21 12l-3.1-.9-1.2-2 1.7-2.8-1.7-1.7-2.8 1.7-2-1.2L12 2.5Z",
  calendar: "M4.5 6.5h15v13h-15v-13Zm0 4h15M8 4v4m8-4v4M8 14h2m3 0h2m-7 3h2m3 0h2",
};

export type IconName = keyof typeof PATHS;

/** Returns an inline SVG element using the shared 24px / 1.8 stroke grid. */
export function icon(name: string, extraClass = ""): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.setAttribute(
    "class",
    `ico${extraClass ? ` ${extraClass}` : ""}`
  );
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.8");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", PATHS[name] ?? PATHS.help);
  svg.append(path);
  return svg;
}

/** Icon markup as a string, for aria-label-only buttons rendered via innerHTML. */
export function iconMarkup(name: string): string {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${PATHS[name] ?? PATHS.help}"/></svg>`;
}

export const UPGRADE_ICONS: Record<string, string> = {
  clone: "clone",
  pierce: "pierce",
  piercePower: "impact",
  rebound: "rebound",
  heavy: "heavy",
  crit: "crit",
  critPower: "critPower",
  speed: "speed",
  splash: "splash",
  fire: "fire",
  poison: "poison",
  resonance: "resonance",
  bossbane: "bossbane",
  greedy: "greedy",
  bigball: "bigball",
  bounce: "bounce",
  bounceDmg: "impact",
  lanes: "pierce",
  comboDmg: "critPower",
};
