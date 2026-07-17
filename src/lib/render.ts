import {
  COLORS,
  ENDZONE_DEPTH,
  FIELD_LENGTH,
  FIELD_WIDTH,
  HASH_Y_BOTTOM,
  HASH_Y_TOP,
  NEUTRAL_ZONE_DEPTH,
  PLAYER_RADIUS,
  ROUTE_HANDLE_GAP,
  yardNumberAt,
  type View,
} from "./field";
import { zoneAssignments } from "./formations";
import { toQuadSegments } from "./geometry";
import type { BallState, PassTarget, PlayState, Point, SimState, ZoneAssignment } from "./types";

type Ctx = CanvasRenderingContext2D;

/**
 * A small tiling canvas of flat speckles. This gives the turf visible texture
 * without reaching for a gradient, which the design rules forbid.
 */
let grassPattern: CanvasPattern | null = null;

function getGrassPattern(ctx: Ctx): CanvasPattern | null {
  if (grassPattern) return grassPattern;

  const tile = document.createElement("canvas");
  tile.width = 48;
  tile.height = 48;
  const tctx = tile.getContext("2d");
  if (!tctx) return null;

  tctx.fillStyle = COLORS.grass;
  tctx.fillRect(0, 0, 48, 48);

  // Deterministic speckle so the turf does not shimmer between frames.
  let seed = 1337;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  for (let i = 0; i < 260; i++) {
    const light = rand() > 0.5;
    tctx.fillStyle = light ? "rgba(255,255,255,0.035)" : "rgba(0,0,0,0.055)";
    tctx.fillRect(Math.floor(rand() * 48), Math.floor(rand() * 48), 1, rand() > 0.7 ? 2 : 1);
  }

  grassPattern = ctx.createPattern(tile, "repeat");
  return grassPattern;
}

function line(ctx: Ctx, v: View, x1: number, y1: number, x2: number, y2: number, width: number, color: string) {
  ctx.beginPath();
  ctx.moveTo(x1 * v.scale, y1 * v.scale);
  ctx.lineTo(x2 * v.scale, y2 * v.scale);
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.stroke();
}

export interface FieldOptions {
  /**
   * Turf speckle. Worth it on screen; switched off for GIF export, where
   * per-pixel noise is close to worst case for LZW and burns through the
   * 256-colour palette, for texture that is invisible at export size.
   */
  texture?: boolean;
}

