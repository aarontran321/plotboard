# Plotboard — Handoff

Written for whoever (human or agent) picks this up next, with no prior context on the session that built it. Read this before touching `index.html`.

## 1. What this is

Plotboard is a single-file, single-page American football playbook designer and play simulator. Everything — HTML, Tailwind config, and ~1450 lines of vanilla ES6 — lives in [`index.html`](index.html). No build step, no `npm install`, no bundler. Open the file in a browser, or serve the repo root as a static site (Vercel needs zero config for this).

Repo: https://github.com/aarontran321/PlotBoard
State as of this handoff: **1 commit on `main`** (`082ff42`), pushed, working tree clean.

```
git log --oneline
082ff42 Add Plotboard playbook designer and play simulator
46b348e Initial commit          (empty scaffold: README, LICENSE, .gitignore)
```

## 2. How to pick this back up

```bash
git clone https://github.com/aarontran321/PlotBoard.git
cd PlotBoard
python3 -m http.server 8000   # or just open index.html directly
```

There is no test suite and no CI. All verification so far was done manually, in-browser, by executing JS against the live `state` object and DOM — see §6. If you continue this work, that's still the fastest way to check anything: open the file, then drive `state`, `step()`, `render()`, etc. directly from devtools/console.

## 3. Architecture — read this before editing

Everything hangs off one global `state` object (`index.html:403`) and a `view` transform (`index.html:439`). The mental model:

- **Model space is field yards, not pixels.** `x: 0–120` (0–10 and 110–120 are endzones), `y: 0–53.3` (sideline to sideline). Every player, route, and the pass target are stored in yards. Conversion to device pixels happens only at draw time via `X()`, `Y()`, `S()` (`index.html:464-466`) and back via `toField()` (`index.html:467`). **Never store pixel coordinates in `state`** — that's what makes the play serializable and resolution-independent.
- **`state.players`** — 10 entries (`QB, WR1, WR2, RB, TE, CB1, CB2, FS, MLB, OLB`), each built by `makePlayer()` (`index.html:422`). Has both `start` (pre-snap alignment, the source of truth) and `pos` (live position during a sim).
- **`state.routes`** — offensive id → array of `{x,y}` points in yards. Only offense gets routes; QB routes are optional (unrouted QB takes a small automatic drop-back, see `step()`).
- **`state.passTarget`** — `{x,y}` or `null`, set by clicking near a route while the QB is selected.
- **Simulation is a pure function of time**: `step(dt)` (`index.html:615`) advances everything by `dt` seconds — receivers walk their route by arc length, defenders steer toward a computed goal, the ball flies its parabola. `resetPlay()` (`index.html:584`) rewinds everyone to `start`. This separation (state mutation in `step`, no side effects in `render`) is what let me test the whole play by calling `step()` in a loop from the console without needing `requestAnimationFrame` — keep it that way.
- **`render()`** (`index.html:1067`) is a pure draw of current `state` — field, zones, routes, players, target, ball. It does not mutate state. `loop()` (`index.html:1079`) is the only place `step()` and `render()` are wired to `requestAnimationFrame`.
- **Pointer interaction** (`index.html:1089` onward) is a tiny state machine on the module-level `drag` object (`index.html:420`), not on `state` — `drag.mode` is `null | 'player' | 'route'`. Selecting a node, dragging a node, and hand-drawing a route are three branches of the same `pointerdown` handler.

### Section map (grep `═══` in the file for these banners)

| Lines | Section |
|---|---|
| 296–400 | Field/physics constants, formations, defense base alignment, zone landmarks |
| 402–435 | `state`, `drag`, `makePlayer` |
| 436–467 | Canvas sizing/scaling, yard↔pixel transforms |
| 469–539 | Geometry helpers (`pathLength`, `pointAtDistance`, `nearestOnPath`, `simplify`) + route presets |
| 541–599 | `applyFormation`, `applyCoverage`, `resetPlay` |
| 600–794 | The simulation: `step`, defender AI (`defensiveGoal`, `steerToward`), ball physics (`launchBall`, `updateBall`, `resolveCatch`), `finishPlay` |
| 796–1075 | All canvas drawing |
| 1076–1170 | Animation loop + pointer interaction |
| 1171–1282 | UI wiring (buttons, inspector panel, toasts, status) |
| 1283–1443 | Supabase + localStorage persistence, serialize/deserialize, share URL |
| 1444–1577 | **Hand-rolled GIF89a/LZW encoder** — see §5, this is the part most likely to need care |
| 1578–1712 | Export orchestration (GIF capture loop + WebM via MediaRecorder) |
| 1713–1758 | Keyboard shortcuts, `init()` |

