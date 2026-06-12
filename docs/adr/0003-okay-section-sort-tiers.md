# The Okay section uses two permanent tiers with a shared sort axis

Members in the Okay state are split into two tiers that share a single sort axis, sorted newest-first:

**Tier A** — members who have had an unexpected transition (meds-out, revival, or landing) during the current monitor session. Sorted by `unexpectedTransitionAt` descending (most recent at top). Once a member enters Tier A, they stay above all Tier B members for the session, even after their visual highlight expires. The highlight is a separate visual concern controlled by a `highlightUntil` timestamp; highlight expiry does not change tier membership or sort position.

**Tier B** — members who have only ever reached Okay via expected transitions or who were already Okay at monitor start. Sorted by `since` ascending (oldest first). This preserves initial DOM order for members who were all Okay at load (equal `since` values → stable sort preserves DOM order). Expected hospital exits land at the bottom of Tier B because they receive the most recent `since` timestamp.

The shared axis means transitions within the Okay section — highlight expiry (Tier A highlight → Tier A unhighlighted) and expected hospital exit (top of hospital group → bottom of Tier B) — produce no visible row movement.

Tier A membership is cleared when a member leaves the Okay state (re-hospitalized, starts traveling, etc.). If they later return to Okay via another unexpected transition, they re-enter Tier A with a fresh timestamp.
