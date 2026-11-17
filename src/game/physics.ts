import { BASE_WALL_BOUNCES, BRICK_H, BRICK_W, CANNON_Y, W } from "./const.ts";

/** Ceiling just above the playfield where launched balls bounce. */
export const CEILING = 8;

export interface BallBody {
  x: number;
  y: number;
  vx: number;
  vy: number;
  speed: number;
  /** Ball radius (grows with the 巨大珠 upgrade). */
  r: number;
  /** Remaining pierce charges for the current volley. */
  pierce: number;
  /** Remaining floor-bounce charges (balls fly back up instead of being collected). */
  rebound: number;
  /** Brick impacts this ball still survives (durability). */
  bounces: number;
  /** Wall/ceiling reflections left before it dissolves. */
  wallBounces: number;
  /** Brick durability this ball started with. */
  bouncesMax: number;
  /** Brick hits landed by this ball (drives bounce-scaling damage). */
  hits: number;
  /** Bricks this ball has passed through (drives the pierce damage falloff). */
  pierced: number;
  /** Brick the ball is currently passing through (piercing); suppresses re-hits. */
  lastBrickId: number | null;
  /** Renderer-only trail buffer of recent positions. */
  trail: Array<{ x: number; y: number }>;
  alive: boolean;
}

export interface BrickBody {
  id: number;
  col: number;
  row: number;
  /** Top-left corner in world coordinates (tower offset already applied). */
  x: number;
  y: number;
  w: number;
  h: number;
  hp: number;
  maxHp: number;
  alive: boolean;
}

export type StepEvent<T extends BrickBody = BrickBody> =
  | { type: "wall"; ball: BallBody; x: number; y: number }
  | { type: "hit"; ball: BallBody; brick: T; x: number; y: number; bounced: boolean }
  | { type: "rebound"; ball: BallBody; x: number; y: number }
  | { type: "fizzle"; ball: BallBody; x: number; y: number }
  | { type: "collect"; ball: BallBody };

export interface WorldBounds {
  left: number;
  right: number;
  ceiling: number;
  /** Balls moving down past this line are collected (or rebound once). */
  collectY: number;
}

export function makeWorld(): WorldBounds {
  return { left: 10, right: W - 10, ceiling: CEILING, collectY: CANNON_Y + 10 };
}

/** Circle vs AABB resolution axis, returned as "x" or "y". */
function resolveAxis(ball: BallBody, brick: BrickBody, yOffset = 0): "x" | "y" {
  const cx = brick.x + brick.w / 2;
  const cy = brick.y + yOffset + brick.h / 2;
  const halfW = brick.w / 2 + ball.r;
  const halfH = brick.h / 2 + ball.r;
  const overlapX = halfW - Math.abs(ball.x - cx);
  const overlapY = halfH - Math.abs(ball.y - cy);
  return overlapX < overlapY ? "x" : "y";
}

export const DEFAULT_BALL_R = 5;

/** Launch a ball from the cannon at the given angle (radians, 0 = straight up). */
export function launchBall(
  x: number,
  y: number,
  angle: number,
  speed: number,
  pierce: number,
  rebound: number,
  r: number = DEFAULT_BALL_R,
  bounces = 3
): BallBody {
  return {
    x,
    y,
    vx: Math.sin(angle) * speed,
    vy: -Math.cos(angle) * speed,
    speed,
    r,
    pierce,
    rebound,
    bounces,
    wallBounces: BASE_WALL_BOUNCES,
    bouncesMax: bounces,
    hits: 0,
    pierced: 0,
    lastBrickId: null,
    trail: [],
    alive: true,
  };
}

/** Spend durability on a brick impact; false = the ball is spent. */
function spendDurability(ball: BallBody): boolean {
  ball.bounces -= 1;
  return ball.bounces > 0;
}

/** Spend one wall/ceiling reflection; false = the ball is spent. */
function spendReflection(ball: BallBody): boolean {
  ball.wallBounces -= 1;
  return ball.wallBounces >= 0;
}

/**
 * Advance one ball by dt and resolve collisions against walls and bricks.
 * Bricks are positioned at their base y plus `yOffset` (tower descent).
 * Returns the events produced this step (at most one brick hit per step).
 */
