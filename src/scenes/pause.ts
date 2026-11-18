import { h } from "../ui/overlays.ts";
import { icon } from "../ui/icons.ts";
import type { OverlayManager } from "../ui/overlays.ts";
import type { SceneShell, Translate } from "./types.ts";

export interface PauseSceneInput {
  onResume(): void;
  onHelp(): void;
  onSettings(): void;
  onRetreat(): void;
}

/**
 * 暂停 = 常规手游做法:雾面蒙层盖在冻结的游戏画面上,居中一张卡片。
 * 不走 shell.open 的整页场景;蒙层点击空白处也可继续。
 */
export function showPauseScene(
  shell: SceneShell,
  overlay: OverlayManager,
  t: Translate,
  input: PauseSceneInput
): void {
  shell.clear();
  overlay.clear();
  overlay.root.className = "overlay overlay--pause";
  const card = h(
    "div",
    { class: "pause-card" },
    h("b", { class: "pause-card__title" }, t("pause.title")),
    h("p", { class: "pause-card__hint" }, t("pause.hint")),
    h(
      "button",
      { class: "btn btn--primary pause-card__resume", onclick: () => input.onResume() },
      icon("play"),
      t("pause.resume")
    ),
    h(
      "div",
      { class: "pause-card__grid" },
      h(
        "button",
        { class: "btn btn--key", style: "--key:#c8b28a", onclick: () => input.onHelp() },
        h("span", { class: "btn__badge" }, icon("help")),
        h("span", { class: "btn__label" }, t("pause.help"))
      ),
      h(
        "button",
        { class: "btn btn--key", style: "--key:#8fb8ff", onclick: () => input.onSettings() },
        h("span", { class: "btn__badge" }, icon("gear")),
        h("span", { class: "btn__label" }, t("menu.settings"))
      )
    ),
    h(
      "button",
      {
        class: "btn btn--key pause-card__retreat",
        style: "--key:#ff8a5c",
        onclick: () => {
          input.onRetreat();
        },
      },
      h("span", { class: "btn__badge" }, icon("flag")),
      h("span", { class: "btn__label" }, t("pause.retreat"))
    ),
    h("p", { class: "pause-card__foot" }, t("pause.foot"))
  );
  // 独立蒙层元素承载「空白处点击 = 继续」;overlay.clear() 换页时随之销毁,
  // 不会把监听残留到后续场景(卡片内的点击被挡住,不触发继续)。
  const layer = h("div", { class: "pause-layer" }, card);
  layer.addEventListener("click", (event) => {
    if (event.target === layer) input.onResume();
  });
  overlay.root.append(layer);
  overlay.show();
  shell.setKeys((event) => {
    if (event.code === "Escape" || event.code === "KeyP") {
      input.onResume();
      return true;
    }
    return false;
  });
}
