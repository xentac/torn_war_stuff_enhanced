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
  onprogress?: (r: { responseText?: string; response?: string }) => void;
  onabort?: () => void;
}

// Formats a FactionResponse as a single SSE event string
function sseEvent(data: FactionResponse): string {
  return `data: ${JSON.stringify(data)}\n\n`;
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

    // Default: auto-resolve GET /faction/:id requests; leave subscribe/POST open.
    gmMock = vi.fn((details: GmDetails) => {
      const abort = vi.fn();
      gmRequests.push({ details, abort });
      if (details.method === "GET" && !details.url.includes("/subscribe")) {
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

    it("returns null immediately when an SSE connection is active", async () => {
      client.subscribe("123", () => {}, "hash");
      expect(await client.fetchLatest("123")).toBeNull();
      expect(gmMock).toHaveBeenCalledTimes(1); // only the subscribe call
    });
  });

  // -------------------------------------------------------------------------
  describe("subscribe", () => {
    it("opens a GM request to the correct URL including tab_id", () => {
      client.subscribe("123", () => {}, "abc123");
      expect(gmRequests).toHaveLength(1);
      expect(gmRequests[0].details.url).toBe(
        `${TWSE_SERVER_BASE_URL}/faction/123/subscribe?user_id_hash=abc123&tab_id=${client.tabId}`,
      );
    });

    it("calls onData with parsed FactionResponse on SSE message", () => {
      const onData = vi.fn();
      client.subscribe("123", onData, "hash");
      gmRequests[0].details.onprogress?.({
        responseText: sseEvent(mockFactionResponse),
      });
      expect(onData).toHaveBeenCalledWith(mockFactionResponse);
    });

    it("blocks fetchLatest while the SSE connection is active", async () => {
      client.subscribe("123", () => {}, "hash");
      expect(await client.fetchLatest("123")).toBeNull();
    });

    it("unblocks fetchLatest after unsubscribe", async () => {
      const unsubscribe = client.subscribe("123", () => {}, "hash");
      expect(await client.fetchLatest("123")).toBeNull();

      unsubscribe();
      expect(await client.fetchLatest("123")).toEqual(mockFactionResponse);
    });

    it("aborts the GM request on unsubscribe", () => {
      const unsubscribe = client.subscribe("123", () => {}, "hash");
      unsubscribe();
      expect(gmRequests[0].abort).toHaveBeenCalled();
    });

    it("reconnects with exponential backoff on error", () => {
      client.subscribe("123", () => {}, "hash");

      // First error → retry after 1s, then bump delay to 2s
      gmRequests[0].details.onerror?.();
      expect(gmRequests).toHaveLength(1);

      vi.advanceTimersByTime(1_000);
      expect(gmRequests).toHaveLength(2);

      // Second error → retry after 2s
      gmRequests[1].details.onerror?.();
      vi.advanceTimersByTime(1_000);
      expect(gmRequests).toHaveLength(2); // not yet

      vi.advanceTimersByTime(1_000);
      expect(gmRequests).toHaveLength(3);
    });

    it("does not reconnect after unsubscribe", () => {
      const unsubscribe = client.subscribe("123", () => {}, "hash");
      unsubscribe();
      gmRequests[0].details.onerror?.();

      vi.advanceTimersByTime(5_000);
      expect(gmRequests).toHaveLength(1);
    });

    it("resets retry delay to 1s after a successful message", () => {
      client.subscribe("123", () => {}, "hash");

      // First error bumps delay from 1s → 2s
      gmRequests[0].details.onerror?.();
      vi.advanceTimersByTime(1_000); // reconnects at 1s → request[1]

      // Successful message resets delay back to 1s
      gmRequests[1].details.onprogress?.({
        responseText: sseEvent(mockFactionResponse),
      });

      // Next error should retry at 1s, not 2s
      gmRequests[1].details.onerror?.();
      vi.advanceTimersByTime(1_000);
      expect(gmRequests).toHaveLength(3);
    });

    it("unblocks fetchLatest while reconnecting between retries", async () => {
      client.subscribe("123", () => {}, "hash");
      gmRequests[0].details.onerror?.(); // SSE dropped, reconnect pending

      // Before reconnect fires, fetchLatest should work
      expect(await client.fetchLatest("123")).toEqual(mockFactionResponse);
    });

    it("handles partial SSE events split across multiple onprogress calls", () => {
      const onData = vi.fn();
      client.subscribe("123", onData, "hash");

      const full = sseEvent(mockFactionResponse);
      const half = Math.floor(full.length / 2);

      // First chunk: partial event — should not fire onData yet
      gmRequests[0].details.onprogress?.({ responseText: full.slice(0, half) });
      expect(onData).not.toHaveBeenCalled();

      // Second chunk: completes the event — should fire onData
      gmRequests[0].details.onprogress?.({ responseText: full });
      expect(onData).toHaveBeenCalledWith(mockFactionResponse);
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
