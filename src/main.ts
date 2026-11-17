import "./style.css";
import type { MiniAppTheme, MiniAppUser } from "@discourse-mini-app/sdk";
import messages from "./strings.json";
import { createHost, type HostMode, type HostSDK } from "./host.ts";
import { claimBoot, detectBridge, detectPlatform } from "./platform.ts";
import { createAudioEngine } from "./audio/engine.ts";
import { createRenderer, type ThemePalette } from "./render/draw.ts";
import { CANNON_Y, H, W } from "./game/const.ts";
import { dailySeed } from "./game/rng.ts";
import {
  aimRun,
  createRun,
  drainFx,
  launchVolley,
  pickRelic,
  pickUpgrade,
  restoreRun,
  snapshotRun,
  updateRun,
  type Run,
  type RunSnapshot,
} from "./game/run.ts";
import {
  applyRunResult,
  emptyMeta,
  normalizeMeta,
  shopById,
  type MetaSave,
  type PlayerSettings,
} from "./game/meta.ts";
import {
  applyUpgrade,
  upgradeById,
  rollDraft,
} from "./game/upgrades.ts";
import { fmtNum, getOverlay } from "./ui/overlays.ts";
import { icon } from "./ui/icons.ts";
import { canvasElement, element } from "./app/dom.ts";
import { createSceneShell } from "./app/shell.ts";
import { showMenuScene } from "./scenes/menu.ts";
import { createShopScene } from "./scenes/shop.ts";
import { showCollectionScene } from "./scenes/collection.ts";
import { showSettlementScene } from "./scenes/settlement.ts";
import { createSkillsScene, showSkillScene } from "./scenes/skills.ts";
import { showHelpScene } from "./scenes/help.ts";
import { createSettingsScene } from "./scenes/settings.ts";
import { showPauseScene } from "./scenes/pause.ts";
import { createDraftScene, showRelicScene } from "./scenes/draft.ts";
import { createBuildScene } from "./scenes/build.ts";
import { createHudView } from "./ui/hud-view.ts";
import { buildHudModel } from "./ui/hud-model.ts";
import { bossProgress, towerBottomY } from "./game/board.ts";
import { relicById } from "./game/relics.ts";

type TemplateElements = {
  "hud-score": HTMLElement;
  "hud-coins": HTMLElement;
  "hud-tower": HTMLElement;
  "hud-shield": HTMLElement;
  overlay: HTMLElement;
  notice: HTMLElement;
  player: HTMLElement;
  board: HTMLCanvasElement;
  pause: HTMLButtonElement;
  help: HTMLButtonElement;
  danger: HTMLElement;
  banner: HTMLElement;
  "banner-title": HTMLElement;
  "banner-sub": HTMLElement;
  "boss-bar": HTMLElement;
  "boss-fill": HTMLElement;
  "build-fab": HTMLButtonElement;
  "build-fab-badge": HTMLElement;
  "build-list": HTMLElement;
  "side-tower": HTMLElement;
  "side-legend": HTMLElement;
};

let currentUser: MiniAppUser | null = null;

let palette: ThemePalette = {
  background: "#101418",
  text: "#e8e6e3",
  accent: "#e0b64c",
  border: "#2c333b",
  mode: "dark",
  reducedMotion: false,
};
let themeReducedMotion = false;
let themeOverride: "dark" | "light" | null = null;
let lastCommunityTheme: MiniAppTheme | null = null;
const motionQuery =
  typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : null;
/** Standalone builds have no community theme, so follow the OS preference. */
const colorQuery =
  typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-color-scheme: light)")
    : null;
function systemTheme(): "dark" | "light" {
  return colorQuery?.matches ? "light" : "dark";
}

/**
 * Apply a community theme: raw colours drive the canvas palette, the panel
 * tokens drive the DOM surfaces so the light forum theme doesn't end up with
 * dark panels behind light text.
 */
const BUILTIN_THEMES: Record<"dark" | "light", MiniAppTheme> = {
  dark: {
    mode: "dark",
    background: "#101418",
    text: "#e8e6e3",
    accent: "#e0b64c",
    border: "#2c333b",
    locale: "zh_CN",
    reducedMotion: false,
    viewport: { width: W, height: H },
  },
  light: {
    mode: "light",
    background: "#eef1f6",
    text: "#1d2530",
    accent: "#8a5c0b",
    border: "#c8d2e0",
    locale: "zh_CN",
    reducedMotion: false,
    viewport: { width: W, height: H },
  },
};

