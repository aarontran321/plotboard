"use client";

import {
  TTT_DANGER_S,
  TTT_WARN_S,
  coverageStatus,
  routeDepthAndSeparation,
  timeToThrow,
  timeToThrowTier,
} from "@/lib/analytics";
import type { PlayState, SimState } from "@/lib/types";
import { Badge } from "./ui";

interface Props {
  play: PlayState;
  sim: SimState | null;
}

const TIER_STYLES = {
  safe: "text-emerald-400 border-emerald-400/30",
  warning: "text-amber-400 border-amber-400/30",
  danger: "text-rose-400 border-rose-400/40",
} as const;

const COVERAGE_STYLES: Record<string, string> = {
  "PRE-SNAP": "text-[#7C8AA5] border-white/10",
  "MAN-LOCK": "text-sky-400 border-sky-400/30",
  "ZONE SET": "text-sky-400 border-sky-400/30",
  "MISMATCH DETECTED": "text-amber-400 border-amber-400/40",
  "ZONE BROKEN": "text-rose-400 border-rose-400/40",
};

/**
 * Live telemetry synchronized to the playhead: Time To Throw (counting up
 * live pre-release, frozen at the true release moment after), route depth
 * and separation for the play's primary receiver, and a small rule-based
 * coverage-integrity read. Every number here is computed from real spatial
 * positions (`src/lib/analytics.ts`) — none of it is decorative.
 */
export default function AnalyticsPanel({ play, sim }: Props) {
  const ttt = timeToThrow(sim);
  const tier = ttt ? timeToThrowTier(ttt.seconds) : "safe";
  const tracking = routeDepthAndSeparation(play, sim);
  const coverage = coverageStatus(play, sim);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between">
          <span className="text-[11px] tracking-wide text-[#7C8AA5] uppercase">Time to Throw</span>
          {ttt && !ttt.released && (
            <span className="text-[10px] text-[#7C8AA5] italic">counting…</span>
          )}
        </div>
        <div
          className={`rounded-lg border bg-[#0a0e17]/70 px-3 py-2 font-mono text-[22px] font-semibold tabular-nums transition-colors duration-200 ${TIER_STYLES[tier]}`}
        >
          {ttt ? ttt.seconds.toFixed(2) : "—.—"}
          <span className="ml-1 text-[13px] font-normal opacity-70">s</span>
        </div>
        <p className="text-[10px] text-[#7C8AA5]">
          Safe under {TTT_WARN_S.toFixed(1)}s · pressure builds past {TTT_WARN_S.toFixed(1)}s · pocket collapsed
          past {TTT_DANGER_S.toFixed(1)}s
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] tracking-wide text-[#7C8AA5] uppercase">Route Depth &amp; Separation</span>
        {tracking ? (
          <div className="flex flex-col gap-1 rounded-lg border border-white/[0.06] bg-[#0a0e17]/70 px-3 py-2 text-[12.5px]">
            <div className="flex items-center justify-between">
              <span className="text-[#E5E7EB]">Primary — {tracking.receiverId}</span>
              <Badge>{tracking.depth >= 0 ? "+" : ""}{tracking.depth.toFixed(1)} yd depth</Badge>
            </div>
            <div className="flex items-center justify-between text-[#7C8AA5]">
              <span>Nearest coverage {tracking.nearestDefenderId ? `— ${tracking.nearestDefenderId}` : ""}</span>
              <Badge>
                {Number.isFinite(tracking.separation) ? `${tracking.separation.toFixed(1)} yd` : "—"}
              </Badge>
            </div>
          </div>
        ) : (
          <p className="rounded-lg border border-white/[0.06] bg-[#0a0e17]/70 px-3 py-2 text-[12px] text-[#7C8AA5]">
            No primary receiver yet — draw a route or place a pass target.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] tracking-wide text-[#7C8AA5] uppercase">Coverage Analysis</span>
        <div
          className={`rounded-lg border bg-[#0a0e17]/70 px-3 py-2 text-center font-mono text-[13px] font-semibold tracking-wide transition-colors duration-200 ${COVERAGE_STYLES[coverage]}`}
        >
          [{coverage}]
        </div>
      </div>
    </div>
  );
}
