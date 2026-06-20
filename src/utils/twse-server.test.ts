import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TWSE_SERVER_BASE_URL, TwseServerClient } from "./twse-server";
import type { FactionResponse } from "./types";

const mockFactionResponse: FactionResponse = {
  members: [],
  chain: {
    current: 10,
    max: 100,
    timeout: 300,
    modifier: 1.0,
    cooldown: 0,
  },
  timestamp: 1700000000,
};

interface GmDetails {
  method: string;
  url: string;
  headers?: Record<string, string>;
  data?: string;
  onload?: (r: { status: number; responseText: string }) => void;
  onerror?: (e?: unknown) => void;
}

describe("TwseServerClient", () => {
  let client: TwseServerClient;
  let gmMock: ReturnType<typeof vi.fn>;
  let gmRequests: Array<{
    details: GmDetails;
    abort: ReturnType<typeof vi.fn>;
  }>;

  beforeEach(() => {
    vi.useFakeTimers();
    client = new TwseServerClient();
    gmRequests = [];

    // Default: auto-resolve GET requests; leave POST open.
    gmMock = vi.fn((details: GmDetails) => {
      const abort = vi.fn();
      gmRequests.push({ details, abort });
      if (details.method === "GET") {
        details.onload?.({
          status: 200,
          responseText: JSON.stringify(mockFactionResponse),
        });
      }
      return { abort };
    });
    global.GM_xmlhttpRequest = gmMock as any;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  describe("fetchLatest", () => {
    it("makes GET to the correct URL", async () => {
      await client.fetchLatest("456");
      expect(gmRequests[0].details.url).toBe(
        `${TWSE_SERVER_BASE_URL}/faction/456`,
      );
      expect(gmRequests[0].details.method).toBe("GET");
    });

    it("returns parsed FactionResponse on success", async () => {
      expect(await client.fetchLatest("123")).toEqual(mockFactionResponse);
    });

    it("returns null on non-200 response", async () => {
      gmMock.mockImplementationOnce((details: GmDetails) => {
        const abort = vi.fn();
        gmRequests.push({ details, abort });
        details.onload?.({ status: 503, responseText: "" });
        return { abort };
      });
      expect(await client.fetchLatest("123")).toBeNull();
    });

    it("returns null on network error", async () => {
      gmMock.mockImplementationOnce((details: GmDetails) => {
        const abort = vi.fn();
        gmRequests.push({ details, abort });
        details.onerror?.(new Error("offline"));
        return { abort };
      });
      expect(await client.fetchLatest("123")).toBeNull();
    });

    it("rate-limits to at most one call per second", async () => {
      await client.fetchLatest("123"); // passes
      expect(await client.fetchLatest("123")).toBeNull(); // rate-limited
      expect(gmMock).toHaveBeenCalledTimes(1);
    });

    it("allows a second call after 1s has elapsed", async () => {
      await client.fetchLatest("123");
      vi.advanceTimersByTime(1_001);
      await client.fetchLatest("123");
      expect(gmMock).toHaveBeenCalledTimes(2);
    });

    it("rate limits are independent per faction", async () => {
      await client.fetchLatest("123");
      await client.fetchLatest("456"); // different faction, not rate-limited
      expect(gmMock).toHaveBeenCalledTimes(2);
    });
  });

  // -------------------------------------------------------------------------
  describe("submit", () => {
    it("makes a POST to the correct URL with the right headers and body", () => {
      const payload = {
        user_id_hash: "abc123",
        torn_response: mockFactionResponse,
      };

      client.submit("123", payload);

      expect(gmRequests[0].details.method).toBe("POST");
      expect(gmRequests[0].details.url).toBe(
        `${TWSE_SERVER_BASE_URL}/faction/123/submit`,
      );
      expect(gmRequests[0].details.headers).toEqual({
        "Content-Type": "application/json",
      });
      expect(JSON.parse(gmRequests[0].details.data ?? "")).toEqual({
        ...payload,
        tab_id: client.tabId,
      });
    });

    it("does not throw on network error", () => {
      gmMock.mockImplementationOnce((details: GmDetails) => {
        const abort = vi.fn();
        gmRequests.push({ details, abort });
        details.onerror?.(new Error("offline"));
        return { abort };
      });

      expect(() =>
        client.submit("123", {
          user_id_hash: "hash",
          torn_response: mockFactionResponse,
        }),
      ).not.toThrow();
    });
  });
});
