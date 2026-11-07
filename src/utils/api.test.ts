// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TornApiClient } from "./api";
import { twseconfig } from "./config";
import type { FactionId } from "./types";

const FACTION_ID = "12345" as FactionId;
const BODY = { timestamp: 1700000000 };

describe("TornApiClient.fetchFactionData", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    twseconfig.apiKey = "abcdefghijklmnop";
    fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(BODY), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete (window as any).PDA_httpGet;
  });

  it("uses PDA_httpGet when it is available and the setting is on", async () => {
    const pdaHttpGet = vi
      .fn()
      .mockResolvedValue({ status: 200, responseText: JSON.stringify(BODY) });
    (window as any).PDA_httpGet = pdaHttpGet;

    const data = await new TornApiClient().fetchFactionData(FACTION_ID);

    expect(data).toEqual(BODY);
    expect(pdaHttpGet).toHaveBeenCalledWith(
      expect.stringContaining("https://api.torn.com/v2/faction?id=12345"),
      {},
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses fetch when the setting is off", async () => {
    const pdaHttpGet = vi.fn();
    (window as any).PDA_httpGet = pdaHttpGet;
    twseconfig.pda_http_enabled = false;

    const data = await new TornApiClient().fetchFactionData(FACTION_ID);

    expect(data).toEqual(BODY);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(pdaHttpGet).not.toHaveBeenCalled();
  });

  it("uses fetch when PDA_httpGet is not available", async () => {
    const data = await new TornApiClient().fetchFactionData(FACTION_ID);

    expect(data).toEqual(BODY);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("returns the Torn API error from a PDA_httpGet error status", async () => {
    const error = { code: 5, error: "Too many requests" };
    (window as any).PDA_httpGet = vi
      .fn()
      .mockResolvedValue({ status: 429, responseText: JSON.stringify(error) });

    const data = await new TornApiClient().fetchFactionData(FACTION_ID);

    expect(data).toEqual({ error });
  });

  it("returns null when PDA_httpGet gives an empty body", async () => {
    (window as any).PDA_httpGet = vi
      .fn()
      .mockResolvedValue({ status: 200, responseText: "" });

    const data = await new TornApiClient().fetchFactionData(FACTION_ID);

    expect(data).toBeNull();
  });
});
