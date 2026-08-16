import { describe, expect, it } from "vitest";
import { formatStatEstimate } from "./format";

describe("Format Utilities", () => {
  describe("formatStatEstimate", () => {
    it("should abbreviate billions to up to 3 significant digits with a 'b' suffix", () => {
      expect(formatStatEstimate(940616747829)).toBe("941b");
    });

    it("should keep a decimal for values near the low end of a tier", () => {
      expect(formatStatEstimate(1200000000)).toBe("1.2b");
    });

    it("should abbreviate trillions with a 't' suffix", () => {
      expect(formatStatEstimate(2500000000000)).toBe("2.5t");
    });

    it("should abbreviate millions with an 'm' suffix", () => {
      expect(formatStatEstimate(4200000)).toBe("4.2m");
    });

    it("should abbreviate thousands with a 'k' suffix", () => {
      expect(formatStatEstimate(15000)).toBe("15k");
    });

    it("should bump into the next tier when rounding spills over", () => {
      expect(formatStatEstimate(999600000000)).toBe("1t");
    });

    it("should return numbers under 1000 as-is with no suffix", () => {
      expect(formatStatEstimate(500)).toBe("500");
      expect(formatStatEstimate(0)).toBe("0");
    });
  });
});
