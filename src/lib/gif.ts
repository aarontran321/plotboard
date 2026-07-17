import { makeView } from "./field";
import { drawField, drawScene } from "./render";
import { createContext, createInitialSim, estimateDuration, stepSim } from "./simulation";
import type { PlayState } from "./types";

/*
 * Sizing note: GIF weight is roughly frames x pixels, and every one of these
 * knobs was measured rather than guessed. 12fps still reads as smooth for a
 * play that lasts a few seconds, and 460px keeps the yard numbers legible.
 */

/** Frames per second captured into the GIF. */
const FPS = 12;

/** Encoding cost scales with frame count, so the recording is capped. */
const MAX_FRAMES = 60;

/** Output width in pixels. The height follows the field's aspect ratio. */
const GIF_WIDTH = 460;

/** Frames to hold on the outcome banner before the loop restarts. */
const HOLD_FRAMES = 6;

/**
 * Replays the play from the snap on an offscreen canvas at 1x speed, capturing
 * frames, then encodes them to an animated GIF.
 *
 * The sim is stepped with a fixed dt rather than driven by rAF: recording is
 * decoupled from wall-clock time, so a slow machine produces the same GIF as a
 * fast one.
 */
export async function recordPlayGif(
  play: PlayState,
  onProgress?: (progress: number) => void
): Promise<Blob> {
  const view = makeView(GIF_WIDTH);
  const canvas = document.createElement("canvas");
  canvas.width = GIF_WIDTH;
  canvas.height = Math.round(view.height);

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create a canvas context for GIF export.");

  // Render the field once, untextured, and blit it under every frame. This
  // both keeps the encoder's palette free for the players and the ball, and
  // saves redrawing every hash mark 60 times.
  const background = document.createElement("canvas");
  background.width = canvas.width;
  background.height = canvas.height;
  const bgCtx = background.getContext("2d");
  if (!bgCtx) throw new Error("Could not create a canvas context for GIF export.");
  drawField(bgCtx, view, { texture: false });

  const simCtx = createContext(play);
  const sim = createInitialSim(simCtx);

  const dt = 1 / FPS;
  const frameCount = Math.min(MAX_FRAMES, Math.ceil(estimateDuration(simCtx) * FPS));
  const images: string[] = [];

  for (let i = 0; i < frameCount; i++) {
    drawScene(ctx, view, { play, sim, selectedId: null, draftRoute: null, background });
    images.push(canvas.toDataURL("image/png"));

    stepSim(sim, simCtx, dt);
    onProgress?.((i / frameCount) * 0.5);

    // Hold on the final frame so the outcome banner is readable in the loop.
    if (sim.finished && i > frameCount * 0.5) {
      for (let hold = 0; hold < HOLD_FRAMES && images.length < MAX_FRAMES; hold++) {
        images.push(images[images.length - 1]);
      }
      break;
    }
  }

  // gifshot touches `window`, so it can only be pulled in on the client.
  const { default: gifshot } = await import("gifshot");

  const dataUrl = await new Promise<string>((resolve, reject) => {
    gifshot.createGIF(
      {
        images,
        gifWidth: canvas.width,
        gifHeight: canvas.height,
        interval: 1 / FPS,
        numWorkers: 2,
        sampleInterval: 10,
        progressCallback: (p) => onProgress?.(0.5 + p * 0.5),
      },
      (result) => {
        if (result.error) reject(new Error(result.errorMsg || "GIF encoding failed."));
        else resolve(result.image);
      }
    );
  });

  const response = await fetch(dataUrl);
  return response.blob();
}

/** Triggers a browser download for a generated blob. */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
