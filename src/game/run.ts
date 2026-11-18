import {
  BALL_R,
  BALL_SPEED,
  BRICK_H,
  CANNON_Y,
  COLLAPSE_TIME,
  COMBO_WINDOW,
  CRUSH_MARGIN,
  DESCEND_BASE,
  DESCEND_MAX,
  DESCEND_PER_TOWER,
  LANE_SPREAD,
  LAUNCH_INTERVAL_MS,
  MAX_FRAME_DT,
  PHYSICS_DT,
  ARMOR_PUSH_ROWS,
  SHIELD_PUSH_ROWS,
  W,
} from "./const.ts";
import {
  ROW_PITCH_PX,
  aliveCount,
  hasReachableBrick,
  createTower,
  tickHealers,
  towerBottomY,
  towerSpec,
  type BoardBrick,
  type BrickKind,
  type Tower,
  type TowerSpec,
} from "./board.ts";
import { relicById, relicGift, rollRelics } from "./relics.ts";
import {
  applyStatuses,
  applyUpgrade,
  baseMods,
  bricksWithin,
  coinValue,
  computeBlastDamage,
  computeHit,
  isEligible,
  neighborsOf,
  rollDraft,
  upgradeById,
  type RunMods,
  type UpgradeLevels,
} from "./upgrades.ts";
import { makeRng, type Rng } from "./rng.ts";
import {
  clampAim,
  launchBall,
  makeWorld,
  CEILING,
  stepWorld,
  type BallBody,
  type StepEvent,
} from "./physics.ts";
import type { RunSummaryStats } from "./meta.ts";
import {
  DIFFICULTY_DEFS,
  STAGE_TOWERS,
  stageTowerIndex,
  type Difficulty,
} from "./stage.ts";

export type RunPhase =
  | "aim"
  | "volley"
  | "collapse"
  | "draft"
  | "relic"
  | "dead"
  | "victory";

export type ProcKind =
  | "crit"
  | "pierce"
  | "burn"
  | "poison"
  | "resonance"
  | "splash"
  | "bossbane"
  | "rebound";

export type FxEvent =
  | { type: "launch"; x: number; y: number; angle: number }
  | { type: "fizzle"; x: number; y: number }
  | { type: "proc"; kind: ProcKind; x: number; y: number }
  | { type: "hit"; x: number; y: number; damage: number; crit: boolean }
  | { type: "destroy"; kind: BrickKind; x: number; y: number; coins: number }
  | { type: "blast"; x: number; y: number; radius: number }
  | { type: "status"; x: number; y: number; kind: "burn" | "poison" }
  | { type: "heal"; x: number; y: number }
  | { type: "bossappear" }
  | { type: "shield" }
  | { type: "collapse" }
  | { type: "death" }
  | { type: "bosskill" }
  | { type: "bossarmor"; x: number; y: number; left: number };

export interface DamagePopup {
  x: number;
  y: number;
  text: string;
  life: number;
  maxLife: number;
  crit: boolean;
  kind: "damage" | "coin" | "heal" | "info" | "proc";
  proc?: ProcKind;
}

export interface Run {
  seed: string;
  daily: boolean;
  shop: Record<string, number>;
  phase: RunPhase;
  tower: Tower;
  mods: RunMods;
  levels: UpgradeLevels;
  shields: number;
  aimAngle: number;
  balls: BallBody[];
  ballsToLaunch: number;
  launchTimer: number;
  combo: number;
  comboTimer: number;
  collapseT: number;
  draftOptions: string[];
  stats: RunSummaryStats;
  coins: number;
  popups: DamagePopup[];
  fxQueue: FxEvent[];
  statusAcc: number;
  /** True during the dramatic last-ball slow-motion window. */
  slowmo: boolean;
  rng: Rng;
  pendingCollapse: boolean;
  time: number;
  /** Last time each proc label was shown, so hit streams don't spam text. */
  procAt: Record<string, number>;
  /** Seconds the mercy rule has been holding the tower still. */
  stallT: number;
  /** Rerolls spent on the current draft; the cost escalates per reroll. */
  draftRerolls: number;
  /** Bricks destroyed in the current volley (drives chain damage). */
  volleyBricks: number;
  /** 已获得的遗物 id。 */
  relics: string[];
  /** Boss 掉落的遗物候选；非空时选完卡进入遗物选择。 */
  relicOptions: string[];
  /** 主线关卡(1-based);null = 无尽/每日模式。 */
  stage: number | null;
  /** 关卡难度;stage 为 null 时也是 null。 */
  difficulty: Difficulty | null;
}

