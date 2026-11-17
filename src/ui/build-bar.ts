/** 顶部读数和「构筑」栏。只认 HudModel 这一份纯数据，不 import 游戏模块。 */

import type { HudModel, OwnedSkill } from "./hud-model.ts";
import { icon, UPGRADE_ICONS } from "./icons.ts";
import { fmtNum, h } from "./overlays.ts";

export interface HudView {
  updateHUD(model: HudModel): void;
  updateBuildBar(model: HudModel): void;
}

interface HudOptions {
  /** 打开某个已获得强化的详情。 */
  onSkill(id: string): void;
  t(key: string): string;
  el(id: string): HTMLElement;
}

/** 等级进度点的形状：等级多（≥5）的技能用圆点，否则用短条。 */
function pipShape(skill: OwnedSkill): string {
  return "build-chip__pips" + (skill.maxLevel >= 5 ? " build-chip__pips--dots" : "");
}

export function createHudView(opts: HudOptions): HudView {
  let legendRendered = false;

  function updateHUD(model: HudModel): void {
    const { readout } = model;
    opts.el("hud-score").textContent = fmtNum(readout.score);
    opts.el("hud-coins").textContent = fmtNum(readout.coins);
    opts.el("hud-tower").textContent = readout.tower;

    const shield = opts.el("hud-shield");
    const shieldCell = shield.closest(".hud__cell");
    if (readout.shield === null) {
      shield.textContent = "—";
      shieldCell?.classList.add("is-zero");
    } else {
      shield.textContent = String(readout.shield);
      shieldCell?.classList.toggle("is-zero", readout.shield <= 0);
    }
  }

  function chip(skill: OwnedSkill): HTMLElement {
    return h(
      "button",
      {
        class:
          "build-chip build-chip--grade-" +
          skill.grade +
          " build-chip--cat-" +
          skill.category +
          (skill.maxed ? " build-chip--max" : ""),
        "aria-label": `${skill.name} Lv ${skill.level}/${skill.maxLevel}`,
        onclick: () => opts.onSkill(skill.id),
      },
      icon(UPGRADE_ICONS[skill.id] ?? "crit"),
      h(
        "span",
        { class: pipShape(skill) },
        ...Array.from({ length: skill.maxLevel }, (_, index) =>
          h("i", {
            class: "build-chip__pip" + (index < skill.level ? " build-chip__pip--on" : ""),
          })
        )
      ),
      h(
        "span",
        { class: "build-chip__lv" },
        skill.maxed ? "MAX" : "Lv" + skill.level
      )
    );
  }

  function row(skill: OwnedSkill): HTMLElement {
    return h(
      "button",
      {
        class:
          "build-row build-row--grade-" +
          skill.grade +
          " build-row--cat-" +
          skill.category +
          (skill.maxed ? " build-row--max" : ""),
        onclick: () => opts.onSkill(skill.id),
      },
      icon(UPGRADE_ICONS[skill.id] ?? "crit"),
      h("span", { class: "build-row__name" }, skill.name),
      h("span", { class: "build-row__lv" }, skill.maxed ? "MAX" : `Lv${skill.level}`)
    );
  }

  function renderLegend(model: HudModel): void {
    if (legendRendered) return;
    legendRendered = true;
    opts.el("side-legend").replaceChildren(
      ...model.legend.map((entry) =>
        h(
          "span",
          { class: "legend-chip" },
          h("i", { style: `background:${entry.color}` }),
          entry.label
        )
      )
    );
  }

  function updateBuildBar(model: HudModel): void {
    const bar = opts.el("build-bar");
    bar.hidden = !model.inRun || model.skills.length === 0;
    bar.replaceChildren(...model.skills.map(chip));

    opts
      .el("build-list")
      .replaceChildren(
        ...(model.skills.length
          ? model.skills.map(row)
          : [h("div", { class: "build-list__empty" }, opts.t("side.empty"))])
      );

    opts
      .el("relic-list")
      .replaceChildren(
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
          : [h("div", { class: "build-list__empty" }, opts.t("side.noRelics"))])
      );

    opts.el("side-tower").replaceChildren(
      ...(model.inRun
        ? [
            h("span", {}, opts.t("side.tower"), h("b", {}, model.readout.tower)),
            h(
              "span",
              {},
              opts.t("side.floorsLeft"),
              h("b", {}, String(model.floorsLeft ?? 0))
            ),
          ]
        : [h("span", {}, opts.t("side.idle"))])
    );

    renderLegend(model);
  }

  return { updateHUD, updateBuildBar };
}
