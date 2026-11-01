# Personal round references

Open **回合紀錄 → 個人收支**, or **個人收支** in the end-of-round awards. The panel lists saved players, birdies, eagles and gross score, with the number of played holes. Select your player name once per round. Enter 地獄倒霉鬼、個人恩怨、其他遊戲 amounts manually; positive means winnings and negative means losses. The total updates immediately. Blank means unrecorded, while zero is an explicitly recorded zero.

Saving stores one private entry per signed-in account and saved round in `golf_personal_round_amounts`. Reopening or editing that round reads that account's amounts. Other accounts cannot read or alter them, even when they can see the shared round. The three amounts are decimal values with at most two decimal places; the database calculates the total independently. Shared rounds, hole scores, game points, handicap updates, PDF/share output and tournament settlement calculations are unchanged.

Apply `supabase/migrations/20261101062220_personal_round_amounts.sql` before releasing the frontend. It adds only the private table, ownership policies, grants and foreign key index. No historical scores or amounts are populated. UI tests use synthetic rounds, and database isolation tests use PGlite.

Validation: `node --test tests/*.test.mjs`, including signed cents, blank/zero, summary calculations, save/update, two-account isolation, ownership reassignment denial and anonymous access denial. The release bumps both the app build and service-worker cache so installed users receive the new controls through the existing update flow.
