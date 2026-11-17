/**
 * 「构筑」浮层：对局中点右下角圆钮展开的随身面板。
 * 桌面端同样信息常驻在作战面板；这里是移动端的等价物。
 */

import type { SceneShell } from "../app/shell.ts";
import type { OwnedSkill, HudModel } from "../ui/hud-model.ts";
import { icon, UPGRADE_ICONS } from "../ui/icons.ts";
import { h } from "../ui/overlays.ts";
import type { Translate } from "./types.ts";

export interface BuildSceneInput {
  model: HudModel;
  /** 点某个已获得强化 → 详情页。 */
  onSkill(id: string): void;
  /** 返回：局内走 returnFromInfoScreen，局外回主页。 */
  onBack(): void;
}

function skillRow(
  skill: OwnedSkill,
  onSkill: (id: string) => void
): HTMLElement {
  return h(
    "button",
    {
      class:
        "build-row build-row--grade-" +
        skill.grade +
        " build-row--cat-" +
        skill.category +
        (skill.maxed ? " build-row--max" : ""),
      onclick: () => onSkill(skill.id),
    },
    icon(UPGRADE_ICONS[skill.id] ?? "crit"),
    h("span", { class: "build-row__name" }, skill.name),
    h("span", { class: "build-row__lv" }, skill.maxed ? "MAX" : `Lv${skill.level}`)
  );
}

export function createBuildScene(shell: SceneShell, t: Translate) {
  return function showBuildScene(input: BuildSceneInput): void {
    const { model } = input;
    shell.open({
      title: t("build.title"),
      meta: model.inRun && model.skills.length > 0 ? String(model.skills.length) : "",
      back: true,
      onBack: input.onBack,
      foot: "",
      body: [
        h("div", { class: "build-sub" }, t("build.skills")),
        h(
          "div",
          { class: "build-list" },
          ...(model.skills.length
            ? model.skills.map((skill) => skillRow(skill, input.onSkill))
            : [h("div", { class: "build-list__empty" }, t("side.empty"))])
        ),
        h("div", { class: "build-sub" }, t("build.relics")),
        h(
          "div",
          { class: "relic-list" },
          ...(model.relics.length
            ? model.relics.map((relic) =>
                h(
                  "div",
                  { class: "relic-row relic-row--grade-" + relic.grade, title: relic.costText },
                  icon("gem"),
                  h("span", { class: "relic-row__name" }, relic.name),
                  h("span", { class: "relic-row__gain" }, relic.gainText)
                )
              )
            : [h("div", { class: "build-list__empty" }, t("side.noRelics"))])
        ),
        h("div", { class: "build-sub" }, t("build.legend")),
        h(
          "div",
          { class: "side-panel__legend build-overlay__legend" },
          ...model.legend.map((entry) =>
            h(
              "span",
              { class: "legend-chip" },
              h("i", { style: `background:${entry.color}` }),
              entry.label
            )
          )
        ),
      ],
    });
  };
}
