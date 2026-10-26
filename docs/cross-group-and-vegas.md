# Compact Vegas totals and concurrent scoring verification — 26 October 2026

The live Vegas card now shows cumulative totals, current pairing and next pairing, with hole calculations and the per-hole table inside a closed details control. Saved Vegas history retains its per-hole breakdown. Statistics has no Vegas tally. Both calculation modules and persistence paths are unchanged.

Added integration coverage runs the actual score-change and hole-confirmation functions over four holes with real 8421 and Vegas calculators, checks each displayed cumulative 8421 result, and corrects an earlier score. An additional test reproduces the reported strokes 4/5/4/7, 3/4/4/4, 3/2/3/3 on par 4/4/3: first player's cumulative 8421 totals are -2, +2, -2. Hole 2 awards +4 for that hole, offsetting hole 1's -2. Hole 3 awards -4, returning the total to -2. This can resemble a stalled total, but the calculations are concurrent. No freeze was reproduced. All 60 tests pass; core 8421 calculator hashes remain unchanged.

---

# Live Vegas section — 26 October 2026

Vegas score entry now includes a separate results card after the existing gross/8421 leaderboard and before the unchanged stroke/putt controls. It shows current pairing, each player's selected-hole delta and overall Vegas total, next-hole pairing once scores are available, and completed-hole deltas with running totals. The selected pending hole remains visible; other unplayed rows are omitted. Previous-score edits recompute all results through the existing Vegas calculator. The card appears only for Vegas; standalone Individual 8421 is unchanged.

56 tests pass, including first-hole drawn teams, pending scores, next-hole pairing from gross scores, earlier corrections, unchanged score-entry markup after excluding the new card, and the existing 8421 calculator hashes. Neither scoring calculator, database schema, nor save behavior changes in this follow-up.

---

# Shared score-entry correction — 26 October 2026

This local review candidate supersedes the separate Vegas entry/save behavior described in the older implementation record below. Vegas now uses the unchanged Individual 8421 score-entry markup and calculators, including strokes, putts (default 2), hole confirmation and navigation. New Vegas rounds save through the ordinary 8421 statistics/matchup path and additionally store an owner-only Vegas snapshot derived from those same scores. Historical records are not migrated or recalculated.

Statistics shows current Vegas results separately; saved Vegas history shows both 8421 and Vegas totals. Cross-group ranking is a separate unchecked setup option or explicit Home action. An existing linked event remains enabled when resuming a round. Unlinked rounds do not create tournament controls or request event lists.

If the additional Vegas snapshot fails after normal saving completes, the local round records that completed stage. Retrying does not repeat the completed 8421 writes; score edits remain blocked until snapshot saving completes. The snapshot uses an immutable, namespaced legacy-round ID and ignores duplicate inserts to tolerate a lost response. The pre-existing sequence of legacy round/score/matchup requests is still not a database transaction; failures inside that older sequence remain an existing limitation.

Validation: 55 local tests pass, including identical rendered entry markup between modes, default putts, shared persistence and snapshot retry, unchanged calculator hashes, Vegas rules, cross-group opt-in, and synthetic database authorization/locking checks. No production database requests, migrations, pushes, or deployments were performed for this correction. Browser/device review remains a release check. Service-worker cache advances to 2026-10-26-01.

---

# Vegas and Cross Group Game — local implementation, 24 October 2026

Status: implementation complete locally with the user's confirmed Vegas and Peoria rules. Database migration installed and verified; application release is in progress. No historical data was changed.

## Repository and data review

Reviewed the latest available Fortis-Golf checkout, existing tournament migration, score entry/save/replay paths, client sync queue, tests and deployment notes. GitHub's latest commit is 6d3e886 (same tournament setup release; local equivalent commit 95b98d1). Existing score storage is positional: score matrix rows are holes, columns follow player order. Active rounds, historical rounds and tournament snapshots have different completion semantics. The legacy save path can substitute par for blanks, so Cross Group Games use explicit entered scores from the existing tournament snapshot path, never infer completion from historical par substitutions.

