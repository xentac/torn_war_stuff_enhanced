# Default TWSE Server sharing to on, gated by a single opt-out toggle

TWSE Server participation — both submitting your own poll results and reading back the community cache — ships enabled by default, with one settings-panel toggle to disable it entirely. We chose opt-out over opt-in because the community cache only has value once a critical mass of users contribute; most users won't find a buried settings checkbox, so opt-in would likely leave the cache too sparse to be useful for anyone, undermining the reason the server exists. The data shared (member statuses, hospital timers, chain state, and revive settings for both sides of a war, since the war page and its polling cover both factions) is either already visible on the public war page or subject to the same caller-relativity limits on `revive_setting` either side could observe manually, so the marginal exposure was judged acceptable against that network-effect requirement.

## Considered Options

- **Opt-in default** — rejected. Without broad participation the cache stays too sparse to deliver its core value (a fresher snapshot than your own poll interval), which would make the feature pointless for the average user who never visits settings.
- **Separate read/write toggles** — rejected. Decoupling them permits a free-riding read-only mode: benefiting from the community cache without contributing to the pool that makes the benefit possible. A single toggle keeps contribution and benefit paired.
