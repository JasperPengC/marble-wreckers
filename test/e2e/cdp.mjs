/**
 * 零依赖 CDP 客户端 + headless Chrome 启动器。
 *
 * 只依赖 Node >= 22（或 bun）自带的 `fetch` 与全局 `WebSocket`：
 * 不引入 puppeteer / playwright / chrome-remote-interface。
 */

import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** 元素/状态对象的精简打印，用于报错信息。 */
export function brief(value, max = 300) {
  let text;
  try {
    text = typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    text = String(value);
  }
  if (text == null) text = String(value);
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export class SetupError extends Error {
  constructor(message) {
    super(message);
    this.name = "SetupError";
  }
}

/** CDP 端口探测：端口上是不是已经有 Chrome 在监听。 */
export async function probeCdpPort(port, timeoutMs = 800) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/version`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * 启动一个属于本次运行的 headless Chrome。
 * 使用独立 user-data-dir（运行结束会删除），不碰用户正在使用的 Chrome。
 */
export async function launchChrome({
  executablePath,
  port,
  windowSize = "1280,900",
  initialUrl = "about:blank",
  timeoutMs = 25000,
  extraArgs = [],
}) {
  const profileDir = path.join(
    os.tmpdir(),
    "dsh-e2e",
    `profile-${port}-${process.pid}-${Date.now()}`
  );
  await fs.rm(profileDir, { recursive: true, force: true });
  await fs.mkdir(profileDir, { recursive: true });

  const args = [
    "--headless=new",
    `--remote-debugging-address=127.0.0.1`,
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--disable-features=CalculateNativeWinOcclusion",
    "--mute-audio",
    "--hide-scrollbars",
    `--window-size=${windowSize}`,
    ...extraArgs,
    initialUrl,
  ];

  const child = spawn(executablePath, args, {
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });

  let stderr = "";
  let stdout = "";
  child.stderr?.on("data", (chunk) => {
    stderr = (stderr + chunk.toString()).slice(-8000);
  });
  child.stdout?.on("data", (chunk) => {
    stdout = (stdout + chunk.toString()).slice(-4000);
  });

  let exited = null;
  child.on("exit", (code, signal) => {
    exited = { code, signal };
  });

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (exited) {
      throw new SetupError(
        `Chrome 启动后立即退出 (code=${exited.code}, signal=${exited.signal})。\nstderr: ${stderr || "(空)"}`
      );
    }
    const version = await probeCdpPort(port, 700);
    if (version) {
      return {
        child,
        profileDir,
        port,
        version,
        logs: () => `stdout: ${stdout || "(空)"}\nstderr: ${stderr || "(空)"}`,
        async kill() {
          try {
            // detached: true => 杀掉整个进程组，连带 renderer 子进程。
            process.kill(-child.pid, "SIGKILL");
          } catch {
            try {
              child.kill("SIGKILL");
            } catch {
              /* 已退出 */
            }
          }
          const waitExit = new Promise((resolve) => {
            if (exited) return resolve();
            child.once("exit", resolve);
            setTimeout(resolve, 3000);
          });
          await waitExit;
          await fs.rm(profileDir, { recursive: true, force: true }).catch(() => {});
        },
      };
    }
    await sleep(120);
  }
  child.kill("SIGKILL");
  throw new SetupError(`Chrome 在 ${timeoutMs}ms 内没有开放 CDP 端口 ${port}。\nstderr: ${stderr || "(空)"}`);
}

/** 从 /json/list 里挑一个 page target，并建立 CDP 连接。 */
export async function connectToPage(port, { timeoutMs = 20000, urlMatch = null } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`, {
        signal: AbortSignal.timeout(1500),
      });
      if (res.ok) {
        const targets = await res.json();
        const pages = targets.filter(
          (t) => t.type === "page" && typeof t.webSocketDebuggerUrl === "string"
        );
        const page = (urlMatch && pages.find((t) => urlMatch.test(t.url))) ?? pages[0];
        if (page) return await CdpClient.connect(page.webSocketDebuggerUrl);
      }
    } catch {
      /* 继续重试 */
    }
    await sleep(150);
  }
  throw new SetupError(`在 ${timeoutMs}ms 内没有找到可连接的 Chrome page target（端口 ${port}）`);
}

