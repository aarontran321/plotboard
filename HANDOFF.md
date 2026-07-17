# Plotboard — Handoff

Written for whoever (human or agent) picks this up next, with no prior context.
Read this before touching the code.

## 0. Read this first: the repo changed shape

Plotboard **was** a single-file vanilla app (`index.html`, ~1750 lines, no build
step). It is now a **Next.js App Router + TypeScript + Tailwind v4** project, per
an explicit rewrite request. The previous handoff described the single-file app
and is superseded by this document.

**The old app was not lost.** Its history is merged into `main`, so it is one
command away:

```bash
git show 082ff42:index.html > index.html   # the last single-file version
git show 44c6d0b:HANDOFF.md               # the previous handoff, worth reading
```

It was removed from the working tree because the repo is now the Next.js app and
two Plotboards at the repo root is confusing, not because it was bad — it was
complete and well tested. If you ever need to compare behaviour, restore it and
open it directly in a browser; it needs no toolchain.

## 1. What this is

An American football playbook designer and play simulator. Design a play, drag
players, draw routes, place a pass target, simulate it against live defensive
coverage, export a GIF, share a link.

```bash
npm install
npm run dev          # http://localhost:3000
```

| Command | Purpose |
| --- | --- |
| `npm run dev` | Dev server (Turbopack, default in Next 16) |
| `npm run build` | Production build |
| `npm run verify` | **Headless simulation checks — 50 assertions. Run this.** |
| `npm run lint` | ESLint (`next lint` was removed in Next 16) |

## 2. State of things

- Builds clean; `tsc --noEmit`, `eslint .`, and `npm run verify` are all green.
- **Supabase is live now, and the whole share path is verified end to end.**
  This supersedes the previous claim here that the `plays` table did not exist —
  it does. `.env.local` carries the URL and publishable key, `GET /rest/v1/plays`
  answers `200`, and Share writes a real row, returns a `/play/<uuid>` link, and
  that link resolves **server-side** with the full current schema
  (`formation`, `defenseFormation`, `losX`, `name`, all 14 players). The
  `localStorage` fallback is still there for when the write fails; it is no
  longer the normal path. If you clone this fresh and Share is disabled, you are
  missing `.env.local` — and if the table is missing, run
  [`supabase/schema.sql`](supabase/schema.sql) in the Supabase SQL editor.
- **`supabase/schema.sql` does not match the deployed table.** The file declares
  a `name text` column; the live table has only `id`, `created_at`, `data`. It
  predates the file. This is a live tripwire: inserting `name` fails the *whole*
  row with PostgREST `PGRST204` and silently drops every share onto the
  localStorage fallback. `sharePlay` therefore writes `data` only, and the
  play's name rides inside that JSON. Don't "fix" the insert to use the column
  without first confirming it exists on the deployed table.
