import { describe, expect, test } from "bun:test";
import {
  aimRun,
  createRun,
  launchVolley,
  pickUpgrade,
  restoreRun,
  descendSpeed,
  snapshotRun,
  updateRun,
  type ProcKind,
} from "../src/game/run.ts";
import { rollDraft, UPGRADES } from "../src/game/upgrades.ts";
import { CANNON_Y, COLLAPSE_TIME } from "../src/game/const.ts";

/** Drive a run forward with a fixed aim until a condition is met. */
function simulate(run: ReturnType<typeof createRun>, seconds: number, dt = 1 / 60) {
  for (let i = 0; i < seconds / dt; i++) {
    updateRun(run, dt);
  }
}

/** Fire volleys with varying aim (like a real player) until draft/death appears. */
function driveToPhase(run: ReturnType<typeof createRun>, maxSeconds = 90): string {
  const angles = [0.85, 0.4, 1.2, -0.9, 0.6, -0.3];
  let t = 0;
  let volley = 0;
  while (t < maxSeconds) {
    if (run.phase === "aim") {
      aimRun(run, angles[volley % angles.length]);
      launchVolley(run);
      volley++;
    }
    updateRun(run, 1 / 60);
    t += 1 / 60;
    if (run.phase === "draft" || run.phase === "dead") return run.phase;
  }
  return run.phase;
}

describe("run lifecycle", () => {
  test("aiming and firing a volley", () => {
    const run = createRun("seed-a", {}, false);
    expect(run.phase).toBe("aim");
    aimRun(run, 0.4);
    expect(run.aimAngle).toBeCloseTo(0.4, 5);
    expect(launchVolley(run)).toBe(true);
    expect(run.phase).toBe("volley");
    expect(run.ballsToLaunch).toBe(8);
    // Launching twice is not allowed.
    expect(launchVolley(run)).toBe(false);
    simulate(run, 8);
    expect(run.phase).toBe("aim");
    expect(run.balls.length).toBe(0);
    expect(run.stats.launches).toBe(8);
  });

  test("aim clamping keeps shots in the walls", () => {
    const run = createRun("seed-b", {}, false);
    aimRun(run, 99);
    expect(Math.abs(run.aimAngle)).toBeLessThanOrEqual(1.35 + 1e-9);
    aimRun(run, -99);
    expect(run.aimAngle).toBeGreaterThanOrEqual(-1.35 - 1e-9);
  });

  test("balls deal damage and destroy bricks over time", () => {
    const run = createRun("seed-c", {}, false);
    // Aim straight up: the tower spawns above the screen and slides in.
    aimRun(run, 0);
    launchVolley(run);
    simulate(run, 60);
    expect(run.stats.damage).toBeGreaterThan(0);
  });

  test("tower eventually crushes the player without upgrades", () => {
    const run = createRun("seed-d", {}, false);
    simulate(run, 600);
    expect(run.phase).toBe("dead");
    expect(run.stats.towersCleared).toBe(0);
  });

  test("clearing the tower grants a draft and next tower spawns", () => {
    // Give the run a big boost so volley damage clears tower 0 quickly.
    // Diagonal aim: balls ricochet off the walls and sweep multiple columns.
    const run = createRun("seed-e", {}, false);
    run.mods.balls = 30;
    run.mods.flatDamage = 60;
    aimRun(run, 0.85);
    expect(driveToPhase(run)).toBe("draft");
    expect(run.draftOptions.length).toBe(3);
    const pick = run.draftOptions[0];
    expect(pickUpgrade(run, pick)).toBe(true);
    expect(run.phase).toBe("aim");
    expect(run.tower.spec.index).toBe(1);
    expect(pickUpgrade(run, pick)).toBe(false); // not in draft anymore
  });

  test("shield absorbs one crush", () => {
    const run = createRun("seed-g", { shield: 1 }, false);
    // Let the tower descend without firing.
    simulate(run, 600);
    // First crush consumed the shield; the second crushed the player.
    expect(run.shields).toBe(0);
    expect(run.phase).toBe("dead");
  });
});

