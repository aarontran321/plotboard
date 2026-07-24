import type { PassTarget, PlayState, Point } from "./types";

/** A single quadratic Bezier segment. */
export interface QuadSegment {
  from: Point;
  ctrl: Point;
  to: Point;
}

/**
 * Converts raw waypoints into a chain of quadratic Beziers that pass smoothly
 * through them. Each waypoint becomes a control point and the curve is stitched
 * together at waypoint midpoints, which keeps the joins tangent-continuous.
 *
 * This mirrors the canvas `quadraticCurveTo` drawing loop exactly, so the route
 * a receiver runs is the same curve the user sees drawn.
 */
export function toQuadSegments(points: Point[]): QuadSegment[] {
  const n = points.length;
  if (n < 2) return [];

  const segments: QuadSegment[] = [];
  let current = points[0];

  for (let i = 1; i < n - 2; i++) {
    const mid = {
      x: (points[i].x + points[i + 1].x) / 2,
      y: (points[i].y + points[i + 1].y) / 2,
    };
    segments.push({ from: current, ctrl: points[i], to: mid });
    current = mid;
  }

  segments.push({ from: current, ctrl: points[n - 2], to: points[n - 1] });
  return segments;
}

function quadAt(seg: QuadSegment, t: number): Point {
  const u = 1 - t;
  return {
    x: u * u * seg.from.x + 2 * u * t * seg.ctrl.x + t * t * seg.to.x,
    y: u * u * seg.from.y + 2 * u * t * seg.ctrl.y + t * t * seg.to.y,
  };
}

/**
 * A curve flattened to a dense polyline with cumulative arc lengths, which
 * turns "how far along is this receiver" into a cheap lookup.
 */
export interface FlatPath {
  pts: Point[];
  /** cum[i] is the arc length from the start of the path to pts[i]. */
  cum: number[];
  length: number;
}

const STEPS_PER_SEGMENT = 16;

export function flattenPath(points: Point[]): FlatPath {
  const segments = toQuadSegments(points);
  if (segments.length === 0) {
    const only = points[0] ?? { x: 0, y: 0 };
    return { pts: [only], cum: [0], length: 0 };
  }

  const pts: Point[] = [segments[0].from];
  for (const seg of segments) {
    for (let i = 1; i <= STEPS_PER_SEGMENT; i++) {
      pts.push(quadAt(seg, i / STEPS_PER_SEGMENT));
    }
  }

  const cum: number[] = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  }

  return { pts, cum, length: cum[cum.length - 1] };
}

/** Position at a given arc length along the path, clamped at both ends. */
export function pointAtDistance(path: FlatPath, d: number): Point {
  if (path.length === 0) return path.pts[0];
  if (d <= 0) return path.pts[0];
  if (d >= path.length) return path.pts[path.pts.length - 1];

  // Binary search for the segment containing `d`.
  let lo = 0;
  let hi = path.cum.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (path.cum[mid] <= d) lo = mid;
    else hi = mid;
  }

  const span = path.cum[hi] - path.cum[lo];
  const f = span === 0 ? 0 : (d - path.cum[lo]) / span;
  return {
    x: path.pts[lo].x + (path.pts[hi].x - path.pts[lo].x) * f,
    y: path.pts[lo].y + (path.pts[hi].y - path.pts[lo].y) * f,
  };
}

/** Position at normalized progress (0..1) along the path. */
export function pointAtT(path: FlatPath, t: number): Point {
  return pointAtDistance(path, t * path.length);
}

export interface NearestResult {
  point: Point;
  /** Normalized progress along the path. */
  t: number;
  /** Distance from the query point to the path. */
  distance: number;
}

/** Finds the closest point on the path to an arbitrary query point. */
export function nearestOnPath(path: FlatPath, q: Point): NearestResult {
  let best: NearestResult = {
    point: path.pts[0],
    t: 0,
    distance: Math.hypot(path.pts[0].x - q.x, path.pts[0].y - q.y),
  };
  if (path.pts.length < 2) return best;

  for (let i = 1; i < path.pts.length; i++) {
    const a = path.pts[i - 1];
    const b = path.pts[i];
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const lenSq = vx * vx + vy * vy;

    // Project q onto the segment, clamped to the segment's extent.
    const f = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((q.x - a.x) * vx + (q.y - a.y) * vy) / lenSq));
    const px = a.x + vx * f;
    const py = a.y + vy * f;
    const d = Math.hypot(px - q.x, py - q.y);

    if (d < best.distance) {
      const along = path.cum[i - 1] + Math.sqrt(lenSq) * f;
      best = {
        point: { x: px, y: py },
        t: path.length === 0 ? 0 : along / path.length,
        distance: d,
      };
    }
  }
  return best;
}

/**
 * The pass target planting the ball on a given receiver right now: 30% down
 * their route if one is drawn (the same depth `THROW_TRIGGER_T` and the
 * context menu's "Set as Primary Option" both use), or their current
 * alignment if it isn't — a hitch thrown right to where they're standing.
 * Shared by every "aim the QB at this player" entry point (the context
 * menu, the sidebar's Pass Target list) so they can't drift apart.
 */
export function primaryTargetFor(play: PlayState, receiverId: string): PassTarget {
  const route = play.routes[receiverId];
  if (route && route.length >= 2) {
    const pt = pointAtT(flattenPath(route), 0.3);
    return { x: pt.x, y: pt.y, receiverId, t: 0.3 };
  }
  const p = play.players.find((pp) => pp.id === receiverId)!;
  return { x: p.startX, y: p.startY, receiverId, t: 0 };
}

/**
 * Moves a point toward a target by at most `maxDist`, returning the new
 * position. Used for every pursuit step in the defensive AI.
 */
export function moveToward(from: Point, to: Point, maxDist: number): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const d = Math.hypot(dx, dy);
  if (d <= maxDist || d === 0) return { x: to.x, y: to.y };
  return { x: from.x + (dx / d) * maxDist, y: from.y + (dy / d) * maxDist };
}