export function drawField(ctx: Ctx, v: View, opts: FieldOptions = {}) {
  const { texture = true } = opts;

  ctx.fillStyle = COLORS.grass;
  ctx.fillRect(0, 0, v.width, v.height);

  const pattern = texture ? getGrassPattern(ctx) : null;
  if (pattern) {
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, v.width, v.height);
  }

  // Mown stripes every 5 yards.
  for (let x = 0; x < FIELD_LENGTH; x += 5) {
    if ((x / 5) % 2 === 0) continue;
    ctx.fillStyle = "rgba(255,255,255,0.022)";
    ctx.fillRect(x * v.scale, 0, 5 * v.scale, v.height);
  }

  // Endzones sit a shade darker than the field of play.
  ctx.fillStyle = COLORS.endzone;
  ctx.fillRect(0, 0, ENDZONE_DEPTH * v.scale, v.height);
  ctx.fillRect((FIELD_LENGTH - ENDZONE_DEPTH) * v.scale, 0, ENDZONE_DEPTH * v.scale, v.height);

  ctx.save();
  ctx.globalAlpha = 0.9;

  // Yard lines every 5 yards; every 10 gets a heavier stroke.
  for (let x = ENDZONE_DEPTH; x <= FIELD_LENGTH - ENDZONE_DEPTH; x += 5) {
    const major = (x - ENDZONE_DEPTH) % 10 === 0;
    line(ctx, v, x, 0, x, FIELD_WIDTH, major ? 1.6 : 1, major ? COLORS.line : COLORS.lineSoft);
  }

  // Hash marks: one-yard ticks along both hash lines.
  for (let x = ENDZONE_DEPTH + 1; x < FIELD_LENGTH - ENDZONE_DEPTH; x += 1) {
    if ((x - ENDZONE_DEPTH) % 5 === 0) continue;
    for (const y of [HASH_Y_TOP, HASH_Y_BOTTOM]) {
      line(ctx, v, x, y - 0.35, x, y + 0.35, 1, COLORS.lineSoft);
    }
  }

  ctx.restore();

  // Yard numbers, drawn upright for legibility in a tactical view.
  ctx.fillStyle = COLORS.line;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const numberSize = Math.max(9, 2.1 * v.scale);
  ctx.font = `600 ${numberSize}px ui-sans-serif, system-ui, sans-serif`;
  ctx.globalAlpha = 0.75;
  for (let x = ENDZONE_DEPTH + 10; x <= FIELD_LENGTH - ENDZONE_DEPTH - 10; x += 10) {
    const n = yardNumberAt(x);
    if (n === null || n === 0) continue;
    ctx.fillText(String(n), x * v.scale, 7 * v.scale);
    ctx.fillText(String(n), x * v.scale, (FIELD_WIDTH - 7) * v.scale);
  }
  ctx.globalAlpha = 1;

  // Endzone wordmarks, rotated to read from the back of each endzone.
  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.font = `700 ${Math.max(10, 2.6 * v.scale)}px ui-sans-serif, system-ui, sans-serif`;
  ctx.fillStyle = COLORS.line;

  ctx.translate(5 * v.scale, (FIELD_WIDTH / 2) * v.scale);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("END ZONE", 0, 0);
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.font = `700 ${Math.max(10, 2.6 * v.scale)}px ui-sans-serif, system-ui, sans-serif`;
  ctx.fillStyle = COLORS.line;
  ctx.translate((FIELD_LENGTH - 5) * v.scale, (FIELD_WIDTH / 2) * v.scale);
  ctx.rotate(Math.PI / 2);
  ctx.fillText("END ZONE", 0, 0);
  ctx.restore();

  // Sidelines and goal lines.
  ctx.globalAlpha = 1;
  line(ctx, v, ENDZONE_DEPTH, 0, ENDZONE_DEPTH, FIELD_WIDTH, 2.2, COLORS.line);
  line(ctx, v, FIELD_LENGTH - ENDZONE_DEPTH, 0, FIELD_LENGTH - ENDZONE_DEPTH, FIELD_WIDTH, 2.2, COLORS.line);

  // The line of scrimmage is deliberately NOT drawn here: this canvas is cached
  // and only rebuilt on resize, and the line is draggable. It is stroked live
  // in `drawScrimmage` instead.
}

/**
 * The line of scrimmage and its neutral zone.
 *
 * Note on orientation: the field runs along +x, so the line of scrimmage is
 * vertical on screen and constrains each player's *x*, not their y.
 */
export function drawScrimmage(ctx: Ctx, v: View, losX: number, active: boolean) {
  const half = NEUTRAL_ZONE_DEPTH / 2;

  // Neutral zone: a flat translucent band, no gradient.
  ctx.save();
  ctx.fillStyle = "rgba(96,165,250,0.16)";
  ctx.fillRect((losX - half) * v.scale, 0, NEUTRAL_ZONE_DEPTH * v.scale, FIELD_WIDTH * v.scale);

  // Its edges are the actual hard boundaries, so they get drawn.
  ctx.globalAlpha = 0.5;
  line(ctx, v, losX - half, 0, losX - half, FIELD_WIDTH, 1, COLORS.los);
  line(ctx, v, losX + half, 0, losX + half, FIELD_WIDTH, 1, COLORS.los);
  ctx.globalAlpha = 1;

  ctx.setLineDash([5, 4]);
  line(ctx, v, losX, 0, losX, FIELD_WIDTH, active ? 2.4 : 1.4, COLORS.los);
  ctx.restore();

  // Grips at both sidelines, marking the line as draggable.
  ctx.save();
  ctx.fillStyle = COLORS.los;
  const w = 0.55 * v.scale;
  const h = 1.6 * v.scale;
  ctx.fillRect(losX * v.scale - w / 2, 0, w, h);
  ctx.fillRect(losX * v.scale - w / 2, FIELD_WIDTH * v.scale - h, w, h);
  ctx.restore();
}

