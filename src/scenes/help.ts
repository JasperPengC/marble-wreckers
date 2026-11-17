import { BRICK_COLORS } from "../game/const.ts";
import { h } from "../ui/overlays.ts";
import { icon } from "../ui/icons.ts";
import type { SceneShell, Translate } from "./types.ts";

const HELP_BRICKS: Array<[string, string, string]> = [
  ["spam", "水贴", "普通砖"],
  ["gold", "神帖", "血厚、掉更多灵石的普通砖（不是 Boss）"],
  ["flame", "对线", "碎裂时炸伤相邻砖"],
  ["bomb", "引战", "碎裂时大范围爆炸"],
  ["steel", "加固", "单次伤害最高 2 点"],
  ["healer", "回帖", "每 3 秒给相邻砖回血"],
  ["mirror", "折叠", "受到的伤害减半"],
  ["core", "镇站", "每 5 栋的 Boss 核心，打掉即破楼，会缓慢回血"],
];

function helpStep(index: number, text: string): HTMLElement {
  return h("div", { class: "help__step" }, h("b", {}, String(index)), text);
}

export function showHelpScene(shell: SceneShell, t: Translate, onBack: () => void): void {
  shell.open({
    title: t("help.title"),
    body: [
      h(
        "div",
        { class: "help__section" },
        h("div", { class: "help__heading" }, icon("play"), "怎么玩"),
        helpStep(1, "按住画面拖动瞄准，松手倾泻弹珠雨。"),
        helpStep(2, "弹珠有弹跳次数，弹完就消散；穿透不消耗弹跳。"),
        helpStep(3, "楼底碰到红色虚线 = 被压扁。每清一栋楼抽一次三选一强化。"),
        helpStep(4, "每 5 栋是「镇站巨楼」：打掉顶部紫色核心即破楼，核心会缓慢回血。"),
        helpStep(5, "只剩最后 1-2 块砖时楼会放慢到 25% 速度等你收尾，不会完全停住。"),
        helpStep(6, "商店的「备用支架」是护盾：楼压到红线时会抵消一次并把楼顶回去 2 层。")
      ),
      h(
        "div",
        { class: "help__section" },
        h("div", { class: "help__heading" }, icon("tower"), "砖块图鉴"),
        h(
          "div",
          { class: "help__bricks" },
          ...HELP_BRICKS.map(([kind, label, desc]) =>
            h(
              "span",
              { class: "help__brick", title: desc },
              h("i", { style: "background:" + (BRICK_COLORS[kind]?.[0] ?? "#888") }),
              label
            )
          )
        )
      ),
      h(
        "div",
        { class: "help__section" },
        h("div", { class: "help__heading" }, icon("gem"), "灵石与成长"),
        h(
          "div",
          { class: "help__note" },
          "清砖得灵石，阵亡或撤退后在「强化商店」买永久强化；技能图鉴看构筑，成就与每日挑战在菜单。"
        )
      ),
      h("p", { class: "overlay__hint" }, t("help.keys"))
    ],
    onBack,
  });
}
