export type TimestampMs = number;
export type TimestampSec = number;
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
  until: TimestampSec | null;
  last_req_time?: TimestampMs;
}

export interface FactionMember {
  id: number;
  name: string;
  level: number;
  last_action: {
    status: string;
    timestamp: TimestampSec;
  };
  status: FactionMemberStatus;
}

export interface FactionChain {
  current: number;
  max: number;
  timeout: number;
  modifier: number;
  cooldown: TimestampSec; // v2: Unix timestamp of when cooldown ends (not seconds remaining)
  end?: TimestampSec;
}

export interface FactionResponse {
  members?: FactionMember[];
  chain?: FactionChain;
  timestamp?: TimestampSec;
  error?: {
    code: number;
    error: string;
  };
}

export interface CachedFactionStatus {
  timestamp: TimestampMs;
  status: Record<string, FactionMemberStatus>;
}
