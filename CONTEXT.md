# Torn War Stuff Enhanced

A browser userscript that augments the Torn City faction war page with real-time member status information, sorted views, and chain tracking. The script runs inside the Torn website DOM and must coexist with Torn's own page rendering and other third-party scripts.

## Language

### Member status

**Canonical status**: The member's current Torn state as reflected in the live DOM — the authoritative source. Torn updates the DOM in near-real-time via its own infrastructure.
_Avoid_: API status, true status, real status

**Augmented data**: Additional information the script overlays on top of canonical status, sourced from the Torn API — hospital countdown timers, travel destinations, chain state. Always secondary to canonical status.
_Avoid_: API data (too broad), enriched status

**Unexpected transition**: A status change that occurs faster than the game mechanics predict — a member going from Traveling to Okay (landed) or from Hospital to Okay before their hospital timer expires (medded). These transitions are surfaced to users as tactically significant events.
_Avoid_: Status discrepancy, status mismatch, STATUS_DIFFERS

**Expected transition**: A status change at the natural end of a timed state — a hospitalized member whose timer reaches zero and returns to Okay.
_Avoid_: Natural transition, normal transition

**Meds-out** (verb: **medded**): An unexpected transition where a hospitalized member uses a medical item on themselves to reduce their hospital timer to zero, returning to Okay early. A subset of unexpected transitions.
_Avoid_: Healed, revived

**Revival** (verb: **revived**): An unexpected transition where a hospitalized member is healed by an ally, returning them to Okay before their timer expires. A subset of unexpected transitions.
_Avoid_: Healed, medded

### Sort model

**Sort group**: The category that places a member's row ahead of or behind other rows in the member list, before any within-group tie-break is applied. The member list orders by sort group first: unexpected transitions, then Tier B, then hospitalized/jailed, then the incoming/abroad/outgoing/traveling sub-groups. Tier A and Tier B are the two sort groups used within the Okay section; the remaining sort groups order non-Okay states.
_Avoid_: Sort tier (too easily confused with Tier A/B specifically), sort bucket

**Tier A**: The elevated sort group within the Okay section — members who have had at least one unexpected transition during the current monitor session. Permanently sorted above Tier B for the session duration, ordered by most-recent unexpected transition first.
_Avoid_: Highlighted Okay, unexpected Okay

**Tier B**: The stable sub-group within the Okay section — members who have transitioned to Okay only via expected transitions or who were already Okay at monitor start. Ordered by oldest canonical-Okay time first, which preserves initial DOM order for members present at load.
_Avoid_: Normal Okay, baseline Okay

**Unexpected-transition highlight**: The orange row background (`data-twse-status-differs="true"`) applied to a Tier A member while their unexpected transition is recent (within the highlight window) and the window has focus (Torn scripting rules forbid drawing attention to an unfocused window using extracted data — ADR-0007). Expiry is purely visual — it does not change sort position or Tier membership. Distinct from the near-expiry highlight.
_Avoid_: Flag, badge, status-differs highlight

**Near-expiry highlight**: The green row background (`data-twse-highlight="true"`) applied to a hospitalized member whose timer is under 5 minutes. Indicates imminent return to Okay.
_Avoid_: Hospital highlight, green highlight

### External service

**TWSE Server** (full name: Torn War Stuff Enhanced Server): An external service that aggregates raw Torn API v2 responses contributed by all script users. Any user can query it for a fresher snapshot than their own poll interval would provide — because another user may have called the Torn API more recently. Write path: fire-and-forget POST after each Torn API poll. Read path: supplements the Torn API — delivers other users' updates in the gaps between the client's own 10-second Torn API polls. The Torn API poll is always unconditional; the TWSE Server is not a replacement for it.
_Avoid_: Collection service, community cache, cache service, API proxy

**Server timestamp**: The `timestamp` field returned by the Torn API v2 `timestamp` selection — a Unix timestamp (seconds) representing when the Torn server generated the response snapshot. The authoritative freshness signal in the community cache: when multiple users have contributed responses, the one with the highest server timestamp is the most recent, regardless of which user contributed it or when.

### Third-party integration

**Published field**: A `data-twse-*` attribute written onto a member row specifically for another script to read, rather than for this script's own sort/render logic. `data-twse-last-action-timestamp` (the Torn API's `last_action.timestamp`, a `TornTimestampSec`, written as a string on the row's `<li>`, `"0"` if absent) is the first example — FF Scouter reads it to filter rows. Unlike the other `data-twse-*` attributes, it has no effect on this script's own sorting or highlighting.
_Avoid_: Interop attribute, export field
_Avoid_: API timestamp, request timestamp, response time, client timestamp