- **The original brief was truncated in delivery.** Its "Section 5 — Handoff
  Protocol & Next.js Architecture" never arrived, twice. The Supabase layout here
  is an inference from `@supabase/ssr` conventions, reconciled after the fact
  against the previous handoff (this document's ancestor). If a real Section 5
  turns up, the Supabase wiring is the part most likely to disagree with it.

## 3. Architecture — read before editing

The load-bearing idea, inherited deliberately from the single-file version:

> **Model space is field yards, never pixels.** `x: 0–120` (0–10 and 110–120 are
> endzones), `y: 0–53.3`. Players, routes, and the pass target are stored in
> yards. Pixels exist only at draw time.

**Orientation matters and trips people up.** The field is landscape: `x` is its
*length* and the offense attacks `+x`. So the line of scrimmage is a **vertical**
line at a constant `x`, and the pre-snap boundary rules constrain each player's
**x**, not their y. Briefs written for a portrait board will say "horizontal
line" and "clamp the y-coordinate"; that is the same idea, rotated.

```
src/
  app/
    page.tsx              Board
    play/[id]/page.tsx    Shared play, resolved server-side (params is async in Next 16)
    actions.ts            'use server' — sharePlay
  components/
    PlotBoard.tsx         State owner: play, selection, playback, history, shortcuts
    FieldCanvas.tsx       Canvas, pointer interaction, animation loop, playhead owner
    PlayDashboard.tsx     3-panel feature dashboard below the field (desktop-first)
    KeyframeTimeline.tsx  Event-marker ruler + filmstrip segments + transport controls
    AnalyticsPanel.tsx    Time-to-throw / route depth & separation / coverage status
    CoachingGrid.tsx      Per-player assignment notes + situational play-call notes
    LeftPanel/RightPanel  Controls
    ui.tsx                Elevated-dark-mode primitives (Button/Panel/Section/Badge/Segmented)
  lib/
    field.ts              Geometry constants, world<->screen transforms, palette,
                          neutral-zone rules (clampToSide/violatesScrimmage)
    geometry.ts           Quadratic Bezier smoothing, arc-length sampling
    formations.ts         7v7 personnel (4 offensive + 5 defensive formations),
                          alignments, derived man/zone assignments
    routePresets.ts       Route shapes, mirrored per side of the field
    simulation.ts         Movement, throw physics, defensive AI, computePlayEvents <- DOM-free
    analytics.ts           Live telemetry (TTT, separation, coverage rules)         <- DOM-free
    render.ts             All canvas drawing                       <- no mutation
    history.ts            Undo/redo over snapshots
    playSchema.ts         Validation at the trust boundary
    playName.ts           Naming rules: defaults, trimming, filename slugs
    localPlays.ts         localStorage fallback for sharing (keyed by share id)
    savedPlays.ts         The user's named play library (list/load/delete)
    gif.ts                Offscreen replay + gifshot encoding
    supabase/             Browser + server clients, env access
scripts/
  verify-sim.ts           The headless test harness
```

Things that will bite you if you don't know them:

- **`simulation.ts` imports no DOM.** That is not incidental — it is what lets
  `npm run verify` run the physics and AI in Node with no browser. Keep it that
  way. `stepSim(sim, ctx, dt)` mutates `sim`; `drawScene` never mutates. If you
  need a new sim feature, it goes in `simulation.ts` and gets a check in
  `scripts/verify-sim.ts`.
- **One curve, two consumers.** `geometry.ts` builds the quadratic Bezier chain
  that `render.ts` strokes *and* that `simulation.ts` samples for movement. The
  route a receiver runs is provably the one drawn. Don't fork that.
- **`PlayerDef.startX/startY` is the alignment (source of truth); `SimState.players[id]`
  is the live position during a run.** Editing touches the former, simulating the latter.
- **The line of scrimmage is `play.losX`, not the `LOS_X` constant.** `LOS_X` is
  only the default. It is draggable, so it lives in `PlayState`, is tracked by
  undo, and is validated by the schema. Anything positioning players relative to
  the line must read the play. It is also *not* drawn into the cached field
  canvas (that only rebuilds on resize) — `drawScrimmage` strokes it live.
- **Rosters are 7v7 and personnel is dynamic.** Both dropdowns change who is on
  the field, so man/zone assignments are **derived from the actual roster**
  (`manAssignments`, `zoneAssignments`) rather than a fixed table. A hardcoded
  map would silently leave defenders uncovered — `verify` checks that it doesn't.
- **The animation loop while idle is now deliberately broad, not narrow.**
  This used to be a hard rule ("an idle board holds no animation frame,
  full stop, with three narrow exceptions") — it was **reversed** for the
  "always alive" tactile aesthetic: routes, the passing lane and the QB
  guides all march continuously (`FieldCanvas`'s marching-ants effect runs
  whenever `!isPlaying && !drawMode`, no longer gated to QB selection or the
  Pass Target Tool). The still-narrower `pump()` loop is unchanged and covers
  only the genuinely transient bits — formation easing, the boundary-warning
  flash, and a context-menu "shimmer" — stopping itself the moment all three
  are done. If you're profiling and wondering why the canvas repaints at 60fps
  on a totally idle board, this is why, and it's intentional now.
- **Interaction is strictly mode-switched.** `pointerdown` decides *once*,
  from `drawMode`, whether a gesture is a `drag`, `group-drag` or a `route`, and
  records that on `interactionRef`. `pointermove` only services the gesture
  already chosen — there is no path from `drag` to `route`. That separation is
  the whole fix for the move-vs-draw bug; don't reintroduce a heuristic. The
  Pass Target Tool (`isPlacingPassTarget`) intercepts a click even earlier, at
  the very top of `pointerdown`, before any gesture is decided.
- **`group-drag` recomputes from a snapshot on every move, not incrementally.**
  It captures each group member's position and route *once*, at drag start,
  then every `pointermove` applies the *total* offset from the drag's anchor
  to that snapshot. Applying a per-frame incremental delta instead (the way
  the single-player `drag` case does, which is safe there because it sets an
  absolute cursor position rather than an offset) would compound, since `play`
  already reflects the previous move's result.
- **The playback deck's scrubbing (`simulateTo`) replays from `t=0` every
  time**, it does not hold a second live simulation. That is only viable
  because `stepSim` is a pure function of the previous state and `dt` — see
  determinism, verified below — and a play never runs longer than
  `MAX_PLAY_TIME`. Scrubbing/stepping are disabled while actually playing
  (pause first) to avoid the seek and the live RAF loop fighting over
  `simRef` in the same frame.
- **`FieldCanvas` is still the one playhead owner — the dashboard below the
  field does not get its own.** It reaches the outside world two ways: an
  `onPlaybackUpdate({t, duration, sim})` callback (fired from the RAF loop at
  the same throttle as the internal deck's readout, from every scrub/step,
  and from a `play`-change effect so duration never goes stale after an edit)
  mirrors the playhead into `PlotBoard`'s own state for the dashboard to read;
  and a `forwardRef`/`useImperativeHandle` handle (`{ scrub, step }`) — the
  *exact* functions the internal `PlaybackDeck` already calls — lets the
  dashboard's timeline drive the same playhead back (e.g. clicking an event
  marker). There is deliberately no second scrub implementation.
- **Coaching notes (`PlayState.assignments`, `.callNotes`) are metadata, like
  `name`.** Edited directly via `setPlay`, not through `commit`/undo, and
  excluded from `history.ts`'s `Snapshot` for the same reason `name` is: a
  coaching note is not the kind of thing Ctrl+Z should undo mid-keystroke.
  They ride to persistence through the *existing* Save/Share path (they're
  just more fields on the serialized play) — there is no separate autosave
  pipeline, and building one was out of scope.
- **There is no sack/tackle mechanic.** The keyframe timeline's four-icon
  schema asked for one (a crash/X icon distinct from interception), but
  nothing in `simulation.ts` models a pocket collapsing or a QB going down —
  see the existing "pass rushers are crude" limitation below. `computePlayEvents`
  uses the crash icon for **interception** instead (a real, defensive,
  play-ending stop), documented inline rather than silently repurposed.
- **"No glows" was reversed.** Every previous mention in this document of a
  hard flat/no-shadow/no-gradient rule described a deliberate design choice
  that held for a while and is **no longer current** — a later brief
  explicitly asked for a "Tactile / Elevated Dark Mode" with glassmorphism
  panels, gradient buttons, glowing tokens and pulsing outcome banners, and
  that request was treated as a considered reversal rather than silently
  honoured or silently ignored. `render.ts` now uses `shadowBlur`/gradients
  throughout (player tokens, the outcome banner, the passing lane, snap
  highlights); `ui.tsx` uses gradient buttons and frosted-glass panels. If a
  future brief asks to go flat again, that's a third reversal, not a bug.
- **Buttons are a strict 3-tier hierarchy, not "gradient everywhere".** A
  follow-up brief specifically complained about the emerald active-toggle
  color clashing with the turf, and about too many buttons competing for
  attention — so `Button` in `ui.tsx` was narrowed: exactly one button
  anywhere on screen at a time may be `variant="primary"` (a solid sky-500
  block — currently Save Play, in the main view; Create GIF also uses it, but
  only inside the export modal, which is never on screen at the same time as
  Save Play, so the two don't actually compete). Everything else is
  `variant="default"` (Tier 2 — outline, fades to slate on hover) or
  `variant="danger"` (Tier 3 — muted rose outline, only turns vibrant on
  hover; used by Clear Route / Reset All Routes). A toggled-**on** mode
  (`active`, e.g. Draw Route Mode) is neither tier — it's a matte fill with a
  glowing sky-blue *ring*, deliberately distinct from Tier 1's solid fill so
  "this mode is on" never reads as "click this to act". The Play/Pause
  transport control in `PlaybackDeck` is its own thing again: a circular
  outline button in the accent colour, sized up rather than filled solid, so
  it stays visually prominent without contending with Save Play for Tier 1.
- **`Segmented` (in `ui.tsx`) replaces dropdowns for small fixed choice sets.**
  Defensive Coverage (3 options) and Field Style (2 options) are now tap-to-
  select segmented controls instead of `<select>` dropdowns; the Tool section
  became a 2-way Move/Draw segmented control instead of a single toggle
  button. Offense/Defense Formation stayed as the underline `Select` — 4 and
  5 options respectively are too many to sit comfortably in a segmented row.
- **A play's `name` may be empty, and the default is never stored.** The default
  is a timestamp, so materialising it during render would produce different
  markup on the server and the client and break hydration. `resolvePlayName`
  turns "" into `Untitled Play - <when>` and is only ever called from an event
  handler — at save, export, or share. Keep it that way.
- **Two localStorage modules that look alike but aren't.** `localPlays.ts` is
  the invisible fallback for a failed *share*, keyed by the share id in the URL.
  `savedPlays.ts` is the user's named library. Don't merge them.
- **The field is cached** to an offscreen canvas and blitted (`background` in
  `SceneOptions`), rather than re-stroking ~400 hash marks per frame.
- **Pointer interaction** is a small state machine on `interactionRef`
  (`none | drag | route`), not React state — per-move `setState` on a drag would
  be the hot path.

## 4. What's implemented

- **3-column "Tactile / Elevated Dark Mode" workspace**: a deep radial-gradient
  navy page background (`globals.css`), with panels a step lighter, frosted
  (`backdrop-blur`), bordered in low-opacity white, and drop-shadowed so they
  read as physically raised. Buttons carry a gradient and lift/glow on hover;
  a toggled-on state (Draw Route Mode, Turf/Chalkboard) uses a vibrant emerald
  glow rather than a plain fill. Dropdowns and text inputs (`Select`,
  `TextField` in `ui.tsx`) are minimal underlines rather than boxed fields,
  glowing into the accent colour on focus. `Section` (in `ui.tsx`) is a
  collapsible accordion, defaulting open, so the long control stack in each
  side panel can be condensed. On the field itself: player tokens are radial
  gradients with a drop shadow and a glossy top-left highlight (a "magnetic
  whiteboard piece" look); the outcome banner is a rounded pill that pulses a
  coloured glow; the passing lane, pass target and snap-highlight ring all
  glow in their accent colour; a small football badge marks whoever currently
  has the ball during playback (`ballCarrierId` in `render.ts`); and a
  **Field Style** toggle in the left panel swaps the realistic turf for a
  slate "coach's chalkboard" theme (`FieldTheme`/`paletteForTheme` in
  `field.ts` — only the field surface changes; tokens, routes and UI accents
  are deliberately identical on either board, and the cached field canvas
  rebuilds whenever the theme changes, the same way it already did on resize).
- **7v7 rosters.** **Offense formations**: Spread, I-Formation, Singleback,
  Empty Backfield (each 7: a centre, a QB, five skill players).
  **Defense formations**: 4-3, 3-4, Nickel, Dime, 5-2 (each 7). Note the brief's
  own 7-player adjustment gives 4-3 and Nickel *identical* personnel
  (2 DL / 2 LB / 3 DB), so they are separated by alignment instead — Nickel
  plays its extra back off and widens the corners.
  **Coverages**: Man, Cover 2, Cover 3, with zone shells drawn so the shell is
  legible, not implied. Coverage is orthogonal to defensive formation: formation
  is *who lines up where*, coverage is *what they then do*. Linemen ignore both
  and rush the passer.
- **Line of scrimmage and neutral zone.** The line is draggable and takes the
  whole play with it (both alignments, every route, the pass target). A 1-yard
  neutral zone is centred on it, and neither side may align inside or across it:
  a drag past the boundary clamps to the edge and flashes a red ring on the node.
  `clampToSide` is shared by the drag handler and the formation builder, so a
  dragged player can never reach a spot a generated alignment wouldn't.
- **Drag-and-drop** all 14 nodes; a node's route drags with it. **Shift-click**
  builds a drag group out of several tokens (added to the primary selection),
  so an entire line or unit can be repositioned together; a plain click on a
  token outside the group clears it and resumes single-player dragging.
- **Right-click context menu** on any token: delete its route, cycle a cosmetic
  position/role label, set it as the primary pass-target receiver, or trigger a
  transient "shimmer" highlight. A full-viewport backdrop closes it on any
  outside click.
- **Hand-drawn routes** (quadratic-smoothed) and **presets** (Slant/Go/Out/Curl),
  mirrored so "inside" means toward the hashes regardless of which side you're on.
  Drawing is behind a **Draw Route Mode** toggle (button, or `D`) — by default a
  drag on a player moves them, full stop.
- **QB pass targeting, two ways.** The original path still works: with the QB
  selected (and not in draw mode), click a receiver's route to snap a target
  onto it. The QB node is drawn with a gold double ring and star badge, and
  when selected it shows marching guide lines to each active route plus a
  ghost target under the cursor.
- **The Pass Target Tool** (`isPlacingPassTarget`, a "Set Pass Target" button
  under Active Element when the QB is selected) is the dedicated version of
  the same idea: it arms a crosshair cursor and dims the field, then a click
  either snaps to whichever route/receiver is within range (highlighted with
  a brighter stroke and a slight scale-up as you hover — weight and size, not
  a glow, so the flat-design rule holds) or drops a free target in open space
  with `receiverId: null` — a throw anticipating a vacancy rather than a
  route. Either way, one placement turns the tool back off. A bright
  sky-blue dashed "passing lane" is drawn from the QB to whatever target is
  set, live, so its geometry can be inspected before running the play.
- **Throw physics**: release at 30% route progress (or, for a free target or a
  receiver with no drawn route — a hitch — a fixed timer once the drop has had
  time to settle, since there is no route progress to key off). Flight time
  from horizontal distance ÷ throw speed; launch velocity solved so
  `z(duration) = 0` exactly. Nearest player to the landing spot wins it →
  Completed / Intercepted / Incomplete — **unless a defender bats it down
  first**: any defender within bat-down range of the ball during the first
  `BAT_WINDOW` seconds of flight, while it is still below `BAT_MAX_Z`,
  produces a distinct "Pass Deflected!" outcome instead, ending the flight on
  the spot rather than at the intended target.
- **Defensive AI**: man coverage chases a **250ms-delayed** copy of the
  assignment's position (this is why a sharp break creates separation); zone sits
  on a landmark and breaks on the nearest intruder inside its radius; everyone
  within 14yd breaks on the ball once it's up.
- **A media-style playback deck** (`PlaybackDeck.tsx`, under the field) replaced
  the old single "Simulate Play" button: Play/Pause (true pause-and-resume —
  pressing Play only creates a fresh simulation if none is loaded, so a pause
  no longer means "restart from the top"), step forward/back one `FRAME_STEP`
  (1/15s), and a timeline scrubber. Scrubbing calls `simulateTo`, which replays
  the play from t=0 at a fixed timestep rather than holding a second live sim —
  cheap, since a play is capped at `MAX_PLAY_TIME` seconds, and exactly as
  deterministic as the live run (`verify` checks the two agree bit-for-bit).
  The deck reports the play's estimated duration from the *authored* state, so
  the scrubber has a sensible range even before Play is first pressed.
- **A three-panel feature dashboard** (`PlayDashboard.tsx`, below the field;
  desktop-first, `lg:grid-cols-3` at 1024px) drives and reads the same
  playhead `PlaybackDeck` does:
  - **Keyframe & Event Timeline** (`KeyframeTimeline.tsx`, full width): a
    ruler with clickable milestone icons computed once per play by
    `computePlayEvents` (football = release, shield = deflected, whistle =
    a clean dead ball, crash/X = interception — standing in for a sack/tackle
    this engine doesn't model), a hover tooltip with the exact time and
    context, transport controls, and a "filmstrip" row of equal-time segment
    blocks (not literal per-frame thumbnails — see the limitations below).
    Clicking a marker or a segment scrubs straight to it.
  - **Live Analytics** (`AnalyticsPanel.tsx`): a Time-to-Throw readout that
    counts up live pre-release and freezes at the true release moment after
    (color-coded green/amber/red past `TTT_WARN_S`/`TTT_DANGER_S`), route
    depth and separation for the play's primary receiver against the nearest
    defender, and a small rule-based coverage status
    (`MAN-LOCK`/`MISMATCH DETECTED`/`ZONE SET`/`ZONE BROKEN`/`PRE-SNAP`).
    Every number is a real computation over `SimState` positions
    (`src/lib/analytics.ts`, DOM-free) — none of it is fabricated.
  - **Coaching Assignments & Notes** (`CoachingGrid.tsx`): a per-player note
    badge-colour-matched to that player's on-field token, plus three
    situational play-call fields (down & distance, defensive counters,
    execution risks). Both map directly onto `PlayState` (`assignments`,
    `callNotes`) and ride to persistence through the *existing* Save/Share
    path — there is no separate autosave pipeline.

  All three panels use `Section` (this project's existing accordion
  primitive) rather than a bespoke breakpoint-gated collapse mechanic, so
  they're collapsible everywhere, not conditionally below 1024px.
- **Undo/redo** over snapshots (alignments, routes, pass target, *and* the line
  of scrimmage). **Shortcuts**: Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z, Space =
  play/pause, R = reset, D = toggle Draw Route Mode, Esc = deselect (and cancels
  the Pass Target Tool, if armed).
- **Naming and a saved play library**. A name input sits at the top of the field
  with a Save Play button (Enter saves). Saved plays go to `localStorage` and are
  listed in "My Saved Plays" in the right panel, newest first, each loadable by
  name and deletable. Saving under an existing name **overwrites** it rather than
  accumulating entries the user cannot tell apart. Loading clears the undo stack,
  because the old snapshots describe a board that is no longer on screen.
- **Save & Share**: Server Action → Supabase → `/play/<id>`, resolved
  server-side, with the play's name in the payload so the recipient's name input
  is populated by the server render. **On any failure it falls back to
  `localStorage`** so work is never lost; `/play/[id]` deliberately does **not**
  404 on a database miss — it renders the board and retries against local storage
  on mount, and only then reports the play missing.
- **GIF export**: deterministic offscreen replay at a fixed timestep (not
  screen-scraping), so a slow machine produces the same GIF as a fast one.
  Export goes through a naming dialog first; the name becomes the filename
  (`vertical-cross.gif`). **"Skip" is not "Cancel"** — skipping still exports,
  under the default name, which is what the brief specified. Escape, the
  backdrop and Cancel abort outright, which the brief did not specify but a
  dialog with no way out is a trap. The name is *not* written into GIF metadata:
  gifshot exposes no way to set a GIF comment extension.
- **Retina**: backing store sized by `devicePixelRatio`, drawing in CSS pixels.
- **Boots with a demo play** (Go/Slant/Curl + a placed target) so the board is
  never empty — intentional, not leftover debug state.

## 5. GIF export — and a correction to the previous handoff

The previous handoff (§5, `git show 44c6d0b:HANDOFF.md`) concluded that gifshot
is unusable, that a rAF shim had been tried and ruled out as the cause, and that
plain `gifshot@0.4.5` "would fail identically" — and therefore hand-rolled a
GIF89a/LZW encoder.

**That conclusion appears to be wrong, and this project uses `gifshot@0.4.5`
successfully.** Verified output: a real `GIF89a`, 460×204, ~517 KB, decoding
correctly.

The likely reason for the false negative — worth knowing, because it will burn
you again:

> gifshot binds its animation-frame reference **at module-evaluation time**
> (`node_modules/gifshot/dist/gifshot.js:27`), and its internal `requestTimeout`
> is built on it, falling back to `setTimeout` **only if rAF is entirely absent**
> (line 32). So a rAF shim installed *after* the library has loaded does nothing —
> the stale reference is already captured. The shim must be in place *before* the
> import. In a hidden tab (`document.hidden === true`, which is how the agent
> Browser tool's non-fronted tab behaves) rAF exists but never fires, so gifshot
> waits forever and looks broken.

If GIF export ever hangs, check that before rewriting the encoder.

Sizing knobs are at the top of `lib/gif.ts`: `GIF_WIDTH` 460, `FPS` 12,
`MAX_FRAMES` 60, `HOLD_FRAMES` 6. **The turf speckle is deliberately disabled for
export** (`drawField(ctx, v, { texture: false })`) — per-pixel noise is close to
worst case for LZW and eats the 256-colour palette, for texture invisible at that
size. Leaving it on roughly quadruples the file (measured: 2.0 MB → 517 KB).

## 6. How this was verified

**`npm run verify` — 147 headless assertions.** This closes the "no automated
tests" gap the previous handoff called its top infrastructure priority (§8).
Covers: path length/nearest-point math, preset mirroring, release timing, arc
monotonicity, ball landing on target, outcome agreeing with the nearest player,
**nobody exceeding their own top speed on any frame**, nobody leaving the field,
man coverage staying tight, Cover 2 vs Cover 3 depth differing, determinism, full
undo/redo semantics including redo-branch invalidation, and schema rejection of
13 classes of malformed input.

Added with the 7v7 / line-of-scrimmage work: every formation fields exactly 7 a
side with unique ids across all 20 pairings; no defender is left without a man,
a zone, or a rush; **no generated alignment violates the neutral zone** at any
line position; the drag clamp agrees with the formation builder at both
boundaries and still respects the field edges; the formation follows the line;
a play from a moved line still resolves; undo restores `losX`; and old share
links still parse (the pre-rename `shotgun-spread` id maps forward, and a
payload with no `losX`/`defenseFormation` defaults rather than being rejected).

Added with play naming: the default/trim/cap rules, that the cap agrees with the
schema (so a name you can type is a name that parses back), filename slugging
including the "all punctuation" case, and that an unnamed play stays valid.

Added with the Pass Target Tool: a free-throw target (`receiverId: null`) and a
hitch onto a receiver with no drawn route both still release and resolve on
their fixed timer rather than waiting forever on route progress that never
comes; a defender standing on the release point deflects the pass
("Pass Deflected!", distinct from an interception at landing); the schema
accepts a free-throw target's null receiver on round-trip; and `simulateTo`
(the scrubber's engine) agrees, to floating-point tolerance, with stepping
there incrementally — the load-bearing assumption behind letting the scrubber
replay from scratch instead of holding a second live simulation.

Added with the feature dashboard: `timeToThrow` matches the exact frame the
ball actually left (cross-checked against the throw-physics section's own
release-timing trace), pre-snap tracking works before a sim exists, the
primary receiver correctly falls back from the placed target to the longest
drawn route to `null`, coverage status resolves to a real (non-`PRE-SNAP`)
value once a play has run, and `computePlayEvents` always finds a release
before an end-of-play event, in chronological order, whose `kind` agrees with
the sim's actual `outcome`. Also added: schema round-tripping and rejection
for `assignments`/`callNotes` (an unknown player id, an oversized note field,
a non-object `callNotes`), and that both default to empty on an older share
that predates them.

Browser-side, verified by sampling canvas pixels and driving synthetic
`PointerEvent`s: exact palette values (grass reads `20,83,45` = `#14532D`), player
placement at computed coordinates, formation switching, route presets, pass-target
placement (`249,115,22` = `#F97316`), a full play resolving to an "Intercepted!"
banner, zone shells matching the predicted alpha blend, Space/Esc shortcuts, the
Supabase error surfacing cleanly, and the localStorage share fallback round-tripping
(including the negative case, so the fallback is proven to actually run).

**Environment caveat, important for whoever re-verifies:** the agent Browser
tool's tab reports `document.hidden === true` and never composites, so
`requestAnimationFrame` never fires and **screenshots time out**. The animation
was therefore never observed visually — it was verified by pixel sampling plus
the headless harness, and playback/export were driven by shimming rAF *before*
gifshot loads (see §5). If you have a real browser, just look at it.

The same caveat applies to everything added for the Pass Target Tool / playback
deck / group-drag / context-menu pass: `tsc --noEmit`, `eslint`, `npm run
build`, and `npm run verify` (121/121) are all green, and a `curl` against a
running dev server confirms the page renders with the new markup present
(`aria-label="Play"` from the deck, etc.) with no server-side exceptions — but
none of the new interaction (snap highlighting, the crosshair cursor and field
dim, scrubbing, shift-click grouping, the right-click menu) has been exercised
by an actual pointer in an actual browser. If you have one, that is the
highest-value next act, same as it was for the original animation.

**Same again for the "Tactile / Elevated Dark Mode" visual pass** (gradient
background, glass panels, gradient/glow buttons, underline inputs, tactile
gradient/shadow player tokens, the pulsing outcome banner, the chalkboard
theme toggle, the ball-possession badge, continuous marching-ants routes):
`tsc`, `eslint`, `npm run build`, and `npm run verify` (still 121/121, since
none of this touched simulation logic) are all green, and a fresh dev-server
`curl` confirms the new markup ("Field Style", "Chalkboard") renders with no
server-side exceptions. But glow, blur, gradient and shadow effects are
exactly the category of thing a static HTML fetch cannot confirm looks right
— canvas `shadowBlur`, CSS `backdrop-blur`, and the chalkboard cache-rebuild-
on-theme-change path in particular have only been read, not seen. This is a
strictly higher-value "look at it in a real browser" than the previous
entries in this section, precisely because the whole point of the change was
visual.

**Same again for the three-panel feature dashboard** (`PlayDashboard`,
`KeyframeTimeline`, `AnalyticsPanel`, `CoachingGrid`, and the `FieldCanvas`
ref/callback plumbing that feeds them): `tsc`, `eslint`, `npm run build`, and
`npm run verify` (147/147) are all green, and a fresh dev-server `curl`
confirms the new markup ("Keyframe", "Live Analytics", "Coaching Assignments",
"Time to Throw") renders with no server-side exceptions. The analytics *math*
is covered by `verify` (see above) — what is **not** verified is the
interactive part: clicking an event marker or a filmstrip segment and
watching the field's playhead actually jump there, dragging the ruler,
typing into a coaching note and having it survive a Save, or how the
`lg:grid-cols-3` → stacked-accordion responsive collapse actually looks
below 1024px. Same standing recommendation as every entry above: open it in
a real browser before trusting the interaction, not just the computation.

## 7. Bugs found and fixed

- **Receivers snapped when the ball landed.** A receiver chasing the catch point
  moved `x/y` directly, while route-following derives `x/y` from distance
  travelled. When the ball landed the chase branch stopped applying, route mode
  resumed, and the receiver teleported back onto the path at exactly 2× top speed.
  Caught by the "no player exceeds top speed" check in `verify`. Fixed at the
  root: a dead ball ends the play and freezes everyone (`stepSim` skips movement
  once `landedAt` is set), which is also what a whistle means.
- **Clicking a player enabled Undo.** `pointerup` committed a history entry even
  when nothing moved, so bare selection pushed no-op entries. Fixed to commit only
  on actual displacement. The line-of-scrimmage drag has the same guard.
- **Dragging a player drew a route instead of moving them.** The handler decided
  move-vs-draw from selection state, so a selected player could not be
  repositioned. Now `drawMode` decides once at `pointerdown` (see §3). Note this
  reversed an earlier change that had made a selected player's drag *draw* — the
  toggle is the design that stuck.
- **Writing the play name to a Supabase column broke every share.** The `name`
  column is in `schema.sql` but not on the deployed table, so the insert failed
  with `PGRST204` and the fallback quietly caught it — the feature looked fine
  while never touching the database. Caught by reading the share status text
  rather than trusting the click. See §2.
- **A formation change could strand players at their old alignment.** The
  transition eases on `requestAnimationFrame`; in a tab that never composites
  (see §6) no frame ever arrives, so the first paint at `f≈0` was also the last.
  The transition is now skipped outright when `document.hidden`.
- **Refs written during render** in `FieldCanvas`/`PlotBoard` — unsafe under
  concurrent rendering. Moved into effects.
- **Undo/Redo announced as "Ctrl+Z"/"Ctrl+Y"** to screen readers, because a bare
  `title` becomes the accessible name. Now `aria-label`.
- The previous handoff's §7 **canvas 0×0 collapse** does not apply here:
  `FieldCanvas` guards with `if (width > 0)` and observes the parent with a
  `ResizeObserver`. Worth keeping.

## 8. Known limitations / not verified

- **Never seen animate.** See §6. Highest-value first act: open it in a real
  browser and watch a play. This now also covers the two transient animations
  added since (formation easing, boundary-warning fade) — their *static* end
  states are verified, the motion between them is not.
- ~~Supabase never exercised against a live table~~ — **no longer true, see §2.**
  The success path is now verified against the real database.
- **The brief's 7-player defensive counts make 4-3 and Nickel identical**
  (both 2 DL / 2 LB / 3 DB). They are distinguished by alignment only. If real
  4-3 personnel matters, the roster needs to grow past 7.
- **Pass rushers are crude.** Linemen beeline for the QB's *alignment* at
  constant speed; there is no blocking, no pocket, and no sack. They exist so
  that defensive linemen aren't inert, not because the rush is modelled. The
  keyframe timeline's crash/X icon, asked for as "sack/tackle", uses
  **interception** instead — the one real, defensive, play-ending stop this
  engine has. If a sack mechanic is ever added, that's the icon it should
  actually drive, and interception will need a different one.
- **The keyframe timeline's "filmstrip" is equal-time segment blocks, not
  per-frame thumbnails.** A real thumbnail per segment would mean an
  offscreen replay per segment — which is what GIF export already does, at a
  fixed low frame rate, for a real export — and doing that live for a
  scrubbing UI would be needlessly expensive for what is, honestly, a
  decorative filmstrip. The event markers and the scrubhead are the part
  that's load-bearing; the filmstrip is texture.
- **Coverage analysis is a small, honest heuristic, not route recognition.**
  `coverageStatus` (`src/lib/analytics.ts`) knows exactly one thing: the
  separation between the play's primary receiver and the nearest defender,
  read against a threshold appropriate to man vs. zone. It has no notion of
  leverage, technique, or which specific defender "should" have help — it is
  a real computation over real positions, but a simple one, not NFL-grade
  analytics. Likewise, "primary receiver" falls back from the placed pass
  target to whichever route is longest when no target is set, which is a
  reasonable guess, not a guarantee of picking the play's actual first read.
- **"Change Position/Role" from the context menu is cosmetic.** It rewrites
  `label` only, cycling through a small pool per team; it does not touch `id`,
  so routes, man/zone assignments and the pass target — all keyed by `id` —
  are unaffected. A relabeled "CB1" is still covering whoever `manAssignments`
  gave CB1.
- **Group-drag selection lives only in `FieldCanvas`, not lifted to
  `PlotBoard`.** The right panel's "Active Element" section still describes
  just the primary `selectedId`; it has no way to say "4 players selected".
  Extending that would mean threading a `groupSelectedIds` prop up through
  `PlotBoard` and `RightPanel`, which felt like real scope creep for what the
  brief asked for (the ability to drag several tokens together).
- **The free-throw release timer (`FREE_THROW_RELEASE_T = 1.1s`) and the
  batted-pass window (`BAT_RADIUS`/`BAT_MAX_Z`/`BAT_WINDOW`) are heuristic
  constants**, tuned only against `buildTestPlay`'s default spread/4-3
  matchup. They are not re-derived per formation, so a formation with a much
  shorter or longer drop could make a free throw release oddly early/late, or
  make batted passes systematically more/less likely than intended. Worth
  revisiting if free throws start feeling wrong for a particular formation.
- **Deviations from the single-file app**, none of which are principled — just
  unported:
  - Steering is constant-speed (`moveToward`) rather than the old
    acceleration + drag + speed-cap (`steerToward`), so defenders change direction
    instantly. The old model looked better. Porting it means re-tuning and
    re-running `verify`.
  - No WebM export (the old app had `MediaRecorder`); GIF only.
  - One `CATCH_RADIUS` rather than separate catch/interception radii.
  - Config is env vars, not the old in-app Supabase config widget — this was
    specified.
  - Share is a real route (`/play/<id>`, SSR) rather than `?play=<id>`, because
    server-rendered sharing was specified.
- **Touch not tested.** Pointer events are used, so it should work; unverified.
- **RLS policies in `supabase/schema.sql` are fully public** (anon select +
  insert). Appropriate for disposable diagrams, nothing else. The publishable key
  ships in the client bundle by design, so that table is world-writable by anyone
  who loads the page. Add auth and scope to `auth.uid()` before it holds anything
  real.
- **`npm run verify` covers the sim, not the UI.** Component/interaction tests
  don't exist; the browser checks in §6 were ad hoc. In particular
  `savedPlays.ts` has no headless coverage — it needs a `localStorage`, so it was
  verified by driving the real browser and reading the store back.
- **The saved play library is per-browser and unsynced.** It is `localStorage`,
  so it does not follow the user to another device, and clearing site data loses
  it. Saving is capped at 100 plays and a full quota surfaces as an error rather
  than failing silently, but there is no export/import.

## 9. Possible next steps (options, not a queue)

- Create the `plays` table and exercise sharing across two real browsers.
- Port `steerToward`'s momentum model from `git show 082ff42:index.html`.
- Watch it animate in a real browser; there may be visual issues no pixel probe
  would catch.
- Add component tests around `FieldCanvas` interaction.
- Mobile/touch pass.

## 10. Anything else

- All work landed directly on `main` per explicit user instruction, including
  merging the unrelated single-file history rather than force-pushing over it —
  that was a deliberate choice to keep the old app recoverable. Normally this
  agent branches and asks before touching a default branch.
- `AGENTS.md` (from `create-next-app`) tells you to read
  `node_modules/next/dist/docs/` before writing code against this Next version.
  That advice is good and it is how the async-`params` and `next typegen`
  requirements here were found. New routes need `npx next typegen` before
  `PageProps<'/your/route'>` type-checks.
