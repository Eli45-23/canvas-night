# Shared Cloudflare rollout

Status: storage preparation only; no production deployment or account purchase.

The selected target is Workers Paid + D1 + Access, in the owner's Cloudflare account. Both approved operators will have equal app permissions. Access must protect the website and every API endpoint before records are uploaded. Local mock authentication must never be used as production authentication.

## Storage preparation

`shared_state` holds the revision and a unique save token. `shared_state_parts` stores ordered JSON fragments, each at most 128 KB in UTF-8. A transactional D1 batch changes the revision, removes old fragments and inserts new fragments. All fragment mutations require the winning save token. A stale request changes nothing. Reads use a transactional batch to avoid mixing revisions.

The existing `shop_state` entry is read until the first successful new-format save. It is retained intact afterward, but becomes an out-of-date migration snapshot, NOT a live backup. Do not run an older app version against a migrated database or restore the legacy entry over newer records. Restoring requires an explicit verified export of the current shared state.

Tests cover legacy migration, records larger than D1's row limit, Unicode boundaries, stale saves, replacement of longer snapshots and transaction rollback.

## Remaining steps before shared use

1. Owner signs into Cloudflare; confirm the two allowed email addresses.
2. Configure separate local and production bindings and deploy settings. Protect every route with Access and validate authenticated identity in the API.
3. Add operator identity to history, automatic refresh with stale-response protection, and clear connection/save status. Keep in-progress forms from silently submitting against changed records.
4. Add export/import verification and independently retained backups. Take a fresh local snapshot immediately before migration.
5. Test private staging with copied records: compare every worker total, every assignment, every charge and all history. Test two separate logins and simultaneous edits; verify unauthenticated requests are denied. Measure actual Workers CPU and D1 usage.
6. During a short agreed pause in editing, transfer the latest snapshot, verify it, and switch both users to the shared site. Preserve the original local data and backup. Do not continue writing to independent local copies after cutover.

The local benchmark is only an estimate. Paid hosting starts at $5/month with metered overages; no plan has been activated by this change.

## Private staging configuration

The Cloudflare `canvas-night` Worker tracks `feat/shared-cloudflare-storage` during preparation. Build command: `npm run build:cloudflare`; deploy command: `npm run deploy:cloudflare`. This targets the separate `canvas-night-staging` database. Access is configured for all traffic with the owner-only policy. Preview builds are disabled. The initial default build failed before these commands were configured. No operational records have been imported. Local builds continue using the local database binding.
