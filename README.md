# PlotBoard

An interactive 2D American football playbook designer and play simulator. Next.js
(App Router) + TypeScript + Tailwind v4, with all field rendering done through
vanilla HTML5 Canvas.

## Running it

```bash
npm install
npm run dev
```

Open http://localhost:3000.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run verify` | Headless checks of the simulation engine (50 assertions) |
| `npm run lint` | ESLint |

## Using the board

- **Click** a player to select them.
- **Drag** a player to move them. Their route moves with them.
- With a **receiver** selected, drag on open field to draw a route. Or use a
  preset (Slant / Go / Out / Curl), which mirrors correctly per side of the field.
- Select the **QB**, then click anywhere along a receiver's route to place the
  orange pass target.
- **Simulate Play** runs it. The QB releases once the target receiver is ~30%
  through the route; the ball flies a real parabolic arc and whoever is closest
  to the landing spot makes the play.
**Shortcuts:** **Space** play/pause · **R** reset · **Esc** deselect · **Ctrl+Z**
undo · **Ctrl+Y** / **Ctrl+Shift+Z** redo.

> Picking this up cold? Read [`HANDOFF.md`](HANDOFF.md) first — architecture,
> what's verified, what isn't, and the traps.

## Supabase setup (required for Share Play)

`.env.local` already holds the connection settings:

```env
NEXT_PUBLIC_SUPABASE_URL=https://tzoibhhxcbrncxdonrvd.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

**The `plays` table does not exist yet.** Until it does, Share Play falls back to
`localStorage`: the play is saved and the link works, but only in the browser that
created it. Nothing is lost either way.

To enable real sharing, run [`supabase/schema.sql`](supabase/schema.sql) in the
Supabase dashboard under **SQL Editor → New query**.

> **Security note.** That schema grants `anon` both select and insert, so the
> table is world-writable by anyone holding the publishable key — and that key
> ships in the client bundle, as it is designed to. This is acceptable for
> disposable play diagrams and nothing else. Before storing anything you care
> about, add auth and scope the policies to `auth.uid()`.

## Architecture

```
src/
  app/
    page.tsx              Board
    play/[id]/page.tsx    Shared play, fetched server-side (params is async in Next 16)
    actions.ts            'use server' — sharePlay
  components/
    PlotBoard.tsx         State owner: play, selection, playback, history
    FieldCanvas.tsx       Canvas, pointer interaction, animation loop
    LeftPanel/RightPanel  Controls
  lib/
    field.ts              Geometry constants, world<->screen transforms, palette
    geometry.ts           Quadratic Bezier smoothing, arc-length sampling
    formations.ts         Personnel, alignments, coverage landmarks
    routePresets.ts       Route shapes, mirrored per side
    simulation.ts         Movement, throw physics, defensive AI  (DOM-free)
    render.ts             All canvas drawing
    history.ts            Undo/redo over snapshots
    playSchema.ts         Validation at the trust boundary
    gif.ts                Offscreen replay + gifshot encoding
    supabase/             Browser + server clients (@supabase/ssr)
```

### Notes on a few decisions

**World units are yards.** The sim works in a 120 × 53.33 yard space with the
origin at the back of the left endzone; rendering scales to pixels. Speeds are
real (a receiver sustains ~8.5 yd/s), so the timing of a throw against a route is
meaningful rather than tuned by eye.

**One curve, two consumers.** `geometry.ts` builds the same quadratic Bezier
chain that `render.ts` strokes and that `simulation.ts` samples for movement, so
the route a receiver runs is exactly the one drawn.

**The sim is DOM-free and deterministic**, which is what lets `npm run verify`
exercise the physics and AI headlessly, and what makes GIF export reproducible:
export replays the play offscreen at a fixed timestep rather than screen-scraping,
so a slow machine produces the same GIF as a fast one.

**GIF weight** lands around 500 KB for a typical play (460px, 12fps, 60 frames
max). The knobs are at the top of `lib/gif.ts`. The turf speckle is deliberately
disabled for export — per-pixel noise is close to worst case for LZW and eats the
256-colour palette, for texture invisible at that size. Leaving it on roughly
quadruples the file.

**Defensive tracking latency** (250ms) is why a sharp break creates separation;
defenders chase where the receiver *was*.

**The field is cached** to an offscreen canvas and blitted, rather than
re-stroking every hash mark each frame. The animation loop only runs during
playback — an idle board holds no animation frame.
