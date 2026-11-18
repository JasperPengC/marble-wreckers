/**
 * 任务面板:每日任务(按天重置)+ 里程碑任务(永久进度)。
 * 进度条 + 灵石奖励 + 领取按钮。
 */

import {
  DAILY_QUESTS,
  MILESTONE_QUESTS,
  accountPower,
  type MetaSave,
  type QuestDef,
} from "../game/meta.ts";
import { fmtNum, h } from "../ui/overlays.ts";
import { icon } from "../ui/icons.ts";
import type { SceneShell, Translate } from "./types.ts";

export interface QuestsSceneInput {
  meta: MetaSave;
  /** 今天日期(YYYY-MM-DD),驱动每日任务桶。 */
  today: string;
  onClaim(kind: "daily" | "milestones", id: string): void;
  onBack(): void;
}

function questRow(
  shell: SceneShell,
  t: Translate,
  def: QuestDef,
  progress: number,
  claimed: boolean,
  onClaim: () => void
): HTMLElement {
  const done = progress >= def.goal;
  const ratio = Math.max(0, Math.min(1, progress / def.goal));
  return h(
    "div",
    { class: "quest-row" + (claimed ? " quest-row--claimed" : done ? " quest-row--done" : "") },
    h(
      "div",
      { class: "quest-row__text" },
      h("div", { class: "quest-row__name" }, def.name),
      h("div", { class: "quest-row__desc" }, def.desc)
    ),
    h(
      "div",
      { class: "quest-row__side" },
      h(
        "div",
        { class: "quest-row__track" },
        h("b", { class: "quest-row__fill", style: `width:${(ratio * 100).toFixed(1)}%` })
      ),
      h(
        "div",
        { class: "quest-row__meta" },
        h("span", { class: "quest-row__progress" }, `${fmtNum(Math.min(progress, def.goal))}/${fmtNum(def.goal)}`),
        h(
          "button",
          {
            class: "btn btn--small quest-row__claim",
            disabled: !done || claimed,
            onclick: onClaim,
          },
          claimed ? t("quests.claimed") : `${t("quests.claim")} ${def.reward}`
        )
      )
    )
  );
}

export function createQuestsScene(shell: SceneShell, t: Translate) {
  return function showQuestsScene(input: QuestsSceneInput): void {
    const meta = input.meta;
    const power = accountPower(meta);
    const dailyProgress = (id: string): number => {
      if (id === "daily-towers") return meta.quests.towers;
      if (id === "daily-gems") return meta.quests.gems;
      return meta.quests.stageClears;
    };
    const dailyRows = DAILY_QUESTS.map((def) => {
      const state = meta.quests.daily[def.id] ?? { progress: 0, claimed: false };
      return questRow(shell, t, def, dailyProgress(def.id), state.claimed, () =>
        input.onClaim("daily", def.id)
      );
    });
    const milestoneRows = MILESTONE_QUESTS.map((def) => {
      const state = meta.quests.milestones[def.id] ?? { progress: 0, claimed: false };
      return questRow(shell, t, def, def.progress(meta), state.claimed, () =>
        input.onClaim("milestones", def.id)
      );
    });
    shell.open({
      title: t("quests.title"),
      meta: t("quests.power") + " " + fmtNum(power),
      back: true,
      onBack: input.onBack,
      foot: t("quests.foot"),
      body: [
        h("div", { class: "help__heading" }, icon("calendar"), t("quests.daily")),
        h("div", { class: "quest-list" }, ...dailyRows),
        h("div", { class: "help__heading quest-milestone" }, icon("book"), t("quests.milestones")),
        h("div", { class: "quest-list" }, ...milestoneRows),
      ],
    });
  };
}
