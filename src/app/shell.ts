/**
 * 场景骨架：所有非游戏画面共用一套 CRT 内页结构。
 *
 * 场景层不再各自拼 header/body/foot，也不再各自管返回键和键盘处理器；
 * 这里统一负责"换页时清掉上一页的键盘状态"，避免出现帮助页按 Enter
 * 却把三选一的卡选掉这类串场景 bug。
 */

import type { OverlayManager } from "../ui/overlays.ts";
import { h } from "../ui/overlays.ts";
import { icon } from "../ui/icons.ts";

export interface SceneOptions {
  title: string;
  meta?: string;
  body: Array<Node | null>;
  /** 底部提示行；传空串则不显示。 */
  foot?: string;
  /** false 时不显示返回键（三选一、结算这类流程内页面）。 */
  back?: boolean;
  onBack?: () => void;
}

export type SceneKeyHandler = (event: KeyboardEvent) => boolean;

export interface SceneShell {
  open(opts: SceneOptions): HTMLElement;
  tabRow(
    tabs: Array<[string, string]>,
    active: string,
    onPick: (id: string) => void
  ): HTMLElement;
  /** 当前页的返回动作；null 表示这页没有返回键。 */
  back(): (() => void) | null;
  setKeys(handler: SceneKeyHandler | null): void;
  keys(): SceneKeyHandler | null;
  /** 换页/回到游戏时调用，清空上一页残留的键盘与返回绑定。 */
  clear(): void;
}

export function createSceneShell(deps: {
  overlay: OverlayManager;
  t: (key: string) => string;
  onHome: () => void;
}): SceneShell {
  let backHandler: (() => void) | null = null;
  let keyHandler: SceneKeyHandler | null = null;

  function open(opts: SceneOptions): HTMLElement {
    // 新场景永远不继承上一页的键盘处理。
    keyHandler = null;
    const { overlay, t } = deps;
    overlay.clear();
    overlay.root.className = "overlay";
    const showBack = opts.back !== false;
    const onBack = opts.onBack ?? deps.onHome;
    backHandler = showBack ? onBack : null;
    const scene = h(
      "div",
      { class: "scene" },
      h(
        "header",
        { class: "scene__bar" },
        showBack
          ? h(
              "button",
              { class: "scene__back", "aria-label": t("shop.back"), onclick: onBack },
              icon("back")
            )
          : h("span", { class: "scene__back scene__back--ghost" }),
        h("span", { class: "scene__title" }, opts.title),
        opts.meta ? h("span", { class: "scene__meta" }, opts.meta) : null
      ),
      h("div", { class: "scene__body" }, ...opts.body),
      opts.foot === ""
        ? null
        : h("div", { class: "scene__foot" }, opts.foot ?? t("scene.foot"))
    );
    overlay.root.append(scene);
    overlay.show();
    return scene;
  }

  function tabRow(
    tabs: Array<[string, string]>,
    active: string,
    onPick: (id: string) => void
  ): HTMLElement {
    return h(
      "div",
      { class: "tabs" },
      ...tabs.map(([id, label]) =>
        h(
          "button",
          {
            class: "tab" + (active === id ? " tab--on" : ""),
            onclick: () => onPick(id),
          },
          label
        )
      )
    );
  }

  return {
    open,
    tabRow,
    back: () => backHandler,
    setKeys(handler) {
      keyHandler = handler;
    },
    keys: () => keyHandler,
    clear() {
      keyHandler = null;
      backHandler = null;
    },
  };
}
