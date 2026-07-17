/**
 * Field geometry. The simulation works entirely in "world" units of yards with
 * the origin at the back-left corner of the left endzone. The offense always
 * attacks toward +x. Rendering scales world yards to screen pixels.
 */

/** 100 yards of play plus two 10-yard endzones. */
export const FIELD_LENGTH = 120;

/** Regulation width: 160 feet. */
export const FIELD_WIDTH = 160 / 3;

export const ENDZONE_DEPTH = 10;

export const FIELD_CENTER_Y = FIELD_WIDTH / 2;

/** Line of scrimmage, in world x. Sits on the offense's own 35. */
export const LOS_X = 45;

/** NFL hash marks are 70 feet 9 inches from each sideline. */
export const HASH_INSET = (70 + 9 / 12) / 3;
export const HASH_Y_TOP = HASH_INSET;
export const HASH_Y_BOTTOM = FIELD_WIDTH - HASH_INSET;

export const PLAYER_RADIUS = 1.4;

/** How close a click must be to count as grabbing a player. */
export const PLAYER_HIT_RADIUS = 1.9;

/** How close a click must be to a route to drop a pass target on it. */
export const ROUTE_HIT_RADIUS = 2.5;

/** A player must be within this of the landing spot to make a play on the ball. */
export const CATCH_RADIUS = 2.2;

export const COLORS = {
  grass: "#14532D",
  grassStripe: "#12492A",
  endzone: "#0F3D22",
  line: "#F8FAFC",
  lineSoft: "#CBD5E1",
  offense: "#2563EB",
  defense: "#DC2626",
  nodeBorder: "#FFFFFF",
  selected: "#FACC15",
  target: "#F97316",
  ball: "#8B4513",
  los: "#60A5FA",
  routeOffense: "#E2E8F0",
} as const;

/** Maps world yards to screen pixels for a canvas of a given CSS width. */
export interface View {
  scale: number;
  width: number;
  height: number;
}

export function makeView(cssWidth: number): View {
  const scale = cssWidth / FIELD_LENGTH;
  return { scale, width: cssWidth, height: FIELD_WIDTH * scale };
}

export function toScreen(view: View, x: number, y: number) {
  return { x: x * view.scale, y: y * view.scale };
}

export function toWorld(view: View, sx: number, sy: number) {
  return { x: sx / view.scale, y: sy / view.scale };
}

export function clampToField(x: number, y: number) {
  return {
    x: Math.max(0, Math.min(FIELD_LENGTH, x)),
    y: Math.max(0, Math.min(FIELD_WIDTH, y)),
  };
}

export function dist(ax: number, ay: number, bx: number, by: number) {
  return Math.hypot(ax - bx, ay - by);
}

/**
 * Yard-line number as painted on the field. Counts up to 50 at midfield and
 * back down, and returns null inside the endzones.
 */
export function yardNumberAt(x: number): number | null {
  const fromGoal = x - ENDZONE_DEPTH;
  if (fromGoal < 0 || fromGoal > 100) return null;
  return fromGoal <= 50 ? fromGoal : 100 - fromGoal;
}
