# Personal round references

Open **回合紀錄 → 個人收支**, or **個人收支** in the end-of-round awards. The panel lists saved players, birdies, eagles and gross score, with the number of played holes. Select your player name once per round. Enter 地獄倒霉鬼、個人恩怨、其他遊戲 amounts manually; positive means winnings and negative means losses. The total updates immediately. Blank means unrecorded, while zero is an explicitly recorded zero.

Saving stores one private entry per signed-in account and saved round in `golf_personal_round_amounts`. Reopening or editing that round reads that account's amounts. Other accounts cannot read or alter them, even when they can see the shared round. The three amounts are decimal values with at most two decimal places; the database calculates the total independently. Shared rounds, hole scores, game points, handicap updates, PDF/share output and tournament settlement calculations are unchanged.

Apply `supabase/migrations/20261101062220_personal_round_amounts.sql` before releasing the frontend. It adds only the private table, ownership policies, grants and foreign key index. No historical scores or amounts are populated. UI tests use synthetic rounds, and database isolation tests use PGlite.

Validation: `node --test tests/*.test.mjs`, including signed cents, blank/zero, summary calculations, save/update, two-account isolation, ownership reassignment denial and anonymous access denial. The release bumps both the app build and service-worker cache so installed users receive the new controls through the existing update flow.

## Green fees and all-time costs

Each round now accepts a nonnegative green fee. `net_cost = green_fee - total_amount`; positive is out-of-pocket cost and negative is a net profit after the fee. It remains unknown until both the fee and at least one game amount are recorded. Record zero explicitly for a free round or no game winnings/losses.

Home → 我的打球成本 shows lifetime totals, averages and the denominator for green fees, round winnings, round losses, net game results and net costs. Winning and losing amounts are separated by each round's net result; both averages use the count of rounds with recorded game amounts. Fee averages use recorded fees, and net-cost averages use only rounds with both inputs. Unknown values are excluded rather than silently becoming zero. These are separate cohorts, so a net-cost total need not equal the fee total minus game total when records are incomplete.

`golf_personal_cost_summary()` aggregates all private records in the database, beyond the 30-round history and 1,000-row API limits. It is a SECURITY INVOKER function, explicitly filters by `auth.uid()`, accepts no user ID, and is not executable by anon. Existing ownership policies cover the added green fee and generated net cost. Old entries retain null fees until the user supplies them. The additive migration is `20261101063124_personal_green_fees.sql`.

## Dedicated 打球收支 tab

The report has moved from Home to its own bottom navigation tab. 最近五場 lists actual played rounds, including missing amounts, with an edit button on every row. It orders by `played_at`, then round ID to break ties; backfilled older rounds do not displace newer games merely because they were entered later. Future-dated rounds are excluded from the recent list. A round belongs to this list when the account's explicit profile display name or a previously selected private player name matches its roster/scores, or the user already has a private note for that round. No other account's amount is joined.

今年至今 filters private entries by the saved round's actual played date from January 1 at midnight Asia/Taipei through the report request time. 全部歷史 retains the full lifetime summary. Both display separate filled-in counts and averages; the recent list also shows its known-cost total and average. Unknown amounts stay unknown. The report refreshes after editing an amount and during the existing data refresh flow.

The additive `20261101064031_personal_cost_report.sql` migration creates `golf_personal_cost_report()` as SECURITY INVOKER with no user-id parameter and no anonymous execution. It does not change scores or existing private amounts. Tests cover Taipei year boundaries, future dates, legacy score-only membership, ordering ties, backfills, missing amounts, edits, navigation and account isolation.

## Annual membership, insurance and other fixed costs

The costs tab includes clickable year cards. Each opens private membership, golf insurance and other fixed-cost fields for that year. The current year, years with saved fixed costs, and years with dated personal round entries are listed newest first. Users can open any year from 1900–2199 using Other year. Amounts are nonnegative, support two decimal places, and preserve blank versus explicit zero. Repeated saves replace the one account/year record rather than creating another cost. Nothing is automatically copied to another year or to individual rounds.

`golf_personal_annual_costs` has an ownership-protected composite primary key and a generated total. `golf_personal_annual_cost_report()` is SECURITY INVOKER and combines the existing round report with private annual records. YTD counts the current year's full entered fixed amount once. Lifetime counts entered fixed costs through the current Taipei year, excluding future years. The round-only costs stay separate; combined total cost is recorded round net cost plus recorded fixed costs. Combined and fixed-cost averages use the existing count of complete round cost records. The UI states this basis; a zero-round year has no per-round average, and unentered fixed costs remain visibly unentered.

The report refreshes after each annual edit, and year cards also show their combined cost average when complete round records exist. No existing scores or round expenses are changed. The additive migration is `20261101064954_annual_fixed_golf_costs.sql`. Tests verify exact cents, upsert idempotency, year/account isolation, future exclusion, blanks/zero, zero rounds, unchanged round expenses, generated totals, anonymous denial and ownership reassignment denial.

## Per-account cost start year

`golf_personal_cost_settings.start_year` stores the account's calendar-year cutoff, protected by the same ownership policies as its private costs. The requested account is configured separately to start in 2027; no account IDs or email addresses are included in the source migration. Other accounts with no preference retain their earlier history (the fallback start is 1900).

All cost summary endpoints enforce the account's start at midnight January 1 Asia/Taipei, through the current time. This includes fees, games, net costs, average denominators and fixed-cost aggregation. Unknown round dates are not eligible. Recent rounds remain visible, but pre-start rounds are labelled as excluded and do not contribute to the recent cost total/average. Pre-start yearly fees remain editable/reference data, but have no combined career cost or average. Future-year costs can be prepared, but are not counted until that year. No existing records are deleted or zeroed.

The UI displays the start date, labels career costs with the start year, and defaults annual entry to at least the start year. All report endpoints (including older clients' summary calls) use the same cutoff. `20261101065957_cost_tracking_start_2027.sql` creates the settings table and replaces only report functions. Tests freeze the database clock to check December 31 23:59:59.999 versus January 1 00:00 Taipei, future/undated records, fixed fees, preserved raw data, current pre-start behavior, legacy endpoints and account isolation.
