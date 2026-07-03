Torn War Stuff Enhanced augments the Torn City faction war box with near-real-time member status, sorted priority of members, and chain tracking. It runs entirely inside the war page DOM and layers on top of what Torn already shows you.

This version is a nearly entirely rewritten version with many new features along with numerous quality of life improvements!

## Features

- Real-time hospital countdown timers and travel destinations overlaid on each member's row
- Sorts faction members by Okay/Hospital/Departing/Abroad/Returning
- Members who land or med/revive early are sorted to the top of the Okay section and highlighted (if window focused)
- Chain count and timers always on screen
- Quick copy `Name [ID]` of a player by clicking on the right side of their honor bar
- Optional Torn API status sharing (via the TWSE Server) to ensure up-to-date timers
- Tuned for efficiency: the most features and lowest performance impact of any war monitoring script!

If you install both [FF Scouter](https://greasyfork.org/en/scripts/535292-ff-scouter-v2) and [Torn War Stuff Enhanced](https://greasyfork.org/en/scripts/529238-torn-war-stuff-enhanced) to enable additional features:

- Premium users can see flight estimates
- Filtering by last action
- Sorting by FF/Est

## Setup

The script needs a Public API key to poll faction data. Register it via the Tampermonkey menu command **"Torn War Stuff: Register Key"** (click the Tampermonkey icon → this script → the menu command) or in the settings box on the faction page.

Configuration is handled by the "Torn War Stuff Enhanced Settings" box at the bottom of the faction page.

## Screenshots

![Screenshot showing hospital timers with chain bubble](https://raw.githubusercontent.com/xentac/torn_war_stuff_enhanced/refs/heads/main/docs/screenshots/Hospital%20timers%20with%20chain%20bubble.png)<br>
_Hospital timers (including < 5 minute green highlight) with chain bubble_

![Screenshot showing orange med out highlight](https://raw.githubusercontent.com/xentac/torn_war_stuff_enhanced/refs/heads/main/docs/screenshots/Med%20out%20hightlights.png)<br>
_Orange med out/landed highlight_

![Screenshot showing settings panel](https://raw.githubusercontent.com/xentac/torn_war_stuff_enhanced/refs/heads/main/docs/screenshots/Settings.png)<br>
_Settings panel_

![Screenshot showing FF Scouter Premium flight estimates](https://raw.githubusercontent.com/xentac/torn_war_stuff_enhanced/refs/heads/main/docs/screenshots/FF%20Scouter%20Premiu%20flight%20estimates.png)<br>
_FF Scouter Premium flight estimates_

## Privacy & Torn API Terms of Service

Per the [Torn API Terms of Service](https://www.torn.com/api.html#), here's what this script stores, shares, and why:

- **Data Storage**: Persistent, locally on your device — the API key is stored in browser `localStorage`. The script itself doesn't persist faction data; it forwards each poll to the TWSE Server (see below), which persists snapshots server-side.
- **Data Sharing**: The API key is never shared with anyone but `api.torn.com`. Faction member/chain/timestamp data, plus a one-way SHA-256 hash of your key, is sent to the TWSE Server (`twse.dev`) — a community aggregation service this script integrates with. Anyone who knows your faction ID can query that aggregated data back from the TWSE Server.
- **Purpose of Use**: Community tool / statistical aggregation — the TWSE Server lets script users get a fresher snapshot of faction status between their own 10-second polls, sourced from other users' polls of the same faction.
- **Key Storage & Sharing**: Unencrypted, local to your device only. Never transmitted to or stored by the TWSE Server — it receives a one-way SHA-256 hash, used only to avoid echoing your own submissions back to you.
- **Key Access Level**: Public

> NOTE: To comply with Torn scraping rules, med/revive/flight arrival will only highlight the row when the window is in focus.

## Editions

- [Torn War Stuff Enhanced](https://greasyfork.org/en/scripts/529238-torn-war-stuff-enhanced) — stable
- [Torn War Stuff Enhanced Beta](https://greasyfork.org/en/scripts/579772-torn-war-stuff-enhanced-beta) — experimental, newer features, may be less stable

## Support

Found a bug or have a feature request? [Open an issue on GitHub](https://github.com/xentac/torn_war_stuff_enhanced/issues).

Support is also available in the [FF Scouter discord server](https://discord.gg/cndwEmVSd).

## Disclaimer

This script is an independent, unofficial tool and is not affiliated with, endorsed by, or operated by Torn or its developers. It complies with Torn's API Terms of Service and scripting rules.
