/**
 * Minimal typings for the subset of gifshot's API this app uses. The package
 * ships as untyped UMD, and only `createGIF` from an array of data URLs is
 * needed here.
 */
declare module "gifshot" {
  export interface CreateGifOptions {
    /** Source frames as data URLs. */
    images: string[];
    gifWidth?: number;
    gifHeight?: number;
    /** Seconds each frame is displayed. */
    interval?: number;
    numWorkers?: number;
    /** Lower samples more colors and encodes more slowly. 1..30. */
    sampleInterval?: number;
    progressCallback?: (progress: number) => void;
  }

  export interface CreateGifResult {
    error: boolean;
    errorCode?: string;
    errorMsg?: string;
    /** The encoded GIF as a base64 data URL. */
    image: string;
  }

  export function createGIF(
    options: CreateGifOptions,
    callback: (result: CreateGifResult) => void
  ): void;

  const gifshot: {
    createGIF: typeof createGIF;
  };

  export default gifshot;
}
