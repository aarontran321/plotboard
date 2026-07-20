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
  dist,
  paletteForTheme,
  yardNumberAt,
  type FieldTheme,
  type Palette,
  type View,
} from "./field";
import { zoneAssignments } from "./formations";
import { toQuadSegments } from "./geometry";
import type { BallState, PassTarget, PlayState, Point, SimState, ZoneAssignment } from "./types";

type Ctx = CanvasRenderingContext2D;

/**
 * A small tiling canvas of speckles, giving the turf (or chalkboard dust)
 * visible texture. Cached per theme, since switching themes must not keep
 * yesterday's grass speckle baked into today's slate.
 */
const texturePatterns = new Map<FieldTheme, CanvasPattern | null>();

function getTexturePattern(ctx: Ctx, theme: FieldTheme): CanvasPattern | null {
  const cached = texturePatterns.get(theme);
  if (cached !== undefined) return cached;

  const palette = paletteForTheme(theme);
  const tile = document.createElement("canvas");
  tile.width = 48;
  tile.height = 48;
  const tctx = tile.getContext("2d");
  if (!tctx) return null;

  tctx.fillStyle = palette.grass;
  tctx.fillRect(0, 0, 48, 48);

  // Deterministic speckle so the texture does not shimmer between frames.
  let seed = 1337;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const lightFleck = theme === "chalkboard" ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.035)";
  const darkFleck = theme === "chalkboard" ? "rgba(0,0,0,0.12)" : "rgba(0,0,0,0.055)";
  for (let i = 0; i < 260; i++) {
    const light = rand() > 0.5;
    tctx.fillStyle = light ? lightFleck : darkFleck;
    tctx.fillRect(Math.floor(rand() * 48), Math.floor(rand() * 48), 1, rand() > 0.7 ? 2 : 1);
  }

  const pattern = ctx.createPattern(tile, "repeat");
  texturePatterns.set(theme, pattern);
  return pattern;
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
   * Surface speckle. Worth it on screen; switched off for GIF export, where
   * per-pixel noise is close to worst case for LZW and burns through the
   * 256-colour palette, for texture that is invisible at export size.
   */
  texture?: boolean;
  /** "turf" (default) is the realistic field; "chalkboard" is the coach's-board look. */
  theme?: FieldTheme;
}

