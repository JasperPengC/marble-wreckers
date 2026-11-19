import { ACHIEVEMENTS } from "../game/meta.ts";
import { icon } from "../ui/icons.ts";
import { fmtNum, h } from "../ui/overlays.ts";
import type { SceneShell, Translate } from "./types.ts";

export interface CollectionSceneInput {
  achievements: readonly string[];
  /** 已领取奖励的成就 id。 */
  claims: readonly string[];
  onClaim(id: string): void;
  onBack(): void;
}

/**
 * 成就图鉴:未解锁=灰;已解锁未领取=亮+领取按钮;已领取=亮+「已领取」。
 * 领取按钮直接发灵石。
 */
export function showCollectionScene(shell: SceneShell, t: Translate, input: CollectionSceneInput): void {
  shell.open({
    title: t("collection.title"),
    meta: input.achievements.length + "/" + ACHIEVEMENTS.length,
    body: [
      h(
        "div",
        { class: "ach-list" },
        ...ACHIEVEMENTS.map((def) => {
          const has = input.achievements.includes(def.id);
          const claimed = input.claims.includes(def.id);
          const claimable = has && !claimed;
          return h(
            "div",
            {
              class:
                "ach-row" +
                (has ? " ach-row--unlocked" : "") +
                (claimed ? " ach-row--claimed" : "") +
                (claimable ? " ach-row--claimable" : ""),
            },
            h(
              "span",
              { class: "ach-row__medal" + (has ? " ach-row__medal--on" : "") },
              icon(has ? "gem" : "help")
            ),
            h(
              "div",
              { class: "ach-row__text" },
              h("span", { class: "ach-row__name" }, def.name),
              h("span", { class: "ach-row__desc" }, def.desc)
            ),
            has
              ? h(
                  "button",
                  {
                    class: "btn btn--small ach-row__claim",
                    disabled: !claimable,
                    onclick: () => input.onClaim(def.id),
                  },
                  claimed ? t("quests.claimed") : `${t("quests.claim")} ${fmtNum(def.reward)}`
                )
              : null
          );
        })
      ),
    ],
    onBack: input.onBack,
  });
}
