"use client";

import type { CallNotes, PlayState, SimState } from "@/lib/types";
import AnalyticsPanel from "./AnalyticsPanel";
import CoachingGrid from "./CoachingGrid";
import KeyframeTimeline from "./KeyframeTimeline";
import { Panel, Section } from "./ui";

interface Props {
  play: PlayState;
  playbackT: number;
  playbackDuration: number;
  sim: SimState | null;
  isPlaying: boolean;
  disabled: boolean;
  onTogglePlay: () => void;
  onScrub: (t: number) => void;
  onStep: (deltaSeconds: number) => void;
  onAssignmentChange: (playerId: string, note: string) => void;
  onCallNotesChange: (next: Partial<CallNotes>) => void;
}

/**
 * The desktop feature dashboard beneath the field: a keyframe/event timeline
 * (full width — a scrubber this dense needs the room), and underneath it a
 * live analytics readout alongside the coaching assignments grid. All three
 * panels use `Section`, this project's existing accordion primitive, so they
 * collapse the same way every other control stack in the app does rather
 * than a bespoke breakpoint-gated mechanic — `grid-cols-1` below `lg`
 * (1024px) stacks the three panels; `lg:grid-cols-3` lays them out side by
 * side above it.
 */
export default function PlayDashboard({
  play,
  playbackT,
  playbackDuration,
  sim,
  isPlaying,
  disabled,
  onTogglePlay,
  onScrub,
  onStep,
  onAssignmentChange,
  onCallNotesChange,
}: Props) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Panel className="lg:col-span-3">
        <Section title="Keyframe &amp; Event Timeline">
          <KeyframeTimeline
            play={play}
            playbackT={playbackT}
            playbackDuration={playbackDuration}
            isPlaying={isPlaying}
            disabled={disabled}
            onTogglePlay={onTogglePlay}
            onScrub={onScrub}
            onStep={onStep}
          />
        </Section>
      </Panel>

      <Panel className="lg:col-span-1">
        <Section title="Live Analytics">
          <AnalyticsPanel play={play} sim={sim} />
        </Section>
      </Panel>

      <Panel className="lg:col-span-2">
        <Section title="Coaching Assignments &amp; Notes">
          <CoachingGrid
            play={play}
            disabled={disabled}
            onAssignmentChange={onAssignmentChange}
            onCallNotesChange={onCallNotesChange}
          />
        </Section>
      </Panel>
    </div>
  );
}
