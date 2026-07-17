export type Team = "offense" | "defense";

export type FormationId = "spread" | "i-formation" | "singleback" | "empty";

/** Defensive personnel and alignment. Orthogonal to `CoverageId`, which is behaviour. */
export type DefenseFormationId = "4-3" | "3-4" | "nickel" | "dime" | "5-2";

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
 * A pass target either sits on a receiver's route (`receiverId` set — `t` is
 * normalized progress along that route, which lets the simulation time the
 * throw so the ball and the receiver arrive together) or is a free-throw spot
 * in open space (`receiverId: null` — anticipating a vacancy rather than a
 * specific route). `t` is meaningless for a free throw and left at 0.
 */
export interface PassTarget {
  x: number;
  y: number;
  receiverId: string | null;
  t: number;
}

/**
 * A coaching note per player, keyed by id — e.g. "Execute a 12-yard slant to
 * draw the FS shallow." Metadata, not geometry: like `name`, it is excluded
 * from the undo/redo `Snapshot` (see `history.ts`), since re-typing a note is
 * not the kind of thing Ctrl+Z should undo mid-edit.
 */
export type Assignments = Record<string, string>;

/** Macro-level strategic context for the play call, not tied to any one player. */
export interface CallNotes {
  /** e.g. "3rd & Medium". */
  downDistance: string;
  /** e.g. "Exploits aggressive Cover 2". */
  counters: string;
  /** e.g. "Deep comeback is a low-percentage throw outside the numbers." */
  risks: string;
}

/**
 * The full authored state of a play. This is the unit that gets snapshotted
 * for undo/redo and serialized to the database.
 */
export interface PlayState {
  /**
   * The play's name. Empty means the user has not named it; a display name is
   * only materialised at the point it is needed (save, export, share) via
   * `resolvePlayName`, never during render — a timestamped default computed in
   * render would differ between server and client and break hydration.
   */
  name: string;
  formation: FormationId;
  defenseFormation: DefenseFormationId;
  coverage: CoverageId;
  /**
   * Line of scrimmage in world x. The offense aligns below it and attacks
   * toward +x. Draggable, so it lives in state rather than being the `LOS_X`
   * constant, which is now only the default.
   */
  losX: number;
  players: PlayerDef[];
  /** Player id -> ordered route waypoints in world yards. */
  routes: Record<string, Point[]>;
  passTarget: PassTarget | null;
  assignments: Assignments;
  callNotes: CallNotes;
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

export type Outcome = "Pass Completed!" | "Intercepted!" | "Incomplete Pass" | "Pass Deflected!";

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

/**
 * A milestone in the play's event feed, rendered as a message in the Play
 * Chat panel. `kind` drives the accent/label a caller draws; there is no
 * sack/tackle mechanic in this simulation (see `computePlayEvents` in
 * `simulation.ts`), so "interception" stands in for the defensive-stop
 * outcome rather than inventing a mechanic that doesn't run.
 */
export type PlayEventKind = "release" | "deflected" | "dead" | "interception";

export interface PlayEvent {
  kind: PlayEventKind;
  /** Seconds since the snap. */
  t: number;
  label: string;
  detail: string;
}