/** Traces a smoothed route into the current path without stroking it. */
function traceRoute(ctx: Ctx, v: View, points: Point[]) {
  const segments = toQuadSegments(points);
  if (segments.length === 0) return;

  ctx.beginPath();
  ctx.moveTo(segments[0].from.x * v.scale, segments[0].from.y * v.scale);
  for (const s of segments) {
    ctx.quadraticCurveTo(s.ctrl.x * v.scale, s.ctrl.y * v.scale, s.to.x * v.scale, s.to.y * v.scale);
  }
}

export function drawRoute(
  ctx: Ctx,
  v: View,
  points: Point[],
  color: string,
  dashed = true,
  highlighted = false
) {
  if (points.length < 2) return;

  // A route the Pass Target Tool is hovering gets a heavier, brighter stroke —
  // weight and colour carry the emphasis, not a blur.
  ctx.save();
  if (dashed) ctx.setLineDash([6, 5]);
  ctx.lineWidth = highlighted ? 3.5 : 2;
  ctx.strokeStyle = highlighted ? COLORS.passingLane : color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  traceRoute(ctx, v, points);
  ctx.stroke();
  ctx.restore();

  drawRouteCap(ctx, v, points, highlighted ? COLORS.passingLane : color);
}

/** A flat arrowhead marking which way the route runs. */
function drawRouteCap(ctx: Ctx, v: View, points: Point[], color: string) {
  const end = points[points.length - 1];
  const prev = points[points.length - 2];
  const angle = Math.atan2(end.y - prev.y, end.x - prev.x);
  const size = 0.9 * v.scale;

  ctx.save();
  ctx.translate(end.x * v.scale, end.y * v.scale);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(size, 0);
  ctx.lineTo(-size * 0.8, -size * 0.7);
  ctx.lineTo(-size * 0.8, size * 0.7);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

/**
 * Zone landmarks and their radii, so a Cover 2 / Cover 3 shell is legible
 * rather than implied. Kept solid-but-translucent — opacity, not blur.
 */
export function drawZones(ctx: Ctx, v: View, zones: Record<string, ZoneAssignment>) {
  ctx.save();
  for (const zone of Object.values(zones)) {
    const cx = zone.x * v.scale;
    const cy = zone.y * v.scale;
    const r = zone.radius * v.scale;

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(239,68,68,0.10)";
    ctx.fill();

    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(248,113,113,0.40)";
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
}

export function drawPassTarget(ctx: Ctx, v: View, target: PassTarget) {
  const cx = target.x * v.scale;
  const cy = target.y * v.scale;
  const r = 1.15 * v.scale;

  ctx.save();
  ctx.lineWidth = 2;
  ctx.strokeStyle = COLORS.target;

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();

  // Inner crosshair.
  ctx.beginPath();
  ctx.moveTo(cx - r * 1.5, cy);
  ctx.lineTo(cx - r * 0.35, cy);
  ctx.moveTo(cx + r * 0.35, cy);
  ctx.lineTo(cx + r * 1.5, cy);
  ctx.moveTo(cx, cy - r * 1.5);
  ctx.lineTo(cx, cy - r * 0.35);
  ctx.moveTo(cx, cy + r * 0.35);
  ctx.lineTo(cx, cy + r * 1.5);
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(1.5, r * 0.18), 0, Math.PI * 2);
  ctx.fillStyle = COLORS.target;
  ctx.fill();
  ctx.restore();
}

/** A small five-pointed star, used as the QB's badge. Fill only, no glow. */
function drawStar(ctx: Ctx, cx: number, cy: number, r: number, color: string) {
  const spikes = 5;
  const step = Math.PI / spikes;
  const inner = r * 0.45;

  ctx.save();
  ctx.beginPath();
  let rot = -Math.PI / 2;
  ctx.moveTo(cx + Math.cos(rot) * r, cy + Math.sin(rot) * r);
  for (let i = 0; i < spikes; i++) {
    rot += step;
    ctx.lineTo(cx + Math.cos(rot) * inner, cy + Math.sin(rot) * inner);
    rot += step;
    ctx.lineTo(cx + Math.cos(rot) * r, cy + Math.sin(rot) * r);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 0.75;
  ctx.strokeStyle = "#78350F";
  ctx.stroke();
  ctx.restore();
}

const QB_GOLD = "#EAB308";

export interface PlayerStyle {
  selected?: boolean;
  isQB?: boolean;
  /**
   * 0..1 boundary-violation flash. Rendered as a flat red ring at falling
   * opacity — the brief asked for a "red glow", but this project forbids
   * shadows and gradients outright, so the warning reads through colour and
   * weight instead.
   */
  warn?: number;
  /** Shown on a selected player in draw mode: the ring you pull a route from. */
  routeHandle?: boolean;
  /**
   * The Pass Target Tool is hovering this receiver, within snapping range.
   * Reads as a crisp outer ring plus a slight scale-up — weight and size, not
   * a glow, so it stays inside the project's flat-design rule.
   */
  snapHighlight?: boolean;
  /** A transient "shimmer" called out from the token's context menu. */
  shimmer?: number;
}

export function drawPlayer(
  ctx: Ctx,
  v: View,
  pos: Point,
  label: string,
  team: "offense" | "defense",
  style: PlayerStyle = {}
) {
  const {
    selected = false,
    isQB = false,
    warn = 0,
    routeHandle = false,
    snapHighlight = false,
    shimmer = 0,
  } = style;
  const cx = pos.x * v.scale;
  const cy = pos.y * v.scale;
  // A snap-eligible receiver scales up slightly under the Pass Target Tool —
  // real size change, not a shadow, so it stays inside the flat-design rule.
  const r = PLAYER_RADIUS * v.scale * (snapHighlight ? 1.14 : 1);

  ctx.save();

  if (shimmer > 0) {
    ctx.save();
    ctx.globalAlpha = 0.55 + 0.45 * Math.sin(shimmer * Math.PI * 2);
    ctx.beginPath();
    ctx.arc(cx, cy, r + 7, 0, Math.PI * 2);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = COLORS.passingLane;
    ctx.stroke();
    ctx.restore();
  }

  if (snapHighlight) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r + 5, 0, Math.PI * 2);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = COLORS.passingLane;
    ctx.stroke();
    ctx.restore();
  }

  if (warn > 0) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, warn);
    ctx.beginPath();
    ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
    ctx.lineWidth = 3;
    ctx.strokeStyle = COLORS.warning;
    ctx.stroke();
    ctx.restore();
  }

  // The only grab area that starts a route drag, so it is drawn as a real ring.
  if (routeHandle) {
    ctx.save();
    ctx.setLineDash([3, 3]);
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.arc(cx, cy, r + ROUTE_HANDLE_GAP * v.scale, 0, Math.PI * 2);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = COLORS.selected;
    ctx.stroke();
    ctx.restore();
  }

  // The QB is the anchor of the play, so it gets a second, outer gold ring —
  // set apart from the selection ring, which uses the same yellow family.
  if (isQB) {
    ctx.beginPath();
    ctx.arc(cx, cy, r + 5, 0, Math.PI * 2);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = QB_GOLD;
    ctx.stroke();
  }

  // Flat body with a crisp white ring. No shadow, no gradient.
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = team === "offense" ? COLORS.offense : COLORS.defense;
  ctx.fill();
  ctx.lineWidth = isQB ? 2.5 : 2;
  ctx.strokeStyle = isQB ? QB_GOLD : COLORS.nodeBorder;
  ctx.stroke();

  if (selected) {
    ctx.beginPath();
    ctx.arc(cx, cy, r + (isQB ? 8.5 : 3.5), 0, Math.PI * 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = COLORS.selected;
    ctx.stroke();
  }

  // Shrink the label until it fits inside the node.
  ctx.fillStyle = "#FFFFFF";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let size = r * 0.92;
  ctx.font = `${isQB ? 800 : 700} ${size}px ui-sans-serif, system-ui, sans-serif`;
  const maxWidth = r * 1.7;
  if (ctx.measureText(label).width > maxWidth) {
    size *= maxWidth / ctx.measureText(label).width;
    ctx.font = `${isQB ? 800 : 700} ${size}px ui-sans-serif, system-ui, sans-serif`;
  }
  ctx.fillText(label, cx, cy);

  if (isQB) drawStar(ctx, cx + r * 0.85, cy - r * 0.85, r * 0.36, QB_GOLD);

  ctx.restore();
}