function applyTheme(theme: MiniAppTheme): void {
  const style = document.documentElement.style;
  style.setProperty("--primary", theme.text);
  style.setProperty("--secondary", theme.background);
  style.setProperty("--accent", theme.mode === "light" ? "#8a5c0b" : theme.accent);
  style.setProperty("--line", theme.border);
  if (theme.mode === "light") {
    style.setProperty("--panel-1", "rgba(255, 255, 255, 0.92)");
    style.setProperty("--panel-2", "rgba(238, 242, 248, 0.94)");
    style.setProperty("--panel-border", "rgba(90, 110, 140, 0.35)");
    style.setProperty("--panel-strong", "rgba(248, 250, 253, 0.96)");
    style.setProperty("--panel-strong-2", "rgba(228, 235, 245, 0.96)");
    style.setProperty("--scrim", "rgba(238, 242, 248, 0.62)");
    style.setProperty("--page-bg", "#eef1f6");
  } else {
    for (const name of [
      "--panel-1",
      "--panel-2",
      "--panel-border",
      "--panel-strong",
      "--panel-strong-2",
      "--scrim",
      "--page-bg",
    ]) {
      style.removeProperty(name);
    }
  }
  style.colorScheme = theme.mode;
  document.documentElement.dataset.theme = theme.mode;
  themeReducedMotion = theme.reducedMotion;
  const reducedMotion =
    themeReducedMotion ||
    (motionQuery?.matches ?? false) ||
    meta.settings.reducedMotion;
  palette = {
    background: theme.background,
    text: theme.text,
    accent: theme.accent,
    border: theme.border,
    mode: theme.mode,
    reducedMotion,
    screenShake: meta.settings.screenShake,
  };
  audio.setEnabled(meta.settings.sound);
  renderer.setPalette(palette);
  localize();
}

colorQuery?.addEventListener?.("change", () => {
  if (platform === "web" && !themeOverride && !lastCommunityTheme) {
    applyTheme(BUILTIN_THEMES[systemTheme()]);
  }
});

motionQuery?.addEventListener?.("change", () => {
  palette = { ...palette, reducedMotion: themeReducedMotion || motionQuery.matches };
  renderer.setPalette(palette);
});

/** 音效挂在 drainFx 的同一批事件上，和渲染器共用一个数据源。 */
const audio = createAudioEngine(false);
// 浏览器要求音频在用户手势里启动，否则一直是挂起状态。
for (const gesture of ["pointerdown", "keydown"] as const) {
  window.addEventListener(gesture, () => audio.unlock(), { once: true, passive: true });
}

/** "miniapp" inside the linux.do sandbox, "web" in a plain browser. */
const platform = detectPlatform();
const host = createHost(detectBridge() as unknown as HostSDK | null, messages, {
  onIdentity: (user) => {
    currentUser = user;
    updatePlayer();
  },
  onMode: (next) => {
    // Keep the status line honest: it used to stay on the boot default forever.
    mode = next;
    updatePlayer();
  },
  onTheme: (theme) => {
    lastCommunityTheme = theme;
    if (!themeOverride) applyTheme(theme);
    else applySettings();
  },
  onNotice: (text) => {
    element("notice").textContent = text;
  },
});
const t = host.t;

let meta: MetaSave = emptyMeta();
let run: Run | null = null;
let mode: HostMode = "preview";
let savedSnapshot: unknown = null;
let draftShown = false;
let relicShown = false;
let deathShown = false;
let paused = false;
const keys = { left: false, right: false };
let aiming = false;
let lastDpr = window.devicePixelRatio || 1;

const canvas = canvasElement("board");
const renderer = createRenderer(canvas);
const overlay = getOverlay();

const hud = createHudView({
  onSkill: (id) => showSkill(id),
  t: (key) => t(key),
  el: (id) => element(id) as HTMLElement,
});

/**
 * Size the backing store to the real CSS box in device pixels. A fixed
 * 400x660 backing store gets resampled by the browser on every frame (the CSS
 * box is never exactly 400px), which makes brick labels and 1px lines shimmer
 * and crawl while the camera moves.
 */
function syncCanvasSize(): void {
  const rect = canvas.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return;
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}
/**
 * The canvas is fullscreen (CSS pins it to the viewport), so its backing store
 * just follows resize events — no more letterbox math against the cabinet.
 */
function refitCanvas(): void {
  lastDpr = window.devicePixelRatio || 1;
  syncCanvasSize();
}

let noticeTimer = 0;
function setNotice(text: string): void {
  const node = element("notice");
  node.textContent = text;
  window.clearTimeout(noticeTimer);
  if (!text) return;
  noticeTimer = window.setTimeout(() => {
    node.textContent = "";
  }, 2600);
}

function localize(): void {
  document.querySelectorAll<HTMLElement>("[data-text]").forEach((node) => {
    node.textContent = t(node.dataset.text!);
  });
}

function updatePlayer(): void {
  const modeKey: Record<HostMode, string> = {
    preview: "player.mode.preview",
    connected: "player.mode.connected",
    guest: "player.mode.guest",
    disconnected: "player.mode.disconnected",
  };
  const identity = host.has("user.read") ? currentUser : null;
  element("player").textContent = identity
    ? `${identity.name || identity.username} · ${t(modeKey[mode])}`
    : `${t("player.guest")} · ${t(modeKey[mode])}`;
}

