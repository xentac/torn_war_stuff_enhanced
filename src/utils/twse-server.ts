import logger from "./logger";
import type { FactionId, FactionResponse } from "./types";

const log = logger.child("twse-server");

export const TWSE_SERVER_BASE_URL = "https://twse.dev";

const MIN_FETCH_INTERVAL_MS = 1_000;

export interface TwseSubmitPayload {
  user_id_hash: string;
  torn_response: FactionResponse;
}

export class TwseServerClient {
  // Stable for the lifetime of this tab; used for SSE echo-suppression.
  readonly tabId = crypto.randomUUID();

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
    log.debug("Fetching latest from twse.dev");
    const start = performance.now();

    return new Promise((resolve) => {
      GM_xmlhttpRequest({
        method: "GET",
        url: `${TWSE_SERVER_BASE_URL}/faction/${factionId}`,
        onload: (response) => {
          if (response.status !== 200) {
            resolve(null);
            return;
          }
          try {
            const end = performance.now();
            log.debug(`Received result in ${end - start}ms`);
            resolve(JSON.parse(response.responseText) as FactionResponse);
          } catch (e) {
            log.error(`Failed to parse response for faction ${factionId}:`, e);
            resolve(null);
          }
        },
        onerror: (e) => {
          log.debug(`Failed to fetch latest data for faction ${factionId}:`, e);
          resolve(null);
        },
      });
    });
  }

  /**
   * Opens an SSE subscription for live faction updates via GM_xmlhttpRequest streaming.
   * Returns an unsubscribe function that aborts the connection.
   * Reconnects with exponential backoff (1s → 2s → 4s → 30s cap) on drop.
   * While reconnecting, fetchLatest is unblocked so GET polling fills the gap.
   */
  subscribe(
    factionId: FactionId,
    onData: (data: FactionResponse) => void,
    userIdHash: string,
  ): () => void {
    let stopped = false;
    let retryDelayMs = 1_000;
    let requestHandle: { abort: () => void } | null = null;

    const connect = () => {
      if (stopped) return;
      this.activeSseConnections.add(factionId);

      const url = `${TWSE_SERVER_BASE_URL}/faction/${factionId}/subscribe?user_id_hash=${encodeURIComponent(userIdHash)}&tab_id=${encodeURIComponent(this.tabId)}`;
      let processedLength = 0;
      let pending = "";

      requestHandle = GM_xmlhttpRequest({
        method: "GET",
        url,
        headers: {
          Accept: "text/event-stream",
          "Cache-Control": "no-cache",
        },
        onprogress: (response) => {
          // Violentmonkey populates `response`; Tampermonkey populates `responseText`
          const fullText =
            response.responseText ?? (response.response as string) ?? "";
          const chunk = fullText.slice(processedLength);
          processedLength = fullText.length;
          pending += chunk;

          // SSE events are separated by double newlines
          const parts = pending.split("\n\n");
          pending = parts.pop() ?? "";

          for (const eventText of parts) {
            const dataLine = eventText
              .split("\n")
              .find((line) => line.startsWith("data:"));
            if (!dataLine) continue;
            try {
              const data = JSON.parse(
                dataLine.slice("data:".length).trim(),
              ) as FactionResponse;
              onData(data);
              retryDelayMs = 1_000;
            } catch (e) {
              log.error("Failed to parse SSE event data:", e);
            }
          }
        },
        onerror: () => {
          requestHandle = null;
          this.activeSseConnections.delete(factionId);
          if (!stopped) {
            log.warn(
              `SSE for faction ${factionId} dropped. Retrying in ${retryDelayMs}ms.`,
            );
            setTimeout(connect, retryDelayMs);
            retryDelayMs = Math.min(retryDelayMs * 2, 30_000);
          }
        },
        onabort: () => {
          requestHandle = null;
          this.activeSseConnections.delete(factionId);
        },
      });
    };

    connect();

    return () => {
      stopped = true;
      this.activeSseConnections.delete(factionId);
      requestHandle?.abort();
      requestHandle = null;
    };
  }

  /**
   * Fire-and-forget POST of a Torn API response to the TWSE Server.
   * Errors are logged but never propagated.
   */
  submit(factionId: FactionId, payload: TwseSubmitPayload): void {
    log.debug("Sending update to twse server");
    GM_xmlhttpRequest({
      method: "POST",
      url: `${TWSE_SERVER_BASE_URL}/faction/${factionId}/submit`,
      headers: { "Content-Type": "application/json" },
      data: JSON.stringify({ ...payload, tab_id: this.tabId }),
      onerror: (e) => {
        log.error(
          `Failed to submit faction ${factionId} data to TWSE Server:`,
          e,
        );
      },
    });
  }
}

export const twseClient = new TwseServerClient();
