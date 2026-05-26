import { describe, expect, it } from "vitest";
import {
  calc_delta,
  formatChainCooldown,
  formatChainTimeout,
  getCurrentTimeSec,
  pad_with_zeros,
} from "./time";

describe("Time Utilities", () => {
  describe("pad_with_zeros", () => {
    it("should pad single-digit numbers with a leading zero", () => {
      expect(pad_with_zeros(0)).toBe("00");
      expect(pad_with_zeros(5)).toBe("05");
      expect(pad_with_zeros(9)).toBe("09");
    });

    it("should not pad double-digit or larger numbers", () => {
      expect(pad_with_zeros(10)).toBe("10");
      expect(pad_with_zeros(99)).toBe("99");
      expect(pad_with_zeros(123)).toBe("123");
    });
  });

  describe("calc_delta", () => {
    it("should correctly format seconds to HH:MM:SS with default options", () => {
      // 1 hour, 1 minute, 5 seconds = 3665 seconds
      expect(calc_delta(3665)).toBe("01:01:05");
    });

    it("should omit seconds when include_seconds is false", () => {
      expect(calc_delta(3665, false)).toBe("01:01");
    });

    it("should omit hour padding when pad_hour is false", () => {
      expect(calc_delta(3665, true, false)).toBe("1:01:05");
    });

    it("should correctly format large durations", () => {
      // 25 hours, 4 minutes, 12 seconds = 90252 seconds
      expect(calc_delta(90252)).toBe("25:04:12");
    });
  });

  describe("getCurrentTimeSec", () => {
    it("should fallback to Date.now() / 1000 when getCurrentTimestamp is undefined", () => {
      const originalWindow = global.window;
      // Mock window without getCurrentTimestamp
      global.window = {} as any;

      const before = Date.now() / 1000;
      const t = getCurrentTimeSec();
      const after = Date.now() / 1000;

      expect(t).toBeGreaterThanOrEqual(before);
      expect(t).toBeLessThanOrEqual(after);

      global.window = originalWindow;
    });

    it("should use window.getCurrentTimestamp() when defined", () => {
      const originalWindow = global.window;
      const mockTimestamp = 1700000000000; // 1700000000 seconds
      global.window = {
        getCurrentTimestamp: () => mockTimestamp,
      } as any;

      expect(getCurrentTimeSec()).toBe(1700000000);

      global.window = originalWindow;
    });
  });

  describe("formatChainTimeout", () => {
    it("should correctly format positive chain timeouts", () => {
      expect(formatChainTimeout(272)).toBe("4:32");
      expect(formatChainTimeout(60)).toBe("1:00");
      expect(formatChainTimeout(5)).toBe("0:05");
    });

    it("should correctly format zero chain timeout", () => {
      expect(formatChainTimeout(0)).toBe("0:00");
    });

    it("should correctly format negative chain timeouts for polling delays", () => {
      expect(formatChainTimeout(-5)).toBe("-0:05");
      expect(formatChainTimeout(-65)).toBe("-1:05");
    });
  });

  describe("formatChainCooldown", () => {
    it("should format zero and negative cooldowns", () => {
      expect(formatChainCooldown(0)).toBe("0:00");
      expect(formatChainCooldown(-10)).toBe("0:00");
    });

    it("should format short cooldowns (< 10 minutes) with seconds precision", () => {
      expect(formatChainCooldown(80)).toBe("1:20");
      expect(formatChainCooldown(599)).toBe("9:59");
    });

    it("should format medium cooldowns (10 minutes to 1 hour) with minutes precision", () => {
      expect(formatChainCooldown(600)).toBe("10m");
      expect(formatChainCooldown(2700)).toBe("45m");
      expect(formatChainCooldown(3599)).toBe("59m");
    });

    it("should format long cooldowns (1 hour to 24 hours) as XhYm", () => {
      expect(formatChainCooldown(3600)).toBe("1h0m");
      expect(formatChainCooldown(7500)).toBe("2h5m");
      expect(formatChainCooldown(45000)).toBe("12h30m");
    });

    it("should format ultra-long cooldowns (>= 24 hours) as XdYh", () => {
      expect(formatChainCooldown(86400)).toBe("1d0h");
      expect(formatChainCooldown(273600)).toBe("3d4h");
    });
  });
});
