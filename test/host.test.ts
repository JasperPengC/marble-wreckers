import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHost, type HostSDK } from "../src/host.ts";

/** Minimal browser stand-in: the host layer only needs window.localStorage. */
function installFakeWindow(): Map<string, string> {
  const store = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  };
  (globalThis as Record<string, unknown>).window = { localStorage };
  return store;
}

const messages = {
  zh_CN: {
    saveUnreadable: "存档损坏",
    saveFallback: "已切换到本地存档",
    apiError: "接口错误 {code}",
  },
};

type BridgeOptions = {
  permissions?: string[];
  store?: Map<string, string>;
  failWrite?: boolean;
};

/** A bridge shaped like the linux.do loader's, with just what the host uses. */
function fakeBridge(options: BridgeOptions = {}) {
  const store = options.store ?? new Map<string, string>();
  const permissions = new Set(options.permissions ?? ["storage.read", "storage.write"]);
  const ready = Promise.resolve({});
  return {
    ready,
    permissions: { has: (permission: string) => permissions.has(permission) },
    localStorage: {
      getItem: async (key: string) => store.get(key) ?? null,
      setItem: async (key: string, value: string) => {
        if (options.failWrite) throw { code: "WRITE_FAILED" };
        store.set(key, value);
      },
    },
    lifecycle: { ready: async () => undefined },
  };
}

let store: Map<string, string>;

beforeEach(() => {
  store = installFakeWindow();
});

afterEach(() => {
  delete (globalThis as Record<string, unknown>).window;
});

describe("host storage backend", () => {
  test("without a bridge everything goes to localStorage", async () => {
    const notices: string[] = [];
    const host = createHost(null, messages, { onNotice: (t) => notices.push(t) });
    await host.connect();
    expect(host.platform).toBe("web");
    expect(host.storageKind()).toBe("local");

    await host.save("meta", { coins: 7 });
    expect(store.get("chai-lou-danzhu:meta")).toBe('{"coins":7}');
    expect(await host.load("meta")).toEqual({ coins: 7 });
    expect(notices).toEqual([]);
  });

  test("with a bridge the platform store owns the data", async () => {
    const bridgeStore = new Map<string, string>();
    const host = createHost(
      fakeBridge({ store: bridgeStore }) as unknown as HostSDK,
      messages
    );
    await host.connect();
    expect(host.platform).toBe("miniapp");
    expect(host.storageKind()).toBe("sdk");

    await host.save("run", { towerIndex: 2 });
    expect(bridgeStore.get("run")).toBe('{"towerIndex":2}');
    // The browser store must stay untouched, or the two saves would diverge.
    expect(store.size).toBe(0);
    expect(await host.load("run")).toEqual({ towerIndex: 2 });
  });

  test("a bridge without storage permission falls back to localStorage", async () => {
    const bridgeStore = new Map<string, string>();
    const host = createHost(
      fakeBridge({ store: bridgeStore, permissions: [] }) as unknown as HostSDK,
      messages
    );
    await host.connect();
    expect(host.storageKind()).toBe("local");

    await host.save("meta", { coins: 3 });
    expect(store.get("chai-lou-danzhu:meta")).toBe('{"coins":3}');
    expect(bridgeStore.size).toBe(0);
  });

  test("a failing write degrades to localStorage instead of losing progress", async () => {
    const notices: string[] = [];
    const bridgeStore = new Map<string, string>();
    const host = createHost(
      fakeBridge({ store: bridgeStore, failWrite: true }) as unknown as HostSDK,
      messages,
      { onNotice: (t) => notices.push(t) }
    );
    await host.connect();
    expect(host.storageKind()).toBe("sdk");

    await host.save("run", { towerIndex: 9 });
    expect(bridgeStore.size).toBe(0);
    expect(store.get("chai-lou-danzhu:run")).toBe('{"towerIndex":9}');
    expect(host.storageKind()).toBe("local");
    expect(notices).toContain("已切换到本地存档");
  });

  test("corrupt local saves are reported and read as empty", async () => {
    const notices: string[] = [];
    const host = createHost(null, messages, { onNotice: (t) => notices.push(t) });
    await host.connect();
    store.set("chai-lou-danzhu:meta", "{not json");
    expect(await host.load("meta")).toBeNull();
    expect(notices).toContain("存档损坏");
  });
});
