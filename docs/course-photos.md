# Shared course signature photos

One current JPEG per canonical course/parent club. All authenticated users can read, add or replace photos; anonymous access and client-side deletion are not granted by these new policies. This is a shared course image, not a personal album. Last successful save wins if two players replace it at once.

## Setup still required

1. Run `supabase/migrations/202610020001_course_photos.sql` once in the existing project's Supabase SQL editor. It creates a private `course-photos` bucket (2 MB JPEG limit) and bucket-scoped SELECT, INSERT and UPDATE policies. Verify there is no conflicting pre-existing bucket or broad storage policy. The migration deliberately does not change other buckets, tables, policies or scoring data.
2. Deploy the updated HTML, `scripts/course-photos.js`, stylesheet and service worker together.
3. Test with two real player accounts: upload using one, read/replace using the other; verify anonymous reads/writes fail. Check a fresh sign-in reload and an offline upload retry. Live policies and persistence have not been exercised here because no Supabase administrative connection is available.

The app uses the existing authenticated Supabase client. No service-role key is shipped. Storage responses are excluded from service-worker caching. Photos are fetched as authenticated blobs; object URLs are transient and revoked on remount. Pictures are shared with signed-in users only under the supplied policies.

## UI behavior

- Separate Choose photo and Take a picture controls feed the same preview, compression and Save flow. The camera control requests the rear camera on supported phones; unsupported devices can show a file picker. Actual camera capture has not been tested on a physical phone.

- Dashboard collection is derived from completed rounds in the app's existing loaded history, not an additional full-history query.
- Course picker permits uploads before a course has been played. Such a photo is visible in the picker and appears in the collection when a completed round is available.
- Canonical course codes and explicit parent/combo relationships determine a SHA-256 file path; display-name translations do not change the path. Renaming a database course code requires migrating its photo separately.
- JPG/PNG/WebP inputs up to 12 MB are decoded, resized to a maximum 1600px edge, and encoded as JPEG at 82% quality. The output limit is 2 MB. HEIC and SVG are rejected with a message.
- A preview and explicit Save precede replacement. Network/storage failures keep the prepared image available for retry.
- No photos are invented or preloaded. Users are asked to upload photos they took or have permission to share.

## Validation performed

8 automated tests passed, including unchanged Larry-mode and score-animation tests and new checks for parent-course identity, deterministic paths, isolation, file-type and file-size rejection. Browser fixture exercised missing photos, image compression/preview, save, replacement without extra objects, failed upload and successful retry. Tests used mocked storage; no production uploads occurred.

Implementation follows Supabase's [upload reference](https://supabase.com/docs/reference/javascript/file-buckets-upload) and [storage access-control guide](https://supabase.com/docs/guides/storage/security/access-control).

## Layout update — 2026.10.02.06

Photo collection, course picker, upload and camera controls now live under 管理 for every signed-in player. Existing privileged management controls and the infrastructure/backup card remain restricted to admins. Home displays course-photo backgrounds on 最近一場 and 最近五場成績; repeated course codes share one image download per render. Missing/invalid images retain the plain card, and High Contrast suppresses decorative backgrounds. Uploading in 管理 and returning Home fetches the current images. Scoring calculations are unchanged.

## Compact photo controls — 2026.10.02.08

The 球場照片 panel is at the bottom of 管理, after all admin content. The gallery is replaced by a course dropdown, a single selected-course photo, Upload/Camera buttons and Save. Images load only when a course is selected. After saving, the pending preview clears and the current image refreshes. All signed-in players retain upload/replace access; Home photo backgrounds are unchanged.

## Course finding (2026-10-03)

The authenticated master currently contains 117 course records. The previous picker reduced these to 79 canonical photo keys, hiding individual course codes (including grouped nine-hole courses). Every master record now gets its own selectable name/code entry; combo parents remain available as additional entries. Upload/download still use the unchanged canonical parent photo key, so existing shared pictures require no migration.

Country, region and prefecture filters derive from master metadata and work together with case-insensitive multilingual name/code search. Changing country clears invalid region/prefecture selections. Filtering out the selected course clears its photo preview and pending upload; controls lock during save. Clear filters restores the complete list. Missing location metadata does not exclude a course from the unfiltered list or assign it an invented country. Japan currently has region and prefecture data; Taiwan has region data.

Course and combination loading now use ordered pagination to avoid the single-request API cap. Build and service-worker cache versions advance together. No database or storage migration is required.

Validation: 15 automated tests pass, including master-record coverage, grouped/inactive records, multilingual combined filters, and loading 2,107 records across pages with failure propagation. A 390px browser fixture included all 117 live master codes plus two illustrative location records; combined filters, empty results, dependent resets, TN lookup, photo preview/save/replacement and horizontal overflow passed. Storage writes were mocked; production course records and photos were unchanged.
