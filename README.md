# Plotboard

A 2D American Football Playbook Designer & Play Simulator. Draw routes, customize defensive coverage, simulate pass trajectory physics, and export animations.

Everything lives in a single `index.html` — no build step, no bundler, no `npm install`. Open the file, or deploy the folder as-is.

## Running it

Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000   # → http://localhost:8000
```

Deploying to Vercel: the repo root is the static output directory, no configuration needed.

## Designing a play

- **Drag** any node to set its pre-snap alignment. An existing route travels with its player.
- **Click** an offensive node to select it, then **drag on open turf** to hand-draw a route (smoothed into a quadratic spline). Or apply a **Slant / Go / Out / Curl** preset.
- **Select the QB**, then click a point on a receiver's route to set the throw target. It snaps onto the nearest route.
- **Space** toggles playback, **R** resets, **Esc** deselects.

## How the simulation works

Receivers run their routes by arc length. Once the targeted receiver is 30% down their route, the QB releases the ball; it flies a real parabola — flight time comes from the throw distance, and the launch velocity is solved so height returns to zero exactly on arrival under gravity. When it lands, the closest player to the spot wins it: a defender inside 1.6 yd is an **interception**, an offensive player inside 2.0 yd is a **completion**, anything else falls **incomplete**.

Defenders run one of three shells:

| Coverage | Behavior |
| --- | --- |
| Man-to-Man | Each defender chases its assignment's position from ~0.28 s ago, so tracking looks reactive rather than glued. |
| Zone (Cover 2) | Two deep halves, two flats, one hook. |
| Zone (Cover 3) | Three deep thirds, two underneath curl/flat. |

Zone defenders sit on their landmark until a receiver crosses the boundary threshold — then they break and pursue. Any live ball pulls every defender toward the landing spot.

The model stores positions in **field yards** (x: 0–120 including endzones, y: 0–53.3), never pixels. The renderer converts to device pixels at draw time, so the play is resolution-independent and serializes cleanly for sharing. The canvas scales by `devicePixelRatio` to stay crisp on retina.

## Saving & sharing

"Share Play" writes the play and updates the URL to `?play=<id>`; loading that URL restores the play.

Without credentials it saves to `localStorage`, so links only work in the same browser. To share across devices, paste a Supabase URL and anon key into the **Supabase connection** panel (kept in `localStorage`, never sent anywhere else). A cloud write that fails falls back to a local save rather than losing the play.

Expected schema:

```sql
create table plays (
  id          text primary key,
  title       text,
  positions   jsonb,   -- { QB: {x,y}, WR1: {x,y}, ... } starting coordinates
  routes      jsonb,   -- { WR1: [{x,y}, ...], ... } drawn paths
  pass_target jsonb,   -- {x,y} or null
  formation   text,
  coverage    text
);
alter table plays enable row level security;
create policy "public read"   on plays for select using (true);
create policy "public insert" on plays for insert with check (true);
```

Those policies make every play world-readable and let anyone insert — appropriate for a public playbook, not for private data.

## Exporting

"Record & Download" resets the play, replays it once at 1.0x while capturing frames, and downloads the clip.

- **GIF** uses an inline GIF89a encoder (600 px wide, 15 fps, 100 frames max) — no CDN, no worker.
- **WebM** uses `MediaRecorder` over `canvas.captureStream()`, at full stage resolution.

### Why the GIF encoder is hand-rolled

The brief called for a `gifshot` CDN bundle. It was tried first and rejected: its existing-images path never invokes its callback in this app, hanging the export with no way to recover, and `gifshot-plus@1.0.2` is a near-identical fork of gifshot 0.4.5 with the same behavior. Since a hung export is worse than no export, `index.html` ships its own encoder — uniform 3-3-2 RGB quantization into a fixed 256-color global palette, then standard variable-width LZW.

It's verified by round-tripping frames through the browser's own GIF decoder and comparing pixels: gradients, solids, and pure noise (which exercises every code-size boundary and a full dictionary flush) all decode with zero mismatches. A stage-sized frame encodes in ~13 ms, so a typical play lands near 1.3 s.

## Attribution

Built with Claude Code.