The deployed schema, function definitions, grants and public RLS policies were inspected through the connected Supabase project before migration. All existing policies compare unchanged afterward. Historical-data fingerprints match before migration and after transaction-isolated live permission tests: 40 saved rounds, 2,700 score rows, 1,620 holes and 119 matchups. No existing tournament rows were present. This checks release-specific data preservation and access controls, rather than claiming a complete security audit of all app features.

## Preserved behavior

Individual 8421 remains the default. The point, pairing, stroke allocation, bonus and individual calculation source blocks are byte-identical, verified by regression hashes. Its ordinary save path and historical statistical tables remain intact. New standalone modes bypass the legacy save/statistics/matchup path. No historical rows are deleted or recalculated.

Existing gross events receive only a game_kind discriminator defaulting to gross. Their original command implementation is retained privately behind an authorized dispatcher, preserving their published-score correction behavior. The original migration remains unchanged.

## Vegas

Opt-in mode requires four players and a manually entered permutation of 1–4, and starts at hole 1. Teams use positions 1+4 versus 2+3. Later order comes from the immediately preceding hole's ascending gross scores, retaining prior order for ties. Corrections recompute downstream order. Missing earlier scores leave later pairings pending, rather than treating blanks as par or inventing an order.

Separate score entry, active-round persistence, owner-only saved Vegas history include current-hole and accumulated points, plus a per-hole breakdown. New active and saved Vegas rounds include the rule version. Vegas points remain completely separate from Individual 8421 statistics.

Confirmed rules:

- Join complete gross scores, lower first when both are single digits: 4 and 5 → 45.
- Put 10+ first: 10 and 3 → 103. When both are 10+, larger first: 12 and 10 → 1210. Never truncate scores to a single digit.
- Lower team number wins. Equal team numbers score zero. Opposing numbers are never flipped.
- Multiply the difference by the winning team's highest achievement: birdie ×2, eagle or better ×5, hole-in-one ×10 on any par. Hole-in-one takes precedence. Do not stack partner multipliers. Losing-team achievements do not multiply points.
- Every winning partner gains the full multiplied difference and every losing partner loses that amount. No point cap. Totals stay zero sum.

User example, par 3: 2+5 forms 25, 3+3 forms 33; birdie gives 2 × (33 − 25) = 16 points to each winning partner and −16 to each opponent. Eagle example: 2+5 versus 4+4 on par 4 gives 5 × (44 − 25) = 95. A hole-in-one with partner 5 against 3+3 gives 10 × (33 − 15) = 180. Earlier-hole corrections recalculate both subsequent pairings and total points.

## Standalone Cross Group Game

Home has a separate Cross Group Game entry, with standalone gross entry for 2–4 players per group, independent of Individual and Vegas. Existing active Individual or Vegas scores can also feed a Cross Group Game without altering their group scoring mode. Historical saved rounds are not automatically imported, because substituted par scores do not prove actual completion.

Existing invitation and participant-readable RLS remain in place. New standalone modes and newly linked Cross Group rounds do not send score snapshots to the legacy public live_rounds table; Cross Group sharing uses authenticated event invitations. Existing Individual 8421 live behavior remains unchanged. Each group has one exclusive scorer, and each scorer has at most one group per event. The event organizer is the game administrator; no new global application-admin access to unrelated events is introduced. The administrator can override group scores, reassign a scorer to another invited scoring member, and finalize. Revision checks protect corrections and reassignment against stale clients. Every player's 18 scores and confirmed Peoria settings are required to finalize.

New Cross Group Games lock after finalization: score changes, administrator overrides, roster changes, scorer assignment, invitations, withdrawal, reroll and manual selection all fail server-side. Existing gross events keep their historical behavior.

Gross rankings use existing tournament scoring, with final gross ranking after 18 holes. Net results are withheld until finalization. Ties share competition rank.

## Peoria and secrecy

