# High-Low-Total and High-Low

These are two separately selectable four-player modes. The team games do not run 8421 or Vegas team calculations. All four selectable modes now include the existing configurable individual battles and running gross totals. Each has a separate history button and game-kind filter, backed by owner-only standalone snapshots in golf_high_low_rounds. New saves also write gross and putt statistics and apply the same individual-battle handicap/history updates as 8421. Team points remain separate from those battles.

The first played hole uses the entered driving-distance order: 1+4 versus 2+3. Subsequent pairings use the previous hole's gross strokes ascending, preserving prior order for ties. Starting at any hole is supported, wrapping through all eighteen holes. Missing earlier scores keep downstream pairings pending. Corrections recompute subsequent pairings and all points.

Compare the lower stroke count of each team (Low) and the higher count (High), each worth one point. High-Low-Total additionally compares the teams' sums for one point. Equal comparisons award zero. Each birdie adds one team point, eagle adds three, and albatross or better adds five. Bonuses stack across teammates and are offset against the opposing team's bonuses. A hole-in-one uses its actual relation to par; there is no separate Vegas multiplier. Each partner receives the full net team result, with opponents receiving the opposite amount.

Confirmed example on par 4: Paul 3, Davie 5, Nick 4, Ralf 4, distance ranks 1,2,3,4. Paul+Ralf win Low, High and Total plus one birdie point: +4 each in High-Low-Total, +3 each in High-Low; opponents lose the same amounts. Next pairing is Paul+Davie versus Nick+Ralf.

The new High-Low and standalone Vegas screens require all four actual scores on all eighteen holes; blanks never become par. In-progress games resume through existing local draft storage. After gross scores and individual results save, retrying a supplemental history request reuses the saved round ID and does not repeat statistics or individual updates. Each saved snapshot contains its own selected mode and rule version. History is private to the recorder, consistent with existing Vegas history. No account permissions or existing policies change. Game metadata stored alongside course data distinguishes new team modes in replay and gross statistics, and keeps their points out of the 8421 season tally. Older records without mode metadata retain their original interpretation.

Apply supabase/migrations/20261127055542_high_low_games.sql before deploying index.html, sw.js, scripts/high-low.js and scripts/high-low-ui.js together.

Validation includes independent calculator fixtures, source routing and save-isolation tests, setup distance validation, retry recovery, and PostgreSQL RLS and JSON validation. Legacy calculator and Vegas source blocks were compared with the prior release. Stale regression hashes for the existing 32-point albatross change and a pre-solo Larry-mode assertion were brought up to date; calculator behavior was not changed.

## Four game menu

8421 is selected by default. Vegas, High-Low-Total and High-Low are separate choices; new Vegas rounds no longer calculate an additional 8421 game. Each mode can use the existing individual-battle toggle, per-pair settings, handicaps and Larry-mode option. The High-Low team calculations still use gross strokes regardless of those individual settings. Gross totals and entered-hole counts are shown above the selected game, and the same score entries update individual battles immediately.

New non-8421 rounds also record putts through visible controls. Saved team snapshots retain their matchups and a linked normal statistics round ID. Previous standalone High-Low histories remain viewable; prior entries are not retroactively inserted into personal statistics or used to update handicaps.
