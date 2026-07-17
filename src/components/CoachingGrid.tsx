"use client";

import { COLORS } from "@/lib/field";
import type { CallNotes, PlayState } from "@/lib/types";

interface Props {
  play: PlayState;
  disabled: boolean;
  onAssignmentChange: (playerId: string, note: string) => void;
  onCallNotesChange: (next: Partial<CallNotes>) => void;
}

const NOTE_FIELDS: { key: keyof CallNotes; label: string; placeholder: string }[] = [
  {
    key: "downDistance",
    label: "Down & Distance Compatibility",
    placeholder: "e.g. 3rd & Medium",
  },
  {
    key: "counters",
    label: "Defensive Counter-Indicators",
    placeholder: "e.g. Exploits aggressive Cover 2",
  },
  {
    key: "risks",
    label: "Execution Risks",
    placeholder: "e.g. Deep comeback is a low-percentage throw outside the numbers",
  },
];

const textareaClass =
  "w-full resize-none rounded-md border border-white/[0.07] bg-[#0a0e17]/70 px-2.5 py-2 text-[12.5px] " +
  "text-[#E5E7EB] transition-colors duration-200 ease-in-out placeholder:text-[#4B5875] " +
  "hover:enabled:border-white/[0.14] focus:border-sky-400/60 focus:outline-none " +
  "disabled:cursor-not-allowed disabled:opacity-40";

/**
 * Coaching notes, mapped directly onto the play's schema: a per-player
 * assignment badge (colour-matched to that player's on-field token) and the
 * play's macro-level call notes. Both are metadata (`PlayState.assignments` /
 * `.callNotes`) — edits apply immediately via `onChange`, exactly like the
 * play's name, and ride to persistence the next time the play is saved or
 * shared. There is no separate autosave path; this project's only write path
 * to Supabase is the existing explicit Save/Share action.
 */
export default function CoachingGrid({ play, disabled, onAssignmentChange, onCallNotesChange }: Props) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <span className="text-[11px] tracking-wide text-[#7C8AA5] uppercase">Token Assignments</span>
        <div className="flex max-h-[260px] flex-col gap-1.5 overflow-y-auto pr-1">
          {play.players.map((p) => (
            <div key={p.id} className="flex items-start gap-2">
              <span
                className="mt-0.5 flex h-6 w-11 shrink-0 items-center justify-center rounded-md font-mono text-[10.5px] font-bold text-white"
                style={{ backgroundColor: p.team === "offense" ? COLORS.offense : COLORS.defense }}
                title={p.team === "offense" ? "Offense" : "Defense"}
              >
                {p.id}
              </span>
              <textarea
                rows={1}
                disabled={disabled}
                value={play.assignments[p.id] ?? ""}
                onChange={(e) => onAssignmentChange(p.id, e.target.value)}
                placeholder="Execute…"
                maxLength={300}
                className={textareaClass}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        <span className="text-[11px] tracking-wide text-[#7C8AA5] uppercase">Situational Play Call Notes</span>
        {NOTE_FIELDS.map((field) => (
          <label key={field.key} className="flex flex-col gap-1">
            <span className="text-[10.5px] font-medium text-[#7C8AA5]">{field.label}</span>
            <textarea
              rows={2}
              disabled={disabled}
              value={play.callNotes[field.key]}
              onChange={(e) => onCallNotesChange({ [field.key]: e.target.value })}
              placeholder={field.placeholder}
              maxLength={800}
              className={textareaClass}
            />
          </label>
        ))}
      </div>
    </div>
  );
}
