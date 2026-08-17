# Torn War Stuff Enhanced

A browser userscript that augments the Torn City faction war page with real-time member status information, sorted views, and chain tracking. The script runs inside the Torn website DOM and must coexist with Torn's own page rendering and other third-party scripts.

## Language

### Member status

**Canonical status**: The member's current Torn state as reflected in the live DOM — the authoritative source. Torn updates the DOM in near-real-time via its own infrastructure.
_Avoid_: API status, true status, real status

**Augmented data**: Additional information the script overlays on top of canonical status, sourced from the Torn API — hospital countdown timers, travel destinations, chain state. Always secondary to canonical status.
_Avoid_: API data (too broad), enriched status

**Unexpected transition**: A status change that occurs faster than the game mechanics predict — a member going from Traveling to Okay (landed) or from Hospital to Okay before their hospital timer expires (medded). A hospital/jail exit within the expiry tolerance is not an unexpected transition. These transitions are surfaced to users as tactically significant events.
_Avoid_: Status discrepancy, status mismatch, STATUS_DIFFERS

**Expected transition**: A status change at the natural end of a timed state — a hospitalized member whose timer reaches zero and returns to Okay. Includes exits observed with no more than the expiry tolerance left on the timer.
_Avoid_: Natural transition, normal transition

**Expiry tolerance**: The margin (2 seconds) before a hospital or jail timer's scheduled end within which an observed Okay still counts as an expected transition. Absorbs normal clock skew — Torn's clock-sync granularity and DOM update timing — so natural exits aren't misreported as meds-outs or revivals. Does not attempt to compensate for a skewed local clock when Torn's synced clock is unavailable.
_Avoid_: Grace period, skew allowance

**Meds-out** (verb: **medded**): An unexpected transition where a hospitalized member uses a medical item on themselves to reduce their hospital timer to zero, returning to Okay early. A subset of unexpected transitions.
_Avoid_: Healed, revived

**Revival** (verb: **revived**): An unexpected transition where a hospitalized member is healed by an ally, returning them to Okay before their timer expires. A subset of unexpected transitions.
_Avoid_: Healed, medded

**Revive setting**: The Torn API's `revive_setting` field — a member's own privacy preference for who may revive them (`Everyone`, `Friends & faction`, `No one`, `Unknown`). Reported from the requesting API key's own perspective: `Everyone` resolves the same for any caller, but `Friends & faction` only resolves visibly for a caller who actually qualifies as a friend or faction-mate — a caller who doesn't will see it differently, indistinguishable from a real `No one`/`Unknown`. Since this script only ever queries with the operator's own key, the purple indicator (below) is therefore expected to only ever appear on the operator's own faction's members in practice, never on enemy rows. Only trusted from our own direct Torn API poll (`applyFactionData`'s `source: "own"`); a snapshot relayed through the TWSE Server community cache reflects some other user's key and relationship to the member, so it must never overwrite a `revive_setting` we already have from our own poll.
_Avoid_: Revival, revivable, revive privacy, revive permission

**Revivable-plus indicator**: The red/purple `"+"` drawn over a member's status cell (`data-twse-revivable`), driven directly by Revive setting — red for `Everyone`, purple for `Friends & faction`, absent for `No one`/`Unknown`/unknown. Shown in any canonical state, not just Hospital, on both sides of the war (own faction and enemy), though purple is only ever expected to actually appear on the operator's own faction's rows per the caller-relativity above.
_Avoid_: Revival, revivable status

**Presence**: A member's online/idle/offline indicator, read from the `aria-label` Torn writes on the member row's status icon (`"{name} is online|idle|offline"`) — sourced from the live DOM, like canonical status, rather than the Torn API, for freshness. Independent of canonical status: a hospitalized member can still be online.
_Avoid_: online status (ambiguous with canonical "Okay"), activity state

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

### War data

**Ranked war**: The faction's current matchmade 1v1 war, sourced from the Torn API v2 `wars` selection (`wars.ranked`, `null` when no ranked war is active). Carries a `target` score, a `winner` (`null` until decided), and each side's Ranked war score and chain.
_Avoid_: War, the war (ambiguous with Raid war / Territory war)

