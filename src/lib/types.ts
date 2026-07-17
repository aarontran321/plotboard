export type Team = "offense" | "defense";

export type FormationId = "shotgun-spread" | "i-formation" | "singleback";

export type CoverageId = "man" | "cover-2" | "cover-3";

export type RoutePresetId = "slant" | "go" | "out" | "curl";

export interface Point {
  x: number;
  y: number;
}

/** A player's static definition plus its pre-snap alignment. */
export interface PlayerDef {
  id: string;
  team: Team;
  label: string;
  /** Pre-snap alignment in world yards. */
  startX: number;
  startY: number;
  /** Top speed in yards/second. */
  speed: number;
}

/** Where a defender lines up in a zone scheme, and how big the zone is. */
export interface ZoneAssignment {
  x: number;
  y: number;
  radius: number;
}

/**
 * A pass target sits on a receiver's route. `t` is normalized progress along
 * that route, which lets the simulation time the throw so the ball and the
 * receiver arrive together.
 */
export interface PassTarget {
  x: number;
  y: number;
  receiverId: string;
  t: number;
}

/**
 * The full authored state of a play. This is the unit that gets snapshotted
 * for undo/redo and serialized to the database.
 */
export interface PlayState {
  formation: FormationId;
  coverage: CoverageId;
  players: PlayerDef[];
  /** Player id -> ordered route waypoints in world yards. */
  routes: Record<string, Point[]>;
  passTarget: PassTarget | null;
}

export type BallPhase = "held" | "flight" | "landed";

export interface BallState {
  phase: BallPhase;
  x: number;
  y: number;
  /** Height above the field in yards; drives the parabolic arc. */
  z: number;
  from: Point;
  to: Point;
  /** Seconds elapsed since release. */
  elapsed: number;
  /** Total seconds the throw will take. */
  duration: number;
}

export type Outcome = "Pass Completed!" | "Intercepted!" | "Incomplete Pass";

/** Per-player mutable state during a simulation run. */
export interface PlayerSim {
  x: number;
  y: number;
  /** Distance travelled along the player's route so far, in yards. */
  dist: number;
  /** Recent position samples, newest last. Powers defensive tracking latency. */
  trail: { t: number; x: number; y: number }[];
}

export interface SimState {
  /** Seconds since the snap. */
  t: number;
  players: Record<string, PlayerSim>;
  ball: BallState | null;
  outcome: Outcome | null;
  /** Value of `t` when the ball came down, or null while it is still live. */
  landedAt: number | null;
  /** True once every scripted element of the play has resolved. */
  finished: boolean;
}
