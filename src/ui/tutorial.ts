/**
 * 新手引导:首局的三步提示(拖动瞄准 → 松手发射 → 清空整栋楼)。
 *
 * 用 DOM 层实现,pointer-events: none 让玩家照常操作;提示气泡跟随炮台,
 * 玩家完成对应动作后自动进入下一步,全部完成(或点跳过)后整层移除。
 * 完成状态由调用方写进存档(meta.tutorial)。
 */

import { h } from "./overlays.ts";

export interface TutorialHandle {
  /** 当前步(0=瞄准,1=发射,2=清楼);隐藏中为 -1。 */
  step(): number;
  dispose(): void;
}

export interface TutorialOptions {
  /** 文案。 */
  steps: [string, string, string];
  skipLabel: string;
  /** 任意完成路径调用:调用方负责写存档并 dispose。 */
  onFinish(): void;
}

export function createTutorial(app: HTMLElement, options: TutorialOptions): TutorialHandle {
  const layer = h(
    "div",
    { class: "tutorial-layer" },
    h("div", { class: "tutorial-hand" }, "👆"),
    h("div", { class: "tutorial-bubble" }, options.steps[0]),
    h(
      "button",
      { class: "tutorial-skip", onclick: () => finish() },
      options.skipLabel
    )
  );
  let step = 0;
  let disposed = false;

  const onPointerDown = (): void => {
    if (step === 0) advance();
  };
  const onPointerUp = (): void => {
    if (step === 1) advance();
  };
  // 键盘玩家(←→ + 空格)没有 pointer 事件,否则气泡会挂满整局、叠到三选一上
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.code !== "Space" && event.code !== "Enter") return;
    if (step === 0 || step === 1) advance();
  };

  function advance(): void {
    step += 1;
    if (step >= 2) {
      step = 2;
      show("bubble", options.steps[2]);
      hide("hand");
      // 第三步在塔清掉时由调用方收尾;这里监听不到塔状态,交给 finish()
      window.addEventListener("tower-cleared", onTowerCleared, { once: true });
      return;
    }
    show("bubble", options.steps[step]);
  }

  function onTowerCleared(): void {
    finish();
  }

  function show(part: "bubble" | "hand", text?: string): void {
    const bubble = layer.querySelector(".tutorial-bubble");
    const hand = layer.querySelector(".tutorial-hand");
    if (bubble && text !== undefined) bubble.textContent = text;
    if (hand) (hand as HTMLElement).style.display = part === "hand" ? "" : "none";
  }

  function hide(part: "hand" | "bubble"): void {
    const node = layer.querySelector(`.tutorial-${part}`);
    if (node) (node as HTMLElement).style.display = "none";
  }

  function finish(): void {
    if (disposed) return;
    disposed = true;
    window.removeEventListener("tower-cleared", onTowerCleared);
    window.removeEventListener("keydown", onKeyDown);
    layer.remove();
    options.onFinish();
  }

  window.addEventListener("pointerdown", onPointerDown, { passive: true });
  window.addEventListener("pointerup", onPointerUp, { passive: true });
  window.addEventListener("keydown", onKeyDown);
  app.append(layer);

  return {
    step: () => (disposed ? -1 : step),
    dispose: finish,
  };
}

/** 通关事件名:主循环在塌楼完成时派发,引导第三步监听它。 */
export const TOWER_CLEARED_EVENT = "tower-cleared";
