/**
 * 三选一 / 遗物卡片的视图构建。
 *
 * 纯数据进、DOM 出：不知道 Run 在哪、不知道点了之后跳哪页。抽卡的状态机
 * 留在 main.ts，这里只负责把一张卡画对——等级点数量、评级配色、分类标签、
 * 满级文案。想改卡片长相不用碰主流程。
 */

import type { RelicDef } from "../game/relics.ts";
import type { SkillGrade, UpgradeDef } from "../game/upgrades.ts";
import { CATEGORY_LABELS, upgradeCategory } from "../game/upgrades.ts";
import { icon, UPGRADE_ICONS } from "../ui/icons.ts";
import { h, RARITY_CLASS, upgradeSkin } from "../ui/overlays.ts";

export interface DraftCardInput {
  def: UpgradeDef;
  /** 当前等级（0 表示还没拿过）。 */
  level: number;
  /** 是否处于键盘光标位置。 */
  focused: boolean;
  onPick(): void;
}

/** 一张强化卡：图标/分类在顶行，名称与等级同行，底部是等级点。 */
export function draftCard(input: DraftCardInput): HTMLElement {
  const { def, level, focused, onPick } = input;
  const next = level + 1;
  const willMax = next >= def.maxLevel;
  const category = upgradeCategory(def.id);
  const levelText = willMax ? `Lv ${level} → MAX` : `Lv ${level} → ${next}`;
  const pips = Array.from({ length: def.maxLevel }, (_, index) =>
    h("span", {
      class:
        "card__pip" +
        (index < level ? " card__pip--filled" : index === level ? " card__pip--next" : ""),
    })
  );

  return h(
    "button",
    {
      class:
        "card card--carousel card--grade-" +
        def.grade +
        " " +
        RARITY_CLASS[upgradeSkin(def.id).rarity] +
        " card--cat-" +
        category +
        (focused ? " card--focus" : ""),
      "aria-label": `${def.name} 升级到 Lv ${next}`,
      onclick: onPick,
    },
    h(
      "div",
      { class: "card__top" },
      h("span", { class: "card__icon" }, icon(UPGRADE_ICONS[def.id] ?? "crit")),
      h("span", { class: "card__cat" }, CATEGORY_LABELS[category])
    ),
    h("div", { class: "card__name" }, def.name, h("span", { class: "card__level" }, levelText)),
    h("div", { class: "card__effect" }, def.effect(next)),
    h(
      "div",
      { class: "card__pips" + (def.maxLevel >= 5 ? " card__pips--dots" : "") },
      ...pips
    )
  );
}

/** 一张遗物卡：获得一行、代价一行（代价用警示色）。 */
export function relicCard(input: {
  relic: RelicDef;
  grade: SkillGrade;
  gainLabel: string;
  costLabel: string;
  tag: string;
  onPick(): void;
}): HTMLElement {
  const { relic, grade, gainLabel, costLabel, tag, onPick } = input;
  return h(
    "button",
    {
      class: "card card--carousel card--grade-" + grade,
      "aria-label": relic.name,
      onclick: onPick,
    },
    h(
      "div",
      { class: "card__top" },
      h("span", { class: "card__icon" }, icon("gem")),
      h("span", { class: "card__cat" }, tag)
    ),
    h("div", { class: "card__name" }, relic.name),
    h("div", { class: "card__effect" }, h("b", {}, gainLabel), " ", relic.gainText),
    h(
      "div",
      { class: "card__effect card__effect--cost" },
      h("b", {}, costLabel),
      " ",
      relic.costText
    )
  );
}

/** 卡片轮播容器（三张并排，窄屏横滑）。 */
export function cardCarousel(cards: HTMLElement[]): HTMLElement {
  return h("div", { class: "carousel" }, ...cards);
}
