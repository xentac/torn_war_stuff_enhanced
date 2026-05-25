import { twseconfig } from "./config";
import { FactionResponse } from "./types";
import logger from "./logger";

export class TornApiClient {
  private baseUrl = "https://api.torn.com/faction/";

  /**
   * Fetches faction member list status and chain details from the Torn API.
   * Requests both 'basic' and 'chain' selections.
   */
  public async fetchFactionData(factionId: string): Promise<FactionResponse | null> {
    const key = twseconfig.apiKey;
    if (!key || key === "###PDA-APIKEY###" || key.length !== 16) {
      logger.warn("Torn API key is invalid or not set. Skipping API request.");
      return null;
    }

    const url = `${this.baseUrl}${factionId}?selections=basic,chain&key=${key}&comment=TornWarStuffEnhanced`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP Error status: ${response.status}`);
      }

      const data = (await response.json()) as FactionResponse;
      if (data.error) {
        logger.error(`Torn API returned error code ${data.error.code}: ${data.error.error}`);
        return data; // Return the response containing the error object so caller can handle rate limits / bad keys
      }

      return data;
    } catch (e) {
      logger.error(`Network or parse error fetching faction ${factionId} data:`, e);
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
