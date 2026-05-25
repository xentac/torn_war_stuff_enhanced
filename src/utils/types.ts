export type TimestampMs = number;
export type TimestampSec = number;

export interface FactionMemberStatus {
  state: "Okay" | "Traveling" | "Hospital" | "Jail" | "Abroad" | "Unknown";
  description: string;
  until: TimestampSec;
  since: TimestampMs;
  last_req_time?: TimestampMs;
}

export interface FactionMember {
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
  cooldown: number;
}

export interface FactionResponse {
  ID: number;
  name: string;
  tag: string;
  members?: Record<string, FactionMember>;
  chain?: FactionChain;
  error?: {
    code: number;
    error: string;
  };
}

export interface CachedFactionStatus {
  timestamp: TimestampMs;
  status: Record<string, FactionMemberStatus>;
}
