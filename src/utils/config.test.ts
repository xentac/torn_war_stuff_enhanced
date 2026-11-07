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