**Ranked war score**: A faction's per-hit respect total within a Ranked war — the same underlying respect currency as the faction's persistent total, but scoped to the war and reset per war. Races toward the war's `target`; reaching it decides the `winner`.
_Avoid_: Score (ambiguous with Raid score / Territory war score), respect (ambiguous with the persistent faction total)

**Raid war**: An indefinite, one-sided declared war, sourced from `wars.raids` (an array — a faction can be raiding or be raided by more than one faction at once). Has no `target` or race-to-win condition; ends via the defender's destruction or a negotiated cease, not by reaching a score.
_Avoid_: Raid (ambiguous with the in-game "raid" verb for a single attack), War

**Raid score**: Cumulative respect taken from the raided faction. Sourced from the same wire `score` field as Ranked war score, but a Raid war has no `target` to race toward — the number only ever goes up.
_Avoid_: Score, respect taken

**Territory war**: A contest over a single map territory's wall, sourced from `wars.territory` (an array — a faction can hold multiple contested territories at once). Knocking a defending member off the wall replaces them with an attacker; the wall never sits empty.
_Avoid_: Territory, the war

**Territory war score**: Time-on-wall accumulation toward a Territory war's `target`, distinct from the per-hit respect that drives Ranked war score and Raid score.
_Avoid_: Score

### External service

**TWSE Server** (full name: Torn War Stuff Enhanced Server): An external service that aggregates raw Torn API v2 responses contributed by all script users. Any user can query it for a fresher snapshot than their own poll interval would provide — because another user may have called the Torn API more recently. Write path: fire-and-forget POST after each Torn API poll. Read path: supplements the Torn API — delivers other users' updates in the gaps between the client's own 10-second Torn API polls. The Torn API poll is always unconditional; the TWSE Server is not a replacement for it.
_Avoid_: Collection service, community cache, cache service, API proxy

**Server timestamp**: The `timestamp` field returned by the Torn API v2 `timestamp` selection — a Unix timestamp (seconds) representing when the Torn server generated the response snapshot. The authoritative freshness signal in the community cache: when multiple users have contributed responses, the one with the highest server timestamp is the most recent, regardless of which user contributed it or when.

### Third-party integration

**Published field**: A `data-twse-*` attribute written onto a member row specifically for another script to read, rather than for this script's own sort/render logic. `data-twse-last-action-timestamp` (the Torn API's `last_action.timestamp`, a `TornTimestampSec`, written as a string on the row's `<li>`, `"0"` if absent) is the first example — FF Scouter reads it to filter rows. Unlike the other `data-twse-*` attributes, it has no effect on this script's own sorting or highlighting.
_Avoid_: Interop attribute, export field
_Avoid_: API timestamp, request timestamp, response time, client timestamp

**Total stat estimate**: FF Scouter's estimate of a player's total battle stats, consumed from that script's per-row data rather than sourced from the Torn API. This is the value the sort-by-estimate tie-break and the rich copy format both use.
_Avoid_: Estimate, stat estimate (ambiguous with Fair Fight value), FF value

**Fair Fight value**: FF Scouter's difficulty multiplier for a fight against a player, shown in that script's own column. Distinct from the Total stat estimate — this script does not read or use it anywhere.
_Avoid_: FF, estimate

### UI framework

**Page React**: `react`/`react-dom/client` are never bundled into the shipped `.user.js`. The build aliases them (`vite.config.ts`) to shims (`src/shims/react.ts`, `src/shims/react-dom.ts`, via the shared `src/shims/react-loader.ts`) that prefer `unsafeWindow.React`/`.ReactDOM` at call time, borrowing the copy Torn's own page already loads, saving ~500KB+ of shipped code. Depends on the userscript manager's cross-realm object bridging actually working; unreliable on at least one Safari/Tampermonkey configuration, where it falls back instead to the same-realm copy set up by `@require`ing Torn's own react-dom UMD build (`vite.config.ts`) — see ADR-0008.
_Avoid_: bundled React, native React

**Settings Panel**: The `twse-settings-panel` custom element (`src/ui/settings-panel.tsx`) injected after `#faction_war_list_id` on the faction war page — a plain `HTMLElement` subclass that mounts a React tree into itself via Page React.
_Avoid_: settings dialog, config panel
