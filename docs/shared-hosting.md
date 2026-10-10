# Shared Cloudflare rollout

Status: owner-only shared site deployed and current local records migrated and verified on October 10, 2026. Workers Paid and Zero Trust Free were activated by the owner.

The selected target is Workers Paid + D1 + Access, in the owner's Cloudflare account. Both approved operators will have equal app permissions. Access must protect the website and every API endpoint before records are uploaded. Local mock authentication must never be used as production authentication.

## Storage preparation

`shared_state` holds the revision and a unique save token. `shared_state_parts` stores ordered JSON fragments, each at most 128 KB in UTF-8. A transactional D1 batch changes the revision, removes old fragments and inserts new fragments. All fragment mutations require the winning save token. A stale request changes nothing. Reads use a transactional batch to avoid mixing revisions.

The existing `shop_state` entry is read until the first successful new-format save. It is retained intact afterward, but becomes an out-of-date migration snapshot, NOT a live backup. Do not run an older app version against a migrated database or restore the legacy entry over newer records. Restoring requires an explicit verified export of the current shared state.

Tests cover legacy migration, records larger than D1's row limit, Unicode boundaries, stale saves, replacement of longer snapshots and transaction rollback.

## Active shared site

URL: https://canvas-night.eliascolon23.workers.dev

Cloudflare Access protects production and preview traffic. Email one-time PIN and the owner’s Cloudflare login are enabled. The API independently validates the Access JWT issuer, audience, signature and approved email. Only the owner is authorized so far; adding a partner requires updating both Access and the API allowlist.

The UI checks for updates every five seconds and on focus. Active dialogs and text edits defer automatic refresh. Revision checks reject stale writes. New history entries record the authenticated operator. Workers includes a complete backup download. Initial import is locked once operational data exists.

The verified cutover contained 42 workers, 3 canvases, 43 shifts, 333 responses, 413 charges, 21 adjustments and 675 history entries. Local revision 664 was imported into shared revision 2. A downloaded hosted snapshot was deep-compared to the complete local state, including checkpoints; they matched exactly. State SHA-256: `d3b1cc2336a250aa7a78876872c2d57e38b9e1ace5a272051cf432ec80a10aab`.

Original and downloaded backups remain outside Git under the owner's Canvas Night Backups folder. D1 recovery is available, but scheduled independent exports have not been configured. Download a backup before major operational changes.

After verification, an ignored `.sites-runtime/shared-site-active` marker redirects the original local dev URL to the shared site and rejects local writes. The original database remains intact. Do not remove this marker and resume operational edits against the old database. A separate development checkout may use fictional data.

## Deployment

The Cloudflare `canvas-night` Worker currently tracks `feat/shared-cloudflare-storage`. Build: `npm run build:cloudflare`; deploy: `npm run deploy:cloudflare`. The database retains its initial name `canvas-night-staging`, but now contains the live operational records: do not reset it as disposable staging. Preview builds are disabled. Change the tracked branch to main when the deployment PR is merged.

Pending checks: concurrent browser edits with disposable data, partner login once authorized, and actual deployed CPU/usage monitoring. Storage tests already cover stale-write rejection and transactional rollback. Do not modify real worker records merely to test concurrency.