// ---------------------------------------------------------------------------
// HUD

let bannerTimer = 0;
let holdHintTower = -1;
let lastCoreAlive = false;
let lastShields = 0;

function showBanner(title: string, sub = "", tone: "info" | "danger" = "info"): void {
  const banner = element("banner");
  element("banner-title").textContent = title;
  element("banner-sub").textContent = sub;
  banner.hidden = false;
  banner.className = "banner banner--show" + (tone === "danger" ? " banner--danger" : "");
  window.clearTimeout(bannerTimer);
  bannerTimer = window.setTimeout(() => {
    banner.className = "banner";
    banner.hidden = true;
  }, 2200);
}

/** Announce the new tower and what the player has to do to it. */
function announceTower(): void {
  if (!run) return;
  holdHintTower = -1;
  lastCoreAlive = false;
  lastShields = run.shields;
  const spec = run.tower.spec;
  showBanner(
    "第 " + (spec.index + 1) + " 栋",
    spec.isBoss ? "镇站巨楼 · 打掉核心即捣毁" : "清空整栋楼 · 抽一次强化"
  );
}

function updateHUD(): void {
  hud.updateHUD(buildHudModel(run, meta, t));
  // 楼栋徽章的悬浮提示随局内/局外切换（图标化徽章没有文字标签）。
  const towerChip = document.querySelector<HTMLElement>(".hud-chip--tower");
  if (towerChip) towerChip.title = t(run ? "hud.towerNow" : "hud.towerBest");
}

function updateBuild(): void {
  hud.updateBuild(buildHudModel(run, meta, t));
}

function setRunChrome(active: boolean): void {
  element("pause").hidden = !active;
  if (!active) element("danger").hidden = true;
}

// ---------------------------------------------------------------------------
// Screens

function showMenu(): void {
  infoReturn = "menu";
  shell.clear();
  run = null;
  paused = false;
  setRunChrome(false);
  updateBuild();
  showMenuScene(overlay, t, {
    bestTower: meta.bestTower,
    bestScore: meta.bestScore,
    coins: meta.coins,
    dailyBestTower: meta.daily?.date === dailySeed() ? meta.daily.bestTower : null,
    resumable: !!savedSnapshot && !!restoreRun(savedSnapshot),
    onStart: startRun,
    onResume: () => {
      const restored = savedSnapshot ? restoreRun(savedSnapshot) : null;
      if (restored) resumeRun(restored);
    },
    onShop: showShop,
    onCollection: showCollection,
    onSkills: showSkills,
    onHelp: showHelp,
    onSettings: showSettings,
  });
  updateHUD();
}

function resumeRun(restored: Run): void {
  savedSnapshot = null;
  void host.save("run", null);
  run = restored;
  deathShown = false;
  draftShown = false;
  relicShown = false;
  paused = false;
  overlay.hide();
  setRunChrome(true);
  updateHUD();
  updateBuild();
  announceTower();
}