export function createRun(
  seed: string,
  shop: Record<string, number>,
  daily: boolean,
  stage: number | null = null,
  difficulty: Difficulty | null = null
): Run {
  const rng = makeRng(seed);
  const mods = baseMods();
  const run: Run = {
    seed,
    daily,
    stage,
    difficulty,
    shop: { ...shop },
    phase: "aim",
    tower: createTower(stageTowerSpec(stage, 0, difficulty), rng),
    mods,
    levels: {},
    shields: shop.shield ?? 0,
    aimAngle: 0,
    balls: [],
    ballsToLaunch: 0,
    launchTimer: 0,
    combo: 0,
    comboTimer: 0,
    collapseT: 0,
    draftOptions: [],
    stats: {
      towersCleared: 0,
      bricksDestroyed: 0,
      damage: 0,
      maxVolleyCombo: 0,
      launches: 0,
      dotDamage: 0,
      bossKills: 0,
      coinsEarned: 0,
      coinsSpent: 0,
    },
    coins: 0,
    popups: [],
    fxQueue: [],
    statusAcc: 0,
    slowmo: false,
    rng,
    pendingCollapse: false,
    time: 0,
    procAt: {},
    stallT: 0,
    draftRerolls: 0,
    volleyBricks: 0,
    relics: [],
    relicOptions: [],
  };
  // Meta shop bonuses.
  mods.balls += shop.balls ?? 0;
  mods.coinMul += 0.1 * (shop.coin ?? 0);
  mods.damageMul += 0.02 * (shop.research ?? 0);
  mods.speedMul += 0.04 * (shop.lube ?? 0);
  if ((shop.vanguard ?? 0) > 0) {
    run.phase = "draft";
    run.draftOptions = rollDraft(run.levels, rng);
  }
  return run;
}

export function descendSpeed(towerIndex: number): number {
  return Math.min(DESCEND_BASE + towerIndex * DESCEND_PER_TOWER, DESCEND_MAX);
}

/** 关卡内某一栋楼的规格:全局曲线 × 难度乘数。 */
function stageTowerSpec(
  stage: number | null,
  localIdx: number,
  difficulty: Difficulty | null
): TowerSpec {
  if (stage == null || difficulty == null) return towerSpec(localIdx);
  const def = DIFFICULTY_DEFS[difficulty];
  const index = stageTowerIndex(stage, localIdx);
  const base = towerSpec(index);
  return {
    ...base,
    // 关底 Boss:关卡内只在最后一栋出镇站巨楼(无尽/每日仍按全局每 5 栋)。
    isBoss: localIdx === STAGE_TOWERS - 1,
    hpBase: Math.max(1, Math.round(base.hpBase * def.hpMul)),
    descendMul: def.descendMul,
    kindIndex: index + def.kindShift,
  };
}

/** 生成下一栋楼;Boss 楼附带出场演出 fx。 */
function spawnNextTower(run: Run): void {
  run.tower = createTower(nextTowerSpec(run), run.rng);
  if (run.tower.spec.isBoss) {
    fx(run, { type: "bossappear" });
  }
}

/** 下一栋楼的规格(全局序号连续推进)。 */
function nextTowerSpec(run: Run): TowerSpec {
  const nextIndex = run.tower.spec.index + 1;
  if (run.stage == null || run.difficulty == null) return towerSpec(nextIndex);
  const localIdx = nextIndex - stageTowerIndex(run.stage, 0);
  return stageTowerSpec(run.stage, localIdx, run.difficulty);
}

function popup(run: Run, p: Omit<DamagePopup, "life" | "maxLife">): void {
  run.popups.push({ ...p, life: p.crit ? 1.0 : 0.7, maxLife: p.crit ? 1.0 : 0.7 });
  if (run.popups.length > 60) run.popups.splice(0, run.popups.length - 60);
}

export function drainFx(run: Run): FxEvent[] {
  const out = run.fxQueue;
  run.fxQueue = [];
  return out;
}

