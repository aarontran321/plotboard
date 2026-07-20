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

/**
 * Default line of scrimmage, in world x. Sits on the offense's own 35.
 *
 * This is only the starting value — the live line of scrimmage is `play.losX`,
 * which the user can drag. Anything that positions players relative to the line
 * must read the play, not this constant.
 */
export const LOS_X = 45;

/**
 * Depth of the neutral zone, in yards: the length of the ball, centred on the
 * line of scrimmage. Neither side may align inside it pre-snap.
 */
export const NEUTRAL_ZONE_DEPTH = 1;

/** How far the line of scrimmage may be dragged, leaving room for both sides. */
export const LOS_MIN_X = ENDZONE_DEPTH + 12;
export const LOS_MAX_X = FIELD_LENGTH - ENDZONE_DEPTH - 12;

/** How close a click must be to the line of scrimmage to grab it, in yards. */
export const LOS_HIT_RADIUS = 1.2;

/**
 * The x a player of `team` may not cross, given the line of scrimmage: the near
 * edge of the neutral zone on their own side.
 */
export function scrimmageLimit(team: "offense" | "defense", losX: number) {
  const half = NEUTRAL_ZONE_DEPTH / 2;
  return team === "offense" ? losX - half : losX + half;
}

/**
 * Clamps a player to the field and to their own side of the neutral zone.
 * Shared by the drag handler and the pre-snap alignment builder so that a
 * dragged player and a generated formation obey exactly the same rule.
 */
export function clampToSide(x: number, y: number, team: "offense" | "defense", losX: number) {
  const p = clampToField(x, y);
  const limit = scrimmageLimit(team, losX);
  return {
    x: team === "offense" ? Math.min(p.x, limit) : Math.max(p.x, limit),
    y: p.y,
  };
}

/** True when a point is on the wrong side of the neutral zone for `team`. */
export function violatesScrimmage(x: number, team: "offense" | "defense", losX: number) {
  const limit = scrimmageLimit(team, losX);
  return team === "offense" ? x > limit : x < limit;
}

/** NFL hash marks are 70 feet 9 inches from each sideline. */
export const HASH_INSET = (70 + 9 / 12) / 3;
export const HASH_Y_TOP = HASH_INSET;
export const HASH_Y_BOTTOM = FIELD_WIDTH - HASH_INSET;

export const PLAYER_RADIUS = 1.4;

/** How close a click must be to count as grabbing a player. */
export const PLAYER_HIT_RADIUS = 1.9;

/** How close a click must be to a route to drop a pass target on it. */
export const ROUTE_HIT_RADIUS = 2.5;

/**
 * Gap between a player's edge and their route handle ring, in yards. The ring
 * is the affordance shown in draw mode; `PLAYER_RADIUS + this` is its radius.
 */
export const ROUTE_HANDLE_GAP = 0.9;

/** A player must be within this of the landing spot to make a play on the ball. */
export const CATCH_RADIUS = 2.2;

/**
 * The realistic-turf palette. Player/route/UI accent colours are shared across
 * themes; only the field surface itself (grass, endzone, line colours) changes
 * for the chalkboard theme below, so tokens stay equally readable either way.
 */
export const COLORS = {
  grass: "#14532D",
  grassStripe: "#12492A",
  endzone: "#0F3D22",
  line: "#F8FAFC",
  lineSoft: "#CBD5E1",
  // Own team is blue, the opposing team red — applied to every player of that
  // side (skill and linemen alike), with linemen only a darker shade.
  offense: "#2563EB",
  offenseLight: "#93C5FD",
  offenseDark: "#1E3A8A",
  defense: "#DC2626",
  defenseLight: "#FCA5A5",
  defenseDark: "#7F1D1D",
  nodeBorder: "#FFFFFF",
  selected: "#FACC15",
  target: "#F97316",
  ball: "#5C3A21",
  los: "#60A5FA",
  routeOffense: "#E2E8F0",
  /** Boundary-violation feedback: a pulsing red glow ring. */
  warning: "#EF4444",
  /** The passing lane guide, once a target is placed — kept distinct from the
   *  gold selection ring and the orange target so the three never blend. */
  passingLane: "#38BDF8",
  deflected: "#FB923C",
  possession: "#FACC15",

  /** Endzone brackets: the "home" side (left) reads blue, the "visitor" side
   *  (right) gold, matching the two-tone scoreboard look. */
  bracketHome: "#38BDF8",
  bracketVisitor: "#FBBF24",
} as const;

/** A colour palette shaped like `COLORS`, widened to plain strings so a theme can override individual entries. */
export type Palette = Record<keyof typeof COLORS, string>;

/**
 * The "coach's chalkboard" theme: a slate/charcoal board with chalky
 * off-white lines instead of painted turf. Swapped in for `COLORS` only where
 * the field surface itself is drawn (`drawField`) — player tokens, routes and
 * UI accents are deliberately unchanged, so the same play reads identically
 * on either board.
 */
export const CHALK_COLORS: Palette = {
  ...COLORS,
  grass: "#1E2530",
  grassStripe: "#232B38",
  endzone: "#141A24",
  line: "#F1F5F9",
  lineSoft: "#8B97AC",
};

export type FieldTheme = "turf" | "chalkboard";

/**
 * Accent colour per `PlayEventKind`, shared by the Play Chat feed and the
 * playback deck's timeline markers so a moment reads the same colour no
 * matter which surface shows it. Kept theme-independent — event colour is a
 * semantic signal (release/turnover/stop), not a field-surface choice.
 */
export const EVENT_KIND_COLOR: Record<"release" | "deflected" | "interception" | "dead", string> = {
  release: "#F59E0B",
  deflected: "#38BDF8",
  interception: "#F43F5E",
  dead: "#94A3B8",
};

export function paletteForTheme(theme: FieldTheme): Palette {
  return theme === "chalkboard" ? CHALK_COLORS : COLORS;
}

/** How a token is drawn, keyed off role rather than team. */
export type TokenRole = "offense-skill" | "defense-skill" | "line";

/**
 * Interior linemen (the offensive centre and any defensive line) render as
 * quiet dark chips; every other player is a glowing skill token in their
 * side's colour. Classifying by id keeps this stable as personnel changes.
 */
export function tokenRole(id: string, team: "offense" | "defense"): TokenRole {
  if (team === "offense") return id === "C" ? "line" : "offense-skill";
  return id.startsWith("DL") ? "line" : "defense-skill";
}

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
