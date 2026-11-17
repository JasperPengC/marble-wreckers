import type { RelicDef } from "../game/relics.ts";
import type { UpgradeDef } from "../game/upgrades.ts";
import { fmtFull, h } from "../ui/overlays.ts";
import { icon } from "../ui/icons.ts";
import { draftCard, relicCard } from "./cards.ts";
import type { SceneShell, Translate } from "./types.ts";

export interface DraftSceneInput {
  options: readonly { def: UpgradeDef; level: number }[];
  coins: number;
  rerolls: number;
  towerIndex: number;
  isActive(): boolean;
  onPick(id: string): void;
  onReroll(): void;
}

export interface RelicSceneInput {
  options: readonly RelicDef[];
  onPick(id: string): void;
}

export function createDraftScene(shell: SceneShell, t: Translate) {
  let draftFocus = -1;

  function show(input: DraftSceneInput): void {
    const options = input.options;
    if (draftFocus >= options.length) draftFocus = -1;

    const cards = options.map((option, index) =>
      draftCard({
        def: option.def,
        level: option.level,
        focused: draftFocus >= 0 && index === draftFocus,
        onPick: () => input.onPick(option.def.id),
      })
    );

    // 刷新技能：花本局灵石重抽三张，费用每次翻倍
    const cost = 50 * Math.pow(2, input.rerolls);
    const affordable = input.coins >= cost;
    const reroll = h(
      "button",
      {
        class: "reroll-btn" + (affordable ? "" : " reroll-btn--denied"),
        onclick: input.onReroll,
      },
      h("span", { class: "reroll-btn__label" }, icon("restart"), t("draft.reroll")),
      h(
        "span",
        { class: "reroll-btn__price" },
        "◆ " + fmtFull(cost) + (affordable ? "" : " · " + t("draft.rerollShort"))
      )
    );

    shell.open({
      title: t("draft.title"),
      meta: "第 " + (input.towerIndex + 1) + " 栋",
      body: [h("div", { class: "carousel" }, ...cards), reroll],
      foot: draftFocus >= 0 ? t("draft.foot") : t("draft.footIdle"),
      back: false,
    });
    shell.setKeys((event) => {
      if (!input.isActive()) return false;
      if (event.code === "ArrowLeft" || event.code === "KeyA") {
        draftFocus = draftFocus <= 0 ? 0 : draftFocus - 1;
        show(input);
        return true;
      }
      if (event.code === "ArrowRight" || event.code === "KeyD") {
        draftFocus =
          draftFocus < 0 ? 0 : Math.min(options.length - 1, draftFocus + 1);
        show(input);
        return true;
      }
      if (event.code === "Enter" || event.code === "Space") {
        if (draftFocus < 0) return true;
        const option = options[draftFocus];
        if (option) input.onPick(option.def.id);
        return true;
      }
      return false;
    });
  }

  return { show, resetFocus: () => { draftFocus = -1; } };
}

export function showRelicScene(shell: SceneShell, t: Translate, input: RelicSceneInput): void {
  const cards = input.options.map((relic) => {
    return relicCard({
      relic,
      grade: relic.grade,
      gainLabel: t("relic.gain"),
      costLabel: t("relic.cost"),
      tag: t("relic.meta"),
      onPick: () => input.onPick(relic.id),
    });
  });
  shell.open({
    title: t("relic.title"),
    meta: t("relic.meta"),
    body: [h("div", { class: "carousel" }, ...cards)],
    foot: t("relic.foot"),
    back: false,
  });
}