function fx(run: Run, event: FxEvent): void {
  run.fxQueue.push(event);
}

/** 破甲瞬间：全屏冲击波 + 把楼推回去一截（不推会被压死）。 */
function breakArmor(run: Run, brick: BoardBrick): void {
  const y = brick.y + run.tower.offset + brick.h / 2;
  fx(run, { type: "bossarmor", x: brick.x + brick.w / 2, y, left: brick.armor });
  run.tower.offset -= ARMOR_PUSH_ROWS * ROW_PITCH_PX;
  popup(run, {
    x: W / 2,
    y: CANNON_Y - 78,
    text: brick.armor > 0 ? `护甲破碎 · 剩 ${brick.armor} 层` : "核心暴露!",
    kind: "proc",
    crit: false,
  });
}

/** Apply damage to a brick, handling destruction and on-death effects. */
function damageBrick(
  run: Run,
  brick: BoardBrick,
  amount: number,
  opts: { status?: boolean } = {}
): void {
  if (!brick.alive || amount <= 0) return;

  // Boss 三层结构：护甲层先吃伤害，打穿前核心不掉血。
  if (brick.armor > 0) {
    let rest = amount;
    while (rest > 0 && brick.armor > 0) {
      run.stats.damage += rest;
      if (opts.status) run.stats.dotDamage += rest;
      if (rest < brick.armorHp) {
        brick.armorHp -= rest;
        return;
      }
      // 破一层：溢出伤害带走下一层
      rest -= brick.armorHp;
      brick.armor -= 1;
      brick.armorHp = brick.armor > 0 ? brick.armorMaxHp : 0;
      breakArmor(run, brick);
    }
    if (brick.armor > 0) return;
    // 护甲打光后剩下的一次性砸进核心
    if (rest <= 0) return;
    brick.hp -= rest;
    if (brick.hp > 0) return;
    destroyBrick(run, brick);
    return;
  }

  brick.hp -= amount;
  run.stats.damage += amount;
  if (opts.status) run.stats.dotDamage += amount;
  if (brick.hp > 0) return;
  destroyBrick(run, brick);
}

function destroyBrick(run: Run, brick: BoardBrick): void {
  brick.alive = false;
  brick.hp = 0;
  run.stats.bricksDestroyed++;
  run.combo += 1;
  run.comboTimer = COMBO_WINDOW;
  run.stats.maxVolleyCombo = Math.max(run.stats.maxVolleyCombo, run.combo);
  const coins = coinValue(brick, run.mods);
  run.coins += coins;
  run.stats.coinsEarned += coins;
  popup(run, {
    x: brick.x + brick.w / 2,
    y: brick.y + run.tower.offset,
    text: `+${coins}`,
    kind: "coin",
    crit: false,
  });
  fx(run, {
    type: "destroy",
    kind: brick.kind,
    x: brick.x + brick.w / 2,
    y: brick.y + run.tower.offset + brick.h / 2,
    coins,
  });
  run.stallT = 0;
  if (brick.kind === "core") {
    run.stats.bossKills += 1;
    fx(run, { type: "bosskill" });
  }
  // On-death effects.
  if (brick.kind === "flame") {
    fx(run, {
      type: "blast",
      x: brick.x + brick.w / 2,
      y: brick.y + run.tower.offset + brick.h / 2,
      radius: 66,
    });
    for (const other of neighborsOf(run.tower.bricks, brick)) {
      const amount = computeBlastDamage(
        run.mods,
        other,
        brick.maxHp * 0.4
      );
      damageBrick(run, other, amount);
    }
  } else if (brick.kind === "bomb") {
    const cx = brick.x + brick.w / 2;
    const cy = brick.y + run.tower.offset + brick.h / 2;
    fx(run, { type: "blast", x: cx, y: cy, radius: 150 });
    for (const other of bricksWithin(run.tower.bricks, cx, cy, 150)) {
      const amount = computeBlastDamage(run.mods, other, brick.maxHp * 1.0);
      damageBrick(run, other, amount);
    }
  }
}