Each new game draws 12 distinct holes from all 18 by ordering the full hole population with independent database random values and taking 12. No front/back, par-total or hole-type balancing is imposed. Admin can reroll or submit 12 distinct hole numbers. This intentionally preserves the requested random selection rather than traditional balanced hidden-hole selection.

Hidden selections live in a new private table with RLS enabled, no participant read policies and no direct client grants. A narrowly scoped function exposes holes only to the event owner before finalization, and to invited participants after finalization. Raw holes are never placed in public event metadata, active round snapshots, local storage or the service-worker cache. Server operators/database owners can naturally inspect database data.

Formula: HDCP = (hidden strokes × 1.5 − actual course par) × 0.8; Net = actual 18-hole Gross − HDCP. Confirmed settings: double-par cap on hidden-hole handicap inputs only, handicap 0–36, one decimal, shared net ranks. These settings are shown explicitly; the administrator confirms the displayed rules per event before finalization. Gross scores are never capped. Because the requested draw is not par-balanced, hidden-hole par totals can vary and influence the calculated handicap.

Traditional reference: https://keisan.site/ja/exec/system/1375316408 . The 12-hole method is generally called New/Double Peoria; Japanese New New Peoria often means nine holes. Fortis retains the requested product name and 12-hole behavior.

## Validation

53 tests passed, zero failures or skips. The existing 38 tests remain included. New coverage includes manual draws, stable ties, missing scores, earlier corrections, separate Vegas persistence, complete-score digit concatenation, the exact user-provided par-3 example, multiplier precedence without stacking, any-par hole-in-one, equal team numbers, no point cap, point corrections and zero-sum totals, standalone Cross Group rendering, byte-identical legacy calculators, non-72 Peoria, caps, gross preservation, twelve-player results and ties.

The additive migration was executed locally in PGlite PostgreSQL with synthetic authenticated/anonymous roles and then applied to the Fortis-Golf database as migration 20261024090829 (cross_group_games_and_vegas). Tests cover outsider/viewer isolation, raw secret-table denial, private helper RPC denial, scorer ownership, owner overrides, stale revisions, scorer reassignment, invalid selections, all-18 draw coverage, final publication, every post-final mutation path, historical event preservation, and owner-only Vegas history. Existing RLS definitions were not weakened. Local tests use synthetic data; deployed-database checks create transaction-isolated test events using existing account IDs and roll back every test record.

Run: npm install, then npm test. Alternatively set PGLITE_MODULE to an installed @electric-sql/pglite module. Live role-switched SQL tests passed for owner/scorer/viewer/outsider access, secret access denial, stale revisions, post-final locks and reveal, Vegas ownership, and retained legacy final-score corrections. All test records were rolled back, then historical fingerprints were verified unchanged. No physical-phone or real multi-session browser validation has been performed.

## Deployment work not performed

Schema review, database installation and transaction-isolated role checks are complete. Application publication, production asset verification and real multi-session browser validation remain release steps.

The migration is supabase/migrations/202610240001_cross_group_games.sql and expects the existing 202610230001 migration. Deploy the new modules, index and service worker together. The application build/cache versions advance to 2026.10.24.02. Database installation is complete; application publication is tracked in the release-status report.


## Existing security findings preserved during this release

The pre-migration advisor already reported RLS disabled on profiles, seasons and course_combos, plus disabled leaked-password protection. Legacy live_rounds is publicly readable and has broad authenticated insert/update policies. Those existing controls were not altered in this feature release. New standalone/private scoring avoids that legacy snapshot route.

The secret table intentionally has RLS enabled with no policies or client grants; its advisor information message is expected. Authenticated SECURITY DEFINER warnings for golf_event_command and golf_cross_state reflect deliberate, membership-checked RPC endpoints, with fixed search paths and no anonymous execution. Private helper and legacy-command execution is denied to both anon and authenticated roles. See Supabase's [RLS advisor](https://supabase.com/docs/guides/database/database-linter?lint=0013_rls_disabled_in_public) and [privileged-function advisor](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).
