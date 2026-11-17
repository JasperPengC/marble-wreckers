import { describe, expect, test } from "bun:test";
import {
  DEFAULT_BALL_R,
  aimPreview,
  launchBall,
  makeWorld,
  stepBall,
  stepWorld,
  type BrickBody,
} from "../src/game/physics.ts";
import { BASE_WALL_BOUNCES, BRICK_H, BRICK_W, GRID_LEFT } from "../src/game/const.ts";
import { makeBoardBrick } from "../src/game/board.ts";

const world = makeWorld();

function brick(col: number, row: number, hp = 100): BrickBody {
  return {
    id: col * 100 + row,
    col,
    row,
    x: GRID_LEFT + col * BRICK_W,
    y: 120 + row * (BRICK_H + 6),
    w: BRICK_W,
    h: BRICK_H,
    hp,
    maxHp: hp,
    alive: true,
  };
}

describe("ball launch", () => {
  test("straight launch moves upward", () => {
    const ball = launchBall(200, 600, 0, 400, 0, 0);
    const events = stepBall(ball, 0.1, [], world);
    expect(ball.y).toBeLessThan(600);
    expect(ball.vx).toBe(0);
    expect(events.length).toBe(0);
  });

  test("angled launch keeps speed magnitude", () => {
    const ball = launchBall(200, 600, 0.8, 400, 0, 0);
    stepBall(ball, 0.05, [], world);
    const speed = Math.hypot(ball.vx, ball.vy);
    expect(Math.abs(speed - 400)).toBeLessThan(1e-6);
  });
});

describe("wall reflection", () => {
  test("left wall flips vx positive and keeps ball inside", () => {
    const ball = launchBall(16, 300, -1.0, 400, 0, 0);
    for (let i = 0; i < 200 && ball.vx < 0; i++) {
      stepBall(ball, 1 / 120, [], world);
    }
    expect(ball.vx).toBeGreaterThan(0);
    expect(ball.x).toBeGreaterThanOrEqual(world.left + DEFAULT_BALL_R - 1e-6);
  });

  test("right wall flips vx negative", () => {
    const ball = launchBall(380, 300, 1.0, 400, 0, 0);
    for (let i = 0; i < 200 && ball.vx > 0; i++) {
      stepBall(ball, 1 / 120, [], world);
    }
    expect(ball.vx).toBeLessThan(0);
    expect(ball.x).toBeLessThanOrEqual(world.right - DEFAULT_BALL_R + 1e-6);
  });

  test("ceiling flips vy positive", () => {
    const ball = launchBall(200, 500, 0, 400, 0, 0);
    for (let i = 0; i < 400 && ball.vy < 0; i++) {
      stepBall(ball, 1 / 120, [], world);
    }
    expect(ball.vy).toBeGreaterThan(0);
    expect(ball.y).toBeGreaterThanOrEqual(world.ceiling + DEFAULT_BALL_R - 1e-6);
  });
});

describe("brick collision", () => {
  test("head-on hit reflects downward and reports event", () => {
    const target = brick(3, 0, 1000);
    const ball = launchBall(target.x + BRICK_W / 2, 400, 0, 400, 0, 0);
    let hit = false;
    for (let i = 0; i < 300 && !hit; i++) {
      for (const e of stepBall(ball, 1 / 120, [target], world)) {
        if (e.type === "hit") hit = true;
      }
    }
    expect(hit).toBe(true);
    expect(ball.vy).toBeGreaterThan(0);
    expect(ball.y).toBeLessThan(target.y + BRICK_H + DEFAULT_BALL_R + 1);
  });

  test("pierce passes through without reflecting", () => {
    const target = brick(3, 0, 1000);
    const ball = launchBall(target.x + BRICK_W / 2, 400, 0, 400, 1, 0);
    let sawHit = false;
    for (let i = 0; i < 300 && !(sawHit && ball.y < target.y - DEFAULT_BALL_R - 1); i++) {
      for (const e of stepBall(ball, 1 / 120, [target], world)) {
        if (e.type === "hit") sawHit = true;
      }
    }
    expect(sawHit).toBe(true);
    expect(ball.pierce).toBe(0);
    expect(ball.vy).toBeLessThan(0); // kept flying upward
    expect(ball.y).toBeLessThan(target.y); // passed beyond the brick
  });

  test("pierce is consumed per brick", () => {
    const a = brick(2, 0, 1000);
    const b = brick(2, 1, 1000);
    const ball = launchBall(a.x + BRICK_W / 2, 400, 0, 400, 1, 0);
    const contacts: Array<{ id: number; bounced: boolean }> = [];
    for (let i = 0; i < 400 && !contacts.some((c) => c.bounced); i++) {
      for (const e of stepBall(ball, 1 / 120, [a, b], world)) {
        if (e.type === "hit") contacts.push({ id: e.brick.id, bounced: e.bounced });
      }
    }
    expect(ball.pierce).toBe(0);
    // The lower brick (larger y) is met first and is pierced through.
    expect(contacts[0].bounced).toBe(false);
    expect(contacts[0].id).toBe(b.id);
    // The ball eventually bounced off the second brick it met.
    expect(contacts.some((c) => c.bounced)).toBe(true);
  });

  test("side impact flips vx not vy", () => {
    // Brick sits square across the ball's near-horizontal path.
    const target = makeBoardBrick(9, "spam", 3, 2, 174, 160, BRICK_W, BRICK_H, 1000, 1, "x");
    const ball = launchBall(40, 197, 1.4, 400, 0, 0);
    let hit = false;
    for (let i = 0; i < 400 && !hit; i++) {
      for (const e of stepBall(ball, 1 / 120, [target], world)) {
        if (e.type === "hit") hit = true;
      }
    }
    expect(hit).toBe(true);
    expect(ball.vx).toBeLessThan(0);
    expect(Math.abs(Math.hypot(ball.vx, ball.vy) - 400)).toBeLessThan(1);
  });
});

