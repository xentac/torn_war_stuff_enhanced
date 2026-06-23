import { twseconfig } from "./config";
import logger from "./logger";
import type { FactionId, FactionResponse } from "./types";

const log = logger.child("api");

export class TornApiClient {
  private baseUrl = "https://api.torn.com/v2/faction";

  /**
   * Fetches faction member list status and chain details from the Torn API v2.
   * Requests 'members', 'chain', and 'timestamp' selections.
   */
  public async fetchFactionData(
    factionId: FactionId,
  ): Promise<FactionResponse | null> {
    const tornpdakey = "###PDA-APIKEY###";
    let key = twseconfig.apiKey;
    if (!tornpdakey.startsWith("###PDA")) {
      key = tornpdakey;
    }
    if (!key || key.length !== 16) {
      log.warn("Torn API key is invalid or not set. Skipping API request.");
      return null;
    }

    // Ask for a timestamp in the future so we don't accidentally get cached data
    const url = `${this.baseUrl}?id=${factionId}&selections=members,chain,timestamp&key=${key}&comment=TornWarStuffEnhanced&timestamp=${(Date.now() % 1000) + 10}`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        try {
          const errData = (await response.json()) as {
            code: number;
            error: string;
          };
          log.error(
            `Torn API returned error code ${errData.code}: ${errData.error}`,
          );
          return { error: errData };
        } catch {
          throw new Error(`HTTP Error status: ${response.status}`);
        }
      }

      const data = (await response.json()) as FactionResponse;
      return data;
    } catch (e) {
      log.error(
        `Network or parse error fetching faction ${factionId} data:`,
        e,
      );
      return null;
    }
  }

  /**
   * Determines if a Torn API error code is unrecoverable (e.g. invalid key, deleted faction, etc.).
   */
  public isUnrecoverableError(errorCode: number): boolean {
    const unrecoverable = [0, 1, 2, 3, 4, 6, 7, 10, 12, 13, 14, 16, 18, 21];
    return unrecoverable.includes(errorCode);
  }

  /**
   * Determines if a Torn API error code is recoverable/rate-limited (e.g. too many requests, IP block).
   */
  public isRateLimitError(errorCode: number): boolean {
    const rateLimits = [5, 8, 9];
    return rateLimits.includes(errorCode);
  }
}

export const tornApi = new TornApiClient();
