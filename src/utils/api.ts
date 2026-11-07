import { twseconfig } from "./config";
import logger from "./logger";
import type { FactionId, FactionResponse } from "./types";

const log = logger.child("api");

/** Torn PDA's PDA_httpGet, injected into the page by the app. */
type PdaHttpGet = (
  url: string,
  headers: Record<string, string>,
) => Promise<{ status: number; responseText: string }>;

export class TornApiClient {
  private baseUrl = "https://api.torn.com/v2/faction";

  /**
   * Fetches faction member list status and chain details from the Torn API v2.
   * Requests 'members', 'wars', 'chain', and 'timestamp' selections.
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
    const url = `${this.baseUrl}?id=${factionId}&selections=members,wars,chain,timestamp&key=${key}&comment=TornWarStuffEnhanced&timestamp=${(Date.now() % 1000) + 10}`;

    try {
      const pdaHttpGet = (window as any).PDA_httpGet as PdaHttpGet | undefined;
      if (twseconfig.pda_http_enabled && typeof pdaHttpGet === "function") {
        return await this.fetchViaPda(pdaHttpGet, url);
      }

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
   * Fetches through Torn PDA's native HTTP client instead of the WebView's
   * fetch, which can return an empty body on some devices.
   */
  private async fetchViaPda(
    pdaHttpGet: PdaHttpGet,
    url: string,
  ): Promise<FactionResponse> {
    const response = await pdaHttpGet(url, {});
    if (response.status < 200 || response.status >= 300) {
      try {
        const errData = JSON.parse(response.responseText) as {
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

    return JSON.parse(response.responseText) as FactionResponse;
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