/** Per-second status ticks: burn, poison and boss-core regeneration. */
function tickStatuses(run: Run, dt: number): void {
  run.time += dt;
  run.statusAcc += dt;
  if (run.statusAcc < 1) return;
  run.statusAcc -= 1;
  for (const brick of run.tower.bricks) {
    if (!brick.alive) continue;
    if (brick.burnT > 0) {
      brick.burnT -= 1;
      fx(run, {
        type: "status",
        kind: "burn",
        x: brick.x + brick.w / 2,
        y: brick.y + run.tower.offset + brick.h / 2,
      });
      damageBrick(run, brick, Math.round(brick.burnDps), { status: true });
      if (!brick.alive) continue;
    }
    if (brick.poisonT > 0) {
      brick.poisonT -= 1;
      fx(run, {
        type: "status",
        kind: "poison",
        x: brick.x + brick.w / 2,
        y: brick.y + run.tower.offset + brick.h / 2,
      });
      damageBrick(run, brick, Math.round(brick.poisonDps), { status: true });
      if (!brick.alive) continue;
    }
    if (brick.kind === "core" && brick.alive && brick.hp < brick.maxHp) {
      const heal = Math.round(brick.maxHp * 0.008);
      brick.hp = Math.min(brick.maxHp, brick.hp + heal);
    }
  }
}

/** Crush check: tower bottom reaching the cannon line. */
function checkCrush(run: Run): void {
  if (run.phase !== "aim" && run.phase !== "volley") return;
  const bottom = towerBottomY(run.tower);
  if (bottom < CANNON_Y - CRUSH_MARGIN) return;
  if (run.shields > 0) {
    run.shields--;
    run.tower.offset -= SHIELD_PUSH_ROWS * ROW_PITCH_PX;
    popup(run, {
      x: W / 2,
      y: CANNON_Y - 60,
      text: "护盾挡住了!",
      kind: "info",
      crit: false,
    });
    fx(run, { type: "shield" });
    return;
  }
  run.phase = "dead";
  fx(run, { type: "death" });
}

/** Handle one physics event from stepWorld. */
function handleEvent(run: Run, event: StepEvent<BoardBrick>): void {
  if (event.type === "hit") {
    const brick = event.brick;
    if (!brick.alive || brick.hp <= 0) return;
    // Damage grows with the ball's own bounces and with the live combo, so
    // bounce builds and multi-kill builds both scale.
    // Chain damage: every brick already shattered in this volley makes the
    // following hits stronger, so it works whatever the ball's durability is.
    const bounceBonus = run.volleyBricks * run.mods.bounceDmg;
    const comboBonus = run.combo * run.mods.comboDmg;
    // Every brick already pierced on this flight costs damage unless the
    // player invests in 贯穿强化.
    const pierceScale = Math.pow(
      run.mods.pierceFalloff,
      Math.max(0, event.ball.pierced)
    );
    const outcome = computeHit(
      run.mods,
      brick,
      run.rng,
      bounceBonus + comboBonus,
      pierceScale
    );
    popup(run, {
      x: event.x,
      y: event.y,
      text: String(outcome.damage),
      crit: outcome.crit,
      kind: "damage",
    });
    fx(run, {
      type: "hit",
      x: event.x,
      y: event.y,
      damage: outcome.damage,
      crit: outcome.crit,
    });
    brick.hp -= outcome.damage;
    run.stats.damage += outcome.damage;
    const centerX = brick.x + brick.w / 2;
    const centerY = brick.y + run.tower.offset + brick.h / 2;
    const proc = (kind: ProcKind, text: string): void => {
      fx(run, { type: "proc", kind, x: centerX, y: centerY });
      // Visual fx always plays; the floating label is rate-limited so a
      // 20-ball pierce volley doesn't turn into a wall of text.
      const last = run.procAt[kind] ?? -9;
      if (run.time - last < 0.18) return;
      run.procAt[kind] = run.time;
      // Stagger proc labels around the hit so simultaneous procs stay legible.
      const OFFSETS: Record<ProcKind, [number, number]> = {
        crit: [0, -26],
        pierce: [-20, -8],
        burn: [16, -6],
        poison: [-14, -30],
        resonance: [20, -30],
        splash: [24, 4],
        bossbane: [0, -40],
        rebound: [0, 0],
      };
      const [ox, oy] = OFFSETS[kind];
      popup(run, {
        x: centerX + ox,
        y: centerY + oy,
        text,
        kind: "proc",
        proc: kind,
        crit: false,
      });
    };
    if (!event.bounced) proc("pierce", "穿透!");
    if (outcome.crit) proc("crit", "暴击!");
    if (brick.kind === "core" && run.mods.bossDmgMul > 0) proc("bossbane", "镇楼!");
    if (run.mods.burnDps > 0 || run.mods.poisonPct > 0) {
      const applied = applyStatuses(run.mods, brick);
      if (applied.burn > 0) proc("burn", "点燃!");
      if (applied.poison > 0) proc("poison", "剧毒!");
      if ((applied.burn > 0 || applied.poison > 0) && run.mods.dotMul > 1) {
        proc("resonance", "共鸣!");
      }
      if (applied.burn > 0 || applied.poison > 0) {
        fx(run, {
          type: "status",
          kind: applied.poison > 0 ? "poison" : "burn",
          x: centerX,
          y: centerY,
        });
      }
    }
    if (brick.hp <= 0) {
      run.volleyBricks += 1;
      destroyBrick(run, brick);
    } else if (run.mods.splash > 0) {
      let splashed = 0;
      for (const other of neighborsOf(run.tower.bricks, brick)) {
        const amount = computeBlastDamage(
          run.mods,
          other,
          outcome.damage * run.mods.splash
        );
        damageBrick(run, other, amount);
        splashed += 1;
      }
      if (splashed > 0) proc("splash", "溅射!");
    }
    return;
  }
  if (event.type === "fizzle") {
    fx(run, { type: "fizzle", x: event.x, y: event.y });
    return;
  }
  if (event.type === "collect") {
    return;
  }
  if (event.type === "rebound") {
    fx(run, { type: "proc", kind: "rebound", x: event.ball.x, y: event.ball.y });
    popup(run, {
      x: event.ball.x,
      y: event.ball.y,
      text: "回旋!",
      kind: "proc",
      proc: "rebound",
      crit: false,
    });
  }
}