/** Diagonal hash strokes filling an endzone rectangle, clipped to its bounds. */
function drawEndzoneHatch(ctx: Ctx, v: View, x0: number, width: number, palette: Palette) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0 * v.scale, 0, width * v.scale, v.height);
  ctx.clip();

  ctx.globalAlpha = 0.16;
  ctx.strokeStyle = palette.line;
  ctx.lineWidth = 1;
  const step = 2.2 * v.scale;
  const w = width * v.scale;
  const h = v.height;
  for (let offset = -h; offset < w + h; offset += step) {
    ctx.beginPath();
    ctx.moveTo(x0 * v.scale + offset, 0);
    ctx.lineTo(x0 * v.scale + offset - h, h);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawField(ctx: Ctx, v: View, opts: FieldOptions = {}) {
  const { texture = true, theme = "turf" } = opts;
  const palette = paletteForTheme(theme);

  ctx.fillStyle = palette.grass;
  ctx.fillRect(0, 0, v.width, v.height);

  const pattern = texture ? getTexturePattern(ctx, theme) : null;
  if (pattern) {
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, v.width, v.height);
  }

  // Mown stripes every 5 yards.
  for (let x = 0; x < FIELD_LENGTH; x += 5) {
    if ((x / 5) % 2 === 0) continue;
    ctx.fillStyle = theme === "chalkboard" ? "rgba(255,255,255,0.015)" : "rgba(255,255,255,0.022)";
    ctx.fillRect(x * v.scale, 0, 5 * v.scale, v.height);
  }

  // Endzones sit a shade darker than the field of play, with a diagonal hatch
  // so they read as a distinct zone rather than just a darker rectangle.
  ctx.fillStyle = palette.endzone;
  ctx.fillRect(0, 0, ENDZONE_DEPTH * v.scale, v.height);
  ctx.fillRect((FIELD_LENGTH - ENDZONE_DEPTH) * v.scale, 0, ENDZONE_DEPTH * v.scale, v.height);
  drawEndzoneHatch(ctx, v, 0, ENDZONE_DEPTH, palette);
  drawEndzoneHatch(ctx, v, FIELD_LENGTH - ENDZONE_DEPTH, ENDZONE_DEPTH, palette);

  ctx.save();
  ctx.globalAlpha = 0.9;

  // Yard lines every 5 yards; every 10 gets a heavier stroke.
  for (let x = ENDZONE_DEPTH; x <= FIELD_LENGTH - ENDZONE_DEPTH; x += 5) {
    const major = (x - ENDZONE_DEPTH) % 10 === 0;
    line(ctx, v, x, 0, x, FIELD_WIDTH, major ? 1.6 : 1, major ? palette.line : palette.lineSoft);
  }

  // Hash marks: one-yard ticks along both hash lines.
  for (let x = ENDZONE_DEPTH + 1; x < FIELD_LENGTH - ENDZONE_DEPTH; x += 1) {
    if ((x - ENDZONE_DEPTH) % 5 === 0) continue;
    for (const y of [HASH_Y_TOP, HASH_Y_BOTTOM]) {
      line(ctx, v, x, y - 0.35, x, y + 0.35, 1, palette.lineSoft);
    }
  }

  ctx.restore();

  // Yard numbers, drawn upright for legibility in a tactical view.
  ctx.fillStyle = palette.line;
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

  // Endzone wordmarks, rotated to read from the back of each endzone, with a
  // bold outlined treatment so they read as a distinct typographic texture.
  const drawWordmark = (x: number, rotate: number) => {
    ctx.save();
    ctx.font = `800 ${Math.max(10, 2.8 * v.scale)}px ui-sans-serif, system-ui, sans-serif`;
    ctx.translate(x * v.scale, (FIELD_WIDTH / 2) * v.scale);
    ctx.rotate(rotate);
    ctx.lineWidth = Math.max(1, 0.12 * v.scale);
    ctx.strokeStyle = palette.line;
    ctx.globalAlpha = 0.22;
    ctx.strokeText("END ZONE", 0, 0);
    ctx.fillStyle = palette.line;
    ctx.globalAlpha = 0.3;
    ctx.fillText("END ZONE", 0, 0);
    ctx.restore();
  };
  drawWordmark(5, -Math.PI / 2);
  drawWordmark(FIELD_LENGTH - 5, Math.PI / 2);

  // Sidelines and goal lines.
  ctx.globalAlpha = 1;
  line(ctx, v, ENDZONE_DEPTH, 0, ENDZONE_DEPTH, FIELD_WIDTH, 2.2, palette.line);
  line(ctx, v, FIELD_LENGTH - ENDZONE_DEPTH, 0, FIELD_LENGTH - ENDZONE_DEPTH, FIELD_WIDTH, 2.2, palette.line);

  // The line of scrimmage is deliberately NOT drawn here: this canvas is cached
  // and only rebuilt on resize (or a theme change), and the line is draggable.
  // It is stroked live in `drawScrimmage` instead.
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
  highlighted = false,
  /** Marching-ants phase, so the dash reads as travelling in the run direction. */
  dashOffset = 0
) {
  if (points.length < 2) return;

  // A route the Pass Target Tool is hovering gets a heavier, brighter stroke
  // plus a soft glow — weight, colour and blur all carry the emphasis.
  ctx.save();
  if (highlighted) {
    ctx.shadowColor = COLORS.passingLane;
    ctx.shadowBlur = 10;
  }
  if (dashed) {
    ctx.setLineDash([7, 6]);
    ctx.lineDashOffset = -dashOffset;
  }
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
  ctx.shadowColor = COLORS.target;
  ctx.shadowBlur = 10;
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
  /** 0..1 boundary-violation flash: a pulsing red glow ring at falling opacity. */
  warn?: number;
  /** Shown on a selected player in draw mode: the ring you pull a route from. */
  routeHandle?: boolean;
  /**
   * The Pass Target Tool is hovering this receiver, within snapping range.
   * Reads as a glowing outer ring plus a slight scale-up.
   */
  snapHighlight?: boolean;
  /** A transient "shimmer" called out from the token's context menu. */
  shimmer?: number;
  /** This token currently has the ball — draws a small badge above it. */
  hasBall?: boolean;
  /** The cursor is over this token — a distinguishing ring for dense clusters. */
  hovered?: boolean;
}

