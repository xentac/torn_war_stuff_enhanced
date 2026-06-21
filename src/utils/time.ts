import type { DurationSec, TornTimestampMs } from "./types";

/**
 * Gets the current time on Torn's server-synchronized clock, bridged locally:
 * window.getCurrentTimestamp() if defined — Torn Server Time, exposed by the
 * Torn website itself on any device, not specific to any particular client —
 * otherwise Date.now() as a best-effort fallback. Never substitute this for a
 * local TimestampMs.
 */
export function getCurrentTime(): TornTimestampMs {
  const w = window as any;
  if (typeof w.getCurrentTimestamp === "function") {
    try {
      return w.getCurrentTimestamp();
    } catch (_e) {
      // Fallback on error
    }
  }
  return Date.now();
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
  delta: DurationSec,
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
export function formatChainTimeout(seconds: DurationSec): string {
  const isNegative = seconds < 0;
  const absSeconds = Math.abs(seconds);
  const m = Math.floor(absSeconds / 60);
  const s = Math.floor(absSeconds % 60);
  return `${isNegative ? "-" : ""}${m}:${pad_with_zeros(s)}`;
}

/**
 * Formats seconds left on a chain cooldown cleanly into dynamic compact durations.
 */
export function formatChainCooldown(seconds: DurationSec): string {
  if (seconds <= 0) return "0:00";
  const s = Math.floor(seconds % 60);
  const m = Math.floor((seconds / 60) % 60);
  const h = Math.floor((seconds / 3600) % 24);
  const d = Math.floor(seconds / 86400);

  if (d > 0) return `${d}d${h}h`;
  if (h > 0) return `${h}h${m}m`;
  if (m >= 10) return `${m}m`;
  return `${m}:${pad_with_zeros(s)}`;
}