/** Advance the simulation. */
export function updateRun(run: Run, frameDt: number): void {
  let dt = frameDt;
  if (dt > MAX_FRAME_DT) dt = MAX_FRAME_DT;
  // Dramatic slow motion while the final ball of a volley is still flying.
  run.slowmo =
    run.phase === "volley" &&
    run.ballsToLaunch === 0 &&
    run.balls.length === 1 &&
    run.balls[0].alive;
  if (run.slowmo) dt *= 0.6;
  if (run.phase === "dead" || run.phase === "draft") {
    decayPopups(run, dt);
    return;
  }

  if (run.phase === "aim" || run.phase === "volley") {
    // Mercy rule: with ≤2 bricks left (and a straggler fully on screen) the
    // tower creeps at 25% speed instead of holding still. It never freezes, so
    // the run can't stall and the tower never looks "stuck"; if the last brick
    // is clipped above the ceiling it keeps descending at full speed.
    const remaining = aliveCount(run.tower);
    const slowForStragglers =
      remaining <= 2 && hasReachableBrick(run.tower, CEILING + BRICK_H);
    const mercy = slowForStragglers ? 0.25 : 1;
    run.tower.offset +=
      descendSpeed(run.tower.spec.index) *
      (run.tower.spec.descendMul ?? 1) *
      mercy *
      dt;
    tickStatuses(run, dt);
    const healed = tickHealers(run.tower, dt);
    if (healed > 0) {
      const healer = run.tower.bricks.find(
        (b) => b.alive && b.kind === "healer"
      );
      if (healer) {
        popup(run, {
          x: healer.x + healer.w / 2,
          y: healer.y + run.tower.offset,
          text: "+回复",
          kind: "heal",
          crit: false,
        });
        fx(run, {
          type: "heal",
          x: healer.x + healer.w / 2,
          y: healer.y + run.tower.offset + healer.h / 2,
        });
      }
    }
  }

  if (run.phase === "volley") {
    // Launch queue.
    run.launchTimer -= dt;
    while (run.ballsToLaunch > 0 && run.launchTimer <= 0) {
      // Split shots fan the stream across several lanes; each lane keeps the
      // whole volley's ball count, so the damage penalty is what balances it.
      // Split shots multiply the volley: every lane fires the whole ball
      // count, so total balls = balls x lanes (paid for by laneDamageMul).
      const laneCount = Math.max(1, run.mods.lanes);
      for (let lane = 0; lane < laneCount; lane++) {
        const laneOffset =
          laneCount > 1 ? (lane - (laneCount - 1) / 2) * LANE_SPREAD : 0;
        const angle = clampAim(run.aimAngle + laneOffset);
        run.balls.push(
          launchBall(
            W / 2,
            CANNON_Y - 8,
            angle,
            BALL_SPEED * run.mods.speedMul,
            run.mods.pierce,
            run.mods.rebound,
            run.mods.ballR,
            run.mods.bounces
          )
        );
        fx(run, { type: "launch", x: W / 2, y: CANNON_Y - 8, angle });
      }
      run.ballsToLaunch--;
      run.launchTimer += LAUNCH_INTERVAL_MS / 1000;
    }
    // Physics substeps.
    const world = makeWorld();
    const steps = Math.max(1, Math.ceil(dt / PHYSICS_DT));
    const sub = dt / steps;
    for (let i = 0; i < steps; i++) {
      const events = stepWorld(
        run.balls,
        worldBricks(run),
        sub,
        world,
        run.tower.offset
      );
      for (const event of events) handleEvent(run, event);
    }
    run.balls = run.balls.filter((b) => b.alive);
    // Volley finished?
    if (run.ballsToLaunch === 0 && run.balls.length === 0) {
      if (run.pendingCollapse) {
        run.phase = "collapse";
        run.collapseT = 0;
        fx(run, { type: "collapse" });
      } else {
        run.phase = "aim";
      }
    }
  }

  if (run.phase === "collapse") {
    run.collapseT += dt;
    if (run.collapseT >= COLLAPSE_TIME) {
      run.stats.towersCleared += 1;
      // 关卡制:打穿本关全部楼 → 通关。关底 Boss 的遗物在结算前可选。
      if (run.stage != null && run.stats.towersCleared >= STAGE_TOWERS) {
        run.pendingCollapse = false;
        if (run.tower.spec.isBoss) {
          run.relicOptions = rollRelics(run.relics, run.rng);
        }
        if (run.relicOptions.length > 0) {
          run.phase = "relic";
        } else {
          run.phase = "victory";
        }
        return;
      }
      // Boss 掉遗物：先抽卡，选完卡再挑遗物（顺序固定，便于存档还原）
      if (run.tower.spec.isBoss) {
        run.relicOptions = rollRelics(run.relics, run.rng);
      }
      const options = rollDraft(run.levels, run.rng);
      if (options.length === 0) {
        // Build fully maxed: a draft with no cards would strand the run, so
        // pay a bonus and walk straight into the next tower.
        const bonus = 30 + run.tower.spec.index * 10;
        run.coins += bonus;
        run.stats.coinsEarned += bonus;
        popup(run, {
          x: W / 2,
          y: CANNON_Y - 90,
          text: "构筑满级 +" + bonus,
          kind: "coin",
          crit: false,
        });
        run.draftOptions = [];
        run.pendingCollapse = false;
        if (run.relicOptions.length > 0) {
          run.phase = "relic";
        } else {
          spawnNextTower(run);
          run.phase = "aim";
        }
      } else {
        run.draftOptions = options;
        run.phase = "draft";
      }
    }
  }

  // Combo window.
  if (run.combo > 0) {
    run.comboTimer -= dt;
    if (run.comboTimer <= 0) run.combo = 0;
  }

  // Tower cleared during aim/statuses?
  if (
    (run.phase === "aim" || run.phase === "volley") &&
    aliveCount(run.tower) === 0 &&
    !run.pendingCollapse
  ) {
    run.pendingCollapse = true;
    if (run.phase === "aim") {
      run.phase = "collapse";
      run.collapseT = 0;
      fx(run, { type: "collapse" });
    }
  }

  checkCrush(run);
  decayPopups(run, dt);
}

