import type { FactionId, TornTimestampMs } from "@utils/types";

export interface PresenceAlertSettings {
  /** Presence surge threshold (X): members above the trough. */
  surgeMembers: number;
  /** Presence surge trailing window (T), in ms. */
  surgeWindowMs: number;
  /** Presence gap threshold (Y): member difference between the factions. */
  gapMembers: number;
}

/** How long a Presence gap crossing alerts the leading side. Not a setting. */
const PRESENCE_GAP_ALERT_MS = 60_000;

interface Sample {
  t: TornTimestampMs;
  online: number;
}

/**
 * Tracks Presence surge and Presence gap (GLOSSARY.md) from successive
 * per-faction online counts and reports which factions should currently show
 * a Presence alert. Pure: no DOM or clock access — callers pass the time in.
 * State is in memory only, so a reload starts history fresh.
 */
export class PresenceAlertTracker {
  private samples = new Map<FactionId, Sample[]>();
  // Starts armed so a gap already at Y on page load counts as a crossing.
  private gapArmed = true;
  private gapLeader: FactionId | null = null;
  private gapAlertUntil: TornTimestampMs = 0;

  update(
    nowMs: TornTimestampMs,
    onlineByFaction: Map<FactionId, number>,
    settings: PresenceAlertSettings,
  ): Set<FactionId> {
    const alerting = new Set<FactionId>();

    for (const [factionId, online] of onlineByFaction) {
      const samples = this.samples.get(factionId) ?? [];
      samples.push({ t: nowMs, online });
      // Prune with this call's window so a changed T applies immediately.
      const cutoff = nowMs - settings.surgeWindowMs;
      while (samples.length > 0 && (samples[0]?.t ?? nowMs) < cutoff) {
        samples.shift();
      }
      this.samples.set(factionId, samples);

      // Measured from the trough, so a dip followed by a rise counts in full.
      const trough = Math.min(...samples.map((s) => s.online));
      if (online - trough >= settings.surgeMembers) {
        alerting.add(factionId);
      }
    }

    this.updateGap(nowMs, onlineByFaction, settings.gapMembers);
    if (this.gapLeader !== null && nowMs < this.gapAlertUntil) {
      alerting.add(this.gapLeader);
    }

    return alerting;
  }

  private updateGap(
    nowMs: TornTimestampMs,
    onlineByFaction: Map<FactionId, number>,
    gapMembers: number,
  ): void {
    // Only defined when exactly two factions have tallies; an unknown side
    // means there's no gap, and the armed state is left untouched.
    if (onlineByFaction.size !== 2) return;
    const [[idA, onlineA], [idB, onlineB]] = [...onlineByFaction] as [
      [FactionId, number],
      [FactionId, number],
    ];
    const gap = Math.abs(onlineA - onlineB);
    const leader = onlineA > onlineB ? idA : onlineB > onlineA ? idB : null;

    if (gap >= gapMembers) {
      // A leader flip while the gap is still >= Y is a new crossing even
      // though the tracker hasn't re-armed.
      if (this.gapArmed || leader !== this.gapLeader) {
        this.gapArmed = false;
        this.gapLeader = leader;
        this.gapAlertUntil = nowMs + PRESENCE_GAP_ALERT_MS;
      }
    } else if (gap <= Math.max(0, gapMembers - 2)) {
      // Re-arm only two below Y so a gap wobbling at Y/Y-1 doesn't re-fire.
      this.gapArmed = true;
    }
  }
}