describe("collection and rebound", () => {
  test("falling ball is collected past the cannon line", () => {
    const ball = launchBall(200, 500, 0, 400, 0, 0);
    for (let i = 0; i < 2000 && ball.alive; i++) {
      stepBall(ball, 1 / 120, [], world);
    }
    expect(ball.alive).toBe(false);
    expect(ball.y).toBeGreaterThan(world.collectY);
  });

  test("rebound charge bounces the ball back up once", () => {
    const ball = launchBall(200, 500, 0, 400, 0, 1);
    let rebounds = 0;
    for (let i = 0; i < 3000 && ball.alive; i++) {
      for (const e of stepBall(ball, 1 / 120, [], world)) {
        if (e.type === "rebound") {
          rebounds++;
          expect(ball.vy).toBeLessThan(0);
        }
      }
    }
    expect(rebounds).toBe(1);
    expect(ball.alive).toBe(false);
  });
});

describe("stepWorld", () => {
  test("steps every alive ball and reports collect events", () => {
    const balls = [
      launchBall(100, 500, 0, 400, 0, 0),
      launchBall(300, 500, 0, 400, 0, 0),
    ];
    let collected = 0;
    for (let i = 0; i < 2000 && collected < 2; i++) {
      for (const e of stepWorld(balls, [], 1 / 120, world)) {
        if (e.type === "collect") collected++;
      }
    }
    expect(collected).toBe(2);
    expect(balls.every((b) => !b.alive)).toBe(true);
  });

  test("dead balls are skipped", () => {
    const dead = launchBall(100, 500, 0, 400, 0, 0);
    dead.alive = false;
    const events = stepWorld([dead], [], 1 / 120, world);
    expect(events.length).toBe(0);
    expect(dead.x).toBe(100);
  });
});

describe("aimPreview", () => {
  test("returns points from origin toward the aim direction", () => {
    const points = aimPreview(200, 600, 0, [], world);
    expect(points.length).toBeGreaterThan(1);
    expect(points[0].y).toBe(600);
    expect(points[points.length - 1].y).toBeLessThan(600);
  });

  test("stops at the first brick", () => {
    const target = brick(3, 0, 10);
    const points = aimPreview(target.x + BRICK_W / 2, 600, 0, [target], world);
    const last = points[points.length - 1];
    expect(last.y).toBeGreaterThan(target.y - 12);
    expect(last.y).toBeLessThan(target.y + BRICK_H + 12);
  });
});

describe("durability", () => {
  test("durability 1 shatters on the first brick it touches", () => {
    const world = makeWorld();
    const brick = makeBoardBrick(1, "spam", 0, 0, 170, 280, BRICK_W, BRICK_H, 999, 1, "x");
    const ball = launchBall(200, 340, 0, 400, 0, 0, 5, 1);
    let hits = 0;
    let fizzled = false;
    for (let i = 0; i < 240 && ball.alive; i++) {
      for (const event of stepBall(ball, 1 / 120, [brick], world)) {
        if (event.type === "hit") hits += 1;
        if (event.type === "fizzle") fizzled = true;
      }
    }
    expect(hits).toBe(1);
    expect(fizzled).toBe(true);
    expect(ball.alive).toBe(false);
  });

  test("wall reflections use their own budget, not durability", () => {
    const world = makeWorld();
    const ball = launchBall(200, 500, -1.2, 400, 0, 0, 5, 1);
    let reflections = 0;
    for (let i = 0; i < 900 && ball.alive; i++) {
      for (const event of stepBall(ball, 1 / 120, [], world)) {
        if (event.type === "wall") reflections += 1;
      }
    }
    expect(ball.alive).toBe(false);
    expect(reflections).toBeGreaterThan(0);
    expect(reflections).toBeLessThanOrEqual(BASE_WALL_BOUNCES + 1);
  });
});

describe("bounce budget", () => {
  test("a ball dissolves once its bounce budget is spent", () => {
    const world = makeWorld();
    const ball = launchBall(60, 300, -1.2, 400, 0, 0, 5, 1);
    let fizzled = false;
    for (let i = 0; i < 1200 && ball.alive; i++) {
      const events = stepBall(ball, 1 / 120, [], world);
      if (events.some((event) => event.type === "fizzle")) fizzled = true;
    }
    expect(ball.alive).toBe(false);
    expect(fizzled).toBe(true);
  });

  test("pierce passes through bricks without spending the budget", () => {
    const world = makeWorld();
    const ball = launchBall(200, 300, 0, 400, 2, 0, 5, 0);
    const brick = makeBoardBrick(1, "spam", 0, 0, 170, 280, BRICK_W, BRICK_H, 999, 1, "x");
    const events = stepBall(ball, 1 / 120, [brick], world);
    expect(ball.alive).toBe(true);
    expect(ball.bounces).toBe(0);
    expect(events.some((event) => event.type === "hit")).toBe(true);
  });
});