function worldBricks(run: Run): BoardBrick[] {
  return run.tower.bricks;
}

function decayPopups(run: Run, dt: number): void {
  for (let i = run.popups.length - 1; i >= 0; i--) {
    run.popups[i].life -= dt;
    if (run.popups[i].life <= 0) run.popups.splice(i, 1);
  }
}

/** Aim the cannon (call from pointer/keyboard input). */
export function aimRun(run: Run, angle: number): void {
  run.aimAngle = clampAim(angle);
}

/** Fire a volley from the aim state. */
export function launchVolley(run: Run): boolean {
  if (run.phase !== "aim") return false;
  run.phase = "volley";
  run.ballsToLaunch = run.mods.balls;
  run.volleyBricks = 0;
  run.stats.launches = Math.max(
    run.stats.launches,
    run.mods.balls * Math.max(1, run.mods.lanes)
  );
  run.launchTimer = 0;
  return true;
}

/** Pick a drafted upgrade; spawns the next tower. */
export function pickUpgrade(run: Run, id: string): boolean {
  if (run.phase !== "draft") return false;
  const def = upgradeById(id);
  if (!def || !isEligible(def, run.levels)) return false;
  const prev = run.levels[id] ?? 0;
  run.levels[id] = prev + 1;
  applyUpgrade(run.mods, def, prev);
  run.draftOptions = [];
  run.pendingCollapse = false;
  if (run.relicOptions.length > 0) {
    run.phase = "relic";
    return true;
  }
  spawnNextTower(run);
  run.phase = "aim";
  return true;
}