/** 最小可用 CDP WebSocket 客户端：request/response + 事件订阅。 */
export class CdpClient {
  #ws;
  #nextId = 0;
  #pending = new Map();
  #handlers = new Map();
  #closed = false;

  constructor(webSocketUrl) {
    this.#ws = new WebSocket(webSocketUrl);
    this.#ws.addEventListener("message", (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      if (message.id != null) {
        const request = this.#pending.get(message.id);
        if (!request) return;
        this.#pending.delete(message.id);
        clearTimeout(request.timer);
        if (message.error) {
          request.reject(new Error(`${request.method}: ${message.error.message}`));
        } else {
          request.resolve(message.result);
        }
        return;
      }
      for (const handler of this.#handlers.get(message.method) ?? []) {
        try {
          handler(message.params);
        } catch {
          /* 事件处理器异常不影响主流程 */
        }
      }
    });
    this.#ws.addEventListener("close", () => {
      this.#closed = true;
      for (const request of this.#pending.values()) {
        clearTimeout(request.timer);
        request.reject(new Error("CDP 连接已关闭"));
      }
      this.#pending.clear();
    });
    this.#ws.addEventListener("error", () => {
      this.#closed = true;
    });
  }

  static async connect(webSocketUrl, { timeoutMs = 10000 } = {}) {
    const client = new CdpClient(webSocketUrl);
    const deadline = Date.now() + timeoutMs;
    while (!client.opened) {
      if (client.#closed) throw new SetupError("CDP WebSocket 连接失败");
      if (Date.now() > deadline) throw new SetupError("CDP WebSocket 连接超时");
      await sleep(50);
    }
    return client;
  }

  get opened() {
    return this.#ws.readyState === 1;
  }

  on(method, handler) {
    if (!this.#handlers.has(method)) this.#handlers.set(method, []);
    this.#handlers.get(method).push(handler);
  }

  send(method, params = {}, timeoutMs = 30000) {
    if (this.#closed) return Promise.reject(new Error(`CDP 已关闭，无法发送 ${method}`));
    const id = ++this.#nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`CDP ${method} 请求超时 (${timeoutMs}ms)`));
      }, timeoutMs);
      this.#pending.set(id, { resolve, reject, method, timer });
      try {
        this.#ws.send(JSON.stringify({ id, method, params }));
      } catch (error) {
        this.#pending.delete(id);
        clearTimeout(timer);
        reject(error);
      }
    });
  }

  /** Runtime.evaluate 包装：返回按值序列化的结果，页面异常转成 JS Error。 */
  async evaluate(expression, { timeoutMs = 30000 } = {}) {
    const result = await this.send(
      "Runtime.evaluate",
      {
        expression,
        returnByValue: true,
        awaitPromise: true,
        userGesture: true,
        includeCommandLineAPI: false,
      },
      timeoutMs
    );
    if (result.exceptionDetails) {
      const detail =
        result.exceptionDetails.exception?.description ??
        result.exceptionDetails.text ??
        brief(result.exceptionDetails);
      throw new Error(`页面内执行异常: ${String(detail).slice(0, 800)}`);
    }
    return result.result?.value;
  }

  close() {
    try {
      this.#ws.close();
    } catch {
      /* ignore */
    }
  }
}

/**
 * 收集页面 console error / 未捕获异常 / Log 错误，供每个验收项断言“无报错”。
 * Vite dev server / HMR 的瞬时日志由调用方过滤。
 */
export function attachPageErrors(client) {
  const entries = [];
  const push = (kind, text) => {
    entries.push({ kind, text: String(text ?? "").slice(0, 2000), at: Date.now() });
  };

  client.on("Runtime.consoleAPICalled", (params) => {
    if (params.type !== "error") return;
    const text = (params.args ?? [])
      .map((arg) => arg.value ?? arg.description ?? arg.type ?? "")
      .join(" ");
    push("console", text);
  });
  client.on("Runtime.exceptionThrown", (params) => {
    const details = params.exceptionDetails ?? {};
    push(
      "exception",
      details.exception?.description ?? details.text ?? "未捕获异常"
    );
  });
  client.on("Log.entryAdded", (params) => {
    const entry = params.entry ?? {};
    if (entry.level !== "error") return;
    push("log", `${entry.text ?? ""}${entry.url ? ` @ ${entry.url}` : ""}`);
  });

  return {
    entries,
    mark: () => entries.length,
    since: (mark) => entries.slice(mark),
  };
}