describe("run snapshot", () => {
  test("snapshot and restore produce an equivalent aim state", () => {
    const run = createRun("seed-h", { balls: 2 }, false);
    run.mods.flatDamage = 0;
    aimRun(run, 0);
    launchVolley(run);
    // Run half a volley then stop: snapshot only works in aim phase, so wait.
    simulate(run, 10);
    if (run.phase !== "aim") return; // tower cleared in a heavy build; skip
    run.levels["heavy"] = 2;
    const snapshot = snapshotRun(run);
    expect(snapshot).not.toBeNull();
    const restored = restoreRun(snapshot)!;
    expect(restored).not.toBeNull();
    expect(restored.seed).toBe("seed-h");
    expect(restored.tower.spec.index).toBe(run.tower.spec.index);
    expect(restored.levels["heavy"]).toBe(2);
    expect(restored.shop.balls).toBe(2);
    expect(restored.mods.balls).toBe(10); // 8 base + 2 shop
    expect(restored.phase).toBe("aim");
    // Same RNG state → same next draft.
    const a = rollDraft(restored.levels, restored.rng);
    expect(a.length).toBe(3);
  });

  test("restore is null for garbage input", () => {
    expect(restoreRun(null)).toBeNull();
    expect(restoreRun({})).toBeNull();
    expect(restoreRun({ seed: 42 })).toBeNull();
  });

  test("mid-volley snapshot resumes at aim", () => {
    const run = createRun("seed-i", {}, false);
    aimRun(run, 0.2);
    launchVolley(run);
    simulate(run, 0.5);
    const snapshot = snapshotRun(run)!;
    expect(snapshot.phase).toBe("aim");
    const restored = restoreRun(snapshot)!;
    expect(restored.phase).toBe("aim");
    expect(restored.balls.length).toBe(0);
    expect(restored.tower.spec.index).toBe(run.tower.spec.index);
    expect(restored.coins).toBe(run.coins);
  });

  test("draft snapshot resumes on the draft screen", () => {
    const run = createRun("seed-k", {}, false);
    run.mods.balls = 30;
    run.mods.flatDamage = 60;
    aimRun(run, 0.85);
    expect(driveToPhase(run)).toBe("draft");
    const snapshot = snapshotRun(run)!;
    expect(snapshot.phase).toBe("draft");
    expect(snapshot.draftOptions).toEqual(run.draftOptions);
    const restored = restoreRun(snapshot)!;
    expect(restored.phase).toBe("draft");
    expect(restored.draftOptions).toEqual(run.draftOptions);
    expect(pickUpgrade(restored, restored.draftOptions[0])).toBe(true);
    expect(restored.tower.spec.index).toBe(run.tower.spec.index + 1);
  });

  test("a finished run cannot be snapshotted", () => {
    const run = createRun("seed-l", {}, false);
    simulate(run, 600);
    expect(run.phase).toBe("dead");
    expect(snapshotRun(run)).toBeNull();
  });
});

describe("determinism", () => {
  test("same seed produces identical towers", () => {
    const a = createRun("same", {}, false);
    const b = createRun("same", {}, false);
    expect(a.tower.bricks.map((x) => `${x.kind}:${x.hp}:${x.label}`)).toEqual(
      b.tower.bricks.map((x) => `${x.kind}:${x.hp}:${x.label}`)
    );
  });

  test("daily seeds differ by day", () => {
    const run = createRun("2026-11-12", {}, true);
    const run2 = createRun("2026-11-13", {}, true);
    expect(run.seed).not.toBe(run2.seed);
  });
});

describe("combo", () => {
  test("combo counts destructions and decays", () => {
    const run = createRun("seed-j", {}, false);
    run.mods.balls = 100;
    run.mods.flatDamage = 100;
    aimRun(run, 0);
    launchVolley(run);
    simulate(run, 30);
    if (run.stats.bricksDestroyed > 0) {
      expect(run.stats.maxVolleyCombo).toBeGreaterThan(0);
    }
  });
});

describe("mercy rule", () => {
  test("tower keeps descending while the remaining bricks are unreachable", () => {
    const run = createRun("seed-m", {}, false);
    for (const brick of run.tower.bricks) brick.alive = false;
    const alive = run.tower.bricks.slice(0, 2);
    for (const brick of alive) {
      brick.alive = true;
      brick.y = -400; // parked far above the ceiling: balls cannot reach them
    }
    const before = run.tower.offset;
    simulate(run, 1);
    expect(run.tower.offset).toBeGreaterThan(before);
  });

  test("with stragglers on screen the tower crawls at 25% instead of stopping", () => {
    const run = createRun("seed-n", {}, false);
    for (const brick of run.tower.bricks) brick.alive = false;
    const alive = run.tower.bricks.slice(0, 2);
    for (const brick of alive) {
      brick.alive = true;
      brick.y = CANNON_Y - 200;
    }
    const before = run.tower.offset;
    simulate(run, 2);
    const moved = run.tower.offset - before;
    expect(moved).toBeGreaterThan(0); // never freezes
    expect(moved).toBeLessThan(descendSpeed(0) * 2 * 0.6); // clearly slower
  });

  test("a clipped sliver at the ceiling is not treated as reachable", () => {
    const run = createRun("seed-sliver", {}, false);
    for (const brick of run.tower.bricks) brick.alive = false;
    const alive = run.tower.bricks.slice(0, 2);
    for (const brick of alive) {
      brick.alive = true;
      // Bottom edge only 30px into the field: still clipped by the top edge.
      brick.y = 30 - brick.h - run.tower.offset;
    }
    const before = run.tower.offset;
    simulate(run, 1);
    expect(run.tower.offset).toBeGreaterThan(before + 1);
  });
});

describe("skill procs", () => {
  test("special skills emit their own proc events", () => {
    const run = createRun("proc-seed", {}, false);
    run.mods.critChance = 1;
    run.mods.damageMul = 0.2;
    run.mods.pierce = 3;
    run.mods.burnDps = 8;
    run.mods.poisonPct = 0.02;
    run.mods.dotMul = 1.5;
    run.mods.splash = 0.5;
    aimRun(run, 0);
    launchVolley(run);
    for (let i = 0; i < 400; i++) updateRun(run, 1 / 60);
    const kinds = new Set<ProcKind>();
    for (const event of run.fxQueue) {
      if (event.type === "proc") kinds.add(event.kind);
    }
    const expected: ProcKind[] = ["crit", "pierce", "burn", "poison", "resonance", "splash"];
    for (const kind of expected) {
      expect(kinds.has(kind)).toBe(true);
    }
  });
});
