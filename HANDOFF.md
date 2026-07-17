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
- **The Supabase `plays` table does not exist.** Verified directly against the
  project: the publishable key authenticates fine (PostgREST answers `404
  PGRST205`, not `401`), the table is simply absent. Run
  [`supabase/schema.sql`](supabase/schema.sql) in the Supabase SQL editor to
  create it. Until then Share falls back to `localStorage` (see §4) — it works,
  but links only open in the browser that made them.
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
    field.ts              Geometry constants, world<->screen transforms, palette
    geometry.ts           Quadratic Bezier smoothing, arc-length sampling
    formations.ts         Personnel, alignments, man assignments, zone landmarks
    routePresets.ts       Route shapes, mirrored per side of the field
    simulation.ts         Movement, throw physics, defensive AI   <- DOM-free
    render.ts             All canvas drawing                       <- no mutation
    history.ts            Undo/redo over snapshots
    playSchema.ts         Validation at the trust boundary
    localPlays.ts         localStorage fallback for sharing
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
- **The animation loop only runs while playing.** An idle board holds no
  animation frame. Static repaints happen in an effect after render. If you add
  something that animates while idle, you are probably doing it wrong.
- **The field is cached** to an offscreen canvas and blitted (`background` in
  `SceneOptions`), rather than re-stroking ~400 hash marks per frame.
- **Pointer interaction** is a small state machine on `interactionRef`
  (`none | drag | route`), not React state — per-move `setState` on a drag would
  be the hot path.

## 4. What's implemented

- **3-column flat dark workspace** (#0B0F19 / #111827 / #0F172A, #1F2937 borders).
  Strictly no glows: there is not one `shadowBlur`, `box-shadow`, `text-shadow`,
  or gradient in `src/` — that was a hard requirement, and `grep` enforces it.
- **Formations**: Shotgun Spread, I-Formation, Singleback. **Coverages**: Man,
  Cover 2, Cover 3, with zone shells drawn so the shell is legible, not implied.
- **Drag-and-drop** all 10 nodes; a node's route drags with it.
- **Hand-drawn routes** (quadratic-smoothed) and **presets** (Slant/Go/Out/Curl),
  mirrored so "inside" means toward the hashes regardless of which side you're on.
- **QB pass targeting**: with the QB selected, click a receiver's route to snap a
  target onto it.
- **Throw physics**: release at 30% route progress; flight time from horizontal
  distance ÷ throw speed; launch velocity solved so `z(duration) = 0` exactly.
  Nearest player to the landing spot wins it → Completed / Intercepted / Incomplete.
- **Defensive AI**: man coverage chases a **250ms-delayed** copy of the
  assignment's position (this is why a sharp break creates separation); zone sits
  on a landmark and breaks on the nearest intruder inside its radius; everyone
  within 14yd breaks on the ball once it's up.
- **Undo/redo** over snapshots. **Shortcuts**: Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z,
  Space = play/pause, R = reset, Esc = deselect.
- **Save & Share**: Server Action → Supabase → `/play/<id>`, resolved
  server-side. **On any failure it falls back to `localStorage`** so work is never
  lost; `/play/[id]` deliberately does **not** 404 on a database miss — it renders
  the board and retries against local storage on mount, and only then reports the
  play missing.
- **GIF export**: deterministic offscreen replay at a fixed timestep (not
  screen-scraping), so a slow machine produces the same GIF as a fast one.
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

**`npm run verify` — 50 headless assertions.** This closes the "no automated
tests" gap the previous handoff called its top infrastructure priority (§8).
Covers: path length/nearest-point math, preset mirroring, release timing, arc
monotonicity, ball landing on target, outcome agreeing with the nearest player,
**nobody exceeding their own top speed on any frame**, nobody leaving the field,
man coverage staying tight, Cover 2 vs Cover 3 depth differing, determinism, full
undo/redo semantics including redo-branch invalidation, and schema rejection of
10 classes of malformed input.

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
  on actual displacement.
- **Refs written during render** in `FieldCanvas`/`PlotBoard` — unsafe under
  concurrent rendering. Moved into effects.
- **Undo/Redo announced as "Ctrl+Z"/"Ctrl+Y"** to screen readers, because a bare
  `title` becomes the accessible name. Now `aria-label`.
- The previous handoff's §7 **canvas 0×0 collapse** does not apply here:
  `FieldCanvas` guards with `if (width > 0)` and observes the parent with a
  `ResizeObserver`. Worth keeping.

## 8. Known limitations / not verified

- **Never seen animate.** See §6. Highest-value first act: open it in a real
  browser and watch a play.
- **Supabase never exercised against a live table** — the table doesn't exist.
  The *error* path and the local fallback are both thoroughly verified; the
  success path is verified only in shape.
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
  don't exist; the browser checks in §6 were ad hoc.

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
