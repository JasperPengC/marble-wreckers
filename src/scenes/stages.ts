/**
 * 选关页:主线关卡列表 + 每关三档难度(简单/困难/地狱)。
 * 星标 = 该难度已通关;未解锁的关卡/难度置灰。
 */

import {
  MAX_STAGE,
  DIFFICULTIES,
  stageClearReward,
  stageModifier,
  stagePowerFor,
  type Difficulty,
} from "../game/stage.ts";
import type { MetaSave, StageRecord } from "../game/meta.ts";
import { icon } from "../ui/icons.ts";
import { fmtNum, h } from "../ui/overlays.ts";
import type { SceneShell, Translate } from "./types.ts";

export interface StagesSceneInput {
  meta: Pick<MetaSave, "stages" | "stageUnlocked" | "coins">;
  power: number;
  onStart(stage: number, difficulty: Difficulty): void;
  onBack(): void;
}

const DIFF_LABEL: Record<Difficulty, string> = {
  easy: "简单",
  hard: "困难",
  hell: "地狱",
};

function clearedStars(rec: StageRecord | undefined, diff: Difficulty): boolean {
  return rec?.[diff] === true;
}

export function createStagesScene(shell: SceneShell, t: Translate) {
  return function showStagesScene(input: StagesSceneInput): void {
    const cards: Array<Node | null> = [];
    for (let stage = 1; stage <= MAX_STAGE; stage++) {
      const unlocked = stage <= input.meta.stageUnlocked;
      const rec = input.meta.stages[stage];
      const starCount = DIFFICULTIES.filter((d) => clearedStars(rec, d)).length;
      const diffButtons = DIFFICULTIES.map((diff, index) => {
        // 难度递进解锁:通关上一档才开放下一档;关卡本身未解锁则全灰。
        const diffUnlocked =
          unlocked &&
          (index === 0 || clearedStars(rec, DIFFICULTIES[index - 1]));
        const done = clearedStars(rec, diff);
        return h(
          "button",
          {
            class:
              "stage-diff stage-diff--" + diff + (diffUnlocked ? "" : " stage-diff--locked"),
            disabled: !diffUnlocked,
            onclick: () => diffUnlocked && input.onStart(stage, diff),
          },
          h("span", { class: "stage-diff__label" }, DIFF_LABEL[diff]),
          h(
            "span",
            { class: "stage-diff__state" },
            done ? icon("crit") : diffUnlocked ? icon("play") : icon("pause")
          ),
          h(
            "span",
            {
              class:
                "stage-diff__power" +
                (input.power < stagePowerFor(stage, diff) ? " stage-diff__power--low" : ""),
            },
            t("stages.recommend") + " " + fmtNum(stagePowerFor(stage, diff))
          )
        );
      });
      cards.push(
        h(
          "div",
          {
            class:
              "stage-card" +
              (unlocked ? "" : " stage-card--locked") +
              (stage === input.meta.stageUnlocked ? " stage-card--next" : ""),
          },
          h(
            "div",
            { class: "stage-card__head" },
            h("b", { class: "stage-card__no" }, unlocked ? `${stage}` : "?"),
            (() => {
              const mod = stageModifier(stage);
              return mod && unlocked
                ? h("span", { class: "stage-card__mod", title: mod.desc }, mod.name)
                : null;
            })(),
            h(
              "span",
              { class: "stage-card__stars" },
              ...Array.from({ length: 3 }, (_, i) =>
                h(
                  "i",
                  { class: "stage-card__star" + (i < starCount ? " stage-card__star--on" : "") },
                  "★"
                )
              )
            ),
            h(
              "span",
              { class: "stage-card__reward" },
              t("stages.clearReward", {
                n: fmtNum(stageClearReward(stage, "hell")),
              })
            )
          ),
          unlocked
            ? h("div", { class: "stage-card__diffs" }, ...diffButtons)
            : h("p", { class: "stage-card__lock" }, t("stages.locked", { prev: stage - 1 }))
        )
      );
    }
    shell.open({
      title: t("stages.title"),
      meta: t("stages.power") + " " + fmtNum(input.power),
      back: true,
      onBack: input.onBack,
      foot: "",
      body: [
        h("p", { class: "overlay__hint" }, t("stages.hint")),
        h("div", { class: "stage-grid" }, ...cards),
      ],
    });
  };
}