/** Hover ring colour — deliberately distinct from selection (gold), the
 *  passing lane / snap highlight (sky), and shimmer (also sky), so all four
 *  read as different signals when they overlap. */
const HOVER_COLOR = "#2DD4BF";

/** A small football badge marking whoever currently has the ball. */
function drawBallBadge(ctx: Ctx, cx: number, cy: number, r: number) {
  const bx = cx + r * 0.78;
  const by = cy - r * 1.05;
  const br = r * 0.42;

  ctx.save();
  ctx.shadowColor = "rgba(250,204,21,0.85)";
  ctx.shadowBlur = 6;
  ctx.beginPath();
  ctx.arc(bx, by, br + 2, 0, Math.PI * 2);
  ctx.fillStyle = "#0B0F19";
  ctx.fill();
  ctx.strokeStyle = COLORS.possession;
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.translate(bx, by);
  ctx.rotate(-Math.PI / 5);
  ctx.beginPath();
  ctx.moveTo(-br * 0.85, 0);
  ctx.quadraticCurveTo(0, -br * 1.3, br * 0.85, 0);
  ctx.quadraticCurveTo(0, br * 1.3, -br * 0.85, 0);
  ctx.closePath();
  ctx.fillStyle = COLORS.ball;
  ctx.fill();
  ctx.lineWidth = 0.8;
  ctx.strokeStyle = "#F8FAFC";
  ctx.stroke();
  ctx.restore();
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
    hasBall = false,
    hovered = false,
  } = style;
  const cx = pos.x * v.scale;
  const cy = pos.y * v.scale;
  // A snap-eligible receiver scales up slightly under the Pass Target Tool.
  const r = PLAYER_RADIUS * v.scale * (snapHighlight ? 1.14 : 1);

  ctx.save();

  if (hovered) {
    ctx.save();
    ctx.shadowColor = HOVER_COLOR;
    ctx.shadowBlur = 9;
    ctx.beginPath();
    ctx.arc(cx, cy, r + (selected ? 6.5 : 3), 0, Math.PI * 2);
    ctx.lineWidth = 1.75;
    ctx.strokeStyle = HOVER_COLOR;
    ctx.stroke();
    ctx.restore();
  }

  if (shimmer > 0) {
    ctx.save();
    ctx.globalAlpha = 0.55 + 0.45 * Math.sin(shimmer * Math.PI * 2);
    ctx.shadowColor = COLORS.passingLane;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 7, 0, Math.PI * 2);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = COLORS.passingLane;
    ctx.stroke();
    ctx.restore();
  }

  if (snapHighlight) {
    ctx.save();
    ctx.shadowColor = COLORS.passingLane;
    ctx.shadowBlur = 14;
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
    ctx.shadowColor = COLORS.warning;
    ctx.shadowBlur = 10;
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

  // Tactile whiteboard-piece body: a radial gradient reading as a rounded 3D
  // piece, plus a drop shadow so the token appears to sit above the field.
  const light = team === "offense" ? COLORS.offenseLight : COLORS.defenseLight;
  const base = team === "offense" ? COLORS.offense : COLORS.defense;
  const dark = team === "offense" ? COLORS.offenseDark : COLORS.defenseDark;
  const grad = ctx.createRadialGradient(
    cx - r * 0.35,
    cy - r * 0.4,
    r * 0.1,
    cx,
    cy,
    r * 1.15
  );
  grad.addColorStop(0, light);
  grad.addColorStop(0.55, base);
  grad.addColorStop(1, dark);

  // Drop shadow cast onto the turf, so the token reads as sitting physically
  // above the field rather than painted onto it.
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 4;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.restore();

  ctx.lineWidth = isQB ? 2.5 : 2;
  ctx.strokeStyle = isQB ? QB_GOLD : COLORS.nodeBorder;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();

  // A glossy top-left highlight arc, so the piece reads as rounded rather than flat.
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.beginPath();
  ctx.ellipse(cx - r * 0.32, cy - r * 0.4, r * 0.55, r * 0.32, -0.5, 0, Math.PI * 2);
  ctx.fillStyle = "#FFFFFF";
  ctx.fill();
  ctx.restore();

  // A single ring in the player's own team color, breathing in scale and
  // opacity — replaces the old dual yellow rings (selection + QB) which read
  // as one indicator when both applied to the same token.
  if (selected) {
    const teamColor = team === "offense" ? COLORS.offense : COLORS.defense;
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 260);
    ctx.save();
    ctx.globalAlpha = 0.55 + 0.35 * pulse;
    ctx.beginPath();
    ctx.arc(cx, cy, r + (isQB ? 8.5 : 3.5) + pulse * 1.5, 0, Math.PI * 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = teamColor;
    ctx.stroke();
    ctx.restore();
  }

  // Shrink the label until it fits inside the node.
  ctx.fillStyle = "#FFFFFF";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = 2;
  let size = r * 0.92;
  ctx.font = `${isQB ? 800 : 700} ${size}px ui-sans-serif, system-ui, sans-serif`;
  const maxWidth = r * 1.7;
  if (ctx.measureText(label).width > maxWidth) {
    size *= maxWidth / ctx.measureText(label).width;
    ctx.font = `${isQB ? 800 : 700} ${size}px ui-sans-serif, system-ui, sans-serif`;
  }
  ctx.fillText(label, cx, cy);

  if (isQB) drawStar(ctx, cx + r * 0.85, cy - r * 0.85, r * 0.36, QB_GOLD);
  if (hasBall) drawBallBadge(ctx, cx, cy, r);

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
  const rx = 0.95 * v.scale * lift;
  const ry = 0.58 * v.scale * lift;
  const angle = Math.atan2(ball.to.y - ball.from.y, ball.to.x - ball.from.x);
  const drawY = cy - ball.z * 0.55 * v.scale;

  ctx.save();
  ctx.translate(cx, drawY);
  ctx.rotate(angle);

  // Two arcs meeting at points give the football silhouette. Solid dark
  // brown, no outline — a flat, realistic leather colour rather than a
  // stroked cartoon shape.
  ctx.beginPath();
  ctx.moveTo(-rx, 0);
  ctx.quadraticCurveTo(0, -ry * 1.6, rx, 0);
  ctx.quadraticCurveTo(0, ry * 1.6, -rx, 0);
  ctx.closePath();
  ctx.fillStyle = COLORS.ball;
  ctx.fill();

  // Laces.
  ctx.beginPath();
  ctx.moveTo(-rx * 0.3, 0);
  ctx.lineTo(rx * 0.3, 0);
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#F8FAFC";
  ctx.stroke();

  ctx.restore();
}

