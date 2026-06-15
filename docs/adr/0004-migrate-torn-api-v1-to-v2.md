# Migrate Torn API v1 to v2

The script is migrating from the Torn API v1 faction endpoint to v2 in order to access the `timestamp` selection, which returns the server-generated snapshot time. The client-side `Date.now()` alternative is not sufficient because the TWSE Server uses the server timestamp as the authoritative freshness signal when comparing responses contributed by different users — a client timestamp is meaningless for that comparison.

The migration changes three things beyond the URL and selection names:

- **`members` shape**: v1 returns a dict keyed by member ID; v2 returns an array with an explicit `id` field.
- **`chain.cooldown` semantics**: v1 is seconds remaining; v2 is a Unix timestamp of when the cooldown ends. The chain bubble calculation changes from `cooldown - elapsed` to `cooldown - now`.
- **`status.until` nullability**: v2 allows `null` where v1 used `0`.

The `tag` field (previously sourced from v1's `basic` selection) is dropped from `ActiveChainState` and the chain bubble — it is available in the DOM but not needed.

## Considered Options

Staying on v1 and stamping responses with `Date.now()` was rejected because client timestamps vary by network latency and clock skew, making them useless for cross-user freshness comparison in the TWSE Server.
