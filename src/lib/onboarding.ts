/**
 * Persistence for the first-run feature tour. Same tolerance as the rest of
 * this project's localStorage reads (see `localPlays.ts`): a missing or
 * unavailable store should never crash the board, it should just behave as
 * if the tour has never been seen.
 */

const KEY = "plotboard:onboardingTourComplete";

export function hasCompletedOnboardingTour(): boolean {
  try {
    return localStorage.getItem(KEY) === "true";
  } catch {
    return false;
  }
}

export function markOnboardingTourComplete() {
  try {
    localStorage.setItem(KEY, "true");
  } catch {
    // Storage unavailable (private mode, disabled cookies, etc.) — the tour
    // will simply offer itself again next visit, which is a fine fallback.
  }
}
