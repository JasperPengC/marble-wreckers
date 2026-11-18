/** 顶部读数徽章与「构筑」圆钮/浮层内容。只认 HudModel 这一份纯数据，不 import 游戏模块。 */

import type { HudModel, OwnedSkill } from "./hud-model.ts";
import { icon, UPGRADE_ICONS } from "./icons.ts";
import { fmtNum, h } from "./overlays.ts";

export interface HudView {
  updateHUD(model: HudModel): void;
  /** 局外/局内共用的构筑信息：右侧栏 + 构筑圆钮的角标。 */
  updateBuild(model: HudModel): void;
}

interface HudOptions {
  /** 打开某个已获得强化的详情。 */
  onSkill(id: string): void;
  t(key: string): string;
  el(id: string): HTMLElement;
}

export function createHudView(opts: HudOptions): HudView {
  let legendRendered = false;

  function updateHUD(model: HudModel): void {
    const { readout } = model;
    opts.el("hud-score").textContent = fmtNum(readout.score);
    opts.el("hud-coins").textContent = fmtNum(readout.coins);
    opts.el("hud-tower").textContent = readout.stage != null ? String(readout.stage) : readout.tower;
    opts.el("hud-power").textContent = fmtNum(readout.power);

    const shield = opts.el("hud-shield");
    if (readout.shield === null) {
      shield.textContent = "—";
    } else {
      shield.textContent = String(readout.shield);
    }
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

  function updateBuild(model: HudModel): void {
    const fab = opts.el("build-fab");
    const badge = document.getElementById("build-fab-badge");
    const showFab = model.inRun && model.skills.length > 0;
    fab.hidden = !showFab;
    if (badge) badge.textContent = String(model.skills.length);

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

    if (!legendRendered) {
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
  }

  return { updateHUD, updateBuild };
}