/**
 * The "drop ripple" that fires the instant a player catches the ball (a
 * completion or an interception): a few concentric rings, staggered so they
 * read as radiating outward one after another, expanding and fading to
 * nothing — a raindrop hitting water, centred on the catch point.
 */
export function drawRipple(ctx: Ctx, v: View, point: Point, progress: number) {
  const cx = point.x * v.scale;
  const cy = point.y * v.scale;
  const maxRadius = 3.4 * v.scale;
  const ringCount = 3;

  ctx.save();
  for (let i = 0; i < ringCount; i++) {
    const delay = i * 0.18;
    const local = (progress - delay) / (1 - delay);
    if (local <= 0 || local > 1) continue;
    const radius = local * maxRadius;
    ctx.globalAlpha = (1 - local) * 0.7;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#E0F2FE";
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * The outcome banner — an impactful, glowing pill that pulses to make the
 * moment feel bigger than the flat text alone would. Reads `performance.now()`
 * directly for its pulse phase: this module already talks to the DOM (canvas
 * patterns), so there is no purity to protect by threading a clock through.
 */
export function drawBanner(ctx: Ctx, v: View, text: string) {
  const accent =
    text === "Intercepted!"
      ? "#F87171"
      : text === "Pass Completed!"
        ? "#4ADE80"
        : text === "Pass Deflected!"
          ? COLORS.deflected
          : "#E5E7EB";

  ctx.save();
  ctx.font = `800 ${Math.max(12, 2.2 * v.scale)}px ui-sans-serif, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const padX = 20;
  const w = ctx.measureText(text).width + padX * 2;
  const h = Math.max(30, 3.8 * v.scale);
  const x = v.width / 2 - w / 2;
  const y = 12;
  const radius = h / 2;
  const pulse = 0.6 + 0.4 * Math.sin(performance.now() / 260);

  const bg = ctx.createLinearGradient(x, y, x, y + h);
  bg.addColorStop(0, "#1E293B");
  bg.addColorStop(1, "#0B1120");

  ctx.save();
  ctx.shadowColor = accent;
  ctx.shadowBlur = 22 * pulse;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = accent;
  ctx.globalAlpha = 0.6 + 0.4 * pulse;
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = accent;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 8;
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
  ctx.shadowColor = COLORS.passingLane;
  ctx.shadowBlur = 8;
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

/** The drag-to-select marquee box: a translucent fill with a dashed outline. */
export function drawMarquee(ctx: Ctx, v: View, box: { x0: number; y0: number; x1: number; y1: number }) {
  const x = box.x0 * v.scale;
  const y = box.y0 * v.scale;
  const w = (box.x1 - box.x0) * v.scale;
  const h = (box.y1 - box.y0) * v.scale;

  ctx.save();
  ctx.fillStyle = "rgba(56,189,248,0.12)";
  ctx.fillRect(x, y, w, h);
  ctx.setLineDash([5, 4]);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = COLORS.passingLane;
  ctx.strokeRect(x, y, w, h);
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
  /** In-progress marquee selection box, in world coordinates. */
  marquee?: { x0: number; y0: number; x1: number; y1: number } | null;
  /** Present only while the QB is selected and the play is idle. */
  qbGuide?: QBGuideOptions | null;
  /** Present only while the dedicated Pass Target Tool is armed. */
  passPlacement?: PassPlacementOptions | null;
  /**
   * Marching-ants phase, applied to every dashed element (routes, the passing
   * lane, the QB throw guides) so the whole board reads as "live" rather than
   * just the narrow set of things that used to animate while idle.
   */
  dashOffset?: number;
  /** True while the line of scrimmage is grabbed or hovered. */
  losActive?: boolean;
  /** True when a route drag is armed, which shows the route handles. */
  drawMode?: boolean;
  /** Player id -> 0..1 boundary-warning intensity. */
  warnings?: Record<string, number>;
  /** Player id -> shimmer phase (0..1, looping), from the context menu action. */
  shimmers?: Record<string, number>;
  /** The token under the cursor, drawn last so it sits above any it overlaps. */
  hoveredId?: string | null;
  /**
   * Purely visual formation transition: player id -> the position to draw them
   * at instead of their alignment. The authored state jumps immediately; only
   * the rendering eases, which keeps the simulation and this animation from
   * ever disagreeing about where a player actually is.
   */
  transition?: Record<string, Point> | null;
  /**
   * A pre-rendered field to blit instead of re-stroking every yard line and
   * hash mark. The field only changes when the view resizes or the theme is
   * switched, so callers that animate should cache it (and rebuild it on
   * either of those changes).
   */
  background?: CanvasImageSource | null;
  /** "turf" (default) or "chalkboard" — only used as a fallback when `background` is absent. */
  theme?: FieldTheme;
  /** Present for a short window right after a catch (completed or intercepted):
   *  an expanding, fading ripple centred on the catch point. `progress` is 0..1. */
  ripple?: { x: number; y: number; progress: number } | null;
}

/**
 * Whoever currently has the ball: the QB before it's thrown, nobody while
 * it's in the air, and whoever it settled on (for a completion or a pick)
 * once it lands. Nobody carries it after an incompletion or a deflection —
 * it's just dead on the ground.
 */
function ballCarrierId(play: PlayState, sim: SimState | null): string | null {
  if (!sim) return null;
  if (!sim.ball) return "QB";
  if (sim.ball.phase !== "landed") return null;
  if (sim.outcome !== "Pass Completed!" && sim.outcome !== "Intercepted!") return null;

  let best: { id: string; d: number } | null = null;
  for (const p of play.players) {
    const ps = sim.players[p.id];
    const d = dist(ps.x, ps.y, sim.ball.to.x, sim.ball.to.y);
    if (!best || d < best.d) best = { id: p.id, d };
  }
  return best?.id ?? null;
}

export function drawScene(ctx: Ctx, v: View, opts: SceneOptions) {
  const {
    play,
    sim,
    selectedId,
    groupSelectedIds,
    draftRoute,
    marquee,
    qbGuide,
    passPlacement,
    dashOffset = 0,
    losActive = false,
    drawMode = false,
    warnings,
    shimmers,
    transition,
    background,
    theme = "turf",
    hoveredId,
    ripple,
  } = opts;

  if (background) ctx.drawImage(background, 0, 0, v.width, v.height);
  else drawField(ctx, v, { theme });

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

  // Route lines are static — no marching-ants dash animation — so each one
  // is drawn with a fixed dash offset regardless of the board's idle clock.
  for (const [id, pts] of Object.entries(play.routes)) {
    if (!pts || pts.length < 2) continue;
    const isSnapTarget = passPlacement?.snapReceiverId === id;
    const isGroupSelected = id === selectedId || (groupSelectedIds?.includes(id) ?? false);
    drawRoute(ctx, v, pts, isGroupSelected ? COLORS.selected : COLORS.routeOffense, true, isSnapTarget);
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
      drawPassingLane(ctx, v, qbPos, play.passTarget, dashOffset);
    }
    drawPassTarget(ctx, v, play.passTarget);
  }

  const carrierId = ballCarrierId(play, sim);

  // The hovered token draws last (on top of any it overlaps) so a dense
  // cluster — around an interception, a tackle, a crowded formation — can
  // still be picked apart by mousing over it.
  const drawOrder =
    hoveredId && play.players.some((p) => p.id === hoveredId)
      ? [...play.players.filter((p) => p.id !== hoveredId), ...play.players.filter((p) => p.id === hoveredId)]
      : play.players;

  for (const p of drawOrder) {
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
      hasBall: p.id === carrierId,
      hovered: p.id === hoveredId,
    });
  }

  if (sim?.ball) drawBall(ctx, v, sim.ball);
  if (ripple) drawRipple(ctx, v, { x: ripple.x, y: ripple.y }, ripple.progress);
  if (sim?.outcome) drawBanner(ctx, v, sim.outcome);
  if (marquee) drawMarquee(ctx, v, marquee);
}
