import { afterEach, describe, expect, test } from "bun:test";
import { claimBoot, detectBridge, detectPlatform } from "../src/platform.ts";

const scope = globalThis as Record<string, unknown>;

afterEach(() => {
  delete scope.miniApp;
  delete scope.__chaiLouBooted;
});

describe("platform detection", () => {
  test("a plain page has no bridge and counts as web", () => {
    expect(detectBridge()).toBeNull();
    expect(detectPlatform()).toBe("web");
  });

  test("an injected bridge is picked up as the mini-app runtime", () => {
    scope.miniApp = { ready: Promise.resolve({}) };
    expect(detectBridge()).not.toBeNull();
    expect(detectPlatform()).toBe("miniapp");
  });

  test("a throwing global degrades to web instead of crashing the page", () => {
    Object.defineProperty(scope, "miniApp", {
      configurable: true,
      get() {
        throw new Error("blocked by host");
      },
    });
    expect(detectBridge()).toBeNull();
    expect(detectPlatform()).toBe("web");
    // Clean up the accessor so later tests see a normal global.
    delete scope.miniApp;
  });

  test("non-object values are not mistaken for a bridge", () => {
    scope.miniApp = "yes";
    expect(detectBridge()).toBeNull();
    scope.miniApp = 42;
    expect(detectBridge()).toBeNull();
  });

  test("booting twice is refused, so a double-injected bundle runs once", () => {
    expect(claimBoot()).toBe(true);
    expect(claimBoot()).toBe(false);
  });
});
