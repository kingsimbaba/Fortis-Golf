# Multi-group gross tournaments

Implemented against `kingsimbaba/Fortis-Golf` main, commit `313255f`.

## Existing model validation

The current app reads `courses`, `holes` and `course_combos`, and builds an ordered 18-hole round layout containing display name, par, handicap, source course ID, and round-hole index. Selected player names are positional: each score matrix row follows `round.players` order. Back-nine starts change playing order, not score matrix indices.

`live_rounds` stores active group snapshots (`round_data`, `round_hole`, timestamp and active flag). `fortis_rounds` and `hole_scores` are written at save time, not on each edit. The existing save routine substitutes par for blanks through the last played hole. Consequently neither historical score rows nor the active flag are reliable evidence that tournament players completed holes.

The repository has no baseline schema, deployed policies, or Supabase credentials. Data field usage has been checked in the current source; production column types and existing-table RLS have not been inspected. The new migration only introduces new tables and functions; it has no dependency on legacy round ID types and changes no existing scoring rules or rows.

## Confirmed rules

- All groups use the same ordered 18-hole layout and pars.
- Organizer invites existing signed-in users by Supabase user ID and can designate scorers. Viewer invitations confer no scoring rights. Each scorer has one group per event, with 2–4 players; player names cannot repeat across groups.
- Each entered positive integer score is a completed hole for that player. Blank scores remain null and contribute neither strokes nor par. No invented par scores or handicap adjustments.
- Live order: gross strokes minus par for each player's completed holes. Show completed holes and gross alongside the relative score. Unstarted players remain unranked. Players with different progress can share rank.
- Organizer explicitly publishes final results after all intended groups have joined. Publication requires all players' 18 scores; lower total gross wins. Competition ties use 1, 2, 2, 4 with no tiebreaker. Alphabetical display within a tie does not change rank.
- Scorers can correct completed scores after publication; results recalculate on the next refresh. Final groups cannot withdraw or add players. Rosters remain fixed; before publication a scorer may withdraw and relink a corrected roster.
- Group 8421 calculations, bonuses, pairings, Larry mode, saved statistics and handicap updates retain their existing behavior. Tournament corrections update tournament scores only; they do not rewrite previously saved 8421 history.

## Access and updates

`golf_events`, `golf_event_members`, and `golf_event_groups` are participant-readable through RLS. Direct client inserts/updates/deletes are denied. All writes go through `golf_event_command`, which checks authentication, membership, organizer/scorer permissions, course, roster and score shape. An event row lock serializes concurrent membership, group, and finalization changes. Revision checks prevent stale devices from overwriting corrections.

Each device queues captured score snapshots. A failed upload is shown and blocks later writes until retry or explicit cloud reload. Retry keeps the same revision, so conflicts remain protected. Local scores persist through failed uploads. Saving the legacy round first flushes tournament uploads. Cancellation requires withdrawal first to prevent leaving discarded tournament scores behind.

The leaderboard polls authenticated data every 10 seconds while visible, with errors shown rather than silently treated as an empty result. Database and auth responses bypass the service worker cache. This release changes the cache version to remove previously cached responses. No service-role credentials are shipped to the client.

Existing `live_rounds` sharing and historical-table permissions are outside the new event policies. Their deployed RLS must be audited separately before claiming that all legacy group scores are private.

## Use

Start a normal round, then use the new tournament panel below the scoring controls. Organizer creates an event, copies its displayed ID, and invites viewers or scorers by user ID. Each scorer starts their normal group round with the same course, opens that event ID, and links their group. Invited viewers can use the tournament button on Home without starting a round.

For corrections on another device or after saving a round: start a round with the same course and player order, open the event, and select “載入本組雲端桿數”. Review the overwrite confirmation, then edit normally. Do not save this temporary correction round into 8421 history unless a separate historical round is actually intended.

## Validation and release

Install development dependencies (`npm install`), then run `npm test`. Tests execute the migration in PGlite PostgreSQL with synthetic Supabase auth roles, run permission and mutation checks, exercise 12-player ranking and corrections, and test the client upload queue. Existing tests remain included. PGlite module location may alternatively be supplied with `PGLITE_MODULE`.

Local result: **33 passed, zero skipped**, including existing 22 tests. The additive migration was subsequently installed in the Fortis-Golf Supabase project. Before-and-after fingerprints matched for all 39 saved rounds, 2,628 hole score rows, 114 matchups and 1,620 course holes. The app release uses the existing GitHub-to-Vercel deployment.

Release sequence: review the additive SQL, apply it to a staging Supabase project, test three real scorer sessions and an invited viewer, then apply the migration and deploy the updated assets together. Existing 8421 works without the new migration, but tournament controls report unavailable until it is installed. The user confirmed access and 18-hole decisions before schema preparation, then authorized production deployment. Existing tables and 8421 rules were not changed.
