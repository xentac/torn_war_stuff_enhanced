# Unexpected transitions are detected by comparing previous API state against current DOM state

An unexpected transition is detected in `watch()` by comparing the most recent API snapshot (`memberStatus`) against the current DOM state (the live status class on the member's row). The DOM is the canonical source (ADR-0001), so when the two disagree in tactically significant ways, the DOM is right and the API is stale.

The three disagreements we treat as unexpected transitions:
- API state is `Traveling` or `Abroad`, DOM shows Okay → member landed
- API state is `Hospital`, DOM shows Okay, and API `until > now` → member was medded or revived
- API state is `Jail`, DOM shows Okay, and API `until > now` → member left jail early

All other API-vs-DOM disagreements (e.g. API=Okay while DOM=Hospital, or API=Traveling while DOM=Abroad) are routine lag and are silently reconciled at the next API poll. They are not surfaced to the user.

Detection happens in `watch()` (every 500ms) rather than at API poll time, so the transition is caught as soon as Torn's DOM updates — up to 9.5 seconds before the next API poll would reveal it.
