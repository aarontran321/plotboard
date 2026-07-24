# PlotBoard

Domain language for an interactive football play designer and simulator used by players and coaches to draft, simulate, and share plays.

## Language

**Play**:
The primary shared object: a named snap setup including every player's alignment and route, plus where the QB is throwing.
_Avoid_: Diagram, board, scheme (when meaning the saved unit)

**Coach**:
The primary author: builds Plays quickly, simulates them, and sends them for review.
_Avoid_: User, admin (when meaning the author role)

**Player**:
Someone who opens a Play (often shared), explores throw choices, and re-simulates — not the default authoring persona.
_Avoid_: Athlete, end user (when meaning this role)

**Pass Target**:
Where the QB is throwing on this Play — a required part of every Play (receiver route point or free throw spot).
_Avoid_: Throw, target, hotspot, pass (when naming this object)

**Share**:
Publishing a Play to an immutable link others can open and simulate.
_Avoid_: Send, export (when meaning the link publish action)

**Save**:
Persisting a Play into the author's personal library on this device (local for now) for reload and iteration.
_Avoid_: Bookmark, stash

**Route**:
An ordered path for one player, as waypoints (optionally expanded from a preset).
_Avoid_: Pattern, stem (when meaning one player's path)

**Formation**:
A pre-snap alignment template for one side of the ball.
_Avoid_: Set, look (when meaning alignment)

**Marketplace**:
A browsable library of reusable Formations and Routes (including famous ones) that drop into a Play — not a separate product surface that replaces the board.
_Avoid_: Store, gallery (when meaning this feature)
