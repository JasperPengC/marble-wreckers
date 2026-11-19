import { ACHIEVEMENTS, type RunSummaryStats } from "../game/meta.ts";
import type { Difficulty } from "../game/stage.ts";
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
  onNext?(): void;
  onStages?(): void;
  /** 关卡制:通关时带奖励与难度;失败时带失败关卡。 */
  victory?: { stage: number; difficulty: Difficulty; rewardBonus: number } | null;
  failure?: { stage: number; difficulty: Difficulty } | null;
}

const DIFF_LABEL: Record<Difficulty, string> = {
  easy: "简单",
  hard: "困难",
  hell: "地狱",
};

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
  const victory = input.victory ?? null;
  const failure = input.failure ?? null;
  const countUp = (el: HTMLElement, target: number): void => {
    const reduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || target <= 0) return;
    const started = performance.now();
    const duration = 850;
    const tick = (now: number): void => {
      const t = Math.min(1, (now - started) / duration);
      el.textContent = fmtNum(Math.round(target * (1 - Math.pow(1 - t, 3))));
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  shell.open({
    title: victory
      ? t("victory.title", { stage: String(victory.stage) })
      : failure
        ? t("death.stageFail", { stage: String(failure.stage) })
        : t("death.title"),
    meta: victory
      ? t("victory.diff", { diff: DIFF_LABEL[victory.difficulty] })
      : isRecord
        ? "★ " + t("death.record")
        : "",
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
          victory
            ? h(
                "div",
                { class: "overlay__stat overlay__stat--gold" },
                t("victory.bonus"),
                h("strong", {}, "+" + fmtNum(victory.rewardBonus))
              )
            : null,
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
        victory
          ? h(
              "button",
              { class: "btn btn--primary", onclick: () => (input.onNext ?? input.onRestart)() },
              icon("play"),
              input.onNext ? t("victory.next") : t("death.restart")
            )
          : h(
              "button",
              { class: "btn btn--primary", onclick: () => input.onRestart() },
              icon("restart"),
              failure ? t("death.retry") : t("death.restart")
            ),
        failure
          ? h(
              "button",
              { class: "btn btn--key", onclick: () => input.onRestart() },
              icon("restart"),
              t("death.restart")
            )
          : null,
        h(
          "button",
          {
            class: "btn btn--ghost",
            onclick: () => (input.onStages ? input.onStages() : input.onBack()),
          },
          icon("home"),
          input.onStages ? t("stages.backToStages") : t("death.menu")
        )
      ),
    ],
  });
  // 通关结算:核心数字滚动演出(尊重减少动效)
  const reduced = document.documentElement.dataset.theme !== undefined;
  if (victory) {
    const heat = [...document.querySelectorAll("#overlay .overlay__stat")].find((stat) =>
      (stat.textContent || "").includes(t("death.score"))
    );
    const strong = heat?.querySelector("strong");
    if (strong) countUp(strong, stats.damage);
  }
}
