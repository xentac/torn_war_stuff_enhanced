// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import { Config } from "./config";

describe("Config", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("bubble_presence_enabled", () => {
    it("defaults to true", () => {
      expect(new Config().bubble_presence_enabled).toBe(true);
    });

    it("persists a stored value", () => {
      new Config().bubble_presence_enabled = false;
      expect(new Config().bubble_presence_enabled).toBe(false);
    });

    it("is cleared by reset", () => {
      const config = new Config();
      config.bubble_presence_enabled = false;
      config.reset();
      expect(config.bubble_presence_enabled).toBe(true);
    });
  });

  describe("pda_http_enabled", () => {
    it("defaults to true", () => {
      expect(new Config().pda_http_enabled).toBe(true);
    });

    it("persists a stored value", () => {
      new Config().pda_http_enabled = false;
      expect(new Config().pda_http_enabled).toBe(false);
    });

    it("is cleared by reset", () => {
      const config = new Config();
      config.pda_http_enabled = false;
      config.reset();
      expect(config.pda_http_enabled).toBe(true);
    });
  });
});

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
