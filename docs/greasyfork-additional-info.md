Torn War Stuff Enhanced augments the Torn City faction war page with real-time member status, sorted views, and chain tracking. It runs entirely inside the war page DOM and layers on top of what Torn already shows you.

## Features

- Real-time hospital countdown timers and travel destinations overlaid on each member's row
- Members who land or med/revive early are sorted to the top of the Okay section and highlighted
- Chain tracking of both factions
- Optional community data sharing (via the TWSE Server) that fills in the gaps between your own poll interval with fresher data contributed by other script users tracking the same faction

- Integration with FF Scouter
  - Premium users can see flight estimates

## Setup

The script needs your Torn API key to poll faction data. Register it via the Tampermonkey menu command **"Torn War Stuff: Register Key"** (click the Tampermonkey icon → this script → the menu command). A **Public** access key is all that's required -- no elevated permissions needed.

## Privacy & Torn API Terms of Service

Per the [Torn API Terms of Service](https://www.torn.com/api.html#), here's what this script stores, shares, and why:

|                           |                                                                                                                                                                                                                                                                                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Data Storage**          | Persistent, locally on your device — the API key is stored in browser `localStorage`. The script itself doesn't persist faction data; it forwards each poll to the TWSE Server (see below), which persists snapshots server-side.                                                                                                           |
| **Data Sharing**          | The API key is never shared with anyone but `api.torn.com`. Faction member/chain/timestamp data, plus a one-way SHA-256 hash of your key, is sent to the TWSE Server (`twse.dev`) — a community aggregation service this script integrates with. Anyone who knows your faction ID can query that aggregated data back from the TWSE Server. |
| **Purpose of Use**        | Community tool / statistical aggregation — the TWSE Server lets script users get a fresher snapshot of faction status between their own 10-second polls, sourced from other users' polls of the same faction.                                                                                                                               |
| **Key Storage & Sharing** | Unencrypted, local to your device only. Never transmitted to or stored by the TWSE Server — it receives a one-way SHA-256 hash, used only to avoid echoing your own submissions back to you.                                                                                                                                                |
| **Key Access Level**      | Public                                                                                                                                                                                                                                                                                                                                      |

## Editions

- [Torn War Stuff Enhanced](https://greasyfork.org/en/scripts/529238-torn-war-stuff-enhanced) — stable
- [Torn War Stuff Enhanced Beta](https://greasyfork.org/en/scripts/579772-torn-war-stuff-enhanced-beta) — experimental, newer features, may be less stable

## Support

Found a bug or have a feature request? [Open an issue on GitHub](https://github.com/xentac/torn_war_stuff_enhanced/issues).

## Disclaimer

This script is an independent, unofficial tool and is not affiliated with, endorsed by, or operated by Torn or its developers. It complies with Torn's API Terms of Service and scripting rules.
