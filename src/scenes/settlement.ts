import { ACHIEVEMENTS, type RunSummaryStats } from "../game/meta.ts";
import { makeRng } from "../game/rng.ts";
import { fmtNum, h } from "../ui/overlays.ts";
import { icon } from "../ui/icons.ts";
import type { SceneShell, Translate } from "./types.ts";

export interface SettlementSceneInput {
  stats: Readonly<RunSummaryStats>;
  coins: number;
  towerIndex: number;
  daily: boolean;
  newAchievements: readonly string[];
  previousRecord: Readonly<{ score: number; tower: number }>;
  onRestart(): void;
  onBack(): void;
}

const TAUNTS = [
  "你碎了 {bricks} 块砖,整个审核组看了都沉默。",
  "{towers} 栋楼塌了,水友们已经在隔壁盖新的。",
  "热度 {score}——离热榜第一还差亿点点。",
  "搬砖不易,下局记得先抽「分身弹珠」。",
  "楼塌的瞬间,楼主正在床上装睡。",
  "水贴们托我向你问好:下次别炸这么狠。",
];

const RANKS: Array<[number, string, string]> = [
  [16, "楼见愁", "#8ef0ff"],
  [10, "拆迁办主任", "#ff9de0"],
  [5, "拆迁队长", "#ffd977"],
  [3, "熟练拆迁工", "#b8c8e0"],
  [1, "见习拆迁工", "#c8b28a"],
];

export function showSettlementScene(shell: SceneShell, t: Translate, input: SettlementSceneInput): void {
  const { stats, coins, towerIndex, daily, newAchievements: newAch, previousRecord: prevRecord } = input;
  const taunt = makeRng(Date.now() & 0xffffff);
  const template = TAUNTS[Math.floor(taunt() * TAUNTS.length)];
  const tauntText = template
    .replace("{bricks}", String(stats.bricksDestroyed))
    .replace("{towers}", String(stats.towersCleared))
    .replace("{score}", fmtNum(stats.damage));
  const towers = stats.towersCleared;
  const [, rankName, rankInk] =
    RANKS.find(([towersNeeded]) => towers >= towersNeeded) ??
    RANKS[RANKS.length - 1];
  const isRecord =
    !daily &&
    (stats.damage > prevRecord.score ||
      towerIndex > prevRecord.tower);
  shell.open({
    title: t("death.title"),
    meta: isRecord ? "★ " + t("death.record") : "",
    back: false,
    foot: "",
    body: [
      h("p", { class: "overlay__subtitle" }, tauntText),
      h(
        "div",
        { class: "settle" },
        h(
          "div",
          { class: "settle__rank", style: "--rank:" + rankInk },
          h("span", { class: "settle__rank-label" }, t("death.rank")),
          h("strong", {}, rankName)
        ),
        h(
          "div",
          { class: "settle__hero" },
          h("b", {}, String(towers)),
          h("span", {}, t("death.towers"))
        ),
        h(
          "div",
          { class: "overlay__stats" },
          h("div", { class: "overlay__stat" }, t("death.score"), h("strong", {}, fmtNum(stats.damage))),
          h("div", { class: "overlay__stat" }, t("death.bricks"), h("strong", {}, String(stats.bricksDestroyed))),
          h("div", { class: "overlay__stat" }, t("death.combo"), h("strong", {}, String(stats.maxVolleyCombo))),
          h("div", { class: "overlay__stat" }, t("death.coins"), h("strong", {}, "+" + fmtNum(coins))),
          (stats.coinsSpent ?? 0) > 0
            ? h(
                "div",
                { class: "overlay__stat" },
                t("death.spent"),
                h("strong", {}, "-" + fmtNum(stats.coinsSpent))
              )
            : null
        )
      ),
      newAch.length
        ? h(
            "p",
            { class: "overlay__hint" },
            t("death.newAch") +
              ":" +
              newAch.map((id) => ACHIEVEMENTS.find((a) => a.id === id)?.name ?? id).join("、")
          )
        : null,
      h(
        "div",
        { class: "scene__actions" },
        h(
          "button",
          { class: "btn btn--primary", onclick: () => input.onRestart() },
          icon("restart"),
          t("death.restart")
        ),
        h(
          "button",
          { class: "btn btn--ghost", onclick: () => input.onBack() },
          icon("home"),
          t("death.menu")
        )
      ),
    ],
  });
}