/** 选择 Boss 掉落的遗物，然后进入下一栋楼。 */
export function pickRelic(run: Run, id: string): boolean {
  if (run.phase !== "relic") return false;
  const def = relicById(id);
  if (!def || !run.relicOptions.includes(id)) return false;
  run.relics.push(id);
  def.apply(run.mods);
  const gift = relicGift(id);
  if (gift.shields) run.shields += gift.shields;
  run.relicOptions = [];
  if (run.stage != null && run.stats.towersCleared >= STAGE_TOWERS) {
    run.phase = "victory";
    return true;
  }
  spawnNextTower(run);
  run.phase = "aim";
  return true;
}

/** Serializable snapshot of a run that can be resumed later. */
export interface RunSnapshot {
  seed: string;
  daily: boolean;
  /** 主线关卡与难度(v2);旧存档缺省 = 无尽模式。 */
  stage?: number | null;
  difficulty?: Difficulty | null;
  shop: Record<string, number>;
  towerIndex: number;
  offset: number;
  healTimer: number;
  bricks: Array<
    Pick<
      BoardBrick,
      | "id"
      | "kind"
      | "col"
      | "row"
      | "x"
      | "y"
      | "w"
      | "h"
      | "hp"
      | "maxHp"
      | "alive"
      | "burnT"
      | "burnDps"
      | "poisonT"
      | "poisonDps"
      | "label"
      | "coinMul"
      | "armor"
      | "armorMax"
      | "armorHp"
      | "armorMaxHp"
    >
  >;
  levels: UpgradeLevels;
  shields: number;
  stats: RunSummaryStats;
  coins: number;
  rngState: number;
  draftRerolls: number;
  /**
   * Where to resume. Any in-flight volley is discarded and resumed at "aim":
   * only the settled board (bricks, levels, coins) is worth persisting.
   */
  phase: "aim" | "draft" | "relic";
  draftOptions: string[];
  /** 已拿到的遗物；旧存档没有这个字段，按空处理。 */
  relics?: string[];
  /** Boss 掉落但还没选的遗物。 */
  relicOptions?: string[];
}

export function snapshotRun(run: Run): RunSnapshot | null {
  if (run.phase === "dead" || run.phase === "victory") return null;
  const phase: "aim" | "draft" | "relic" =
    run.phase === "draft" ? "draft" : run.phase === "relic" ? "relic" : "aim";
  return {
    seed: run.seed,
    daily: run.daily,
    stage: run.stage,
    difficulty: run.difficulty,
    shop: { ...run.shop },
    towerIndex: run.tower.spec.index,
    offset: run.tower.offset,
    healTimer: run.tower.healTimer,
    bricks: run.tower.bricks.map((b) => ({ ...b })),
    levels: { ...run.levels },
    shields: run.shields,
    stats: { ...run.stats },
    coins: run.coins,
    rngState: run.rng.getState(),
    draftRerolls: run.draftRerolls,
    phase,
    draftOptions: phase === "draft" ? [...run.draftOptions] : [],
    relics: [...run.relics],
    relicOptions: phase === "relic" ? [...run.relicOptions] : [],
  };
}

