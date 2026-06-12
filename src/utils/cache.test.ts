import { beforeEach, describe, expect, it, vi } from "vitest";
import { FactionCache } from "./cache";
import type { FactionMemberStatus } from "./types";

// Setup localStorage polyfill for vitest
const storageMock: Record<string, string> = {};
global.localStorage = {
  getItem: (key: string) => storageMock[key] || null,
  setItem: (key: string, value: string) => {
    storageMock[key] = value;
  },
  removeItem: (key: string) => {
    delete storageMock[key];
  },
  clear: () => {
    for (const key of Object.keys(storageMock)) {
      delete storageMock[key];
    }
  },
  key: (index: number) => Object.keys(storageMock)[index] || null,
  get length() {
    return Object.keys(storageMock).length;
  },
} as any;

describe("FactionCache", () => {
  let cache: FactionCache;
  const mockStatus: Record<string, FactionMemberStatus> = {
    "123": {
      state: "Okay",
      description: "Okay",
      until: 0,
    },
  };

  beforeEach(() => {
    localStorage.clear();
    cache = new FactionCache();
  });

  it("should return null for non-existent cache keys", () => {
    expect(cache.get("999")).toBeNull();
  });

  it("should set and retrieve values correctly within TTL", () => {
    cache.set("123", mockStatus);
    const retrieved = cache.get("123");
    expect(retrieved).toEqual(mockStatus);
  });

  it("should return null and clean up if the cache item has expired", () => {
    vi.useFakeTimers();
    cache.set("123", mockStatus);

    // Advance time by 11 seconds (TTL is 10s)
    vi.advanceTimersByTime(11_000);

    expect(cache.get("123")).toBeNull();
    expect(
      localStorage.getItem("xentac-torn_war_stuff_enhanced-status-123"),
    ).toBeNull();

    vi.useRealTimers();
  });

  it("should remove values explicitly", () => {
    cache.set("123", mockStatus);
    cache.remove("123");
    expect(cache.get("123")).toBeNull();
  });

  it("should clean expired items globally during sweeping", () => {
    vi.useFakeTimers();

    cache.set("1", mockStatus);
    cache.set("2", mockStatus);

    // Advance time past TTL
    vi.advanceTimersByTime(11_000);

    // Set a new valid item
    cache.set("3", mockStatus);

    // Run cleanExpired sweep
    cache.cleanExpired();

    expect(cache.get("1")).toBeNull();
    expect(cache.get("2")).toBeNull();
    expect(cache.get("3")).toEqual(mockStatus);

    vi.useRealTimers();
  });
});
