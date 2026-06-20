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
  // Stable for the lifetime of this tab; identifies this tab's submissions to the TWSE Server.
  readonly tabId = crypto.randomUUID();

  private lastFetchTime = new Map<FactionId, number>();

  /**
   * Fetches the latest cached faction data from the TWSE Server.
   * Returns null when the 1-second rate limit has not elapsed.
   */
  async fetchLatest(factionId: FactionId): Promise<FactionResponse | null> {
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
