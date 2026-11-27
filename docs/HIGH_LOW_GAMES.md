# High-Low-Total and High-Low

These are two independently calculated four-player games. They can be selected together with 8421 and Vegas. All four games include the existing configurable individual battles and running gross totals. Each has a separate history button and game-kind filter, backed by owner-only standalone snapshots in golf_high_low_rounds. New saves also write gross and putt statistics and apply the same individual-battle handicap/history updates as 8421. Team points remain separate from those battles.

The first played hole uses the entered driving-distance order: 1+4 versus 2+3. Subsequent pairings use the previous hole's gross strokes ascending, preserving prior order for ties. Starting at any hole is supported, wrapping through all eighteen holes. Missing earlier scores keep downstream pairings pending. Corrections recompute subsequent pairings and all points.

Compare the lower stroke count of each team (Low) and the higher count (High), each worth one point. High-Low-Total additionally compares the teams' sums for one point. Equal comparisons award zero. Each birdie adds one team point, eagle adds three, and albatross or better adds five. Bonuses stack across teammates and are offset against the opposing team's bonuses. A hole-in-one uses its actual relation to par; there is no separate Vegas multiplier. Each partner receives the full net team result, with opponents receiving the opposite amount.

Confirmed example on par 4: Paul 3, Davie 5, Nick 4, Ralf 4, distance ranks 1,2,3,4. Paul+Ralf win Low, High and Total plus one birdie point: +4 each in High-Low-Total, +3 each in High-Low; opponents lose the same amounts. Next pairing is Paul+Davie versus Nick+Ralf.

The new High-Low and standalone Vegas screens require all four actual scores on all eighteen holes; blanks never become par. In-progress games resume through existing local draft storage. After gross scores and individual results save, retrying a supplemental history request reuses the saved round ID and does not repeat statistics or individual updates. Each saved snapshot contains its own selected mode and rule version. History is private to the recorder, consistent with existing Vegas history. No account permissions or existing policies change. Game metadata stored alongside course data distinguishes new team modes in replay and gross statistics, and keeps other games’ points out of the 8421 season tally; multi-game rounds contribute 8421 points only when 8421 is selected. Older records without mode metadata retain their original interpretation.

Apply supabase/migrations/20261127055542_high_low_games.sql before deploying index.html, sw.js, scripts/high-low.js and scripts/high-low-ui.js together.

Validation includes independent calculator fixtures, source routing and save-isolation tests, setup distance validation, retry recovery, and PostgreSQL RLS and JSON validation. Legacy calculator and Vegas source blocks were compared with the prior release. Stale regression hashes for the existing 32-point albatross change and a pre-solo Larry-mode assertion were brought up to date; calculator behavior was not changed.

## Four game menu

8421 is selected by default. All four games use independent checkboxes, so any nonempty combination is supported. 8421 runs only when selected. Selecting Vegas starts the shared round at hole 1. Vegas alone offers driving distance (default) or manual drawn teams; multiple games always use driving distance; other combinations support any starting hole. Each mode can use the existing individual-battle toggle, per-pair settings, handicaps and Larry-mode option. The High-Low team calculations still use gross strokes regardless of those individual settings. Gross totals and entered-hole counts are shown above the selected games, and the same score entries update individual battles immediately.

New non-8421 rounds also record putts through visible controls. Saved team snapshots retain their matchups and a linked normal statistics round ID. Previous standalone High-Low histories remain viewable; prior entries are not retroactively inserted into personal statistics or used to update handicaps.

## Multiple games per round

New drafts and saved course metadata retain selectedGames. A single score/putt matrix and one set of individual battles feed all selected calculators. Saving writes one normal statistics round and one handicap/history update per active matchup. Vegas receives its own snapshot; both High-Low modes receive distinct stable UUIDs and game-kind snapshots linked to that same statistics round. Completed snapshot checkpoints prevent a retry of a later snapshot from repeating prior games or individual-battle updates. Existing drafts and history without selectedGames keep their previous behavior.

Live scoring, the completed-round recap, shared recap text and round replay show the selected games separately. Gross totals and individual battles appear once. The 8421 season tally includes a multi-game round only if 8421 was selected. Validation exercises all 15 nonempty game combinations, shared score corrections, selection/start behavior, metadata restoration, and retry failure after earlier game snapshots have succeeded.

## Gross-score videos

Confirming a hole in the shared game screen now triggers the same existing score video as 8421, once per hole regardless of how many games were selected. Selection uses actual gross strokes relative to that hole’s par: the best under-par score if present, otherwise the highest gross score. Game points and individual handicaps never affect the video. Double/triple bogey completion and media-failure fallbacks are inherited from the existing player; the last played hole remains on its result screen. Blank scores do not trigger a video or advance.

## Vegas first-hole pairing

Vegas alone offers driving distance (default) or manual drawn teams. Distance uses the existing 1+4 versus 2+3 ranks; drawing selects two members of team A and automatically assigns the remaining players to team B, hiding the distance inputs. Selecting more than one game forces driving distance and hides all drawing controls. Start-time validation enforces this even if stale drawing fields remain. Both choices feed the existing Vegas calculator through vegasDraw; drawn teams use a stable order (A1, B1, B2, A2) for subsequent ties. Existing scoring, videos, and individual battles are unchanged. The pairing method and derived order persist in draft/saved metadata.
