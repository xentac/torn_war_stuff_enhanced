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

// Minimal EventSource mock that exposes onmessage/onerror for test control
class MockEventSource {
  static instances: MockEventSource[] = [];

  url: string;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  close() {
    this.closed = true;
  }
}

describe("TwseServerClient", () => {
  let client: TwseServerClient;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    MockEventSource.instances = [];
    client = new TwseServerClient();
    global.EventSource = MockEventSource as any;
    fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  describe("fetchLatest", () => {
    it("makes GET to the correct URL", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockFactionResponse,
      });
      await client.fetchLatest("456");
      expect(fetchMock).toHaveBeenCalledWith(
        `${TWSE_SERVER_BASE_URL}/faction/456`,
      );
    });

    it("returns parsed FactionResponse on success", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockFactionResponse,
      });
      expect(await client.fetchLatest("123")).toEqual(mockFactionResponse);
    });

    it("returns null on non-200 response", async () => {
      fetchMock.mockResolvedValueOnce({ ok: false, status: 503 });
      expect(await client.fetchLatest("123")).toBeNull();
    });

    it("returns null on network error", async () => {
      fetchMock.mockRejectedValueOnce(new Error("offline"));
      expect(await client.fetchLatest("123")).toBeNull();
    });

    it("rate-limits to at most one call per second", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => mockFactionResponse,
      });

      await client.fetchLatest("123"); // passes
      expect(await client.fetchLatest("123")).toBeNull(); // rate-limited
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("allows a second call after 1s has elapsed", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => mockFactionResponse,
      });

      await client.fetchLatest("123");
      vi.advanceTimersByTime(1_001);
      await client.fetchLatest("123");
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("rate limits are independent per faction", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => mockFactionResponse,
      });

      await client.fetchLatest("123");
      await client.fetchLatest("456"); // different faction, not rate-limited
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("returns null immediately when an SSE connection is active", async () => {
      client.subscribe("123", () => {}, "hash");
      expect(await client.fetchLatest("123")).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  describe("subscribe", () => {
    it("opens EventSource with the correct URL", () => {
      client.subscribe("123", () => {}, "abc123");
      expect(MockEventSource.instances).toHaveLength(1);
      expect(MockEventSource.instances[0].url).toBe(
        `${TWSE_SERVER_BASE_URL}/faction/123/subscribe?user_id_hash=abc123`,
      );
    });

    it("calls onData with parsed FactionResponse on message", () => {
      const onData = vi.fn();
      client.subscribe("123", onData, "hash");

      MockEventSource.instances[0].onmessage?.({
        data: JSON.stringify(mockFactionResponse),
      });

      expect(onData).toHaveBeenCalledWith(mockFactionResponse);
    });

    it("blocks fetchLatest while the SSE connection is active", async () => {
      client.subscribe("123", () => {}, "hash");
      expect(await client.fetchLatest("123")).toBeNull();
    });

    it("unblocks fetchLatest after unsubscribe", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockFactionResponse,
      });

      const unsubscribe = client.subscribe("123", () => {}, "hash");
      expect(await client.fetchLatest("123")).toBeNull();

      unsubscribe();
      expect(await client.fetchLatest("123")).toEqual(mockFactionResponse);
    });

    it("closes the EventSource on unsubscribe", () => {
      const unsubscribe = client.subscribe("123", () => {}, "hash");
      unsubscribe();
      expect(MockEventSource.instances[0].closed).toBe(true);
    });

    it("reconnects with exponential backoff on error", () => {
      client.subscribe("123", () => {}, "hash");

      // First error → retry after 1s, then bump delay to 2s
      MockEventSource.instances[0].onerror?.();
      expect(MockEventSource.instances).toHaveLength(1);

      vi.advanceTimersByTime(1_000);
      expect(MockEventSource.instances).toHaveLength(2);

      // Second error → retry after 2s
      MockEventSource.instances[1].onerror?.();
      vi.advanceTimersByTime(1_000);
      expect(MockEventSource.instances).toHaveLength(2); // not yet

      vi.advanceTimersByTime(1_000);
      expect(MockEventSource.instances).toHaveLength(3);
    });

    it("does not reconnect after unsubscribe", () => {
      const unsubscribe = client.subscribe("123", () => {}, "hash");
      unsubscribe();
      MockEventSource.instances[0].onerror?.();

      vi.advanceTimersByTime(5_000);
      expect(MockEventSource.instances).toHaveLength(1);
    });

    it("resets retry delay to 1s after a successful message", () => {
      client.subscribe("123", () => {}, "hash");

      // First error bumps delay from 1s → 2s
      MockEventSource.instances[0].onerror?.();
      vi.advanceTimersByTime(1_000); // reconnects at 1s → es[1]

      // Successful message resets delay back to 1s
      MockEventSource.instances[1].onmessage?.({
        data: JSON.stringify(mockFactionResponse),
      });

      // Next error should retry at 1s, not 2s
      MockEventSource.instances[1].onerror?.();
      vi.advanceTimersByTime(1_000);
      expect(MockEventSource.instances).toHaveLength(3);
    });

    it("unblocks fetchLatest while reconnecting between retries", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => mockFactionResponse,
      });

      client.subscribe("123", () => {}, "hash");
      MockEventSource.instances[0].onerror?.(); // SSE dropped, reconnect pending

      // Before reconnect fires, fetchLatest should work
      expect(await client.fetchLatest("123")).toEqual(mockFactionResponse);
    });
  });

  // -------------------------------------------------------------------------
  describe("submit", () => {
    it("makes a POST to the correct URL with the right headers and body", () => {
      fetchMock.mockResolvedValueOnce({ ok: true });

      const payload = {
        player_id: 42,
        user_id_hash: "abc123",
        torn_response: mockFactionResponse,
      };

      client.submit("123", payload);

      expect(fetchMock).toHaveBeenCalledWith(
        `${TWSE_SERVER_BASE_URL}/faction/123/submit`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
    });

    it("does not throw on network error", async () => {
      fetchMock.mockRejectedValueOnce(new Error("offline"));

      expect(() =>
        client.submit("123", {
          player_id: 1,
          user_id_hash: "hash",
          torn_response: mockFactionResponse,
        }),
      ).not.toThrow();

      await vi.runAllTimersAsync();
    });
  });
});
