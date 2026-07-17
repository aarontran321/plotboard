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
    FieldCanvas.tsx       Canvas, pointer interaction, animation loop
    LeftPanel/RightPanel  Controls
    ui.tsx                Flat primitives (Button/Panel/Section/Badge)
  lib/
    field.ts              Geometry constants, world<->screen transforms, palette,
                          neutral-zone rules (clampToSide/violatesScrimmage)
    geometry.ts           Quadratic Bezier smoothing, arc-length sampling
    formations.ts         7v7 personnel (4 offensive + 5 defensive formations),
                          alignments, derived man/zone assignments
    routePresets.ts       Route shapes, mirrored per side of the field
    simulation.ts         Movement, throw physics, defensive AI   <- DOM-free
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
- **The animation loop only runs while playing.** An idle board holds no
  animation frame. Static repaints happen in an effect after render. If you add
  something that animates while idle, you are probably doing it wrong. There are
  exactly three deliberate exceptions, all narrow and all self-terminating: the
  QB throw guides (only while the QB is selected), the formation transition, and
  the boundary-warning flash. The latter two share one `pump()` loop that stops
  the moment both are idle.
- **Interaction is strictly mode-switched.** `pointerdown` decides *once*,
  from `drawMode`, whether a gesture is a `drag` or a `route`, and records that
  on `interactionRef`. `pointermove` only services the gesture already chosen —
  there is no path from `drag` to `route`. That separation is the whole fix for
  the move-vs-draw bug; don't reintroduce a heuristic.
- **No glows. Still.** The boundary warning is a flat red *ring*, not a glow,
  because the brief that asked for it did not know about this rule.
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

- **3-column flat dark workspace** (#0B0F19 / #111827 / #0F172A, #1F2937 borders).
  Strictly no glows: there is not one `shadowBlur`, `box-shadow`, `text-shadow`,
  or gradient in `src/` — that was a hard requirement, and `grep` enforces it.
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
- **Drag-and-drop** all 14 nodes; a node's route drags with it.
- **Hand-drawn routes** (quadratic-smoothed) and **presets** (Slant/Go/Out/Curl),
  mirrored so "inside" means toward the hashes regardless of which side you're on.
  Drawing is behind a **Draw Route Mode** toggle (button, or `D`) — by default a
  drag on a player moves them, full stop.
- **QB pass targeting**: with the QB selected (and not in draw mode), click a
  receiver's route to snap a target onto it. The QB node is drawn with a gold
  double ring and star badge, and when selected it shows marching guide lines to
  each active route plus a ghost target under the cursor.
- **Throw physics**: release at 30% route progress; flight time from horizontal
  distance ÷ throw speed; launch velocity solved so `z(duration) = 0` exactly.
  Nearest player to the landing spot wins it → Completed / Intercepted / Incomplete.
- **Defensive AI**: man coverage chases a **250ms-delayed** copy of the
  assignment's position (this is why a sharp break creates separation); zone sits
  on a landmark and breaks on the nearest intruder inside its radius; everyone
  within 14yd breaks on the ball once it's up.
- **Undo/redo** over snapshots (alignments, routes, pass target, *and* the line
  of scrimmage). **Shortcuts**: Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z, Space =
  play/pause, R = reset, D = toggle Draw Route Mode, Esc = deselect.
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

**`npm run verify` — 114 headless assertions.** This closes the "no automated
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
  that defensive linemen aren't inert, not because the rush is modelled.
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
