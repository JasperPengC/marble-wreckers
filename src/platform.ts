/**
 * Runtime platform detection.
 *
 * The same bundle runs in two places:
 *
 *  - the linux.do mini-app sandbox, where the loader injects a `miniApp`
 *    bridge on the global object (SDK storage, community theme, user, and
 *    `lifecycle.ready()`), and
 *  - a plain browser served over HTTP, where none of that exists.
 *
 * Detection happens at runtime rather than at build time, so one build works
 * in both places. It never throws: an SDK that is present but unusable
 * degrades to the browser profile instead of breaking the page.
 */

export type RuntimePlatform = "miniapp" | "web";

/** Minimal shape used for detection; the full type comes from the SDK. */
type BridgeLike = { ready?: Promise<unknown> };

/**
 * Returns the injected mini-app bridge, or null when the page runs as a plain
 * web page. Reading a global cannot fail, but an exotic embedder could expose a
 * throwing getter, so the access is guarded.
 */
export function detectBridge(): BridgeLike | null {
  try {
    const bridge = (globalThis as { miniApp?: unknown }).miniApp;
    if (!bridge || (typeof bridge !== "object" && typeof bridge !== "function")) {
      return null;
    }
    return bridge as BridgeLike;
  } catch {
    return null;
  }
}

export function detectPlatform(): RuntimePlatform {
  return detectBridge() ? "miniapp" : "web";
}

/**
 * Bumped by every boot so a double-loaded bundle (for example a host that
 * injects app.js even though the document already references it) only starts
 * the game once.
 */
const BOOT_FLAG = "__chaiLouBooted";

export function claimBoot(): boolean {
  const scope = globalThis as Record<string, unknown>;
  if (scope[BOOT_FLAG]) return false;
  scope[BOOT_FLAG] = true;
  return true;
}