function startRun(daily: boolean): void {
  const seed = daily ? dailySeed() : `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  run = createRun(seed, meta.shop, daily);
  savedSnapshot = null;
  void host.save("run", null);
  deathShown = false;
  draftShown = false;
  paused = false;
  overlay.hide();
  setRunChrome(true);
  updateHUD();
  updateBuild();
  announceTower();
  persistAll(true);
}

function endRun(abandon: boolean): void {
  if (!run) return;
  const finished = run;
  run = null;
  paused = false;
  setRunChrome(false);
  const prevRecord = { score: meta.bestScore, tower: meta.bestTower };
  const newAch = applyRunResult(meta, {
    coins: finished.coins,
    towerIndex: finished.tower.spec.index,
    score: finished.stats.damage,
    bricks: finished.stats.bricksDestroyed,
    bossKills: finished.stats.bossKills,
    stats: finished.stats,
    daily: finished.daily,
    dailyDate: finished.seed,
  });
  void host.save("meta", meta);
  void host.save("run", null);
  updateHUD();
  updateBuild();
  if (abandon) {
    setNotice(`${t("death.coins")} +${fmtNum(finished.coins)}`);
    showMenu();
    return;
  }
  showDeath(finished, newAch, prevRecord);
}

// ===========================================================================
// Game UI skeleton: scenes with a shared top bar / body / control hint.
// ===========================================================================

/** 非局内信息页的返回来源；具体键盘与返回绑定由 shell 管理。 */
let infoReturn: "menu" | "skills" = "menu";

/** 场景骨架统一由 shell 管理：换页会自动清掉上一页的键盘与返回绑定。 */
const shell = createSceneShell({
  overlay,
  t: (key) => t(key),
  onHome: () => showMenu(),
});

const shopScene = createShopScene(shell, t);
const skillsScene = createSkillsScene(shell, t);
const settingsScene = createSettingsScene(shell, t);
const draftScene = createDraftScene(shell, t);
const buildScene = createBuildScene(shell, t);

// 场景只接收只读快照与回调；状态变更和持久化统一留在组装层。
function buyShop(id: string): void {
  const def = shopById(id);
  if (!def) return;
  const level = meta.shop[id] ?? 0;
  if (level >= def.maxLevel) return;
  const cost = def.cost(level);
  if (meta.coins < cost) {
    setNotice(t("shop.poor"));
    return;
  }
  meta.coins -= cost;
  meta.shop[id] = level + 1;
  void host.save("meta", meta);
  updateHUD();
  updateBuild();
  setNotice(t("shop.bought"));
  showShop();
}

function showShop(): void {
  infoReturn = "menu";
  shopScene({ coins: meta.coins, levels: meta.shop, onBuy: buyShop, onBack: showMenu });
}

// ------------------------------------------------------------------ draft

function pickDraft(id: string): void {
  if (!run) return;
  const def = upgradeById(id);
  if (!def) return;
  if (!pickUpgrade(run, id)) return;
  run.draftRerolls = 0;
  draftScene.resetFocus();
  persistAll(true);
  draftShown = false;
  shell.clear();
  overlay.hide();
  setRunChrome(true);
  updateHUD();
  updateBuild();
  announceTower();
  setNotice(def.name + " Lv " + (run.levels[id] ?? 1));
}

/** Boss 遗物三选一。和抽卡不同，这里没有刷新，选完直接进下一栋。 */
function showRelic(): void {
  if (!run || run.phase !== "relic") return;
  setRunChrome(false);
  showRelicScene(shell, t, {
    options: run.relicOptions.flatMap((id) => {
      const def = relicById(id);
      return def ? [def] : [];
    }),
    onPick: (id) => {
      if (!run || !pickRelic(run, id)) return;
      relicShown = false;
      persistAll(true);
      setNotice(t("relic.picked").replace("{name}", relicById(id)!.name));
      updateHUD();
      updateBuild();
      overlay.hide();
      setRunChrome(true);
    },
  });
}

function rerollDraft(): void {
  if (!run || run.phase !== "draft") return;
  const cost = 50 * Math.pow(2, run.draftRerolls);
  if (run.coins < cost) {
    setNotice(t("draft.rerollPoor"));
    return;
  }
  run.coins -= cost;
  run.stats.coinsSpent = (run.stats.coinsSpent ?? 0) + cost;
  run.draftRerolls += 1;
  run.draftOptions = rollDraft(run.levels, run.rng);
  draftScene.resetFocus();
  updateHUD();
  updateBuild();
  setNotice(t("draft.rerollDone").replace("{n}", String(run.draftRerolls)));
  showDraft();
}

function showDraft(): void {
  if (!run) return;
  infoReturn = "menu";
  setRunChrome(false);
  draftScene.show({
    options: run.draftOptions.map((id) => ({ def: upgradeById(id)!, level: run!.levels[id] ?? 0 })),
    coins: run.coins,
    rerolls: run.draftRerolls,
    towerIndex: run.tower.spec.index,
    isActive: () => !!run && run.phase === "draft" && !overlay.root.hidden,
    onPick: pickDraft,
    onReroll: rerollDraft,
  });
}

// ------------------------------------------------------------- collection

function showCollection(): void {
  infoReturn = "menu";
  showCollectionScene(shell, t, { achievements: meta.achievements, onBack: showMenu });
}

function showDeath(
  finished: Run,
  newAch: string[],
  prevRecord: { score: number; tower: number }
): void {
  infoReturn = "menu";
  element("hud-score").textContent = fmtNum(finished.stats.damage);
  element("hud-coins").textContent = fmtNum(finished.coins);
  element("hud-tower").textContent = String(finished.tower.spec.index + 1);
  element("hud-shield").textContent = String(finished.shields);
  showSettlementScene(shell, t, {
    stats: finished.stats,
    coins: finished.coins,
    towerIndex: finished.tower.spec.index,
    daily: finished.daily,
    newAchievements: newAch,
    previousRecord: prevRecord,
    onRestart: () => startRun(finished.daily),
    onBack: showMenu,
  });
}

function pointerAngle(event: PointerEvent): number {
  const rect = canvas.getBoundingClientRect();
  // The field floats centred inside the fullscreen canvas: undo the field
  // origin (device px) before normalising into logical playfield coordinates.
  const view = renderer.view();
  const px = ((event.clientX - rect.left) * lastDpr - view.ox) / view.scale;
  const py = ((event.clientY - rect.top) * lastDpr - view.oy) / view.scale;
  const dx = px - W / 2;
  const dy = py - CANNON_Y;
  return Math.atan2(dx, -dy);
}

canvas.addEventListener("pointerdown", (event) => {
  if (!run || run.phase !== "aim") return;
  aiming = true;
  canvas.setPointerCapture(event.pointerId);
  aimRun(run, pointerAngle(event));
});
canvas.addEventListener("pointermove", (event) => {
  if (!aiming || !run) return;
  aimRun(run, pointerAngle(event));
});
canvas.addEventListener("pointerup", (event) => {
  if (!aiming) return;
  aiming = false;
  if (run && run.phase === "aim") {
    launchVolley(run);
  }
});
canvas.addEventListener("pointercancel", () => {
  aiming = false;
});

window.addEventListener("keydown", (event) => {
  // Scene-level navigation (draft cursor, pause/escape) runs first, since it
  // owns those keys while a scene is open.
  if (shell.keys()?.(event)) {
    event.preventDefault();
    return;
  }
  if ((event.target as HTMLElement).closest?.("button, input, textarea, select")) {
    return;
  }
  if (event.code === "ArrowLeft" || event.code === "KeyA") {
    keys.left = true;
    event.preventDefault();
  } else if (event.code === "ArrowRight" || event.code === "KeyD") {
    keys.right = true;
    event.preventDefault();
  } else if (event.code === "Space" || event.code === "Enter") {
    if (run && run.phase === "aim") {
      launchVolley(run);
    }
    event.preventDefault();
  } else if (event.code === "Escape" || event.code === "KeyP") {
    if (paused) resume();
    else if (run && run.phase !== "draft") pause();
    event.preventDefault();
  }
});
window.addEventListener("keyup", (event) => {
  if (event.code === "ArrowLeft" || event.code === "KeyA") keys.left = false;
  if (event.code === "ArrowRight" || event.code === "KeyD") keys.right = false;
});

element("help").addEventListener("click", () => {
  showHelp();
});

element("pause").addEventListener("click", () => {
  if (paused) resume();
  else pause();
});

element("build-fab").addEventListener("click", () => {
  showBuild();
});

/**
 * Leave a read-only info screen (help / skill detail) and restore whatever was
 * underneath. A draft never pauses the run, so resume() alone would be a no-op
 * and the button would appear dead — this was the "继续游戏 没反应" bug.
 */
function returnFromInfoScreen(): void {
  if (!run) {
    if (infoReturn === "skills") showSkills();
    else showMenu();
    return;
  }
  if (run.phase === "draft") {
    showDraft();
    return;
  }
  if (paused) {
    resume();
    return;
  }
  overlay.hide();
  setRunChrome(true);
  last = performance.now();
}

// ------------------------------------------------------------------- skill

function showSkill(id: string, from: "build" | "skills" = "build"): void {
  if (!upgradeById(id)) return;
  infoReturn = from === "skills" ? "skills" : "menu";
  const inRun = !!run && run.phase !== "dead";
  pauseForInfo();
  showSkillScene(shell, t, {
    id,
    level: run?.levels[id] ?? 0,
    inRun,
    onBack: () => {
      if (inRun) returnFromInfoScreen();
      else if (from === "skills") showSkills();
      else showMenu();
    },
  });
}

function showSkills(): void {
  infoReturn = "skills";
  skillsScene({ levels: run?.levels ?? {}, onSkill: (id) => showSkill(id, "skills"), onBack: showMenu });
}

/** 信息页不暂停三选一，返回时恢复原场景；战斗中则先保存再暂停。 */
function pauseForInfo(): void {
  if (run && run.phase !== "dead" && run.phase !== "draft" && !paused) {
    paused = true;
    persistAll();
    setRunChrome(false);
  }
}

function showHelp(): void {
  infoReturn = "menu";
  const inRun = !!run && run.phase !== "dead";
  pauseForInfo();
  showHelpScene(shell, t, inRun ? returnFromInfoScreen : showMenu);
}

/** 右下角「构筑」圆钮 → 随身构筑面板（强化/遗物/图例）。 */
function showBuild(): void {
  const inRun = !!run && run.phase !== "dead";
  pauseForInfo();
  buildScene({
    model: buildHudModel(run, meta, t),
    onSkill: (id) => showSkill(id),
    onBack: () => {
      if (inRun) returnFromInfoScreen();
      else showMenu();
    },
  });
}

// --------------------------------------------------------------- settings

function applySettings(): void {
  host.setLocale(meta.settings.locale);
  // Manual theme mode overrides the community theme; auto follows it (or the
  // built-in dark palette when no SDK theme has arrived yet).
  const mode = meta.settings.themeMode;
  if (mode === "dark" || mode === "light") {
    themeOverride = mode;
  } else {
    themeOverride = null;
  }
  if (themeOverride) applyTheme(BUILTIN_THEMES[themeOverride]);
  else if (!lastCommunityTheme && platform === "web") {
    // No community theme to follow: use the browser/OS preference.
    applyTheme(BUILTIN_THEMES[systemTheme()]);
  }
  palette = {
    ...palette,
    reducedMotion:
      meta.settings.reducedMotion || (motionQuery?.matches ?? false),
    screenShake: meta.settings.screenShake,
  };
  renderer.setPalette(palette);
  localize();
}

function changeSettings(patch: Partial<PlayerSettings>): void {
  Object.assign(meta.settings, patch);
  if (patch.sound !== undefined) {
    audio.setEnabled(patch.sound);
    if (patch.sound) audio.unlock();
  }
  applySettings();
  void host.save("meta", meta);
}

function resetProgress(): void {
  const settings = meta.settings;
  meta = emptyMeta();
  meta.settings = settings;
  void host.save("meta", meta);
  void host.save("run", null);
  savedSnapshot = null;
}

function importBackup(text: string): boolean {
  try {
    const parsed = JSON.parse(text) as { meta?: unknown; run?: unknown };
    if (!parsed || typeof parsed !== "object") return false;
    meta = normalizeMeta(parsed.meta);
    applySettings();
    void host.save("meta", meta);
    const restored = parsed.run ? restoreRun(parsed.run) : null;
    savedSnapshot = restored ? snapshotRun(restored) : null;
    void host.save("run", savedSnapshot);
    return true;
  } catch {
    return false;
  }
}

function showSettings(): void {
  infoReturn = "menu";
  settingsScene({
    settings: meta.settings,
    savedAt: meta.savedAt,
    origin: location.origin,
    onChange: changeSettings,
    onReset: resetProgress,
    onExport: () => JSON.stringify({ meta, run: run ? snapshotRun(run) : null }),
    onImport: importBackup,
    onNotice: setNotice,
    onRefresh: showSettings,
    onBack: showMenu,
  });
}

// ------------------------------------------------------------------ pause

function pause(): void {
  if (!run || paused || run.phase === "draft" || run.phase === "dead") return;
  paused = true;
  persistAll(true);
  showPause();
}

function resume(): void {
  if (!paused) return;
  paused = false;
  shell.clear();
  overlay.hide();
  setRunChrome(true);
  last = performance.now();
}

function showPause(): void {
  setRunChrome(false);
  showPauseScene(shell, t, {
    onResume: resume,
    onHelp: showHelp,
    onRetreat: () => {
      paused = false;
      endRun(true);
    },
  });
}

/** Signature of the persisted state, so identical saves are skipped. */
let saveQueued = false;

/** Run a save when the browser is idle, so it never blocks a frame. */
function scheduleAutosave(): void {
  if (saveQueued) return;
  saveQueued = true;
  const runNow = () => {
    saveQueued = false;
    persistAll();
  };
  const idle = (window as unknown as { requestIdleCallback?: (cb: () => void) => number })
    .requestIdleCallback;
  if (typeof idle === "function") idle(runNow);
  else window.setTimeout(runNow, 0);
}
let lastSaveSig = "";
let saveLedTimer = 0;

function flashSaveLed(): void {
  const led = document.getElementById("save-led");
  if (!led) return;
  led.classList.add("save-led--on");
  window.clearTimeout(saveLedTimer);
  saveLedTimer = window.setTimeout(() => led.classList.remove("save-led--on"), 900);
}

/**
 * Persist meta + the current run snapshot. Called on autosave ticks, phase
 * changes, pause and page hide — a crash or reload mid-run must not lose it.
 */
function persistAll(force = false): void {
  const snapshot = run ? snapshotRun(run) : null;
  // Cheap signature: only skip when nothing meaningful changed.
  const sig = [
    snapshot ? snapshot.phase : "none",
    snapshot ? snapshot.towerIndex : -1,
    snapshot ? Math.round(snapshot.coins) : -1,
    snapshot ? Object.keys(snapshot.levels).length : -1,
    snapshot ? snapshot.shields : -1,
    meta.coins,
    Object.values(meta.shop).join(","),
    meta.achievements.length,
    meta.bestTower,
    meta.bestScore,
  ].join("|");
  if (!force && sig === lastSaveSig) return;
  lastSaveSig = sig;
  meta.savedAt = new Date().toISOString();
  void host.save("run", snapshot);
  void host.save("meta", meta);
  flashSaveLed();
}
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) return;
  if (run && run.phase !== "draft") pause();
  else persistAll();
});
window.addEventListener("pagehide", () => persistAll(true));
window.addEventListener("beforeunload", () => persistAll(true));
// Fullscreen canvas: the CSS box tracks the viewport, so the backing store
// follows resize events (browser zoom, rotation, mobile URL-bar collapse).
window.addEventListener("resize", refitCanvas);
window.addEventListener("orientationchange", refitCanvas);
window.visualViewport?.addEventListener("resize", refitCanvas);

// ---------------------------------------------------------------------------
// Loop

let last = performance.now();
let autosaveT = 0;
function loop(now: number): void {
  requestAnimationFrame(loop);
  const rawDt = now - last;
  const dt = Math.min(0.05, rawDt / 1000);
  last = now;
  perfBuf[perfIdx++ % perfBuf.length] = rawDt;
  perfFrames++;
  try {
    if (paused) return;
    // Autosave: cheap, throttled, and independent of tab lifecycle events.
    if (run) {
      autosaveT += dt;
      // Never write during a volley: the snapshot serialisation is synchronous
      // and a single stalled frame is visible in the 60fps budget.
      if (autosaveT >= 4 && run.phase !== "volley") {
        autosaveT = 0;
        scheduleAutosave();
      }
    }
    if (run) {
      if (keys.left) aimRun(run, run.aimAngle - 1.4 * dt);
      if (keys.right) aimRun(run, run.aimAngle + 1.4 * dt);
      updateRun(run, dt);
      const fx = drainFx(run);
      renderer.frame(run, fx, dt);
      audio.play(fx);
      updateHUD();
      const danger = element("danger");
      const nearCrush =
        (run.phase === "aim" || run.phase === "volley") &&
        CANNON_Y - towerBottomY(run.tower) < 130;
      danger.hidden = !nearCrush;

      // Boss core HP bar + "core broken" callout.
      const core = run.tower.bricks.find((brick) => brick.alive && brick.kind === "core");
      const bossBar = element("boss-bar");
      if (core) {
        bossBar.hidden = false;
        // 护甲层与核心合成一条进度，层数交给 CSS 分段
        const progress = bossProgress(core);
        const ratio = progress.max > 0 ? progress.current / progress.max : 0;
        element("boss-fill").style.width = Math.max(0, Math.min(1, ratio)) * 100 + "%";
        bossBar.dataset.armor = String(progress.layers);
        bossBar.dataset.armorMax = String(progress.layersMax);
        const label = bossBar.querySelector(".boss-bar__label");
        if (label) {
          label.textContent =
            progress.layers > 0
              ? `镇站巨楼 · 护甲 ${progress.layers}/${progress.layersMax}`
              : "镇站巨楼 · 核心暴露";
        }
      } else {
        bossBar.hidden = true;
      }
      if (lastCoreAlive && !core && run.tower.spec.isBoss) {
        showBanner("核心击破!", "镇站巨楼已塌", "info");
      }
      lastCoreAlive = !!core;

      // A shield absorbing the crush pushes the tower back up: say so, or it
      // looks like the tower randomly rose.
      if (run.shields < lastShields) {
        showBanner("护盾生效!", "楼被顶回去 2 层，速清剩余砖块");
      }
      lastShields = run.shields;

      // Tell the player the tower is crawling for the stragglers.
      const aliveNow = run.tower.bricks.filter((brick) => brick.alive);
      if (aliveNow.length > 0 && aliveNow.length <= 2 && holdHintTower !== run.tower.spec.index) {
        holdHintTower = run.tower.spec.index;
        showBanner("最后一层!", "剩 " + aliveNow.length + " 块砖，楼会放慢等下潜", "danger");
      }
      if (run.phase === "draft" && !draftShown) {
        draftShown = true;
        persistAll(true);
        showDraft();
      }
      if (run.phase === "relic" && !relicShown) {
        relicShown = true;
        persistAll(true);
        showRelic();
      }
      if (run.phase === "dead" && !deathShown) {
        deathShown = true;
        persistAll(true);
        endRun(false);
      }
    } else {
      renderer.frame(null, [], dt);
    }
  } catch (error) {
    (window as unknown as { __loopError?: string }).__loopError =
      error instanceof Error ? `${error.message}\n${error.stack}` : String(error);
    // eslint-disable-next-line no-console
    console.warn("[game] loop error", error);
  }
}

/** Debug hooks for sandbox inspection (also handy during review testing). */
function installDebugHooks(): void {
  const dbgApi = window as unknown as {
    __dbg?: () => unknown;
    __step?: (frames: number) => void;
    __fire?: (angle: number) => boolean;
    __pick?: (index: number) => boolean;
    __boost?: (balls?: number, flat?: number) => boolean;
    __render?: () => void;
    __win?: () => boolean;
    __grant?: (levels: Record<string, number>) => boolean;
    __coins?: (amount: number) => number;
    __audio?: () => { played: number; state: string; enabled: boolean };
    __shield?: (count?: number) => boolean;
  };
  dbgApi.__dbg = () =>
    run
      ? {
          phase: run.phase,
          balls: run.balls.length,
          ballsToLaunch: run.ballsToLaunch,
          aim: run.aimAngle,
          offset: run.tower.offset,
          alive: run.tower.bricks.filter((b) => b.alive).length,
          total: run.tower.bricks.length,
          damage: run.stats.damage,
          coins: run.coins,
        }
      : { phase: "menu" };
  dbgApi.__step = (frames: number) => {
    if (!run) return;
    for (let i = 0; i < frames; i++) {
      updateRun(run, 1 / 60);
    }
  };
  dbgApi.__fire = (angle: number) => {
    if (!run) return false;
    aimRun(run, angle);
    return launchVolley(run);
  };
  dbgApi.__grant = (levels: Record<string, number>) => {
    if (!run) return false;
    for (const [id, count] of Object.entries(levels)) {
      const def = upgradeById(id);
      if (!def) continue;
      const prev = run.levels[id] ?? 0;
      const target = Math.min(def.maxLevel, prev + count);
      for (let level = prev; level < target; level++) {
        applyUpgrade(run.mods, def, level);
      }
      run.levels[id] = target;
    }
    updateBuild();
    updateHUD();
    return true;
  };
  dbgApi.__audio = () => audio.stats();
  dbgApi.__coins = (amount: number) => {
    meta.coins = Math.max(0, Math.floor(amount));
    void host.save("meta", meta);
    updateHUD();
    updateBuild();
    if (!overlay.root.hidden && infoReturn === "menu") showShop();
    return meta.coins;
  };
  dbgApi.__shield = (count = 1) => {
    if (!run) return false;
    run.shields = Math.max(0, count);
    updateHUD();
    return true;
  };
  dbgApi.__win = () => {
    if (!run || (run.phase !== "aim" && run.phase !== "volley")) return false;
    for (const brick of run.tower.bricks) brick.alive = false;
    run.phase = "collapse";
    run.collapseT = 0;
    return true;
  };
  dbgApi.__pick = (index: number) => {
    if (!run || run.phase !== "draft") return false;
    const id = run.draftOptions[index] ?? run.draftOptions[0];
    return pickUpgrade(run, id);
  };
  dbgApi.__boost = (balls?: number, flat?: number) => {
    if (!run) return false;
    if (balls != null) run.mods.balls = balls;
    if (flat != null) run.mods.flatDamage = flat;
    return true;
  };
  if (import.meta.env.DEV) {
    (dbgApi as unknown as { __theme?: (mode: "light" | "dark") => void }).__theme = (
      mode
    ) =>
      applyTheme({
        mode,
        background: mode === "light" ? "#eef1f6" : "#101418",
        text: mode === "light" ? "#1d2530" : "#e8e6e3",
        accent: "#e0b64c",
        border: mode === "light" ? "#c8d2e0" : "#2c333b",
        locale: "zh_CN",
        reducedMotion: false,
        viewport: { width: W, height: H },
      });
  }
  dbgApi.__render = () => {
    if (run) renderer.frame(run, drainFx(run), 1 / 60);
    else renderer.frame(null, [], 1 / 60);
  };
}

/** Frame-time probe for performance verification (rolling 180 frames). */
const perfBuf = new Float64Array(180);
let perfIdx = 0;
let perfFrames = 0;

function installPerfProbe(): void {
  (window as unknown as { __perf?: () => unknown }).__perf = () => {
    // Count only continuous-render frames: gaps larger than 250ms are
    // background throttling, not real frame cost.
    const n = Math.min(perfFrames, perfBuf.length);
    if (n === 0) return { frames: 0 };
    let sum = 0;
    let max = 0;
    let count = 0;
    const times: number[] = [];
    for (let i = 0; i < n; i++) {
      const v = perfBuf[i];
      if (v > 250) continue;
      sum += v;
      if (v > max) max = v;
      times.push(v);
      count++;
    }
    if (count === 0) return { frames: perfFrames, counted: 0 };
    times.sort((a, b) => a - b);
    const p95 = times[Math.min(count - 1, Math.floor(count * 0.95))];
    return {
      frames: perfFrames,
      counted: count,
      avgMs: Math.round((sum / count) * 100) / 100,
      p95Ms: Math.round(p95 * 100) / 100,
      maxMs: Math.round(max * 100) / 100,
      fps: Math.round(1000 / (sum / count)),
    };
  };
}

function hydrateIcons(): void {
  document.querySelectorAll<HTMLElement>("[data-icon]").forEach((node) => {
    node.replaceChildren(icon(node.dataset.icon ?? "help"));
  });
  for (const [idName, iconName, label] of [
    ["help", "help", t("menu.help")],
    ["pause", "pause", t("pause.button")],
    ["build-fab", "critPower", t("build.title")],
  ] as const) {
    const button = document.getElementById(idName);
    if (!button) continue;
    if (!button.querySelector("svg")) button.append(icon(iconName));
    button.setAttribute("aria-label", label);
  }
}

function localizeAndStart(): void {
  hydrateIcons();
  refitCanvas();
  localize();
  updateHUD();
  showMenu();
  installDebugHooks();
  installPerfProbe();
  void initialize();
  requestAnimationFrame(loop);
}

let initialized = false;
async function initialize(): Promise<void> {
  if (initialized) return;
  initialized = true;
  await host.connect();
  const savedMeta = await host.load("meta");
  meta = normalizeMeta(savedMeta);
  applySettings();
  const savedRun = await host.load("run");
  savedSnapshot = savedRun;
  showMenu();
  await host.rendered();
}

if (claimBoot()) {
  localizeAndStart();
}
