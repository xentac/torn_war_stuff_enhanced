import logger from "./logger";
import type { FactionId, FactionResponse } from "./types";

const log = logger.child("twse-server");

//export const TWSE_SERVER_BASE_URL = "https://PLACEHOLDER.example.com";
export const TWSE_SERVER_BASE_URL = "http://localhost:3000";

const MIN_FETCH_INTERVAL_MS = 1_000;

export interface TwseSubmitPayload {
  player_id: number;
  user_id_hash: string;
  torn_response: FactionResponse;
}

export class TwseServerClient {
  private lastFetchTime = new Map<FactionId, number>();
  private activeSseConnections = new Set<FactionId>();

  /**
   * Fetches the latest cached faction data from the TWSE Server.
   * Returns null when an SSE connection is already active for this faction,
   * or when the 1-second rate limit has not elapsed.
   */
  async fetchLatest(factionId: FactionId): Promise<FactionResponse | null> {
    if (this.activeSseConnections.has(factionId)) return null;

    const now = Date.now();
    const last = this.lastFetchTime.get(factionId) ?? 0;
    if (now - last < MIN_FETCH_INTERVAL_MS) return null;
    this.lastFetchTime.set(factionId, now);

    try {
      const response = await fetch(
        `${TWSE_SERVER_BASE_URL}/faction/${factionId}`,
      );
      if (!response.ok) return null;
      return (await response.json()) as FactionResponse;
    } catch (e) {
      log.error(`Failed to fetch latest data for faction ${factionId}:`, e);
      return null;
    }
  }

  /**
   * Opens an SSE subscription for live faction updates.
   * Returns an unsubscribe function that closes the connection.
   * Reconnects with exponential backoff (1s → 2s → 4s → 30s cap) on drop.
   * While reconnecting, fetchLatest is unblocked so GET polling fills the gap.
   */
  subscribe(
    factionId: FactionId,
    onData: (data: FactionResponse) => void,
    userIdHash: string,
  ): () => void {
    let stopped = false;
    let es: EventSource | null = null;
    let retryDelayMs = 1_000;

    const connect = () => {
      if (stopped) return;
      this.activeSseConnections.add(factionId);

      const url = `${TWSE_SERVER_BASE_URL}/faction/${factionId}/subscribe?user_id_hash=${encodeURIComponent(userIdHash)}`;
      es = new EventSource(url);

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as FactionResponse;
          onData(data);
          retryDelayMs = 1_000;
        } catch (e) {
          log.error("Failed to parse SSE event data:", e);
        }
      };

      es.onerror = () => {
        es?.close();
        es = null;
        this.activeSseConnections.delete(factionId);
        if (!stopped) {
          log.warn(
            `SSE for faction ${factionId} dropped. Retrying in ${retryDelayMs}ms.`,
          );
          setTimeout(connect, retryDelayMs);
          retryDelayMs = Math.min(retryDelayMs * 2, 30_000);
        }
      };
    };

    connect();

    return () => {
      stopped = true;
      this.activeSseConnections.delete(factionId);
      es?.close();
      es = null;
    };
  }

  /**
   * Fire-and-forget POST of a Torn API response to the TWSE Server.
   * Errors are logged but never propagated.
   */
  submit(factionId: FactionId, payload: TwseSubmitPayload): void {
    fetch(`${TWSE_SERVER_BASE_URL}/faction/${factionId}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch((e) => {
      log.error(
        `Failed to submit faction ${factionId} data to TWSE Server:`,
        e,
      );
    });
  }
}

export const twseClient = new TwseServerClient();
