import { beforeEach, describe, expect, it } from "vitest";
import { Config } from "./config";

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

describe("Config — Presence alert settings", () => {
  let config: Config;

  beforeEach(() => {
    localStorage.clear();
    config = new Config("twse-config-test-");
  });

  it("defaults to enabled, X=5, T=5 min, Y=5", () => {
    expect(config.presence_alerts_enabled).toBe(true);
    expect(config.presence_surge_members).toBe(5);
    expect(config.presence_surge_window_min).toBe(5);
    expect(config.presence_gap_members).toBe(5);
  });

  it("round-trips in-range values", () => {
    config.presence_alerts_enabled = false;
    config.presence_surge_members = 12;
    config.presence_surge_window_min = 30;
    config.presence_gap_members = 1;
    expect(config.presence_alerts_enabled).toBe(false);
    expect(config.presence_surge_members).toBe(12);
    expect(config.presence_surge_window_min).toBe(30);
    expect(config.presence_gap_members).toBe(1);
  });

  it("clamps out-of-range values on write", () => {
    config.presence_surge_members = 0;
    config.presence_surge_window_min = 31;
    config.presence_gap_members = 999;
    expect(config.presence_surge_members).toBe(1);
    expect(config.presence_surge_window_min).toBe(30);
    expect(config.presence_gap_members).toBe(50);
    expect(
      JSON.parse(
        localStorage.getItem("twse-config-test-presence_gap_members") ?? "",
      ).value,
    ).toBe(50);
  });

  it("falls back to the default for NaN input", () => {
    config.presence_surge_members = 12;
    config.presence_surge_members = Number.NaN;
    expect(config.presence_surge_members).toBe(5);
  });

  it("clamps what it reads from storage", () => {
    localStorage.setItem(
      "twse-config-test-presence_surge_window_min",
      JSON.stringify({ value: 90, expiration: null }),
    );
    localStorage.setItem(
      "twse-config-test-presence_gap_members",
      JSON.stringify({ value: "junk", expiration: null }),
    );
    expect(config.presence_surge_window_min).toBe(30);
    expect(config.presence_gap_members).toBe(5);
  });

  it("reset() restores the defaults", () => {
    config.presence_alerts_enabled = false;
    config.presence_surge_members = 12;
    config.presence_surge_window_min = 12;
    config.presence_gap_members = 12;
    config.reset();
    expect(config.presence_alerts_enabled).toBe(true);
    expect(config.presence_surge_members).toBe(5);
    expect(config.presence_surge_window_min).toBe(5);
    expect(config.presence_gap_members).toBe(5);
  });
});
