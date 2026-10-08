# Hash window synchronization v1

## Membership and publication weeks

`broadcast_windows` holds a server UUID, a Taipei publication-week Monday date,
 and an internal ordinal. `broadcast_window_members` assigns every service-created
Broadcast exactly one stable window and a slot in 1..5. A slot CHECK plus unique
(window_id, slot) enforces capacity; a broadcast primary key forbids reassignment
by duplicate insertion. Allocation takes a PostgreSQL transaction-scoped advisory
lock per publication week, fills only the last unfilled window, or creates the
next window. Existing full windows never shift. Migration 0008 backfills once,
chronologically by (created_at, id), under locks; runtime queries never repartition.

Windows are global to a week, not per account. A shared multi-class Broadcast has
one membership. Students receive only broadcasts targeted to their current
session group, and only that group's targets, confirmations, replies and events.
Teachers receive all visible target threads. Hashing happens **after** filtering.
No hidden member count, ordinal or other class's event metadata is exposed.
A window with zero visible broadcasts is omitted. Claimed hidden/unknown window
IDs are echoed only in `removed_window_ids`, without disclosing their existence.

The publication week is separate from the acknowledgement day. Sunday 15:00 can
have a Monday deadline while still belonging to Sunday's publication week.
`week` uses ISO labels such as `2026-W41`; historical weeks remain queryable.

## Canonical byte contract

This is a deliberately restricted array-only canonical JSON contract, not a claim
of full RFC 8785 support. Hash input contains only arrays, Unicode strings,
booleans and null: no objects, numeric formatting, undefined or floating points.
Serialize compact JSON without spaces using JSON string escaping, UTF-8 without
BOM, then SHA-256. Prefix the lowercase hexadecimal digest with `sha256:`.

No Unicode normalization occurs: composed and decomposed text remain different.
Unpaired surrogates are rejected. JSON escapes control characters, quotes and
backslashes; Unicode, including U+2028/U+2029 and supplementary characters, remains
literal UTF-8. IDs are lowercase hyphenated UUID strings. UTC timestamps always
use `YYYY-MM-DDTHH:mm:ss.ffffffZ` with exactly six fractional digits. Clients retain
these raw timestamp strings; converting them through Date would lose microseconds.
Null is `null`; an empty collection is `[]`. Reply roots have `ref_id: null`.

Hash envelope: `["broadcast-sync-v1", layer, window_id, projected_records]`.
The response contains objects for readability, but hashing projects them to the
following exact field arrays. Lexicographic comparison is by ASCII ID/time strings,
not locale collation. Wire object-property order never influences hashes.

* broadcasts: records sorted by id; each record is
  `[id, author_id, sender_name, content, created_at, ack_deadline_at, targets]`.
  targets sorted by group_id, each
  `[group_id, group_name, can_confirm, can_reply]`.
* confirmations: only existing confirmations, sorted by (broadcast_id, group_id);
  `[broadcast_id, group_id, confirmed_by_account_id, confirmed_by, role, confirmed_at]`.
* replies: a flat complete node list, sorted by
  (broadcast_id, group_id, created_at, id);
  `[id, broadcast_id, group_id, author_id, author_name, role, content, ref_id, created_at]`.
  The client reconstructs arbitrary-depth trees using ref_id.

Confirmation status, overdue state, pending counts, reply counts, event timestamps
and snapshot_version are not inputs. Deadlines and actual confirmation records
allow the existing time rules to derive presentation states. Visible target
capabilities are included; authorization/profile changes also change scope_key
and force initialization. Display-name changes are detected by hashes even when
no broadcast-domain event was written.

Identical golden vectors live in backend `tests/fixtures/hash_vectors.json` and
frontend `hash-vectors.ts`: empty sets, astral/CJK Unicode, normalization, controls,
null, booleans and six-digit timestamps. Both runtimes verify canonical strings
and real SHA-256. Frontend uses Web Crypto, not server-supplied hashes as its claims.

## Change log and transactions

`broadcast_change_log` records broadcast.created, confirmation.created and
reply.created with a UUID event ID, window/member scope, entity key and UTC time.
Events, membership and business writes commit together through existing Services.
Unique (event_type, entity_key) makes repeated event recording idempotent.
Rollback leaves no event or membership; duplicate confirmations still return 409.
All writers must use these Services (or record_change in their own transaction).
Out-of-band SQL inserts into broadcasts are not a supported publishing path.

The log is queried to provide the mismatched layer's scoped event_count and
last_changed_at in its `activity` field. This identifies the source layer and
supports diagnostics/auditing; it is deliberately advisory, **not** a delivery
cursor or a proof of equality. Client/server hashes are the consistency authority.
There is no `event.id > last_id` scan and no assumption about commit order.
A delayed earlier transaction is detected on the next committed hash snapshot.

Events may be pruned explicitly, e.g. keep 90 days via an operationally chosen
UTC cutoff: `python -m database.sync_log --prune-before 2026-07-10T00:00:00Z`.
There is no implicit deletion job. Pruning only events never changes hashes or
business records; old weeks synchronize from current persisted data. Event counts
then describe retained events, not lifetime totals. Window membership is retained.

