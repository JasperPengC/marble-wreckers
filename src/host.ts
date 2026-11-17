import type {
  JsonValue,
  MiniAppSDK,
  MiniAppTheme,
  MiniAppUser,
  Permission,
} from "@discourse-mini-app/sdk";

/** Capabilities used by the optional community adapter. */
export type HostSDK = Pick<MiniAppSDK, "ready"> & {
  permissions: Pick<MiniAppSDK["permissions"], "has">;
  user?: Pick<MiniAppSDK["user"], "getCurrent">;
  theme?: Pick<MiniAppSDK["theme"], "get" | "onChange">;
  localStorage?: Partial<MiniAppSDK["localStorage"]>;
  lifecycle?: MiniAppSDK["lifecycle"];
};

export type HostMode = "preview" | "connected" | "guest" | "disconnected";

/**
 * Local preview persistence (no SDK): localStorage, so a reload or a return to
 * the page keeps progress exactly like the platform storage would.
 */
const PREVIEW_PREFIX = "chai-lou-danzhu:";

function previewRead(key: string): string | null {
  try {
    return window.localStorage.getItem(PREVIEW_PREFIX + key);
  } catch {
    return null;
  }
}

function previewWrite(key: string, value: string): void {
  try {
    window.localStorage.setItem(PREVIEW_PREFIX + key, value);
  } catch {
    // Storage disabled (private mode/quota): play continues in memory.
  }
}

/**
 * Connects the game to available platform capabilities without blocking local
 * play. `sdk` is the injected mini-app bridge, or null on a plain web page.
 *
 * Storage is resolved once per session to a single backend (platform storage or
 * browser localStorage) instead of being mixed, so the same save is never read
 * back from two places. If the bridge turns out to be unusable the session
 * degrades to localStorage and says so, rather than silently dropping saves.
 */
export function createHost(
  sdk: HostSDK | null,
  messages: Record<string, Record<string, string>>,
  callbacks: {
    onNotice?: (text: string) => void;
    onTheme?: (theme: MiniAppTheme) => void;
    onIdentity?: (user: MiniAppUser | null) => void;
    onMode?: (mode: HostMode) => void;
  } = {}
) {
  let locale = "zh_CN";
  let localeOverride: string | null = null;
  let connected = false;
  let unsubscribe: (() => void) | null | undefined;
  let session:
    | {
        user: MiniAppUser | null;
        mode: HostMode;
      }
    | undefined;
  let writes: Promise<unknown> = Promise.resolve();
  const t = (key: string, values: object = {}) =>
    (messages[localeOverride ?? locale]?.[key] ??
      messages[locale]?.[key] ??
      messages["zh_CN"][key] ??
      key).replace(
      /\{(\w+)\}/g,
      (_: string, name: string) =>
        String((values as Record<string, unknown>)[name] ?? "")
    );
  const has = (permission: Permission) =>
    connected && sdk!.permissions.has(permission);
  const report = (error: unknown) => {
    const code = (error as { code?: unknown } | null)?.code;
    // Retain the underlying exception so a developer can identify the failing capability.
    // eslint-disable-next-line no-console
    console.warn("[chai-lou] Community API failed", error);
    callbacks.onNotice?.(
      t("apiError", {
        code:
          typeof code === "string"
            ? code
            : error instanceof Error
              ? error.name
              : "UNKNOWN_ERROR",
      })
    );
  };
  const applyTheme = (theme: MiniAppTheme) => {
    locale = Object.hasOwn(messages, theme.locale) ? theme.locale : "en";
    callbacks.onTheme?.(theme);
    if (session) {
      showSession(session.user, session.mode);
    }
  };
  function showSession(user: MiniAppUser | null, mode: HostMode) {
    session = { user, mode };
    callbacks.onIdentity?.(user);
    callbacks.onMode?.(mode);
  }
  async function call<T, F = null>(
    permission: Permission,
    action: () => T | Promise<T>,
    fallback: F = null as F
  ): Promise<T | F> {
    if (!has(permission)) {
      return fallback;
    }
    try {
      return await action();
    } catch (error) {
      report(error);
      return fallback;
    }
  }

  /**
   * Which storage owns this session. Chosen once (permissions are only known
   * after connect) and kept for the lifetime of the page.
   */
  let storage: "sdk" | "local" | null = null;

  function storageKind(): "sdk" | "local" {
    if (storage !== null) return storage;
    const usable =
      sdk !== null &&
      connected &&
      typeof sdk.localStorage?.getItem === "function" &&
      typeof sdk.localStorage?.setItem === "function" &&
      has("storage.read") &&
      has("storage.write");
    storage = usable ? "sdk" : "local";
    return storage;
  }

  /** The bridge failed mid-session: keep playing and keep saving locally. */
  function degradeStorage(error: unknown): void {
    if (storage !== "local") {
      storage = "local";
      callbacks.onNotice?.(t("saveFallback"));
    }
    // eslint-disable-next-line no-console
    console.warn("[chai-lou] Platform storage unavailable, using localStorage", error);
  }

  function readLocal(key: string): JsonValue | null {
    const value = previewRead(key);
    if (value === null) return null;
    try {
      return JSON.parse(value) as JsonValue;
    } catch {
      callbacks.onNotice?.(t("saveUnreadable"));
      return null;
    }
  }

  function writeLocal(key: string, snapshot: string): void {
    previewWrite(key, snapshot);
  }
  return {
    t,
    has,
    /**
     * Where this session runs. Derived from the bridge we were handed, so it
     * always matches the capabilities actually in use.
     */
    platform: sdk ? ("miniapp" as const) : ("web" as const),
    /** Which store owns the data, once it is known. */
    storageKind,
    setLocale(next: "zh_CN" | "en" | null) {
      localeOverride = next;
    },
    async connect() {
      unsubscribe?.();
      unsubscribe = null;
      storage = null;
      if (!sdk) {
        showSession(null, "preview");
        return;
      }
      try {
        await sdk.ready;
        connected = true;
        if (has("theme.read")) {
          unsubscribe = sdk!.theme!.onChange(applyTheme);
          const theme = await call("theme.read", () => sdk!.theme!.get());
          if (theme) {
            applyTheme(theme);
          }
        }
        const user = await call("user.read", () => sdk!.user!.getCurrent());
        showSession(user, user ? "connected" : "guest");
      } catch (error) {
        showSession(null, "disconnected");
        report(error);
      }
    },
    async load(key: string) {
      if (storageKind() === "local") return readLocal(key);
      try {
        const value = await sdk!.localStorage!.getItem!(key);
        if (value === null) return null;
        try {
          return JSON.parse(value) as JsonValue;
        } catch {
          callbacks.onNotice?.(t("saveUnreadable"));
          return null;
        }
      } catch (error) {
        degradeStorage(error);
        return readLocal(key);
      }
    },
    save(key: string, value: unknown) {
      const snapshot = JSON.stringify(value);
      if (storageKind() === "local") {
        writeLocal(key, snapshot);
        return Promise.resolve();
      }
      writes = writes.then(async () => {
        try {
          await sdk!.localStorage!.setItem!(key, snapshot);
        } catch (error) {
          degradeStorage(error);
          writeLocal(key, snapshot);
        }
      });
      return writes;
    },
    async rendered() {
      if (sdk) {
        try {
          await sdk.lifecycle!.ready();
        } catch (error) {
          report(error);
        }
      }
    },
    dispose() {
      connected = false;
      unsubscribe?.();
    },
  };
}
