import { SHOP } from "../game/meta.ts";
import { fmtFull, h } from "../ui/overlays.ts";
import type { SceneShell, Translate } from "./types.ts";

export interface ShopSceneInput {
  coins: number;
  levels: Readonly<Record<string, number>>;
  onBuy(id: string): void;
  onBack(): void;
}

const SHOP_TABS: Array<[string, string]> = [
  ["all", "全部"],
  ["balls", "弹珠"],
  ["defense", "防护"],
  ["econ", "收益"],
  ["tech", "研发"],
  ["special", "特殊"],
];

const SHOP_FAMILY: Record<string, string> = {
  balls: "balls",
  shield: "defense",
  coin: "econ",
  research: "tech",
  vanguard: "special",
  lube: "special",
};

/** 筛选与选中项属于商店实例，购买由组装层执行。 */
export function createShopScene(shell: SceneShell, t: Translate): (input: ShopSceneInput) => void {
  let shopTab = "all";
  let shopFocus = 0;

  function show(input: ShopSceneInput): void {
    const defs = SHOP.filter(
      (def) => shopTab === "all" || SHOP_FAMILY[def.id] === shopTab
    );
    if (shopFocus >= defs.length) shopFocus = 0;
    const tiles = h(
      "div",
      { class: "tile-grid" },
      ...defs.map((def, index) => {
        const level = input.levels[def.id] ?? 0;
        const maxed = level >= def.maxLevel;
        const cost = maxed ? Infinity : def.cost(level);
        const affordable = !maxed && input.coins >= cost;
        return h(
          "button",
          {
            class:
              "tile" +
              (index === shopFocus ? " tile--focus" : "") +
              (maxed ? " tile--max" : "") +
              (affordable ? " tile--buyable" : ""),
            onclick: () => {
              shopFocus = index;
              show(input);
            },
          },
          h("span", { class: "tile__name" }, def.name),
          h("span", { class: "tile__lv" }, "Lv " + level + "/" + def.maxLevel),
          h(
            "span",
            { class: "tile__price" + (affordable ? "" : " tile__price--poor") },
            maxed ? "MAX" : "◆ " + fmtFull(cost)
          )
        );
      })
    );
    const sel = defs[shopFocus];
    const level = sel ? input.levels[sel.id] ?? 0 : 0;
    const maxed = sel ? level >= sel.maxLevel : false;
    const cost = sel && !maxed ? sel.cost(level) : Infinity;
    const affordable = sel && !maxed && input.coins >= cost;
    const detail = sel
      ? h(
          "div",
          { class: "detail" },
          h(
            "div",
            { class: "detail__head" },
            h("b", {}, sel.name),
            h("span", { class: "detail__lv" }, "Lv " + level + "/" + sel.maxLevel)
          ),
          h("div", { class: "detail__desc" }, sel.desc),
          h(
            "div",
            { class: "detail__row" },
            h(
              "span",
              { class: "detail__price" + (affordable ? "" : " detail__price--poor") },
              maxed
                ? t("shop.max")
                : "◆ " + fmtFull(cost) + (affordable ? "" : " · 差 " + fmtFull(cost - input.coins))
            ),
            maxed
              ? h("span", { class: "lamp lamp--max" }, "MAX")
              : h(
                  "button",
                  {
                    class: "key-buy",
                    disabled: !affordable,
                    onclick: () => input.onBuy(sel.id),
                  },
                  affordable ? t("shop.buy") : t("shop.poor")
                )
          )
        )
      : null;
    shell.open({
      title: t("shop.title"),
      meta: "◆ " + fmtFull(input.coins),
      body: [
        shell.tabRow(SHOP_TABS, shopTab, (id) => {
          shopTab = id;
          shopFocus = 0;
          show(input);
        }),
        tiles,
        detail,
      ],
      onBack: input.onBack,
    });
  }

  return show;
}