export function restoreRun(snap: unknown): Run | null {
  if (!snap || typeof snap !== "object") return null;
  const s = snap as RunSnapshot;
  if (
    typeof s.seed !== "string" ||
    typeof s.towerIndex !== "number" ||
    !Array.isArray(s.bricks)
  ) {
    return null;
  }
  const rng = makeRng(s.seed);
  rng.setState(s.rngState ?? 0);
  const stage = typeof s.stage === "number" && Number.isFinite(s.stage) ? Math.floor(s.stage) : null;
  const difficulty =
    s.difficulty === "easy" || s.difficulty === "hard" || s.difficulty === "hell"
      ? s.difficulty
      : null;
  const run = createRun(
    s.seed,
    s.shop && typeof s.shop === "object" ? (s.shop as Record<string, number>) : {},
    s.daily === true,
    stage,
    difficulty
  );
  // Rebuild the tower from the snapshot.
  const spec =
    stage != null && difficulty != null
      ? stageTowerSpec(stage, s.towerIndex - stageTowerIndex(stage, 0), difficulty)
      : towerSpec(s.towerIndex);
  run.tower = {
    spec,
    bricks: s.bricks
      .filter(
        (b) =>
          b &&
          typeof b.x === "number" &&
          typeof b.y === "number" &&
          typeof b.w === "number" &&
          typeof b.h === "number"
      )
      .map((b) => ({
        ...b,
        alive: b.alive === true,
        armor: typeof b.armor === "number" ? b.armor : 0,
        armorMax: typeof b.armorMax === "number" ? b.armorMax : 0,
        armorHp: typeof b.armorHp === "number" ? b.armorHp : 0,
        armorMaxHp: typeof b.armorMaxHp === "number" ? b.armorMaxHp : 0,
      })),
    offset: typeof s.offset === "number" ? s.offset : spec.rows * -ROW_PITCH_PX,
    nextBrickId: spec.index * 1000 + 1,
    healTimer: typeof s.healTimer === "number" ? s.healTimer : 3,
  };
  run.levels = {};
  const mods = run.mods;
  for (const [id, level] of Object.entries(s.levels ?? {})) {
    if (typeof level !== "number" || level <= 0) continue;
    const def = upgradeById(id);
    if (!def) continue;
    for (let l = 0; l < Math.min(level, def.maxLevel); l++) {
      applyUpgrade(mods, def, run.levels[id] ?? 0);
      run.levels[id] = (run.levels[id] ?? 0) + 1;
    }
  }
  run.shields = typeof s.shields === "number" && s.shields >= 0 ? s.shields : 0;
  run.stats = { ...run.stats, ...(s.stats ?? {}) };
  run.draftRerolls = typeof s.draftRerolls === "number" && s.draftRerolls >= 0 ? Math.floor(s.draftRerolls) : 0;
  run.coins = typeof s.coins === "number" && s.coins >= 0 ? s.coins : 0;
  run.balls = [];
  run.ballsToLaunch = 0;
  run.pendingCollapse = false;
  run.relics = Array.isArray(s.relics)
    ? s.relics.filter(
        (id): id is string => typeof id === "string" && relicById(id) !== undefined
      )
    : [];
  // 遗物修改的是 mods，还原时要重新生效一遍（mods 会按 levels 重建）。
  for (const id of run.relics) relicById(id)?.apply(run.mods);
  run.phase = "aim";
  if (s.phase === "draft") {
    const options = Array.isArray(s.draftOptions)
      ? s.draftOptions.filter(
          (id): id is string => typeof id === "string" && upgradeById(id) !== undefined
        )
      : [];
    if (options.length > 0) {
      run.phase = "draft";
      run.draftOptions = options;
    }
  }
  if (s.phase === "relic") {
    const options = Array.isArray(s.relicOptions)
      ? s.relicOptions.filter(
          (id): id is string => typeof id === "string" && relicById(id) !== undefined
        )
      : [];
    if (options.length > 0) {
      run.phase = "relic";
      run.relicOptions = options;
      run.draftOptions = [];
    }
  }
  return run;
}