export function stepBall<T extends BrickBody>(
  ball: BallBody,
  dt: number,
  bricks: T[],
  world: WorldBounds,
  yOffset = 0
): StepEvent<T>[] {
  const events: StepEvent<T>[] = [];
  if (!ball.alive) return events;

  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;

  // Side walls.
  if (ball.x - ball.r < world.left) {
    ball.x = world.left + ball.r;
    ball.vx = Math.abs(ball.vx);
    if (!spendReflection(ball)) {
      ball.alive = false;
      events.push({ type: "fizzle", ball, x: ball.x, y: ball.y });
      return events;
    }
    events.push({ type: "wall", ball, x: ball.x, y: ball.y });
  } else if (ball.x + ball.r > world.right) {
    ball.x = world.right - ball.r;
    ball.vx = -Math.abs(ball.vx);
    if (!spendReflection(ball)) {
      ball.alive = false;
      events.push({ type: "fizzle", ball, x: ball.x, y: ball.y });
      return events;
    }
    events.push({ type: "wall", ball, x: ball.x, y: ball.y });
  }
  // Ceiling.
  if (ball.y - ball.r < world.ceiling) {
    ball.y = world.ceiling + ball.r;
    ball.vy = Math.abs(ball.vy);
    if (!spendReflection(ball)) {
      ball.alive = false;
      events.push({ type: "fizzle", ball, x: ball.x, y: ball.y });
      return events;
    }
    events.push({ type: "wall", ball, x: ball.x, y: ball.y });
  }

  // Brick collisions: at most one contact episode per brick.
  let collided: T | null = null;
  let axis: "x" | "y" = "y";
  for (const brick of bricks) {
    if (!brick.alive) continue;
    const cx = brick.x + brick.w / 2;
    const cy = brick.y + yOffset + brick.h / 2;
    const halfW = brick.w / 2 + ball.r;
    const halfH = brick.h / 2 + ball.r;
    if (Math.abs(ball.x - cx) >= halfW || Math.abs(ball.y - cy) >= halfH) {
      continue;
    }
    collided = brick;
    axis = resolveAxis(ball, brick, yOffset);
    break;
  }
  if (!collided) {
    ball.lastBrickId = null;
  } else if (ball.lastBrickId !== collided.id) {
    const bounce = ball.pierce <= 0;
    if (bounce) {
      if (axis === "x") {
        const cxm = collided.x + collided.w / 2;
        const half = collided.w / 2 + ball.r;
        ball.vx = ball.x < cxm ? -Math.abs(ball.vx) : Math.abs(ball.vx);
        ball.x = ball.x < cxm ? cxm - half : cxm + half;
      } else {
        const cym = collided.y + yOffset + collided.h / 2;
        const half = collided.h / 2 + ball.r;
        ball.vy = ball.y < cym ? -Math.abs(ball.vy) : Math.abs(ball.vy);
        ball.y = ball.y < cym ? cym - half : cym + half;
      }
    } else {
      ball.pierce--;
    }
    if (!bounce) ball.pierced += 1;
    if (bounce) {
      // Durability 1 means the ball shatters on its very first brick.
      const survives = spendDurability(ball);
      ball.hits += 1;
      ball.lastBrickId = collided.id;
      events.push({
        type: "hit",
        ball,
        brick: collided,
        x: ball.x,
        y: ball.y,
        bounced: true,
      });
      if (!survives) {
        ball.alive = false;
        events.push({ type: "fizzle", ball, x: ball.x, y: ball.y });
        return events;
      }
      return events;
    }
    ball.hits += 1;
    ball.lastBrickId = collided.id;
    events.push({
      type: "hit",
      ball,
      brick: collided,
      x: ball.x,
      y: ball.y,
      bounced: bounce,
    });
  }

  // Collection or floor rebound at the cannon line.
  if (ball.vy > 0 && ball.y > world.collectY) {
    if (ball.rebound > 0) {
      ball.rebound--;
      ball.y = world.collectY;
      ball.vy = -Math.abs(ball.vy);
      events.push({ type: "rebound", ball, x: ball.x, y: ball.y });
    } else {
      ball.alive = false;
      events.push({ type: "collect", ball });
    }
  }
  return events;
}

/**
 * Advance every ball by a fixed dt and collect all events.
 * Balls are stepped in order; each gets at most one brick interaction per step.
 * `yOffset` positions the bricks (tower descent offset).
 */
export function stepWorld<T extends BrickBody>(
  balls: BallBody[],
  bricks: T[],
  dt: number,
  world: WorldBounds,
  yOffset = 0
): StepEvent<T>[] {
  const events: StepEvent<T>[] = [];
  for (const ball of balls) {
    if (!ball.alive) continue;
    events.push(...stepBall(ball, dt, bricks, world, yOffset));
  }
  return events;
}

/**
 * March a preview ray from the cannon for the aiming line: reflects off side
 * walls, stops at the first brick (positioned at base y + yOffset) or after
 * `maxLen` pixels.
 */
export function aimPreview(
  x: number,
  y: number,
  angle: number,
  bricks: BrickBody[],
  world: WorldBounds,
  maxLen = 460,
  yOffset = 0
): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = [{ x, y }];
  let px = x;
  let py = y;
  let dx = Math.sin(angle);
  let dy = -Math.cos(angle);
  const step = 6;
  let traveled = 0;
  let bounces = 0;
  while (traveled < maxLen && bounces <= 2) {
    px += dx * step;
    py += dy * step;
    traveled += step;
    if (px - DEFAULT_BALL_R < world.left) {
      px = world.left + DEFAULT_BALL_R;
      dx = Math.abs(dx);
      bounces++;
    } else if (px + DEFAULT_BALL_R > world.right) {
      px = world.right - DEFAULT_BALL_R;
      dx = -Math.abs(dx);
      bounces++;
    }
    if (py - DEFAULT_BALL_R < world.ceiling) {
      py = world.ceiling + DEFAULT_BALL_R;
      dy = Math.abs(dy);
      bounces++;
    }
    let hit = false;
    for (const brick of bricks) {
      if (!brick.alive) continue;
      const by = brick.y + yOffset;
      if (
        px > brick.x - DEFAULT_BALL_R &&
        px < brick.x + brick.w + DEFAULT_BALL_R &&
        py > by - DEFAULT_BALL_R &&
        py < by + brick.h + DEFAULT_BALL_R
      ) {
        hit = true;
        break;
      }
    }
    points.push({ x: px, y: py });
    if (hit) break;
  }
  return points;
}

/** Widest legal aim angle from vertical (radians), keeps shots inside the walls. */
export const MAX_AIM_ANGLE = 1.35;

export function clampAim(angle: number): number {
  return Math.max(-MAX_AIM_ANGLE, Math.min(MAX_AIM_ANGLE, angle));
}
