/** Logical playfield size; canvas is scaled to fit the container. */
export const W = 400;
export const H = 660;

/** Side wall thickness (also the ball bounce bounds). */
export const WALL = 10;

/** Brick grid geometry. */
export const COLS = 7;
export const BRICK_W = 50;
export const BRICK_H = 26;
export const ROW_GAP = 6;
export const GRID_LEFT = (W - COLS * BRICK_W) / 2;

/** First tower row spawns at this y (below the HUD). */
export const TOWER_TOP = 56;

/** Cannon baseline: balls are collected when falling past it, bricks kill when reaching it. */
export const CANNON_Y = H - 44;

/** Ball launch stream. */
export const BALL_R = 5;
/**
 * Bounces a ball survives before it dissolves (walls, ceiling and bricks).
 * One by default: a volley resolves quickly instead of waiting for balls to
 * fall back, and durability becomes a real upgrade lane.
 */
export const BASE_BOUNCES = 1;
/**
 * Reflections off walls/ceiling a ball gets before it dissolves. Kept separate
 * from durability so a missed shot still resolves quickly instead of ping-ponging.
 */
export const BASE_WALL_BOUNCES = 2;
/** Extra aim spread between lanes of a split shot (radians). */
export const LANE_SPREAD = 0.17;
export const BALL_SPEED = 430;
export const LAUNCH_INTERVAL_MS = 26;

/** Fixed physics timestep (s). */
export const PHYSICS_DT = 1 / 120;
export const MAX_FRAME_DT = 0.1;

/** Tower descend speed (px/s) grows with the tower index. */
export const DESCEND_BASE = 5;
export const DESCEND_PER_TOWER = 0.8;
export const DESCEND_MAX = 18;

/** Brick hp scales exponentially per tower index. */
export const HP_BASE = 8;
export const HP_PER_TOWER = 1.15;

/** Base damage per ball hit. */
export const BASE_DAMAGE = 4;

/** Rows per tower grows with the index; boss towers replace the top row with a core. */
export const ROWS_BASE = 5;
export const ROWS_PER_TOWER = 0.7;
export const ROWS_MAX = 16;
export const BOSS_EVERY = 5;

/** Collapse animation length before the draft opens (s). */
export const COLLAPSE_TIME = 0.7;

/** Tower is pushed back up this many row pitches when a shield absorbs the crush. */
export const SHIELD_PUSH_ROWS = 2.5;
/** 打穿一层 Boss 护甲时把楼推回的行数（给玩家的喘息窗口）。 */
export const ARMOR_PUSH_ROWS = 1.6;

/** Rows of safety margin above the cannon before the tower counts as crushing the player. */
export const CRUSH_MARGIN = 10;

/** Volley combo decays this many seconds after the last destruction. */
export const COMBO_WINDOW = 2.2;

export const BRICK_COLORS: Record<string, [string, string]> = {
  spam: ["#8a9099", "#5c626b"],
  gold: ["#e0b64c", "#a97f22"],
  flame: ["#e0604c", "#a32f22"],
  bomb: ["#e08a3c", "#a35a16"],
  steel: ["#9fb2c8", "#5e708a"],
  healer: ["#59b26a", "#2e7a3f"],
  mirror: ["#c9d6e4", "#7f93a8"],
  core: ["#b04cd0", "#6f1e8a"],
};
