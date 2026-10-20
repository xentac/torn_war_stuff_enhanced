import { describe, expect, it } from "vitest";
import {
  type PresenceAlertSettings,
  PresenceAlertTracker,
} from "./presence-alerts";

const MIN = 60_000;

// Gap threshold set high enough that gap alerts never interfere with the
// surge tests.
const SURGE_ONLY: PresenceAlertSettings = {
  surgeMembers: 5,
  surgeWindowMs: 5 * MIN,
  gapMembers: 50,
};

function online(...entries: [string, number][]): Map<string, number> {
  return new Map(entries);
}

describe("PresenceAlertTracker — Presence surge", () => {
  it("alerts when online count rises X above the trough, measured from the trough not the window start", () => {
    const tracker = new PresenceAlertTracker();
    // Starts at 10, dips to 7, then rises to 12: +2 from the start but +5
    // from the trough, so the surge counts in full.
    expect(tracker.update(0, online(["a", 10]), SURGE_ONLY)).toEqual(new Set());
    expect(tracker.update(MIN, online(["a", 7]), SURGE_ONLY)).toEqual(
      new Set(),
    );
    expect(tracker.update(2 * MIN, online(["a", 11]), SURGE_ONLY)).toEqual(
      new Set(),
    );
    expect(tracker.update(3 * MIN, online(["a", 12]), SURGE_ONLY)).toEqual(
      new Set(["a"]),
    );
  });

  it("clears on its own once the trough ages out of the window", () => {
    const tracker = new PresenceAlertTracker();
    tracker.update(0, online(["a", 3]), SURGE_ONLY);
    expect(tracker.update(MIN, online(["a", 8]), SURGE_ONLY)).toEqual(
      new Set(["a"]),
    );
    // Still within 5 minutes of the trough sample at t=0.
    expect(tracker.update(5 * MIN, online(["a", 8]), SURGE_ONLY)).toEqual(
      new Set(["a"]),
    );
    // Trough at t=0 is now older than the window; the lowest remaining is 8.
    expect(tracker.update(5 * MIN + 1, online(["a", 8]), SURGE_ONLY)).toEqual(
      new Set(),
    );
  });

  it("prunes history to the current window when T shrinks", () => {
    const tracker = new PresenceAlertTracker();
    tracker.update(0, online(["a", 3]), SURGE_ONLY);
    tracker.update(3 * MIN, online(["a", 8]), SURGE_ONLY);
    expect(tracker.update(4 * MIN, online(["a", 8]), SURGE_ONLY)).toEqual(
      new Set(["a"]),
    );
    // Shrinking T to 2 minutes drops the trough at t=0 immediately.
    const shorter = { ...SURGE_ONLY, surgeWindowMs: 2 * MIN };
    expect(tracker.update(4 * MIN + 1, online(["a", 8]), shorter)).toEqual(
      new Set(),
    );
  });

  it("evaluates each faction independently and skips a faction with no tally that tick", () => {
    const tracker = new PresenceAlertTracker();
    tracker.update(0, online(["a", 1], ["b", 1]), SURGE_ONLY);
    // "b" has no tally this tick; "a" still evaluates.
    expect(tracker.update(MIN, online(["a", 6]), SURGE_ONLY)).toEqual(
      new Set(["a"]),
    );
    expect(
      tracker.update(2 * MIN, online(["a", 6], ["b", 6]), SURGE_ONLY),
    ).toEqual(new Set(["a", "b"]));
  });
});

// Surge threshold set high enough that surge alerts never interfere with the
// gap tests.
const GAP_ONLY: PresenceAlertSettings = {
  surgeMembers: 50,
  surgeWindowMs: 5 * MIN,
  gapMembers: 5,
};

describe("PresenceAlertTracker — Presence gap", () => {
  it("treats a gap already at Y on page load as a crossing and alerts the leading side", () => {
    const tracker = new PresenceAlertTracker();
    expect(
      tracker.update(0, online(["us", 10], ["them", 5]), GAP_ONLY),
    ).toEqual(new Set(["us"]));
  });

  it("alerts the leading side for a fixed 60 s after the crossing", () => {
    const tracker = new PresenceAlertTracker();
    tracker.update(0, online(["us", 2], ["them", 8]), GAP_ONLY);
    expect(
      tracker.update(59_999, online(["us", 2], ["them", 8]), GAP_ONLY),
    ).toEqual(new Set(["them"]));
    expect(
      tracker.update(60_000, online(["us", 2], ["them", 8]), GAP_ONLY),
    ).toEqual(new Set());
  });

  it("doesn't re-fire while the gap wobbles between Y and Y-1", () => {
    const tracker = new PresenceAlertTracker();
    tracker.update(0, online(["us", 10], ["them", 5]), GAP_ONLY);
    // Gap 4 (Y-1) doesn't re-arm, so returning to 5 after the alert expired
    // isn't a new crossing.
    tracker.update(70_000, online(["us", 9], ["them", 5]), GAP_ONLY);
    expect(
      tracker.update(80_000, online(["us", 10], ["them", 5]), GAP_ONLY),
    ).toEqual(new Set());
  });

  it("re-arms once the gap falls to Y-2", () => {
    const tracker = new PresenceAlertTracker();
    tracker.update(0, online(["us", 10], ["them", 5]), GAP_ONLY);
    tracker.update(70_000, online(["us", 8], ["them", 5]), GAP_ONLY);
    expect(
      tracker.update(80_000, online(["us", 10], ["them", 5]), GAP_ONLY),
    ).toEqual(new Set(["us"]));
  });

  it("re-arms only on a tie when Y <= 2", () => {
    const tracker = new PresenceAlertTracker();
    const y2 = { ...GAP_ONLY, gapMembers: 2 };
    tracker.update(0, online(["us", 7], ["them", 5]), y2);
    // Gap 1 is not <= max(0, Y-2) = 0, so still disarmed.
    tracker.update(70_000, online(["us", 6], ["them", 5]), y2);
    expect(tracker.update(80_000, online(["us", 7], ["them", 5]), y2)).toEqual(
      new Set(),
    );
    // A tie re-arms.
    tracker.update(90_000, online(["us", 5], ["them", 5]), y2);
    expect(tracker.update(100_000, online(["us", 7], ["them", 5]), y2)).toEqual(
      new Set(["us"]),
    );
  });

  it("treats the other side taking the lead while the gap is >= Y as a new crossing", () => {
    const tracker = new PresenceAlertTracker();
    tracker.update(0, online(["us", 10], ["them", 5]), GAP_ONLY);
    expect(
      tracker.update(10_000, online(["us", 4], ["them", 10]), GAP_ONLY),
    ).toEqual(new Set(["them"]));
    // The new crossing restarts the 60 s from the flip.
    expect(
      tracker.update(69_999, online(["us", 4], ["them", 10]), GAP_ONLY),
    ).toEqual(new Set(["them"]));
  });

  it("has no gap when one side's tally is missing", () => {
    const tracker = new PresenceAlertTracker();
    expect(tracker.update(0, online(["us", 10]), GAP_ONLY)).toEqual(new Set());
    // Still armed: the first tick with both tallies counts as the crossing.
    expect(
      tracker.update(1_000, online(["us", 10], ["them", 5]), GAP_ONLY),
    ).toEqual(new Set(["us"]));
  });
});
