import type { OverlayManager } from "../ui/overlays.ts";
import { fmtNum, h } from "../ui/overlays.ts";
import { icon } from "../ui/icons.ts";
import type { Translate } from "./types.ts";

export interface MenuSceneInput {
  bestTower: number;
  bestScore: number;
  coins: number;
  dailyBestTower: number | null;
  resumable: boolean;
  /** 关卡制:已解锁的最高关(1-based)与上次游玩(继续闯关默认值)。 */
  stageUnlocked: number;
  lastStage: { stage: number; difficulty: "easy" | "hard" | "hell" } | null;
  power: number;
  onStart(stage: number, difficulty: "easy" | "hard" | "hell"): void;
  onDaily(): void;
  onResume(): void;
  onStages(): void;
  onShop(): void;
  onQuests(): void;
  onCollection(): void;
  onSkills(): void;
  onHelp(): void;
  onSettings(): void;
}

/**
 * 标题屏:继续闯关大按钮 + 底部 Dock(选关/每日/商店/任务/成就/技能),
 * 设置齿轮悬浮右下、玩法问号悬浮左下。
 */
export function showMenuScene(overlay: OverlayManager, t: Translate, input: MenuSceneInput): void {
  overlay.clear();
  overlay.root.className = "overlay overlay--title";
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const dailyBest = input.dailyBestTower === null ? "—" : `${input.dailyBestTower + 1} 栋`;
  // 继续闯关 = 指向最新解锁的关;上次难度只在该关就是上次玩的那关时沿用
  // (通关后 lastStage 是刚打完的关,应推进到 stageUnlocked;失败重试则正好)。
  const targetStage = input.stageUnlocked;
  const targetDiff =
    input.lastStage && input.lastStage.stage === input.stageUnlocked
      ? input.lastStage.difficulty
      : "easy";
  const cell = (id: string, label: string, value: string) =>
    h(
      "div",
      { class: "records__cell", "data-led": id },
      h("span", { class: "records__label" }, label),
      h("b", {}, value)
    );
  const dockItem = (label: string, iconName: string, onclick: () => void) =>
    h(
      "button",
      { class: "menu-item dock__item", onclick },
      h("span", { class: "menu-item__medal" }, icon(iconName)),
      h("span", { class: "menu-item__label" }, label)
    );
  const children: Array<Node | null> = [
    h("div", { class: "logo overlay__title" }, t("title")),
    h("div", { class: "logo-sub" }, "MARBLE WRECKERS"),
    h(
      "div",
      { class: "records" },
      cell("best", t("menu.best"), input.bestTower >= 0 ? `${input.bestTower + 1} 栋` : "—"),
      cell("score", t("menu.bestScore"), fmtNum(input.bestScore)),
      cell("daily", t("menu.dailyBest"), dailyBest),
      cell("coins", t("hud.coins"), fmtNum(input.coins))
    ),
    h(
      "button",
      {
        class: "btn btn--primary btn--start",
        onclick: () => input.onStart(targetStage, targetDiff),
      },
      h("span", { class: "btn-start__glow" }),
      icon("play"),
      h("span", { class: "btn-start__label" }, t("menu.startStage", { stage: String(targetStage) })),
      h("span", { class: "btn-start__coin" }, t("menu.stageSub", { diff: DIFF_NAME[targetDiff] }))
    ),
    ...(input.resumable
      ? [
          h(
            "button",
            { class: "btn btn--ghost btn--resume", onclick: () => input.onResume() },
            icon("restart"),
            t("menu.resume")
          ),
        ]
      : []),
    h("p", { class: "overlay__hint" }, coarse ? t("menu.hintMobile") : t("menu.hint")),
    h(
      "nav",
      { class: "dock" },
      dockItem(t("menu.stagesShort"), "tower", () => input.onStages()),
      dockItem(t("menu.dailyShort"), "calendar", () => input.onDaily()),
      dockItem(t("menu.shopShort"), "shop", () => input.onShop()),
      dockItem(t("menu.questsShort"), "gem", () => input.onQuests()),
      dockItem(t("menu.collectionShort"), "book", () => input.onCollection()),
      dockItem(t("menu.skills"), "critPower", () => input.onSkills())
    ),
    h(
      "button",
      { class: "fab fab--menu", "aria-label": t("menu.settings"), onclick: () => input.onSettings() },
      icon("gear")
    ),
    h(
      "button",
      { class: "fab fab--help", "aria-label": t("menu.help"), onclick: () => input.onHelp() },
      icon("help")
    )
  ];
  overlay.root.append(...children.filter((node): node is Node => node !== null));
  overlay.show();
}

const DIFF_NAME: Record<string, string> = { easy: "简单", hard: "困难", hell: "地狱" };
