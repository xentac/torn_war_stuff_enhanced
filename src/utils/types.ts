/** A point in time on our local device's clock (Date.now()). Never compare
 * directly against a Torn-sourced timestamp — they're different clocks. */
export type TimestampMs = number;

/** A point in time on Torn's server-synchronized clock — either bridged
 * locally via getCurrentTime(), or a literal Torn API response field.
 * Comparable to other Torn timestamps, never to a local TimestampMs. */
export type TornTimestampMs = number;
export type TornTimestampSec = number;

/** A span of time, not a point in time. Comparable to other durations of the
 * same unit, and addable/subtractable to/from a timestamp — but comparing a
 * duration directly to a timestamp never makes sense. */
export type DurationMs = number;
export type DurationSec = number;

export type FactionId = string;

export interface FactionMemberStatus {
  state:
    | "Okay"
    | "Traveling"
    | "Hospital"
    | "Jail"
    | "Abroad"
    | "Awoken"
    | "Dormant"
    | "Fallen"
    | "Federal"
    | "Unknown";
  description: string;
  until: TornTimestampSec | null;
  last_req_time?: TimestampMs;
}

export interface FactionMember {
  id: number;
  name: string;
  level: number;
  last_action: {
    status: string;
    timestamp: TornTimestampSec;
  };
  status: FactionMemberStatus;
}

export interface FactionChain {
  current: number;
  max: number;
  timeout: number;
  modifier: number;
  cooldown: TornTimestampSec; // v2: Unix timestamp of when cooldown ends (not seconds remaining)
  end?: TornTimestampSec;
}

export interface FactionResponse {
  members?: FactionMember[];
  chain?: FactionChain;
  timestamp?: TornTimestampSec;
  error?: {
    code: number;
    error: string;
  };
}

export interface CachedFactionMembers {
  version: number;
  timestamp: TimestampMs;
  members: Record<string, FactionMember>;
}
