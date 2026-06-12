# DOM is the canonical source of member status

The Torn website updates member status in the DOM in near-real-time via its own infrastructure. The TWSE script polls the Torn API at most every 10 seconds, so API data can be up to 10 seconds stale. When the DOM and the API disagree about a member's current state, the DOM wins — we treat the API as augmentation data (hospital timers, travel destinations, chain info), not as a competing authority.

This means we never override a DOM-reported state with an API-reported state, and we never flag a DOM state as wrong because the API disagrees.
