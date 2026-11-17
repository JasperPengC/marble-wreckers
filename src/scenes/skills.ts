import { CATEGORY_LABELS, UPGRADES, upgradeById, upgradeCategory } from "../game/upgrades.ts";
import { h } from "../ui/overlays.ts";
import { icon, UPGRADE_ICONS } from "../ui/icons.ts";
import type { SceneShell, Translate } from "./types.ts";

export interface SkillSceneInput {
  id: string;
  level: number;
  inRun: boolean;
  onBack(): void;
}

export interface SkillsSceneInput {
  levels: Readonly<Record<string, number>>;
  onSkill(id: string): void;
  onBack(): void;
}

const CODEX_TABS: Array<[string, string]> = [
  ["shot", "弹道"],
  ["power", "火力"],
  ["element", "元素"],
  ["economy", "收益"],
];

export function showSkillScene(shell: SceneShell, t: Translate, input: SkillSceneInput): void {
  const { id, level, inRun } = input;
  const def = upgradeById(id);
  if (!def) return;
  const maxed = level >= def.maxLevel;
  shell.open({
    title: def.name,
    meta: "Lv " + level + " / " + def.maxLevel + (maxed ? " · MAX" : ""),
    body: [
      h(
        "div",
        { class: "help__section" },
        h(
          "div",
          { class: "help__heading" },
          icon(UPGRADE_ICONS[id] ?? "crit"),
          "当前效果",
          h("span", { class: "grade-badge grade--" + def.grade }, def.grade),
          h("span", { class: "help__heading-tag" }, CATEGORY_LABELS[upgradeCategory(id)])
        ),
        h("div", { class: "help__note" }, def.effect(Math.max(1, level)))
      ),
      maxed
        ? null
        : h(
            "div",
            { class: "help__section" },
            h(
              "div",
              { class: "help__heading" },
              icon("chevron"),
              "升级到 Lv " + (level + 1)
            ),
            h("div", { class: "help__note" }, def.effect(level + 1))
          ),
    ],
    foot: inRun ? t("help.backToGame") : t("shop.back"),
    onBack: input.onBack,
  });
}


/** 分类光标只属于当前图鉴实例。 */
export function createSkillsScene(shell: SceneShell, t: Translate): (input: SkillsSceneInput) => void {
  let codexTab = "shot";

  function show(input: SkillsSceneInput): void {
    const defs = UPGRADES.filter((def) => upgradeCategory(def.id) === codexTab);
    shell.open({
      title: t("skills.title"),
      meta: t("skills.meta"),
      body: [
        shell.tabRow(CODEX_TABS, codexTab, (id) => {
          codexTab = id;
          show(input);
        }),
        h(
          "div",
          { class: "tile-grid tile-grid--skills" },
          ...defs.map((def) => {
            const level = input.levels[def.id] ?? 0;
            const maxed = level >= def.maxLevel;
            return h(
              "button",
              {
                class:
                  "tile tile--skill tile--grade-" + def.grade +
                  (level > 0 ? " tile--owned" : "") +
                  (maxed ? " tile--max" : ""),
                onclick: () => input.onSkill(def.id),
              },
              h("span", { class: "grade-badge grade-badge--lg" }, def.grade),
              icon(UPGRADE_ICONS[def.id] ?? "crit"),
              h("span", { class: "tile__name" }, def.name),
              h(
                "span",
                { class: "tile__lv" },
                level > 0 ? (maxed ? "MAX" : "Lv " + level + "/" + def.maxLevel) : t("skills.locked")
              )
            );
          })
        ),
      ],
      onBack: input.onBack,
    });
  }

  return show;
}
