const SUFFIXES: [number, string][] = [
  [1_000_000_000_000, "t"],
  [1_000_000_000, "b"],
  [1_000_000, "m"],
  [1_000, "k"],
];

/**
 * Abbreviates a number to at most 3 significant digits with a k/m/b/t suffix
 * (e.g. 940616747829 -> "941b", 1200000000 -> "1.2b"), trimming
 * insignificant trailing zeros so results stay short and consistent.
 */
export function formatStatEstimate(value: number): string {
  for (let i = 0; i < SUFFIXES.length; i++) {
    const [threshold, suffix] = SUFFIXES[i];
    if (value >= threshold) {
      const scaled = Number((value / threshold).toPrecision(3));
      // Rounding up to 3 sig figs can spill into the next tier (e.g.
      // 999.6b -> 1000), so re-scale against that tier instead.
      if (scaled >= 1000 && i > 0) {
        const [nextThreshold, nextSuffix] = SUFFIXES[i - 1];
        const rescaled = Number((value / nextThreshold).toPrecision(3));
        return `${rescaled}${nextSuffix}`;
      }
      return `${scaled}${suffix}`;
    }
  }
  return `${Math.round(value)}`;
}
