# Fortis Golf design system

Implemented against kingsimbaba/Fortis-Golf main at 4110193 (2026-09-24).

## Scope

Home/Dashboard presentation, shared branding/navigation, semantic color tokens and form controls. Detailed scoring, summary, player and admin screen redesigns remain future work. Existing theme classes and theme-selection logic are retained. The referenced conversation supplied a palette description but no retrievable mockup image, so this implements that documented direction rather than claiming a pixel-exact match.

## Foundation

`styles/fortis-design.css` loads after the legacy stylesheet. Use semantic `--fg-*` tokens instead of hardcoded colors. Each token has Dark, Light and High Contrast values. Legacy `--bg`, `--panel`, `--text`, `--muted`, `--line`, `--green`, `--red` and `--cardShadow` map to this foundation.

| Role | Dark | Light | High Contrast |
| --- | --- | --- | --- |
| Canvas | #101720 | #f4f1e9 | #000000 |
| Surface | #18222e | #fffcf5 | #000000 |
| Inset | #121c27 | #ece8de | #000000 |
| Text | #f3efe5 | #202b36 | #ffffff |
| Secondary text | #b2b8bd | #59616a | #ffffff |
| Gold/action | #dac293 | #775922 | #ffe2a3 |
| Emerald | #87c3aa | #22684d | #8fffd0 |

Reusable opt-in classes: `.fg-panel`, `.fg-button`, `.fg-eyebrow`, `.fg-section-heading`, `.fg-empty`. Use gold for primary actions and emphasis, emerald for points/status, ivory for primary information. Keep the existing system font stack; no third-party fonts or additional dependencies. Standard panel radius is 18px and padding 24px. Keyboard focus is explicitly outlined. Mobile layouts stack cards/actions and use two-column metrics. Safe-area padding protects bottom navigation.

The global foundation changes the app shell, existing token-based surfaces, secondary buttons and form fields. Gold primary-button treatment is limited to Home, sign-in/password reset, setup, and opt-in `.fg-button`; detailed scoring controls retain their existing styling and logic.

## Dashboard

- Text monogram and Fortis Golf brand in the shared header; existing Chinese product name retained as a subtitle.
- Welcome panel, player/date, conditional active-round status, gold primary action, secondary round-history action.
- Existing admin import and app-update actions appear as compact utilities.
- Four metrics, ranked season list, recent-round course panel, and recent five rounds retain all existing data calculations.
- Rank numerals replace medal emoji; section headings use quiet bilingual labels.
- Empty data uses existing messages with consistent spacing.

## Imagery

The dashboard now supports one shared signature photo per course through `scripts/course-photos.js`. Signed-in players can select a course, preview a compressed photo, and explicitly save or replace it. The Courses played collection uses completed rounds available in the existing loaded dashboard data. Course combinations resolve to their parent club. Missing or inaccessible photos show a text fallback. No stock or invented course photographs are bundled. See `course-photos.md` for storage setup.

For future real images, verify the exact course/hole identity and usage rights, record the source, owner, permission/license and required attribution, then add the approved asset with a text fallback for missing or failed images. Public availability on an official website alone is not evidence of reuse permission. A separate private Supabase Storage bucket and storage access policies support uploads; no scoring or course-table schema is changed.

## Files and deployment

- `index.html`: stylesheet link, shared header markup, Home template, build version `2026.10.02.02`.
- `styles/fortis-design.css`: foundation, theme overrides, shared shell/control styling, responsive Home components.
- `sw.js`: cache version and precache entry for the versioned stylesheet; service-worker behavior is otherwise unchanged.
- `docs/design-system.md`: this document.

Deploy the HTML, stylesheet and service worker together. No API, authentication, route, score-calculation, storage, database or migration code was changed. No deployment is included in this local update.