## HTTP protocol

Existing broadcast APIs remain unchanged. Angular uses the existing `/api` proxy
mapping; backend paths below omit that frontend-only prefix.

POST `/broadcasts/sync`:

```json
{"week":"2026-W41","schema_version":1,"scope_key":null,"after_window_id":null,"windows":[]}
```

After initialization, `windows` contains up to 20 `{window_id, hashes}` claims,
where hashes has broadcasts/confirmations/replies SHA-256 strings. Claims never
authorize access. The server reloads active account and effective permissions
inside a Repeatable Read READ ONLY transaction after the auth dependency's touch.
Hashes, membership, projection and activity come from that same request snapshot.

Response fields: schema_version, week, scope_key, current_user, reset_required,
reset_reason, snapshot_version, windows, removed_window_ids, next_after_window_id.
Each window includes window_id, visible member_ids, three hashes and `layers`.
Only mismatched layers occur in layers. A matching window has `layers: {}`.
An empty mismatched layer has `records: []`, so stale data is removed explicitly.
Version/scope/invalid cursor forces a full first-page response with reset_required.

Responses have at most two windows (ten broadcasts). Each mismatched layer's first
chunk has at most 100 records and 1 MiB of compact record JSON. Chunk metadata:
records, hash, offset, next_offset, activity. Continuations use
GET `/broadcasts/sync/windows/{window_id}/layers/{layer}` with week, scope_key,
expected_hash and offset. Scope or hash changes return 409; the client discards
all staged data and retries. Unknown/invisible windows return 404. A single
legacy record exceeding 1 MiB returns 422 rather than an oversized response;
this limit needs explicit handling for exceptional imported legacy content.
Ordinary API-published records (20,000 characters, at most 500 targets) fit.

Window pages use stable visible UUID cursors, never a shifting row offset.
snapshot_version is a SHA-256 of the authorized **page** manifest and scope/week;
it is not a database commit sequence or a whole-week MVCC token. Page/chunk reads
may see newer commits. Each comparison/projection is individually consistent;
changed chunk hashes reject mixed layers, and the next poll reconciles later
commits. A completed page walk enumerates all visible windows and removes unseen
cached windows. New inserts append membership and cannot shift a full window.

## Angular lifecycle and recovery

Initial load uses sync with no claims; the legacy GET feed remains available.
The same Store and Component render both real and explicitly selected mock data.
The Store initializes raw projections, reconstructs rows and computes pending
counts only for the current publication week. `loadWeek(week)` fetches history on
 demand; `loadWeek(null)` restores the current week.

Every 30 seconds the active feed recomputes local hashes, walks bounded window
pages and fetches only mismatched layer chunks. It verifies received hashes using
Web Crypto, then commits the complete staged cycle. Matching data retains Store
references; changed rows retain unchanged reply arrays and stable row IDs.
Expanded threads, drafts and scroll are held outside synchronization state.

Polls never overlap one another, and new polls are skipped while a local mutation
is pending. A mutation started during
a poll cancels the older poll on success, updates the raw projections immediately,
and produces fresh client hashes. Authorization/session changes clear private
cache and identity-dependent component state. Network errors retain data and
retry on the timer; 401 clears/stops polling and shows the existing login prompt;
403 clears private data and permits later retry. Protocol/membership problems
clear synchronization claims for reinitialization. Destruction cancels outstanding
HTTP subscriptions and the timer; mock mode does not start either.

Normal development, mock, and Production configurations use 30,000 ms; Production
hardcodes that interval even if a development configuration is accidentally
changed. `npm start -- --configuration sync-e2e` is an explicit local-only 1,000 ms
acceptance configuration. Do not deploy the sync-e2e or mock configurations.

## Validation performed (2026-10-08)

PostgreSQL tests cover 0/1/5/6/10/11 grouping, allocation stability, transactions,
concurrent writes, delayed commits, Repeatable Read, layer hashes, authorization,
retention, migration backfill/roundtrips and legacy API regressions. Frontend tests
cover canonical golden vectors, 30-second scheduling, cancellation, unchanged
references, layer replacement/chunks, new/removed windows, history, draft/DOM/scroll
preservation, immediate operations, network recovery and 401/403/protocol recovery.

Chrome acceptance used a real Backend, TEST PostgreSQL and real HttpOnly sessions,
with the explicit 1-second configuration: teacher API publication appeared on an
already-open class 201 feed; class 202 kept only its own private content; a shared
publication remained properly scoped. Confirmation and reply propagated to a
second already-open same-class session. Draft/expansion survived incoming data.
Stopping/restarting the backend retained data/drafts and recovered automatically;
refresh retained the confirmed state and persisted reply. Browser observations
verified these flows; this is not a claim that a CI browser suite is installed.
Production database migration/deployment was not performed. Deployment must pause
old writers, apply the migration, and restart all writers with the updated Services
before resuming publication; older writers do not record window membership.