export function drawBall(ctx: Ctx, v: View, ball: BallState) {
  const cx = ball.x * v.scale;
  const cy = ball.y * v.scale;

  // Flat ground marker so the ball's position stays readable at altitude.
  ctx.save();
  ctx.globalAlpha = 0.3;
  ctx.beginPath();
  ctx.ellipse(cx, cy, 0.5 * v.scale, 0.3 * v.scale, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#000000";
  ctx.fill();
  ctx.restore();

  // Height reads as scale: the ball grows as it climbs.
  const lift = 1 + ball.z * 0.14;
  const rx = 0.62 * v.scale * lift;
  const ry = 0.38 * v.scale * lift;
  const angle = Math.atan2(ball.to.y - ball.from.y, ball.to.x - ball.from.x);
  const drawY = cy - ball.z * 0.55 * v.scale;

  ctx.save();
  ctx.translate(cx, drawY);
  ctx.rotate(angle);

  // Two arcs meeting at points give the football silhouette.
  ctx.beginPath();
  ctx.moveTo(-rx, 0);
  ctx.quadraticCurveTo(0, -ry * 1.6, rx, 0);
  ctx.quadraticCurveTo(0, ry * 1.6, -rx, 0);
  ctx.closePath();
  ctx.fillStyle = COLORS.ball;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#F8FAFC";
  ctx.stroke();

  // Laces.
  ctx.beginPath();
  ctx.moveTo(-rx * 0.3, 0);
  ctx.lineTo(rx * 0.3, 0);
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#F8FAFC";
  ctx.stroke();

  ctx.restore();
}

export function drawBanner(ctx: Ctx, v: View, text: string) {
  ctx.save();
  ctx.font = `700 ${Math.max(12, 2.2 * v.scale)}px ui-sans-serif, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const padX = 16;
  const w = ctx.measureText(text).width + padX * 2;
  const h = Math.max(26, 3.4 * v.scale);
  const x = v.width / 2 - w / 2;
  const y = 10;

  ctx.fillStyle = "#0F172A";
  ctx.fillRect(x, y, w, h);
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#1F2937";
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

  ctx.fillStyle =
    text === "Intercepted!"
      ? "#F87171"
      : text === "Pass Completed!"
        ? "#4ADE80"
        : text === "Pass Deflected!"
          ? COLORS.deflected
          : "#E5E7EB";
  ctx.fillText(text, v.width / 2, y + h / 2);
  ctx.restore();
}

/**
 * The passing lane: a bright dashed vector from the quarterback to a placed
 * pass target, so its geometry can be inspected before the play is run. Kept
 * visually distinct from the route palette (bright sky blue vs. off-white
 * routes and the gold selection ring) so it always reads as "where the ball
 * is going to go", not another route.
 */
export function drawPassingLane(ctx: Ctx, v: View, from: Point, to: Point, dashOffset: number) {
  ctx.save();
  ctx.setLineDash([9, 6]);
  ctx.lineDashOffset = -dashOffset;
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = COLORS.passingLane;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(from.x * v.scale, from.y * v.scale);
  ctx.lineTo(to.x * v.scale, to.y * v.scale);
  ctx.stroke();
  ctx.restore();
}

/**
 * A flat scrim over the field while the Pass Target Tool is active, so the
 * placement crosshair and the eligible receivers pop against a quieted
 * background. Solid opacity, no blur — consistent with the rest of the
 * project's flat-design rule.
 */
export function drawPlacementDim(ctx: Ctx, v: View) {
  ctx.save();
  ctx.fillStyle = "rgba(2,6,23,0.38)";
  ctx.fillRect(0, 0, v.width, v.height);
  ctx.restore();
}

/**
 * Thin dashed lines from the QB to each active receiver's route start,
 * signalling that a click anywhere along those lines drops the pass target.
 * `dashOffset` marches the dashes to read as "live" while the QB is selected.
 */
export function drawQBThrowGuides(ctx: Ctx, v: View, qb: Point, starts: Point[], dashOffset: number) {
  ctx.save();
  ctx.setLineDash([5, 5]);
  ctx.lineDashOffset = -dashOffset;
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(249,115,22,0.4)";
  for (const start of starts) {
    ctx.beginPath();
    ctx.moveTo(qb.x * v.scale, qb.y * v.scale);
    ctx.lineTo(start.x * v.scale, start.y * v.scale);
    ctx.stroke();
  }
  ctx.restore();
}

/** A faint orange "ghost" marker tracking the cursor near a valid route. */
export function drawGhostTarget(ctx: Ctx, v: View, point: Point) {
  ctx.save();
  ctx.globalAlpha = 0.45;
  ctx.beginPath();
  ctx.arc(point.x * v.scale, point.y * v.scale, 1.15 * v.scale, 0, Math.PI * 2);
  ctx.fillStyle = COLORS.target;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "#FFFFFF";
  ctx.stroke();
  ctx.restore();
}

/** Marching-dash state for the QB throw guides, only meaningful while the QB is selected. */
export interface QBGuideOptions {
  dashOffset: number;
  hoverTarget: Point | null;
}

/** State of the dedicated Pass Target Tool, while it is active. */
export interface PassPlacementOptions {
  /** Receiver id within snapping range of the cursor, if any. */
  snapReceiverId: string | null;
}

export interface SceneOptions {
  play: PlayState;
  /** Live positions during playback; when null, players sit at their alignment. */
  sim: SimState | null;
  selectedId: string | null;
  /** Additional ids dragged together as a group; drawn with the same ring as `selectedId`. */
  groupSelectedIds?: string[];
  /** In-progress route being drawn, rendered before it is committed. */
  draftRoute: Point[] | null;
  /** Present only while the QB is selected and the play is idle. */
  qbGuide?: QBGuideOptions | null;
  /** Present only while the dedicated Pass Target Tool is armed. */
  passPlacement?: PassPlacementOptions | null;
  /**
   * Marching-dash phase for the passing lane (QB to target). Shared with the
   * QB guide's animation loop — both are among this project's few deliberate
   * idle-animation exceptions — and left at 0 (a static dash) outside of it.
   */
  passLaneDashOffset?: number;
  /** True while the line of scrimmage is grabbed or hovered. */
  losActive?: boolean;
  /** True when a route drag is armed, which shows the route handles. */
  drawMode?: boolean;
  /** Player id -> 0..1 boundary-warning intensity. */
  warnings?: Record<string, number>;
  /** Player id -> shimmer phase (0..1, looping), from the context menu action. */
  shimmers?: Record<string, number>;
  /**
   * Purely visual formation transition: player id -> the position to draw them
   * at instead of their alignment. The authored state jumps immediately; only
   * the rendering eases, which keeps the simulation and this animation from
   * ever disagreeing about where a player actually is.
   */
  transition?: Record<string, Point> | null;
  /**
   * A pre-rendered field to blit instead of re-stroking every yard line and
   * hash mark. The field only changes when the view resizes, so callers that
   * animate should cache it.
   */
  background?: CanvasImageSource | null;
}

export function drawScene(ctx: Ctx, v: View, opts: SceneOptions) {
  const {
    play,
    sim,
    selectedId,
    groupSelectedIds,
    draftRoute,
    qbGuide,
    passPlacement,
    passLaneDashOffset = 0,
    losActive = false,
    drawMode = false,
    warnings,
    shimmers,
    transition,
    background,
  } = opts;

  if (background) ctx.drawImage(background, 0, 0, v.width, v.height);
  else drawField(ctx, v);

  drawScrimmage(ctx, v, play.losX, losActive);

  // Zone shells sit under everything else; man coverage has no landmarks.
  if (play.coverage !== "man") {
    drawZones(ctx, v, zoneAssignments(play.coverage, play.players, play.losX));
  }

  // The Pass Target Tool quiets the field so the crosshair and eligible
  // receivers read clearly; everything drawn after this remains full-bright.
  if (passPlacement) drawPlacementDim(ctx, v);

  /** Where a player is drawn: live sim position, else transition, else alignment. */
  const posOf = (p: PlayState["players"][number]): Point | null =>
    sim ? (sim.players[p.id] ?? null) : (transition?.[p.id] ?? { x: p.startX, y: p.startY });

  for (const [id, pts] of Object.entries(play.routes)) {
    if (!pts || pts.length < 2) continue;
    const isSnapTarget = passPlacement?.snapReceiverId === id;
    const isGroupSelected = id === selectedId || (groupSelectedIds?.includes(id) ?? false);
    drawRoute(
      ctx,
      v,
      pts,
      isGroupSelected ? COLORS.selected : COLORS.routeOffense,
      true,
      isSnapTarget
    );
  }

  if (draftRoute && draftRoute.length >= 2) {
    drawRoute(ctx, v, draftRoute, COLORS.selected);
  }

  if (qbGuide) {
    const qb = play.players.find((p) => p.id === "QB");
    if (qb) {
      const starts = Object.entries(play.routes)
        .filter(([id, pts]) => id !== "QB" && pts && pts.length >= 2)
        .map(([id]) => play.players.find((p) => p.id === id))
        .filter((p): p is NonNullable<typeof p> => Boolean(p))
        .map((p) => ({ x: p.startX, y: p.startY }));
      if (starts.length > 0) {
        drawQBThrowGuides(ctx, v, { x: qb.startX, y: qb.startY }, starts, qbGuide.dashOffset);
      }
    }
    if (qbGuide.hoverTarget) drawGhostTarget(ctx, v, qbGuide.hoverTarget);
  }

  if (play.passTarget) {
    const qb = play.players.find((p) => p.id === "QB");
    if (qb) {
      const qbPos = posOf(qb) ?? { x: qb.startX, y: qb.startY };
      drawPassingLane(ctx, v, qbPos, play.passTarget, passLaneDashOffset);
    }
    drawPassTarget(ctx, v, play.passTarget);
  }

  for (const p of play.players) {
    const pos = posOf(p);
    if (!pos) continue;
    const shimmer = shimmers?.[p.id];
    drawPlayer(ctx, v, pos, p.label, p.team, {
      selected: p.id === selectedId || (groupSelectedIds?.includes(p.id) ?? false),
      isQB: p.id === "QB",
      warn: warnings?.[p.id] ?? 0,
      // The handle only means anything on a selected player you can route.
      routeHandle: drawMode && !sim && p.id === selectedId && p.team === "offense",
      snapHighlight: passPlacement?.snapReceiverId === p.id,
      shimmer: shimmer ?? 0,
    });
  }

  if (sim?.ball) drawBall(ctx, v, sim.ball);
  if (sim?.outcome) drawBanner(ctx, v, sim.outcome);
}
