import type { TimestampSec } from "./types";

/**
 * Gets the current timestamp in seconds.
 * Fallbacks to window.getCurrentTimestamp() if defined (usually provided by Torn PDA / other scripts to get accurate server time), otherwise Date.now().
 */
export function getCurrentTimeSec(): TimestampSec {
  const w = window as any;
  if (typeof w.getCurrentTimestamp === "function") {
    try {
      return w.getCurrentTimestamp() / 1000;
    } catch (_e) {
      // Fallback on error
    }
  }
  return Date.now() / 1000;
}

/**
 * Pads a single-digit number with a leading zero.
 */
export function pad_with_zeros(n: number): string {
  if (n < 10) {
    return `0${n}`;
  }
  return String(n);
}

/**
 * Calculates and formats delta duration as HH:MM[:SS]
 */
export function calc_delta(
  delta: number,
  include_seconds = true,
  pad_hour = true,
): string {
  const s = Math.floor(delta % 60);
  const m = Math.floor((delta / 60) % 60);
  const h = Math.floor(delta / 60 / 60);
  const hour_minute = `${pad_hour ? pad_with_zeros(h) : h}:${pad_with_zeros(m)}`;

  return hour_minute + (include_seconds ? `:${pad_with_zeros(s)}` : "");
}

/**
 * Formats seconds left on a chain cleanly as [-]M:SS, allowing negative count down.
 */
export function formatChainTimeout(seconds: number): string {
  const isNegative = seconds < 0;
  const absSeconds = Math.abs(seconds);
  const m = Math.floor(absSeconds / 60);
  const s = Math.floor(absSeconds % 60);
  return `${isNegative ? "-" : ""}${m}:${pad_with_zeros(s)}`;
}
