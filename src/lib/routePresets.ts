import { FIELD_CENTER_Y, clampToField } from "./field";
import type { Point, RoutePresetId } from "./types";

export const ROUTE_PRESET_LABELS: Record<RoutePresetId, string> = {
  slant: "Slant",
  go: "Go Route",
  out: "Out",
  curl: "Curl",
};

/**
 * Preset shapes as offsets from the receiver's alignment, in yards.
 * `+x` is upfield. `+y` is toward the middle of the field; it gets mirrored
 * per-receiver so a slant from either side breaks inward.
 */
const SHAPES: Record<RoutePresetId, Point[]> = {
  // Quick release, then a hard angle across the defender's face.
  slant: [
    { x: 0, y: 0 },
    { x: 2.2, y: 0 },
    { x: 10, y: 7 },
  ],
  // Vertical stem with a slight outside release to stack the corner.
  go: [
    { x: 0, y: 0 },
    { x: 10, y: -0.4 },
    { x: 26, y: -0.8 },
  ],
  // Stem upfield, then break to the sideline.
  out: [
    { x: 0, y: 0 },
    { x: 8, y: 0 },
    { x: 9.2, y: -8 },
  ],
  // Stem, then settle back toward the quarterback.
  curl: [
    { x: 0, y: 0 },
    { x: 12, y: 0 },
    { x: 10.2, y: 2.6 },
  ],
};

/**
 * Builds a preset route for a receiver at `start`. Routes are mirrored about
 * the field's midline so that "inside" always means toward the hash marks.
 */
export function buildPresetRoute(preset: RoutePresetId, start: Point): Point[] {
  // Receivers above the midline break down (+y) to go inside; those below break up.
  const inward = start.y <= FIELD_CENTER_Y ? 1 : -1;

  return SHAPES[preset].map((offset) => {
    const p = clampToField(start.x + offset.x, start.y + offset.y * inward);
    return { x: p.x, y: p.y };
  });
}
