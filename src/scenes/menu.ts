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
  onStart(daily: boolean): void;
  onResume(): void;
  onShop(): void;
  onCollection(): void;
  onSkills(): void;
  onHelp(): void;
  onSettings(): void;
}

export function showMenuScene(overlay: OverlayManager, t: Translate, input: MenuSceneInput): void {
  overlay.clear();
  overlay.root.className = "overlay overlay--title";
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const dailyBest = input.dailyBestTower === null ? "—" : `${input.dailyBestTower + 1} 栋`;
  const cell = (id: string, label: string, value: string) =>
    h(
      "div",
      { class: "records__cell", "data-led": id },
      h("span", { class: "records__label" }, label),
      h("b", {}, value)
    );
  const item = (label: string, iconName: string, onclick: () => void, extra = "") =>
    h(
      "button",
      { class: "menu-item" + (extra ? " " + extra : ""), onclick },
      h("span", { class: "menu-item__cursor" }, "►"),
      h("span", { class: "menu-item__medal" }, icon(iconName)),
      h("span", { class: "menu-item__label" }, label),
      h("span", { class: "menu-item__chev" }, icon("chevron"))
    );
  const children: Array<Node | null> = [
    h("div", { class: "logo overlay__title" }, t("title")),
    h("div", { class: "logo-sub" }, "MARBLE DEMOLITION"),
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
      { class: "btn btn--primary btn--start", onclick: () => input.onStart(false) },
      h("span", { class: "btn-start__glow" }),
      icon("play"),
      h("span", { class: "btn-start__label" }, t("menu.start")),
      h("span", { class: "btn-start__coin" }, "INSERT COIN")
    ),
    ...(input.resumable
      ? [
          item(t("menu.resume"), "restart", () => {
            input.onResume();
          }),
        ]
      : []),
    h(
      "nav",
      { class: "menu-list" },
      item(t("menu.dailyShort"), "calendar", () => input.onStart(true)),
      item(t("menu.shopShort"), "shop", () => input.onShop()),
      item(t("menu.collectionShort"), "book", () => input.onCollection()),
      item(t("menu.skills"), "critPower", () => input.onSkills()),
      item(t("menu.help"), "help", () => input.onHelp()),
      item(t("menu.settings"), "gear", () => input.onSettings())
    ),
    h("p", { class: "overlay__hint" }, coarse ? t("menu.hintMobile") : t("menu.hint"))
  ];
  overlay.root.append(...children.filter((node): node is Node => node !== null));
  overlay.show();
}