## 4. What's implemented (matches the original spec)

- **3-column dark dashboard** (#0B0F19/#111827/#0F172A), Tailwind via CDN (`tailwind.config` inline, `index.html:23`).
- **Formations**: Shotgun Spread, I-Formation, Singleback (`FORMATIONS`, `index.html:336`).
- **Coverages**: Man-to-Man, Zone Cover 2, Zone Cover 3 (`ZONES`, `MAN_ASSIGN`, `index.html:370-398`).
- **Speed slider** 0.5x/1.0x/1.5x, applied as a multiplier on `dt` in `loop()`.
- **Drag-and-drop** of all 10 nodes; dragging a node that already has a route drags the route with it (`pointermove` handler, `index.html:1108` area).
- **Hand-drawn routes** via quadratic-spline smoothing (`tracePath`, `index.html:884`) — the model stores raw simplified points (`simplify`, `index.html:503`), smoothing is a render-time-only transform.
- **Route presets**: Slant, Go, Out, Curl (`buildPreset`, `index.html:527`) — geometric, relative to the selected player's position and which side of the field they're on.
- **QB pass targeting**: click near a route while QB is selected → snaps to nearest point on nearest route within a threshold (`setPassTarget`, `index.html:1156`).
- **Throw physics**: real parabolic arc — flight time from horizontal distance ÷ throw speed, launch `vz` solved so `z(flight) = 0` exactly (`launchBall`, `index.html:735`). Release triggers automatically once the target receiver is 30% down their route (`PHYS.RELEASE_AT`).
- **Catch resolution**: on landing, whoever (any player, any team) is closest to the spot wins it — defender within `PICK_RADIUS` → intercepted, offense within `CATCH_RADIUS` → complete, else incomplete (`resolveCatch`, `index.html:767`).
- **Defensive AI**: man coverage chases a *delayed* copy of the assignment's position (`delayedPos`, `index.html:670` — reads from a per-player position history buffer, ~0.28s lag) so it looks reactive, not telepathic. Zone coverage sits on a landmark and breaks toward the nearest intruding receiver once inside its radius (`defensiveGoal`, `index.html:686`). Steering uses acceleration + drag + a speed cap (`steerToward`, `index.html:715`), not direct teleport.
- **Save & Share**: `serialize()`/`deserialize()` (`index.html:1289`/`1309`) round-trip formation, coverage, positions, routes, and pass target. `sharePlay()` writes to Supabase if connected, else `localStorage`; either way it updates `?play=<id>` in the URL. A failed Supabase write still falls back to a local save so work is never lost (`index.html:1380` area, the `catch` block). `loadFromUrl()` (`index.html:1429`) tries Supabase first, then local, on boot.
- **Supabase config widget**: URL + anon key inputs, persisted to `localStorage`, never sent anywhere but the user's own configured instance.
- **Export**: GIF (custom encoder, see §5) or WebM (`MediaRecorder` + `canvas.captureStream(60)`). Forces 1.0x speed during recording regardless of the UI slider, restores it after. Shows a spinner overlay with live progress during GIF encoding.
- **Retina scaling**: `resizeCanvas()` (`index.html:450`) sizes the backing store by `devicePixelRatio` and draws in CSS pixels via `ctx.setTransform`.
- **Keyboard shortcuts**: Space = play/pause, R = reset, Esc = deselect (`index.html:1713`).

## 5. The one deliberate deviation from spec — read this before touching export

The original brief specified pulling in `gifshot-plus@1.0.2` from a CDN for GIF export. **It doesn't work.** Its existing-images encode path never invokes its callback in this app — confirmed by kicking off encodes with as few as 2 tiny frames and polling for up to 9+ seconds with nothing returned, both with and without a `requestAnimationFrame` shim (ruled out rAF starvation as the cause). I also checked whether the plain `gifshot@0.4.5` package would behave differently — it's byte-for-byte the same codebase (`gifshot-plus` is a thin fork), so it would fail identically. Since a hung export button is strictly worse than no export button, I removed the CDN dependency entirely and wrote a self-contained encoder instead:

- **`buildPalette()`** (`index.html:1451`) — fixed 256-color palette, uniform 3-3-2 RGB quantization (3 bits R, 3 bits G, 2 bits B). No median-cut/adaptive palette — the field's color range is small and known, so a fixed palette keeps encoding to one cheap pass per frame.
- **`quantize()`** (`index.html:1463`) — RGBA pixels → palette indices.
- **`lzwEncode()`** (`index.html:1482`) — standard GIF variable-width LZW. **This is the part that had a real bug during development**: the code-size growth point is subtle because a GIF *decoder* builds its dictionary one entry behind the encoder (it can only add an entry once it reads the *next* code, not the one that triggered the addition). Growing the code width at the naive point desyncs the whole rest of the stream into garbage from that pixel onward. The comment directly above the function (`index.html:1482-1491`) explains the exact off-by-one and why `next === (1 << codeSize) + 1` is the correct trigger, not `next === 1 << codeSize`. **If you ever touch this function, re-run the verification in §6 before trusting it** — a subtly wrong LZW encoder still produces a file that *looks* like a valid GIF (right header, right trailer, right dimensions) while silently corrupting most of the pixel data past the first size boundary. That failure mode is easy to ship by accident.
- **`GifWriter` class** (`index.html:1542`) — streaming builder (`addFrame()` per frame, `finish()` returns a `Blob`). Built as a class specifically so `exportPlay()` can `await` a `setTimeout(0)` between frames and keep the progress overlay (`N / total frames`) actually repainting, rather than freezing behind one long synchronous encode.
- Capture pipeline: `captureFrame()` (`index.html:1587`) downsamples the live canvas into a small scratch canvas (`GIF_WIDTH = 600`px wide, aspect-locked) via `drawImage` + `getImageData`, at `GIF_FPS = 15` (i.e. every 4th tick of the 60fps loop), capped at `GIF_MAX_FRAMES = 100` (~6.6s of play). `getImageData` was chosen over `toDataURL('image/png')` per frame — the latter is a full PNG encode per frame and is dramatically slower for no benefit here since the pixels get re-encoded into GIF anyway.

**Measured performance** (in-browser, this session): a stage-sized frame (600×267ish) encodes in ~13ms; a full 22-frame play encoded end-to-end (capture + encode) in ~230ms total. Pure-noise stress test at 300×200 (worst case for LZW — defeats compression, forces every code-size boundary plus a full dictionary flush) still encoded in 17ms with zero pixel errors on decode.

The README (`README.md`, "Why the GIF encoder is hand-rolled" section) has the same explanation for end users — keep both in sync if this changes.

## 6. How this was verified this session (and how to re-verify)

There's no automated test suite, so re-verification means re-running these checks by hand via the Browser tool's `javascript_exec` (or plain devtools console) against the live page:

1. **GIF round-trip correctness** — encode a canvas of known pixels with `GifWriter`, decode the resulting blob with a real `<img>`, `drawImage` it back to a canvas, `getImageData`, and diff every pixel against the *quantized* source (not the original — quantization is intentionally lossy). Tested solid color, gradient, small noise (crosses the 9→10 bit boundary), and large noise (crosses 10→11→12 and forces a full dictionary flush + reset). All passed with **zero** mismatched pixels after the LZW fix. Before the fix, the same test caught 53% of pixels wrong, first divergence at exactly the first code-size boundary crossing.
2. **Full export pipeline** — ran the real `captureFrame()` capture loop against a properly-sized canvas, encoded with `GifWriter`, decoded the result, and rendered it full-screen to visually confirm the play (field, routes, players, target, correct aspect ratio) is actually in the file, not just structurally valid bytes.
3. **36-scenario regression sweep** — every combination of 3 formations × 3 coverages × 4 route presets (with a pass target auto-placed 90% down WR1's route), run via `step()` in a tight loop (no rAF needed). Checked: every scenario resolves to an outcome (no infinite hang), no player's position ever goes non-finite or off the 0–120 / 0–53.3 field bounds, and outcomes actually vary by scenario (27 complete / 6 incomplete / 3 intercepted — proof the defense placement matters, not just a fixed catch-every-time bug).
4. **Interaction layer** — synthetic `PointerEvent`s dispatched at real canvas coordinates (via `X()`/`Y()`) to click-select nodes, drag nodes, hand-draw routes, verify route-follows-node on drag, select QB, click a route to set target, verify off-route clicks get rejected.
5. **Persistence round-trip** — `serialize()` → `btnShare` click → read back the generated `localStorage` entry by the ID in the share URL → `deserialize()` into a wiped board → `JSON.stringify` before/after compared byte-identical.
6. **Library availability** — confirmed Tailwind, Supabase SDK, and (before removal) the gifshot CDN URL all resolve over the network from this environment.

## 7. Bugs found and fixed this session (beyond the GIF LZW issue in §5)

- **Canvas could permanently collapse to 0×0.** `resizeCanvas()` read `canvas.parentElement.clientWidth`, which is `0` for a backgrounded/hidden tab (this is how the Browser tool's tab behaves when not fronted — not exotic, will also happen for e.g. a `display:none` ancestor during some app-shell transition). Committing a `0` width zeroed `view.scale` permanently, breaking rendering and making `canvas.toDataURL()` return the degenerate `"data:,"`. Fixed with an early-return guard (`index.html:456`) plus a `ResizeObserver` on the canvas's parent (`index.html:1723` area) instead of only listening to `window.resize` — a `ResizeObserver` also fires when the element *first* gains real width, which a window-level resize event never reports.
- **Dead/unreachable code in `resolveCatch()`.** An early draft nulled `state.ball` and then had a branch that read `state.ball?.receiverId` afterward — always `undefined`, never executed meaningfully. Removed; see the current clean version at `index.html:767`.
- **Zone shell visibility.** The translucent circles marking zone landmarks (`drawZones`, `index.html:1051`) were originally too faint (`rgba(239,68,68,.055)` fill) to read against the turf. Bumped opacity.

## 8. Known limitations / things I did not verify

- **Real Supabase connection was never tested against a live instance** — only the localStorage fallback path (which is exercised thoroughly, see §6.5) and the *shape* of the client construction (`supabase.createClient(url, key)`) and query calls (`supa.from('plays').insert(...)`, `.select('*').eq('id', id).single()`). If you wire up a real project, sanity-check the schema in the README matches what you create, and check CORS/RLS behavior from a real browser session, not just this session's file:// origin.
- **Touch input was not tested.** Pointer events (`pointerdown`/`pointermove`/`pointerup`) are used rather than mouse events specifically so touch should work via the browser's pointer-event unification, but no touch-specific interaction (multi-touch, touch-drag scrolling conflicts) was verified.
- **No automated tests exist.** Everything in §6 was ad hoc console-driven verification during this session, not saved as a runnable suite. If this project grows, that's the first infrastructure gap to close — the `step()`/`render()` purity (see §3) makes it very feasible to write real unit tests against `state` without needing a headless browser for most of the physics/AI logic.
- **Tailwind is loaded from the CDN build** (`cdn.tailwindcss.com`), which prints a "should not be used in production" console warning by design. Fine for a demo/single-file deliverable; would need a real PostCSS/CLI build to remove.
- **Supabase RLS policies documented in the README are fully public** (anyone can read and insert into `plays`). Appropriate for a public playbook sharing tool, not for anything with private data — flagged explicitly in the README so a future integrator doesn't miss it.
- **GIF export caps at 100 frames / ~6.6s of play at 15fps**, and downsamples to 600px wide regardless of the live canvas size. These are tunable constants (`GIF_WIDTH`, `GIF_FPS`, `GIF_MAX_FRAMES`, `index.html:1580-1582`) — if a play runs long (the hard sim timeout is `PHYS.PLAY_TIMEOUT = 9` seconds, `index.html:329`), the GIF will just stop capturing at the frame cap rather than truncating gracefully or warning the user. Worth a small UX improvement if this comes up.

## 9. Suggested next steps (not started, no commitments made)

Pick based on what the project actually needs — these are options, not a queue:

- Wire and test a real Supabase project end-to-end (create the `plays` table per the README schema, confirm RLS policies, share a play across two actual browsers/devices).
- Add a lightweight unit test harness around the pure simulation functions (`step`, `defensiveGoal`, `resolveCatch`, `lzwEncode`/`GifWriter` round-trip) — the architecture already supports this cleanly since none of them touch the DOM.
- Mobile/touch pass: verify drag/draw/select on an actual touchscreen, not just synthetic pointer events.
- If the file grows much further, consider splitting into modules (still buildable as a single bundled `index.html` via a simple bundler) — at ~1450 lines it's still comfortably readable as one file, but that's a ceiling, not a target.
- Replace the Tailwind CDN with a compiled stylesheet if this moves toward a real production deployment rather than a single-file demo.

## 10. Anything else worth knowing

- The live demo play loaded on boot (`init()`, `index.html:1722`) auto-builds a Go/Slant/Curl combo with a target already placed — that's intentional, so the board is never empty on first load, not leftover debug state.
- All work this session happened directly on `main` per explicit user instruction (no PR, no review branch) — normally this agent defaults to a feature branch + confirmation before touching the default branch; that was a one-time choice for this repo, not a standing policy.
