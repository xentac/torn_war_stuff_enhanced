# Drop SSE-based push updates from the TWSE Server; poll only

We attempted real-time push delivery from the TWSE Server via a persistent SSE subscription, but every transport available to the userscript fails for this traffic shape (an indefinite-length, chunked `text/event-stream` response). Native `EventSource`/`fetch` are blocked outright by Torn's page CSP — `connect-src`, `frame-src`, and `child-src` all omit `twse.dev`, which also closes off a cross-origin-iframe relay workaround. `GM_xmlhttpRequest` is the only API that bypasses page CSP, but neither of its streaming modes worked in live testing: `responseType: "text"` + `onprogress` never populates `response`/`responseText`, and `responseType: "stream"` + `onloadstart` never fires at all for this connection shape — both confirmed while the TWSE Server itself was independently verified to stream correctly via `curl -N`. We're removing `subscribe()` entirely and relying solely on the existing 1-second `fetchLatest` GET polling as the only TWSE Server read path.

## Considered Options

- Rewrite around `GM_xmlhttpRequest`'s `responseType: "stream"` — rejected, `onloadstart` never fires for an indefinite SSE connection in practice, despite being the documented mechanism.
- Cross-origin iframe bridging to a same-origin page on `twse.dev` (sidestepping CSP via an `EventSource` inside the iframe, relayed to the parent with `postMessage`) — rejected, Torn's `frame-src`/`child-src` directives don't include `twse.dev` either, so the iframe itself would never load.
- Revert to the original native `EventSource` implementation — rejected, blocked outright by Torn's page CSP `connect-src`.
