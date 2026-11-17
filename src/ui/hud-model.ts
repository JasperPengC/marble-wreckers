/**
 * HUD 适配层（防腐层）。
 *
 * 界面不该知道 `Run` 长什么样：这一层把游戏状态压成一份纯数据快照，
 * UI 只认这份快照。好处是界面能脱离 Run 单独渲染和测试，加 Boss 血条、
 * 遗物栏这类新读数量时，也不需要让 `src/ui/**` 反过来依赖 `src/game/**`。
 */

import { BRICK_COLORS } from "../game/const.ts";
import type { BrickKind } from "../game/board.ts";
import type { MetaSave } from "../game/meta.ts";
import type { Run } from "../game/run.ts";
import { upgradeById, upgradeCategory } from "../game/upgrades.ts";
import type { SkillGrade, UpgradeCategory } from "../game/upgrades.ts";
import { relicById } from "../game/relics.ts";

export interface HudReadout {
  /** 本局伤害（热度）；不在局内时是历史最高分。 */
  score: number;
  coins: number;
  /** 已格式化好的楼栋标签：进行中的楼层或历史最高。 */
  tower: string;
  /** 护盾数；无护盾概念时（菜单）为 null，界面显示占位符。 */
  shield: number | null;
}

export interface OwnedSkill {
  id: string;
  name: string;
  grade: SkillGrade;
  category: UpgradeCategory;
  level: number;
  maxLevel: number;
  maxed: boolean;
}

export interface OwnedRelic {
  id: string;
  name: string;
  grade: SkillGrade;
  gainText: string;
  costText: string;
}

export interface LegendEntry {
  color: string;
  label: string;
}

export interface HudModel {
  inRun: boolean;
  readout: HudReadout;
  /** 已获得的强化，等级高的在前。 */
  skills: OwnedSkill[];
  /** 当前楼还剩几层；不在局内为 null。 */
  floorsLeft: number | null;
  /** 已获得的遗物。 */
  relics: OwnedRelic[];
  /** 砖块图例：颜色由游戏常量提供，文案由调用方本地化。 */
  legend: LegendEntry[];
}

const BRICK_KINDS: BrickKind[] = [
  "spam",
  "gold",
  "flame",
  "bomb",
  "steel",
  "healer",
  "mirror",
  "core",
];

export function buildHudModel(
  run: Run | null,
  meta: MetaSave,
  t: (key: string) => string
): HudModel {
  const legend = BRICK_KINDS.map((kind) => ({
    color: BRICK_COLORS[kind]?.[0] ?? "#888888",
    label: t(`brick.${kind}`),
  }));

  if (!run) {
    return {
      inRun: false,
      readout: {
        score: meta.bestScore,
        coins: meta.coins,
        tower: meta.bestTower >= 0 ? String(meta.bestTower + 1) : "—",
        shield: null,
      },
      skills: [],
      relics: [],
      floorsLeft: null,
      legend,
    };
  }

  const skills: OwnedSkill[] = Object.entries(run.levels)
    .filter(([, level]) => level > 0)
    .map(([id, level]) => {
      const def = upgradeById(id);
      if (!def) return null;
      return {
        id,
        name: def.name,
        grade: def.grade,
        category: upgradeCategory(id),
        level,
        maxLevel: def.maxLevel,
        maxed: level >= def.maxLevel,
      } satisfies OwnedSkill;
    })
    .filter((entry): entry is OwnedSkill => entry !== null)
    .sort((a, b) => b.level - a.level || a.id.localeCompare(b.id));

  const floorsLeft = new Set(
    run.tower.bricks.filter((brick) => brick.alive).map((brick) => brick.row)
  ).size;

  return {
    inRun: true,
    readout: {
      score: run.stats.damage,
      coins: run.coins,
      tower: String(run.tower.spec.index + 1),
      shield: run.shields,
    },
    skills,
    relics: run.relics
      .map((id) => relicById(id))
      .filter((relic) => relic !== undefined)
      .map((relic) => ({
        id: relic.id,
        name: relic.name,
        grade: relic.grade,
        gainText: relic.gainText,
        costText: relic.costText,
      })),
    floorsLeft,
    legend,
  };
}
